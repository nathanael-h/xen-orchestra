import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { configure } from '@xen-orchestra/log/configure'
import { generateSecret, generateTotp } from '@vates/otp'
import { OBFUSCATED_VALUE } from '@vates/obfuscate'

import Authentication from './authentication.mjs'
import { ModelAlreadyExists } from '../collection.mjs'
import { Tokens } from '../models/token.mjs'

configure({ level: 'FATAL', transport: () => {} })

const MINUTE = 60e3
const DAY = 24 * 60 * MINUTE
const NOW = 1_700_000_000_000

const CONFIG = {
  defaultTokenValidity: '30 days',
  maxTokenValidity: '1 year',
  throttlingDelay: '2 seconds',
}

const REDIS_STUB = {
  del: async () => {},
  // current schema version, prevents the collection from rebuilding indexes on creation
  get: async () => '20170905',
  keys: async () => [],
  sAdd: async () => {},
  set: async () => {},
  sMembers: async () => [],
}

// In-memory replacement of the Redis storage, keeping the real Tokens (de)serialization
class MemoryTokens extends Tokens {
  records = new Map()
  rebuildIndexesCalls = 0

  constructor() {
    super({ connection: REDIS_STUB, namespace: 'token', indexes: ['client_id', 'user_id'] })
  }

  _store(model) {
    const record = { ...model }
    this._serialize(record)
    this.records.set(record.id, record)
  }

  async _add(models) {
    for (const model of models) {
      if (this.records.has(model.id)) {
        throw new ModelAlreadyExists(model.id)
      }
      this._store(model)
    }
    return models
  }

  async _get(properties) {
    const entries = Object.entries(properties)
    return [...this.records.values()]
      .filter(record => entries.every(([key, value]) => record[key] === value))
      .map(record => {
        const model = { ...record }
        this._unserialize(model)
        return model
      })
  }

  async _remove(ids) {
    ids.forEach(id => this.records.delete(id))
  }

  async _update(models) {
    models.forEach(model => this._store(model))
    return models
  }

  async rebuildIndexes() {
    this.rebuildIndexesCalls++
  }
}

const USERS = {
  'user-1': { id: 'user-1', email: 'alice', password: 'alice-password', permission: 'none' },
  'user-2': { id: 'user-2', email: 'bob', password: 'bob-password', permission: 'admin' },
}

const createApp = ({ users = USERS } = {}) => {
  const hooks = { __proto__: null }
  const app = {
    _redis: REDIS_STUB,
    apiContext: undefined,
    auditEvents: [],
    configManagers: { __proto__: null },
    createdTasks: [],
    hooks: {
      on: (name, fn) => {
        hooks[name] = fn
      },
      run: name => hooks[name](),
    },
    config: {
      watch: (name, cb) => {
        assert.equal(name, 'authentication')
        cb(CONFIG)
      },
    },
    tasks: {
      create: async (properties, options) => {
        const task = {
          properties,
          options,
          runCalls: 0,
          run: fn => {
            task.runCalls++
            return fn()
          },
        }
        app.createdTasks.push(task)
        return task
      },
    },
    addConfigManager: (id, getter, setter) => {
      app.configManagers[id] = { getter, setter }
    },
    emit: (event, ...args) => {
      app.auditEvents.push([event, ...args])
    },
    getUser: async id => {
      const user = users[id]
      if (user === undefined) {
        throw new Error('no such user ' + id)
      }
      return user
    },
    getUserByName: async name => Object.values(users).find(user => user.email === name),
    checkUserPassword: async (id, password) => users[id].password === password,
    doesUserExist: async id => users[id] !== undefined,
  }
  return app
}

const createAuthentication = opts => {
  const app = createApp(opts)
  const authentication = new Authentication(app)
  const tokens = new MemoryTokens()
  authentication._tokens = tokens

  // xo-server merges all mixins into the app, the token provider relies on this
  app.getAuthenticationToken = properties => authentication.getAuthenticationToken(properties)

  return { app, authentication, tokens }
}

const addToken = (tokens, token) =>
  tokens._store({ created_at: NOW, expiration: NOW + DAY, user_id: 'user-1', ...token })

const isInvalidCredentials = { code: 3, message: 'invalid credentials' }
const isNoSuchToken = { code: 1 }

