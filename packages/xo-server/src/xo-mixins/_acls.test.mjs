import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { configure } from '@xen-orchestra/log/configure'

import Acls from './acls.mjs'
import { Acls as AclsCollection } from '../models/acl.mjs'
import { ModelAlreadyExists } from '../collection.mjs'
import { multiKeyHash } from '../utils.mjs'

configure({ level: 'FATAL', transport: () => {} })

const REDIS_STUB = {
  del: async () => {},
  // current schema version, prevents the collection from rebuilding indexes on creation
  get: async () => '20170905',
  keys: async () => [],
  sAdd: async () => {},
  set: async () => {},
  sMembers: async () => [],
}

// In-memory replacement of the Redis storage, keeping the real Acls model logic
class MemoryAcls extends AclsCollection {
  records = new Map()
  rebuildIndexesCalls = 0

  constructor() {
    super({ connection: REDIS_STUB, namespace: 'acl', indexes: ['subject', 'object'] })
  }

  async _add(models) {
    for (const model of models) {
      if (this.records.has(model.id)) {
        throw new ModelAlreadyExists(model.id)
      }
      this.records.set(model.id, { ...model })
    }
    return models
  }

  async _get(properties) {
    const entries = Object.entries(properties)
    return [...this.records.values()]
      .filter(record => entries.every(([key, value]) => record[key] === value))
      .map(record => ({ ...record }))
  }

  async _remove(ids) {
    ids.forEach(id => this.records.delete(id))
  }

  async _update(models) {
    models.forEach(model => this.records.set(model.id, { ...model }))
    return models
  }

  async rebuildIndexes() {
    this.rebuildIndexesCalls++
  }
}

const USERS = {
  admin: { id: 'admin', permission: 'admin' },
  alice: { id: 'alice', permission: 'none', groups: ['group-1'] },
  bob: { id: 'bob', permission: 'none' },
}

// minimal XO objects for xo-acl-resolver
const OBJECTS = {
  'pool-1': { id: 'pool-1', type: 'pool' },
  'vm-1': { id: 'vm-1', type: 'VM', $container: 'pool-1' },
  'vm-2': { id: 'vm-2', type: 'VM', $container: 'pool-1' },
  'sr-1': { id: 'sr-1', type: 'SR', $container: 'pool-1' },
}

const createApp = () => {
  const hooks = { __proto__: null }
  const app = {
    _redis: REDIS_STUB,
    apiContext: undefined,
    configManagers: { __proto__: null },
    hooks: {
      on: (name, fn) => {
        hooks[name] = fn
      },
      run: name => hooks[name](),
    },
    addConfigManager: (id, getter, setter, dependencies) => {
      app.configManagers[id] = { getter, setter, dependencies }
    },
    getObject: id => OBJECTS[id],
    getUser: async id => {
      const user = USERS[id]
      if (user === undefined) {
        throw new Error('no such user ' + id)
      }
      return user
    },
  }
  return app
}

const createAcls = () => {
  const app = createApp()
  const acls = new Acls(app)
  const collection = new MemoryAcls()
  acls._acls = collection
  return { acls, app, collection }
}

const isUnauthorized = { code: 2 }

