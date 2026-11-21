---
sidebar_position: 2
description: 'Create a dedicated Xen Orchestra API token for Terraform, Pulumi, PowerShell, the Go SDK and other tools, store it safely, and renew it.'
---

# Authenticate your tools

Every automation tool needs to prove who it is to Xen Orchestra (XO). This page shows, once and for all, how to give a tool its own credentials. The tool guides link back here.

**In this guide, you will:**

1. create a dedicated API token,
2. store it outside your code,
3. check that it works,
4. know how to renew or revoke it.

## Tokens or passwords?

Xen Orchestra accepts two kinds of credentials:

| | API token (recommended) | Username and password |
| --- | --- | --- |
| Exposes your password | No | Yes |
| Can be revoked on its own | Yes, without touching the account | No, you have to change the password |
| Expires | Yes, automatically | No |
| Supported by | Every tool except the Ansible inventory | Every tool except PowerShell; **the only option for the Ansible inventory** |

:::tip Use a dedicated user
A token acts with the permissions of the user who created it. For production automation, create a dedicated XO user (for example `terraform-ci`) with only the rights it needs, then create the token while logged in as that user. See [RBAC](../security/user-management/rbac.md).
:::

## Step 1: create a token

Pick the method you prefer. All three produce the same kind of token.

<Tabs groupId="token-method">
<TabItem value="ui" label="Web interface" default>

1. In the XO 5 interface, click the **user icon** at the bottom of the left menu to open your **user page** (`/#/user`).
2. In the **Authentication tokens** section, click **New token**.
3. Enter a **description** that tells you later who uses it (for example `terraform - laptop of Alice`), and optionally an **expiration date**.
4. Click **OK**. The new token appears in the list: **copy it now** and keep it somewhere safe.

</TabItem>
<TabItem value="curl" label="curl (REST API)">

Ask the REST API to create a token for the current user (`me`), authenticating once with your username and password:

<Terminal shell title="create a token valid for 30 days">{`
curl -X POST \\
  -u 'your-username:your-password' \\
  -H 'Content-Type: application/json' \\
  -d '{ "description": "terraform", "expiresIn": "30 days" }' \\
  https://your-xo-hostname/rest/v0/users/me/authentication_tokens
`}</Terminal>

The answer contains the token in `token.id`:

```json
{
  "token": {
    "id": "UlTBEnFeL12XocK-7Qx-DKvOYbPn0eG7Z2oMvOniNjg",
    "user_id": "e531b8c9-3876-4ed9-8fd2-0476d5f825c9",
    "created_at": 1765187444219,
    "expiration": 1767779444219
  }
}
```

:::note
Add `-k` to the command if your XO instance uses a self-signed certificate.
:::

</TabItem>
<TabItem value="xo-cli" label="xo-cli">

<Terminal title="create a token with xo-cli">{`
xo-cli create-token your-xo-hostname your-username
Password: ********
Successfully logged with your-username
Authentication token created

DiYBFavJwf9GODZqQJs23eAx9eh3KlsRhBi8RcoX0KM
`}</Terminal>

</TabItem>
</Tabs>

:::info Maximum validity
Tokens cannot live longer than the `maxTokenValidity` setting of the XO configuration (half a year by default). See [REST API: maximum token validity](restapi.md#maximum-token-validity).
:::

## Step 2: store it outside your code

:::warning
Never write a token in a file that ends up in version control. Anyone who reads it can act on your infrastructure with your rights.
:::

Most tools read the same environment variables, so a single file in your home directory serves them all. Create `~/.xoa`:

```bash
# ~/.xoa: Xen Orchestra credentials, never commit this file
export XOA_URL=wss://your-xo-hostname   # wss:// for Terraform, Pulumi and the Go SDK v1
export XOA_TOKEN=your-token
# export XOA_INSECURE=true              # only if XO uses a self-signed certificate
```

Restrict it to your user, then load it in each new terminal:

<Terminal shell title="protect the file and load the variables">{`
chmod 600 ~/.xoa
source ~/.xoa
`}</Terminal>

Each tool reads its credentials slightly differently:

| Tool | Where it reads the credentials |
| --- | --- |
| Terraform / OpenTofu | `XOA_URL`, `XOA_TOKEN` (or `XOA_USER` and `XOA_PASSWORD`), `XOA_INSECURE`, or the `provider` block. [Guide](infrastructure-as-code/terraform-provider.md#authentication) |
| Pulumi | The same variables, or the stack configuration (`pulumi config set xenorchestra:token --secret`). [Guide](infrastructure-as-code/pulumi-provider.md#authentication) |
| Go SDK | The same variables (v2 expects an `https://` URL). [Guide](scripting/go-sdk.md) |
| PowerShell | The `-Token` parameter of `Connect-XoSession`. [Guide](scripting/powershell-module.md) |
| Ansible inventory | `user` and `password` in the inventory file (vault-encrypted), or `ANSIBLE_XO_USER` and `ANSIBLE_XO_PASSWORD`. [Guide](scripting/ansible.md) |
| MCP server | Its own variables: `XO_URL` (`https://`) and `XO_TOKEN`. [Guide](mcp.md#configure-authentication) |
| REST API (`curl`) | The `authenticationToken` cookie. [Guide](restapi.md#authentication) |

In CI pipelines, store the token in your CI secret store (GitLab CI variables, GitHub Actions secrets, Vault…) and expose it to the job as `XOA_TOKEN`.

## Step 3: check that it works

Ask XO who you are, using the token:

<Terminal shell title="check the token">{`
curl -b authenticationToken=$XOA_TOKEN https://your-xo-hostname/rest/v0/users/me
`}</Terminal>

A JSON description of your user means the token is valid. A `401 Unauthorized` answer means the token is wrong, expired or revoked.

## Step 4: renew or revoke a token

- **Renew**: tokens expire. Before that, create a new one (step 1), update it everywhere it is stored, then revoke the old one.
- **Revoke**: on your user page, in **Authentication tokens**, delete the token. Every tool using it is disconnected immediately.

:::tip
Give each tool and each machine its own token, with a clear description. When one leaks or is no longer needed, you revoke it without breaking the others.
:::

## Related links

- [REST API authentication](restapi.md#authentication)
- [Users](../security/user-management/users.md) and [RBAC](../security/user-management/rbac.md)