describe('Authentication', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: NOW })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  describe('constructor', () => {
    it('parses durations from the authentication config', () => {
      const { authentication } = createAuthentication()
      assert.equal(authentication._defaultTokenValidity, 30 * DAY)
      assert.equal(authentication._maxTokenValidity, 365.25 * DAY)
      assert.equal(authentication._throttlingDelay, 2e3)
    })

    it('registers the password and token providers', () => {
      const { authentication } = createAuthentication()
      assert.equal(authentication._providers.size, 2)
    })

    it('creates the tokens collection and its config manager on core started', async () => {
      const app = createApp()
      const authentication = new Authentication(app)
      await app.hooks.run('core started')
      assert(authentication._tokens instanceof Tokens)
      assert.deepEqual(Object.keys(app.configManagers), ['authTokens'])
    })
  })

  describe('providers', () => {
    it('can be registered and unregistered', async () => {
      const { authentication } = createAuthentication()
      const provider = async () => ({ userId: 'user-2' })
      authentication.registerAuthenticationProvider(provider)
      assert.equal(authentication._providers.size, 3)
      assert.equal(authentication.unregisterAuthenticationProvider(provider), true)
      assert.equal(authentication._providers.size, 2)
    })
  })

  describe('password provider', () => {
    it('authenticates with a valid username and password', async () => {
      const { authentication } = createAuthentication()
      const result = await authentication.authenticateUser(
        { username: 'alice', password: 'alice-password' },
        { ip: '192.0.2.1' },
        { bypassTaskCreation: true }
      )
      assert.equal(result.user, USERS['user-1'])
      assert.equal(result.userId, undefined)
    })

    it('emits a signInFailed audit event on a wrong password', async () => {
      const { app, authentication } = createAuthentication()
      await assert.rejects(
        authentication.authenticateUser(
          { username: 'alice', password: 'wrong' },
          { ip: '192.0.2.1' },
          { bypassTaskCreation: true }
        ),
        isInvalidCredentials
      )
      assert.deepEqual(app.auditEvents, [
        ['xo:audit', 'signInFailed', { userId: 'user-1', userName: 'alice', userIp: '192.0.2.1' }],
      ])
    })

    it('emits a signInFailed audit event without userId for an unknown user', async () => {
      const { app, authentication } = createAuthentication()
      await assert.rejects(
        authentication.authenticateUser({ username: 'mallory', password: 'x' }, {}, { bypassTaskCreation: true }),
        isInvalidCredentials
      )
      assert.deepEqual(app.auditEvents, [
        ['xo:audit', 'signInFailed', { userId: undefined, userName: 'mallory', userIp: undefined }],
      ])
    })

    it('ignores credentials without password', async () => {
      const { app, authentication } = createAuthentication()
      await assert.rejects(
        authentication.authenticateUser({ username: 'alice' }, {}, { bypassTaskCreation: true }),
        isInvalidCredentials
      )
      assert.deepEqual(app.auditEvents, [])
    })
  })

  describe('token provider', () => {
    it('authenticates with a valid token, bypassing OTP', async () => {
      const { authentication, tokens } = createAuthentication({
        users: { 'user-1': { ...USERS['user-1'], preferences: { otp: generateSecret() } } },
      })
      addToken(tokens, { id: 'token-1' })

      const result = await authentication.authenticateUser(
        { token: 'token-1' },
        { ip: '192.0.2.1' },
        { bypassTaskCreation: true }
      )

      assert.equal(result.user.id, 'user-1')
      assert.equal(result.bypassOtp, true)
      assert.equal(result.expiration, NOW + DAY)
      assert.deepEqual((await tokens.first('token-1')).last_uses, { '192.0.2.1': { timestamp: NOW } })
    })

    it('keeps only the 10 most recent last uses', async () => {
      const { authentication, tokens } = createAuthentication()
      const last_uses = {}
      for (let i = 0; i < 10; i++) {
        last_uses[`198.51.100.${i}`] = { timestamp: NOW - (i + 1) * MINUTE }
      }
      addToken(tokens, { id: 'token-1', last_uses })

      await authentication.authenticateUser({ token: 'token-1' }, { ip: '192.0.2.1' }, { bypassTaskCreation: true })

      const ips = Object.keys((await tokens.first('token-1')).last_uses)
      assert.equal(ips.length, 10)
      assert(ips.includes('192.0.2.1'))
      assert(!ips.includes('198.51.100.9'), 'the oldest use should be dropped')
    })

    it('rejects an unknown token', async () => {
      const { authentication } = createAuthentication()
      await assert.rejects(
        authentication.authenticateUser({ token: 'nope' }, { ip: '192.0.2.1' }, { bypassTaskCreation: true }),
        isInvalidCredentials
      )
    })

    it('rejects an expired token', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', expiration: NOW - 1 })
      await assert.rejects(
        authentication.authenticateUser({ token: 'token-1' }, { ip: '192.0.2.1' }, { bypassTaskCreation: true }),
        isInvalidCredentials
      )
    })
  })

  describe('_authenticateUser', () => {
    it('tries providers in order and skips those returning nothing', async () => {
      const { authentication } = createAuthentication()
      const calls = []
      authentication._providers = new Set([
        async () => {
          calls.push(1)
        },
        async () => {
          calls.push(2)
          return null
        },
        async () => {
          calls.push(3)
          return { userId: 'user-2', expiration: 42 }
        },
        async () => {
          calls.push(4)
        },
      ])

      const result = await authentication._authenticateUser({})

      assert.deepEqual(calls, [1, 2, 3])
      assert.deepEqual(result, { user: USERS['user-2'], expiration: 42 })
    })

    it('tries the next provider when one throws', async () => {
      const { authentication } = createAuthentication()
      authentication._providers = new Set([
        async () => {
          // eslint-disable-next-line no-throw-literal
          throw null
        },
        async () => {
          throw new Error('provider failure')
        },
        async () => ({ userId: 'user-1' }),
      ])

      const result = await authentication._authenticateUser({})
      assert.equal(result.user, USERS['user-1'])
    })

    it('returns undefined when no provider matches', async () => {
      const { authentication } = createAuthentication()
      authentication._providers = new Set([async () => {}])
      assert.equal(await authentication._authenticateUser({}), undefined)
    })
  })

  describe('authenticateUser', () => {
    it('rejects an empty password without calling providers', async () => {
      const { authentication } = createAuthentication()
      const provider = mock.fn()
      authentication._providers = new Set([provider])
      await assert.rejects(
        authentication.authenticateUser({ username: 'alice', password: '' }, {}, { bypassTaskCreation: true }),
        { message: 'empty password' }
      )
      assert.equal(provider.mock.callCount(), 0)
    })

    it('copies email to username and username to email', async () => {
      const { authentication } = createAuthentication()
      const provider = mock.fn(async () => ({ userId: 'user-1' }))
      authentication._providers = new Set([provider])

      await authentication.authenticateUser({ email: 'alice', password: 'x' }, {}, { bypassTaskCreation: true })
      assert.equal(provider.mock.calls[0].arguments[0].username, 'alice')

      await authentication.authenticateUser({ username: 'bob', password: 'x' }, {}, { bypassTaskCreation: true })
      assert.equal(provider.mock.calls[1].arguments[0].email, 'bob')
    })

    it('does not pass the OTP to providers', async () => {
      const { authentication } = createAuthentication()
      const provider = mock.fn(async () => ({ userId: 'user-1' }))
      authentication._providers = new Set([provider])

      await authentication.authenticateUser(
        { username: 'alice', password: 'x', otp: '123456' },
        {},
        { bypassTaskCreation: true }
      )
      assert.equal('otp' in provider.mock.calls[0].arguments[0], false)
    })

    describe('throttling', () => {
      const credentials = () => ({ username: 'alice', password: 'wrong' })

      it('rejects a new attempt within the throttling delay after a failure', async () => {
        const { authentication } = createAuthentication()
        await assert.rejects(
          authentication.authenticateUser(credentials(), {}, { bypassTaskCreation: true }),
          isInvalidCredentials
        )
        mock.timers.tick(1e3)
        await assert.rejects(authentication.authenticateUser(credentials(), {}, { bypassTaskCreation: true }), {
          message: 'too fast authentication tries',
        })
      })

      it('allows a new attempt once the throttling delay has passed', async () => {
        const { authentication } = createAuthentication()
        await assert.rejects(
          authentication.authenticateUser(credentials(), {}, { bypassTaskCreation: true }),
          isInvalidCredentials
        )
        mock.timers.tick(2e3 + 1)
        const result = await authentication.authenticateUser(
          { username: 'alice', password: 'alice-password' },
          {},
          { bypassTaskCreation: true }
        )
        assert.equal(result.user.id, 'user-1')
        assert.equal(authentication._failures.alice, undefined, 'a success should clear the failure')
      })

      it('only throttles the user who failed', async () => {
        const { authentication } = createAuthentication()
        await assert.rejects(
          authentication.authenticateUser(credentials(), {}, { bypassTaskCreation: true }),
          isInvalidCredentials
        )
        const result = await authentication.authenticateUser(
          { username: 'bob', password: 'bob-password' },
          {},
          { bypassTaskCreation: true }
        )
        assert.equal(result.user.id, 'user-2')
      })
    })

    describe('OTP', () => {
      const secret = generateSecret()
      const users = { 'user-1': { ...USERS['user-1'], preferences: { otp: secret } } }
      const credentials = otp => ({ username: 'alice', password: 'alice-password', otp })

      it('accepts a valid OTP', async () => {
        const { authentication } = createAuthentication({ users })
        const otp = await generateTotp({ secret })
        const result = await authentication.authenticateUser(credentials(otp), {}, { bypassTaskCreation: true })
        assert.equal(result.user.id, 'user-1')
      })

      it('rejects a wrong OTP', async () => {
        const { authentication } = createAuthentication({ users })
        const otp = await generateTotp({ secret })
        const wrongOtp = String((Number(otp) + 1) % 1e6).padStart(6, '0')
        await assert.rejects(
          authentication.authenticateUser(credentials(wrongOtp), {}, { bypassTaskCreation: true }),
          isInvalidCredentials
        )
        assert.equal(authentication._failures.alice, NOW)
      })

      it('rejects a missing OTP', async () => {
        const { authentication } = createAuthentication({ users })
        await assert.rejects(
          authentication.authenticateUser(credentials(), {}, { bypassTaskCreation: true }),
          isInvalidCredentials
        )
      })

      it('skips the OTP check with bypassOtp', async () => {
        const { authentication } = createAuthentication({ users })
        const result = await authentication.authenticateUser(
          credentials(),
          {},
          { bypassOtp: true, bypassTaskCreation: true }
        )
        assert.equal(result.user.id, 'user-1')
      })

      it('skips the OTP check when the provider returns bypassOtp', async () => {
        const { authentication } = createAuthentication({ users })
        authentication.registerAuthenticationProvider(async ({ username }) =>
          username === 'sso' ? { userId: 'user-1', bypassOtp: true } : undefined
        )
        const result = await authentication.authenticateUser({ username: 'sso' }, {}, { bypassTaskCreation: true })
        assert.equal(result.user.id, 'user-1')
      })
    })

    describe('task', () => {
      it('runs the authentication in a task with obfuscated credentials', async () => {
        const { app, authentication } = createAuthentication()
        const userData = { ip: '192.0.2.1' }
        const result = await authentication.authenticateUser(
          { username: 'alice', password: 'alice-password' },
          userData
        )

        assert.equal(result.user.id, 'user-1')
        assert.equal(app.createdTasks.length, 1)
        const [task] = app.createdTasks
        assert.equal(task.runCalls, 1)
        assert.equal(task.properties.type, 'xo:authentication:authenticateUser')
        assert.deepEqual(task.properties.credentials, { username: 'alice', password: '* obfuscated *' })
        assert.notEqual(task.properties.credentials.password, OBFUSCATED_VALUE)
        assert.equal(task.properties.userData, userData)
        assert.deepEqual(task.options, { clearLogOnSuccess: true })
      })

      it('does not create a task with bypassTaskCreation', async () => {
        const { app, authentication } = createAuthentication()
        await authentication.authenticateUser(
          { username: 'alice', password: 'alice-password' },
          {},
          { bypassTaskCreation: true }
        )
        assert.equal(app.createdTasks.length, 0)
      })
    })
  })

  describe('createAuthenticationToken', () => {
    it('creates a token with the default validity', async () => {
      const { authentication, tokens } = createAuthentication()
      const token = await authentication.createAuthenticationToken({ userId: 'user-1', description: 'test' })

      assert.equal(typeof token.id, 'string')
      assert.equal(token.user_id, 'user-1')
      assert.equal(token.description, 'test')
      assert.equal(token.created_at, NOW)
      assert.equal(token.expiration, NOW + 30 * DAY)
      assert(tokens.records.has(token.id))
    })

    it('uses expiresIn when provided', async () => {
      const { authentication } = createAuthentication()
      const token = await authentication.createAuthenticationToken({ userId: 'user-1', expiresIn: '1 hour' })
      assert.equal(token.expiration, NOW + 60 * MINUTE)
    })

    it('rejects an expiresIn shorter than one minute', async () => {
      const { authentication } = createAuthentication()
      await assert.rejects(authentication.createAuthenticationToken({ userId: 'user-1', expiresIn: '59 seconds' }), {
        message: 'invalid expiresIn duration: 59 seconds',
      })
    })

    it('rejects an expiresIn longer than the max validity', async () => {
      const { authentication } = createAuthentication()
      await assert.rejects(authentication.createAuthenticationToken({ userId: 'user-1', expiresIn: '2 years' }), {
        message: 'too high expiresIn duration: 2 years',
      })
    })

    it('refreshes an existing valid token for the same client', async () => {
      const { authentication, tokens } = createAuthentication()
      const client = { id: 'client-1', name: 'my client' }
      const first = await authentication.createAuthenticationToken({ client, userId: 'user-1', description: 'v1' })

      mock.timers.tick(DAY)
      const second = await authentication.createAuthenticationToken({ client, userId: 'user-1', description: 'v2' })

      assert.equal(second.id, first.id)
      assert.equal(second.description, 'v2')
      assert.equal(second.expiration, NOW + DAY + 30 * DAY)
      assert.deepEqual(second.client, client)
      assert.equal(tokens.records.size, 1)
    })

    it('does not reuse a token of the same client for another user', async () => {
      const { authentication, tokens } = createAuthentication()
      const client = { id: 'client-1' }
      const first = await authentication.createAuthenticationToken({ client, userId: 'user-1' })
      const second = await authentication.createAuthenticationToken({ client, userId: 'user-2' })
      assert.notEqual(second.id, first.id)
      assert.equal(tokens.records.size, 2)
    })

    it('replaces an expired token for the same client', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'old-token', client: { id: 'client-1' }, expiration: NOW - 1 })

      const token = await authentication.createAuthenticationToken({ client: { id: 'client-1' }, userId: 'user-1' })

      assert.notEqual(token.id, 'old-token')
      await tokens.first(token.id) // wait for pending storage operations
      assert.deepEqual([...tokens.records.keys()], [token.id])
    })
  })

  describe('deleteAuthenticationToken', () => {
    it('deletes any token by id without API context', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', user_id: 'user-2' })
      await authentication.deleteAuthenticationToken('token-1')
      assert.equal(tokens.records.size, 0)
    })

    it('lets an admin delete a token of another user', async () => {
      const { app, authentication, tokens } = createAuthentication()
      app.apiContext = { permission: 'admin', user: USERS['user-2'] }
      addToken(tokens, { id: 'token-1', user_id: 'user-1' })
      await authentication.deleteAuthenticationToken('token-1')
      assert.equal(tokens.records.size, 0)
    })

    it('lets a non-admin delete their own token', async () => {
      const { app, authentication, tokens } = createAuthentication()
      app.apiContext = { permission: 'none', user: USERS['user-1'] }
      addToken(tokens, { id: 'token-1', user_id: 'user-1' })
      await authentication.deleteAuthenticationToken('token-1')
      assert.equal(tokens.records.size, 0)
    })

    it('prevents a non-admin from deleting a token of another user', async () => {
      const { app, authentication, tokens } = createAuthentication()
      app.apiContext = { permission: 'none', user: USERS['user-1'] }
      addToken(tokens, { id: 'token-1', user_id: 'user-2' })
      await assert.rejects(authentication.deleteAuthenticationToken('token-1'), isNoSuchToken)
      assert.equal(tokens.records.size, 1)
    })
  })

  describe('deleteAuthenticationTokens', () => {
    it('deletes the tokens matching the filter', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', user_id: 'user-1' })
      addToken(tokens, { id: 'token-2', user_id: 'user-2' })
      addToken(tokens, { id: 'token-3', user_id: 'user-1' })

      await authentication.deleteAuthenticationTokens({ filter: { user_id: 'user-1' } })

      assert.deepEqual([...tokens.records.keys()], ['token-2'])
    })
  })

  describe('getAuthenticationToken', () => {
    it('returns a valid token by id', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1' })
      const token = await authentication.getAuthenticationToken('token-1')
      assert.equal(token.id, 'token-1')
    })

    it('returns a valid token by properties', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', user_id: 'user-2' })
      const token = await authentication.getAuthenticationToken({ id: 'token-1', user_id: 'user-2' })
      assert.equal(token.id, 'token-1')
      await assert.rejects(authentication.getAuthenticationToken({ id: 'token-1', user_id: 'user-1' }), isNoSuchToken)
    })

    it('throws for an unknown token', async () => {
      const { authentication } = createAuthentication()
      await assert.rejects(authentication.getAuthenticationToken('nope'), {
        ...isNoSuchToken,
        data: { id: 'nope', type: 'authenticationToken' },
      })
    })

    it('removes and throws for an expired token', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', expiration: NOW - 1 })
      await assert.rejects(authentication.getAuthenticationToken('token-1'), isNoSuchToken)
      await tokens.first('token-1') // wait for the pending removal
      assert.equal(tokens.records.size, 0)
    })
  })

  describe('getAuthenticationTokensForUser', () => {
    it('returns the valid tokens of the user and removes the expired ones', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'valid', user_id: 'user-1' })
      addToken(tokens, { id: 'expired', user_id: 'user-1', expiration: NOW - 1 })
      addToken(tokens, { id: 'other-user', user_id: 'user-2' })

      const result = await authentication.getAuthenticationTokensForUser('user-1')

      assert.deepEqual(
        result.map(_ => _.id),
        ['valid']
      )
      await tokens.first('valid') // wait for the pending removal
      assert.deepEqual([...tokens.records.keys()].sort(), ['other-user', 'valid'])
    })
  })

  describe('isValidAuthenticationToken', () => {
    it('returns true for a valid token of an existing user', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', user_id: 'user-1' })
      assert.equal(await authentication.isValidAuthenticationToken('token-1'), true)
    })

    it('returns false for a token of a deleted user', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', user_id: 'deleted-user' })
      assert.equal(await authentication.isValidAuthenticationToken('token-1'), false)
    })

    it('returns false for an expired or unknown token', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', expiration: NOW - 1 })
      assert.equal(await authentication.isValidAuthenticationToken('token-1'), false)
      assert.equal(await authentication.isValidAuthenticationToken('nope'), false)
    })
  })

  describe('updateAuthenticationToken', () => {
    it('updates the description', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', description: 'before' })
      const token = await authentication.updateAuthenticationToken('token-1', { description: 'after' })
      assert.equal(token.description, 'after')
      assert.equal((await tokens.first('token-1')).description, 'after')
    })

    it('removes the description when set to null', async () => {
      const { authentication, tokens } = createAuthentication()
      addToken(tokens, { id: 'token-1', description: 'before' })
      await authentication.updateAuthenticationToken('token-1', { description: null })
      assert.equal('description' in (await tokens.first('token-1')), false)
    })

    it('throws for an unknown token', async () => {
      const { authentication } = createAuthentication()
      await assert.rejects(authentication.updateAuthenticationToken('nope', { description: 'x' }), isNoSuchToken)
    })
  })

  describe('clean hook', () => {
    it('removes expired tokens and tokens without expiration, then rebuilds indexes', async () => {
      const { app, tokens } = createAuthentication()
      addToken(tokens, { id: 'valid' })
      addToken(tokens, { id: 'expired', expiration: NOW - 1 })
      addToken(tokens, { id: 'no-expiration', expiration: 0 })

      await app.hooks.run('clean')

      assert.deepEqual([...tokens.records.keys()], ['valid'])
      assert.equal(tokens.rebuildIndexesCalls, 1)
    })
  })
})