describe('Acls', () => {
  describe('core started hook', () => {
    it('creates the ACLs collection and its config manager', async () => {
      const app = createApp()
      const acls = new Acls(app)
      await app.hooks.run('core started')
      assert(acls._acls instanceof AclsCollection)
      assert.deepEqual(app.configManagers.acls.dependencies, ['groups', 'users'])
    })
  })

  describe('addAcl / removeAcl', () => {
    it('adds an ACL identified by its subject, object and action', async () => {
      const { acls, collection } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')

      const id = await multiKeyHash('bob', 'vm-1', 'viewer')
      assert.deepEqual(collection.records.get(id), { id, subject: 'bob', object: 'vm-1', action: 'viewer' })
    })

    it('ignores an ACL which already exists', async () => {
      const { acls, collection } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await acls.addAcl('bob', 'vm-1', 'viewer')
      assert.equal(collection.records.size, 1)
    })

    it('rethrows other errors', async () => {
      const { acls, collection } = createAcls()
      const error = new Error('storage failure')
      collection._add = async () => {
        throw error
      }
      await assert.rejects(acls.addAcl('bob', 'vm-1', 'viewer'), error)
    })

    it('removes an ACL', async () => {
      const { acls, collection } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await acls.addAcl('bob', 'vm-1', 'operator')
      await acls.removeAcl('bob', 'vm-1', 'viewer')
      assert.deepEqual(
        [...collection.records.values()].map(_ => _.action),
        ['operator']
      )
    })
  })

  describe('getAllAcls / getAclsForSubject', () => {
    it('returns all ACLs or those of a subject', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await acls.addAcl('alice', 'vm-2', 'admin')

      assert.equal((await acls.getAllAcls()).length, 2)
      assert.deepEqual(
        (await acls.getAclsForSubject('alice')).map(_ => _.object),
        ['vm-2']
      )
    })

    it('migrates ACLs without action to the admin action', async () => {
      const { acls, collection } = createAcls()
      collection.records.set('legacy', { id: 'legacy', subject: 'bob', object: 'vm-1' })

      const [acl] = await acls.getAclsForSubject('bob')

      assert.equal(acl.action, 'admin')
      const id = await multiKeyHash('bob', 'vm-1', 'admin')
      assert.equal(acl.id, id)
      assert.deepEqual([...collection.records.keys()], [id])
    })
  })

  describe('getPermissionsForUser', () => {
    it('expands roles into permissions', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await acls.addAcl('bob', 'vm-2', 'operator')
      await acls.addAcl('bob', 'sr-1', 'admin')

      const permissions = await acls.getPermissionsForUser('bob')

      assert.deepEqual({ ...permissions['vm-1'] }, { view: 1 })
      assert.deepEqual({ ...permissions['vm-2'] }, { view: 1, operate: 1 })
      assert.deepEqual({ ...permissions['sr-1'] }, { view: 1, operate: 1, administrate: 1 })
    })

    it('keeps an action which is not a role as is', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'custom')
      const permissions = await acls.getPermissionsForUser('bob')
      assert.deepEqual({ ...permissions['vm-1'] }, { custom: 1 })
    })

    it('merges the ACLs of the user and of their groups', async () => {
      const { acls } = createAcls()
      await acls.addAcl('alice', 'vm-1', 'viewer')
      await acls.addAcl('group-1', 'vm-1', 'operator')
      await acls.addAcl('group-1', 'vm-2', 'viewer')
      await acls.addAcl('bob', 'sr-1', 'admin')

      const permissions = await acls.getPermissionsForUser('alice')

      assert.deepEqual(Object.keys(permissions).sort(), ['vm-1', 'vm-2'])
      assert.deepEqual({ ...permissions['vm-1'] }, { view: 1, operate: 1 })
      assert.deepEqual({ ...permissions['vm-2'] }, { view: 1 })
    })

    it('returns no permissions for a user without ACLs', async () => {
      const { acls } = createAcls()
      assert.deepEqual(Object.keys(await acls.getPermissionsForUser('bob')), [])
    })
  })

  describe('checkPermissions', () => {
    it('always allows an admin', async () => {
      const { acls } = createAcls()
      assert.equal(await acls.checkPermissions([['vm-1', 'administrate']], 'admin'), true)
    })

    it('allows a user with the required permissions', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'operator')
      await acls.checkPermissions(
        [
          ['vm-1', 'view'],
          ['vm-1', 'operate'],
        ],
        'bob'
      )
    })

    it('grants access to objects through their container', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'pool-1', 'viewer')
      await acls.checkPermissions([['vm-2', 'view']], 'bob')
    })

    it('throws unauthorized when a permission is missing', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await assert.rejects(acls.checkPermissions([['vm-1', 'operate']], 'bob'), isUnauthorized)
      await assert.rejects(acls.checkPermissions([['vm-2', 'view']], 'bob'), isUnauthorized)
    })

    it('uses the user of the API context when no user is given', async () => {
      const { acls, app } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')

      app.apiContext = { permission: 'none', user: { id: 'bob' } }
      await acls.checkPermissions([['vm-1', 'view']])
      await assert.rejects(acls.checkPermissions([['vm-1', 'operate']]), isUnauthorized)

      app.apiContext = { permission: 'admin', user: { id: 'admin' } }
      assert.equal(await acls.checkPermissions([['vm-1', 'operate']]), true)
    })
  })

  describe('hasPermissions', () => {
    it('returns true for an admin', async () => {
      const { acls } = createAcls()
      assert.equal(await acls.hasPermissions('admin', [['vm-1', 'administrate']]), true)
    })

    it('returns whether a user has the permissions', async () => {
      const { acls } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      assert.equal(await acls.hasPermissions('bob', [['vm-1', 'view']]), true)
      assert.equal(await acls.hasPermissions('bob', [['vm-1', 'operate']]), false)
      assert.equal(await acls.hasPermissions('bob', [['vm-2', 'view']]), false)
    })
  })

  describe('removeAclsForObject', () => {
    it('removes all ACLs of the object', async () => {
      const { acls, collection } = createAcls()
      await acls.addAcl('bob', 'vm-1', 'viewer')
      await acls.addAcl('alice', 'vm-1', 'admin')
      await acls.addAcl('bob', 'vm-2', 'viewer')

      await acls.removeAclsForObject('vm-1')

      assert.deepEqual(
        [...collection.records.values()].map(_ => _.object),
        ['vm-2']
      )
    })
  })

  describe('roles', () => {
    it('lists the built-in roles', async () => {
      const { acls } = createAcls()
      assert.deepEqual(
        (await acls.getRoles()).map(_ => _.id),
        ['viewer', 'operator', 'admin']
      )
    })

    it('returns the roles having a permission', async () => {
      const { acls } = createAcls()
      assert.deepEqual(await acls.getRolesForPermission('view'), ['viewer', 'operator', 'admin'])
      assert.deepEqual(await acls.getRolesForPermission('operate'), ['operator', 'admin'])
      assert.deepEqual(await acls.getRolesForPermission('administrate'), ['admin'])
      assert.deepEqual(await acls.getRolesForPermission('unknown'), [])
    })
  })

  describe('clean hook', () => {
    it('removes incomplete ACLs, then rebuilds indexes', async () => {
      const { app, collection } = createAcls()
      collection.records.set('valid', { id: 'valid', subject: 'bob', object: 'vm-1', action: 'viewer' })
      collection.records.set('no-subject', { id: 'no-subject', object: 'vm-1', action: 'viewer' })
      collection.records.set('no-object', { id: 'no-object', subject: 'bob', action: 'viewer' })

      await app.hooks.run('clean')

      assert.deepEqual([...collection.records.keys()], ['valid'])
      assert.equal(collection.rebuildIndexesCalls, 1)
    })
  })
})
