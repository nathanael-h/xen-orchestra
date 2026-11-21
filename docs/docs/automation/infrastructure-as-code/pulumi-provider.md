---
slug: /automation/pulumi-provider
sidebar_position: 2
description: 'Deploy and update a VM on Xen Orchestra with Pulumi, in TypeScript, Python, Go, C# or YAML, step by step.'
---

# Pulumi provider

## Introduction

With Infrastructure as Code (IaC), you describe your infrastructure in code, which makes it **predictable**, **reproducible** and **version-controlled**. [Pulumi](https://www.pulumi.com/) lets you write that code in a real programming language, with loops, functions, tests and your usual IDE.

Xen Orchestra (XO) has an official Pulumi provider, [`vatesfr/pulumi-xenorchestra`](https://github.com/vatesfr/pulumi-xenorchestra), available for **TypeScript/JavaScript**, **Python**, **Go**, **C#/.NET** and **YAML**. It is built on top of the [Terraform provider](./terraform-provider.md), so both offer the same resources.

**In this guide, you will** create a Pulumi project, deploy a VM on your XO instance, then change it. Pick your language in the tabs: your choice is remembered across the whole page.

## Before you start

- [ ] A running **Xen Orchestra** instance connected to an **XCP-ng** pool.
- [ ] The **Pulumi CLI** 3.x: see the [Pulumi installation guide](https://www.pulumi.com/docs/install/).
- [ ] The toolchain of your language: **Node.js** 20+ (TypeScript), **Python** 3.9+, **Go** 1.24+ or the **.NET SDK** 8+. Nothing more for YAML.
- [ ] A VM **template** with **cloud-init** and the guest agent installed. The cloud-init-ready templates of the **XOA Hub** (Debian, Ubuntu…) are the easiest start. See [VM templates](../../manage-your-infrastructure/infrastructure/vm-templates.md#cloud-init-and-cloudbase-init).
- [ ] An **API token**: see [Authenticate your tools](../authentication.md).

## Step 1: create the project and add the provider

<Tabs groupId="pulumi-language" queryString="language">
<TabItem value="ts" label="TypeScript" default>

<Terminal shell title="create a TypeScript project and add the provider">{`
mkdir xo-pulumi && cd xo-pulumi
pulumi new typescript --yes
npm install @vates/pulumi-xenorchestra
`}</Terminal>

</TabItem>
<TabItem value="python" label="Python">

<Terminal shell title="create a Python project and add the provider">{`
mkdir xo-pulumi && cd xo-pulumi
pulumi new python --yes
echo "pulumi-xenorchestra" >> requirements.txt
pulumi install
`}</Terminal>

</TabItem>
<TabItem value="go" label="Go">

<Terminal shell title="create a Go project and add the provider">{`
mkdir xo-pulumi && cd xo-pulumi
pulumi new go --yes
go get github.com/vatesfr/pulumi-xenorchestra/sdk/v2
`}</Terminal>

</TabItem>
<TabItem value="csharp" label="C#">

<Terminal shell title="create a C# project and add the provider">{`
mkdir xo-pulumi && cd xo-pulumi
pulumi new csharp --yes
dotnet add package Pulumi.Xenorchestra
`}</Terminal>

</TabItem>
<TabItem value="yaml" label="YAML">

YAML programs have no package manager, so install the provider plugin explicitly. Check the [releases page](https://github.com/vatesfr/pulumi-xenorchestra/releases) for the latest version:

<Terminal shell title="create a YAML project and install the provider plugin">{`
mkdir xo-pulumi && cd xo-pulumi
pulumi new yaml --yes
pulumi plugin install resource xenorchestra v2.4.0 \\
  --server github://api.github.com/vatesfr/pulumi-xenorchestra
`}</Terminal>

</TabItem>
</Tabs>

`pulumi new` creates the project and a first **stack** named `dev`: a stack is one deployment of your program (dev, staging, production…). With `--yes`, it accepts the default answers.

:::info Where does Pulumi store its state?
Pulumi records what it deployed in a **state**. By default, `pulumi new` asks you to log into Pulumi Cloud. To keep everything on your machine instead, run `pulumi login --local` **before** `pulumi new`. See [State management](#state-management).
:::

## Step 2: connect the provider to Xen Orchestra {#authentication}

The provider talks to XO over a WebSocket connection: the URL starts with `wss://` (or `ws://` without TLS). Store the connection settings in the stack configuration, the token encrypted as a secret:

<Terminal shell title="store the XO connection settings in the stack">{`
pulumi config set xenorchestra:url wss://your-xo-hostname
pulumi config set xenorchestra:token --secret
`}</Terminal>

The second command prompts for the token, so it does not end up in your shell history. Both values are saved in `Pulumi.dev.yaml`, the token encrypted.

<details>
<summary>Other options: environment variables, username and password, self-signed certificates</summary>

| Stack configuration | Environment variable | Purpose |
| --- | --- | --- |
| `xenorchestra:url` | `XOA_URL` | XO URL, `wss://…` or `ws://…` |
| `xenorchestra:token` | `XOA_TOKEN` | API token (recommended) |
| `xenorchestra:username` | `XOA_USER` | Username, if you don't use a token |
| `xenorchestra:password` | `XOA_PASSWORD` | Password, if you don't use a token |
| `xenorchestra:insecure` | `XOA_INSECURE` | `true` to skip TLS verification (self-signed certificates) |

Environment variables are handy in CI, or to share one `~/.xoa` file with Terraform: see [Authenticate your tools](../authentication.md#step-2-store-it-outside-your-code).

</details>

## Step 3: describe the VM

The program first **looks up** the existing objects it needs (pool, template, storage repository, network) by their name in XO, so you never copy a UUID. Then it declares the VM.

Replace the content of your program file with the code below, and replace the four names (`Main pool`, `Ubuntu 24.04 Cloud-Init`, `ZFS`, `Pool-wide network`) with the exact names of your objects in Xen Orchestra.

<Tabs groupId="pulumi-language" queryString="language">
<TabItem value="ts" label="TypeScript" default>

`index.ts`:

```typescript
import * as xenorchestra from "@vates/pulumi-xenorchestra";

// 1. Look up the existing objects, by name
const pool = xenorchestra.getXoaPoolOutput({ nameLabel: "Main pool" });

const template = xenorchestra.getXoaTemplateOutput({
    nameLabel: "Ubuntu 24.04 Cloud-Init",
    poolId: pool.id,
});

const sr = xenorchestra.getXoaStorageRepositoryOutput({
    nameLabel: "ZFS",
    poolId: pool.id,
});

const network = xenorchestra.getXoaNetworkOutput({
    nameLabel: "Pool-wide network",
    poolId: pool.id,
});

// 2. Declare the VM
const vm = new xenorchestra.Vm("tutorial-vm", {
    nameLabel: "XO Pulumi tutorial",
    template: template.id,
    cpus: 1,
    memoryMax: 2 * 1024 * 1024 * 1024, // 2 GiB
    networks: [{ networkId: network.id }],
    disks: [{
        srId: sr.id,
        nameLabel: "VM root volume",
        size: 50 * 1024 * 1024 * 1024, // 50 GiB
    }],
});

// 3. Show useful values at the end of the run
export const vmId = vm.id;
export const ipv4 = vm.ipv4Addresses;
```

</TabItem>
<TabItem value="python" label="Python">

`__main__.py`:

```python
import pulumi
import pulumi_xenorchestra as xenorchestra

GiB = 1024 ** 3

# 1. Look up the existing objects, by name
pool = xenorchestra.get_xoa_pool(name_label="Main pool")

template = xenorchestra.get_xoa_template(
    name_label="Ubuntu 24.04 Cloud-Init",
    pool_id=pool.id,
)

sr = xenorchestra.get_xoa_storage_repository(
    name_label="ZFS",
    pool_id=pool.id,
)

network = xenorchestra.get_xoa_network(
    name_label="Pool-wide network",
    pool_id=pool.id,
)

# 2. Declare the VM
vm = xenorchestra.Vm(
    "tutorial-vm",
    name_label="XO Pulumi tutorial",
    template=template.id,
    cpus=1,
    memory_max=2 * GiB,
    networks=[xenorchestra.VmNetworkArgs(network_id=network.id)],
    disks=[
        xenorchestra.VmDiskArgs(
            sr_id=sr.id,
            name_label="VM root volume",
            size=50 * GiB,
        )
    ],
)

# 3. Show useful values at the end of the run
pulumi.export("vmId", vm.id)
pulumi.export("ipv4", vm.ipv4_addresses)
```

</TabItem>
<TabItem value="go" label="Go">

`main.go`:

```go
package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	xo "github.com/vatesfr/pulumi-xenorchestra/sdk/v2/go/xenorchestra"
)

const GiB = 1024 * 1024 * 1024

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// 1. Look up the existing objects, by name
		pool, err := xo.GetXoaPool(ctx, &xo.GetXoaPoolArgs{NameLabel: "Main pool"})
		if err != nil {
			return err
		}
		template, err := xo.GetXoaTemplate(ctx, &xo.GetXoaTemplateArgs{
			NameLabel: "Ubuntu 24.04 Cloud-Init",
			PoolId:    &pool.Id,
		})
		if err != nil {
			return err
		}
		sr, err := xo.GetXoaStorageRepository(ctx, &xo.GetXoaStorageRepositoryArgs{
			NameLabel: "ZFS",
			PoolId:    &pool.Id,
		})
		if err != nil {
			return err
		}
		network, err := xo.LookupXoaNetwork(ctx, &xo.LookupXoaNetworkArgs{
			NameLabel: "Pool-wide network",
			PoolId:    &pool.Id,
		})
		if err != nil {
			return err
		}

		// 2. Declare the VM
		vm, err := xo.NewVm(ctx, "tutorial-vm", &xo.VmArgs{
			NameLabel: pulumi.String("XO Pulumi tutorial"),
			Template:  pulumi.String(template.Id),
			Cpus:      pulumi.Int(1),
			MemoryMax: pulumi.Float64(2 * GiB),
			Networks: xo.VmNetworkArray{
				xo.VmNetworkArgs{NetworkId: pulumi.String(network.Id)},
			},
			Disks: xo.VmDiskArray{
				xo.VmDiskArgs{
					SrId:      pulumi.String(sr.Id),
					NameLabel: pulumi.String("VM root volume"),
					Size:      pulumi.Float64(50 * GiB),
				},
			},
		})
		if err != nil {
			return err
		}

		// 3. Show useful values at the end of the run
		ctx.Export("vmId", vm.ID())
		ctx.Export("ipv4", vm.Ipv4Addresses)
		return nil
	})
}
```

</TabItem>
<TabItem value="csharp" label="C#">

`Program.cs`:

```csharp
using System.Collections.Generic;
using Pulumi;
using Pulumi.Xenorchestra;
using Pulumi.Xenorchestra.Inputs;

const double GiB = 1024L * 1024 * 1024;

return await Deployment.RunAsync(() =>
{
    // 1. Look up the existing objects, by name
    var pool = GetXoaPool.Invoke(new GetXoaPoolInvokeArgs { NameLabel = "Main pool" });

    var template = GetXoaTemplate.Invoke(new GetXoaTemplateInvokeArgs
    {
        NameLabel = "Ubuntu 24.04 Cloud-Init",
        PoolId = pool.Apply(p => p.Id),
    });

    var sr = GetXoaStorageRepository.Invoke(new GetXoaStorageRepositoryInvokeArgs
    {
        NameLabel = "ZFS",
        PoolId = pool.Apply(p => p.Id),
    });

    var network = GetXoaNetwork.Invoke(new GetXoaNetworkInvokeArgs
    {
        NameLabel = "Pool-wide network",
        PoolId = pool.Apply(p => p.Id),
    });

    // 2. Declare the VM
    var vm = new Vm("tutorial-vm", new VmArgs
    {
        NameLabel = "XO Pulumi tutorial",
        Template = template.Apply(t => t.Id),
        Cpus = 1,
        MemoryMax = 2 * GiB,
        Networks = new[]
        {
            new VmNetworkArgs { NetworkId = network.Apply(n => n.Id) },
        },
        Disks = new[]
        {
            new VmDiskArgs
            {
                SrId = sr.Apply(s => s.Id),
                NameLabel = "VM root volume",
                Size = 50 * GiB,
            },
        },
    });

    // 3. Show useful values at the end of the run
    return new Dictionary<string, object?>
    {
        ["vmId"] = vm.Id,
        ["ipv4"] = vm.Ipv4Addresses,
    };
});
```

</TabItem>
<TabItem value="yaml" label="YAML">

`Pulumi.yaml` (keep the `name` line that `pulumi new` generated):

```yaml
name: xo-pulumi
runtime: yaml

variables:
  # 1. Look up the existing objects, by name
  pool:
    fn::invoke:
      function: xenorchestra:getXoaPool
      arguments:
        nameLabel: Main pool
  template:
    fn::invoke:
      function: xenorchestra:getXoaTemplate
      arguments:
        nameLabel: Ubuntu 24.04 Cloud-Init
        poolId: ${pool.id}
  sr:
    fn::invoke:
      function: xenorchestra:getXoaStorageRepository
      arguments:
        nameLabel: ZFS
        poolId: ${pool.id}
  network:
    fn::invoke:
      function: xenorchestra:getXoaNetwork
      arguments:
        nameLabel: Pool-wide network
        poolId: ${pool.id}

resources:
  # 2. Declare the VM
  tutorial-vm:
    type: xenorchestra:Vm
    properties:
      nameLabel: XO Pulumi tutorial
      template: ${template.id}
      cpus: 1
      memoryMax: 2147483648     # 2 GiB
      networks:
        - networkId: ${network.id}
      disks:
        - srId: ${sr.id}
          nameLabel: VM root volume
          size: 53687091200     # 50 GiB

# 3. Show useful values at the end of the run
outputs:
  vmId: ${tutorial-vm.id}
  ipv4: ${tutorial-vm.ipv4Addresses}
```

</TabItem>
</Tabs>

:::tip
If your template has several disks, declare the same number of disks, in the same order, each at least as large as its counterpart in the template.
:::

## Step 4: deploy

<Terminal shell title="preview and deploy">{`
pulumi up
`}</Terminal>

Pulumi first shows a **preview** of what it is about to do:

```
     Type                       Name             Plan
 +   pulumi:pulumi:Stack        xo-pulumi-dev    create
 +   └─ xenorchestra:index:Vm   tutorial-vm      create

Resources:
    + 2 to create
```

Select **yes**. After a minute or so, the VM is running on your pool, and Pulumi prints the `vmId` and `ipv4` outputs.

<UiShot light="/img/xo5/pulumi-vm-general.png" alt="The freshly deployed VM, seen from its General tab in Xen Orchestra" url="https://your-xo/#/vms/…/general" />

:::tip If you see…
- **`… not found`** during the preview: one of the four names does not match an object in XO exactly (names are case-sensitive).
- **An authentication or connection error**: check that the URL starts with `wss://` (not `https://`), and that the token is valid (see [Authenticate your tools](../authentication.md#step-3-check-that-it-works)).
- **`certificate signed by unknown authority`**: XO uses a self-signed certificate. Run `pulumi config set xenorchestra:insecure true`, or better, install a trusted certificate.
:::

## Step 5: change the VM

Pulumi really shines when your infrastructure changes. Let's add a **second network interface**: add a second entry to the networks list of the VM.

<Tabs groupId="pulumi-language" queryString="language">
<TabItem value="ts" label="TypeScript" default>

```typescript
    networks: [
        { networkId: network.id },
        { networkId: network.id }, // second interface
    ],
```

</TabItem>
<TabItem value="python" label="Python">

```python
    networks=[
        xenorchestra.VmNetworkArgs(network_id=network.id),
        xenorchestra.VmNetworkArgs(network_id=network.id),  # second interface
    ],
```

</TabItem>
<TabItem value="go" label="Go">

```go
			Networks: xo.VmNetworkArray{
				xo.VmNetworkArgs{NetworkId: pulumi.String(network.Id)},
				xo.VmNetworkArgs{NetworkId: pulumi.String(network.Id)}, // second interface
			},
```

</TabItem>
<TabItem value="csharp" label="C#">

```csharp
        Networks = new[]
        {
            new VmNetworkArgs { NetworkId = network.Apply(n => n.Id) },
            new VmNetworkArgs { NetworkId = network.Apply(n => n.Id) }, // second interface
        },
```

</TabItem>
<TabItem value="yaml" label="YAML">

```yaml
      networks:
        - networkId: ${network.id}
        - networkId: ${network.id}   # second interface
```

</TabItem>
</Tabs>

Run the same command again:

<Terminal shell title="preview and apply the change">{`
pulumi up
`}</Terminal>

This time, the preview shows an **update** of the existing VM (`~ update`, `[diff: ~networks]`), not a creation. Confirm with **yes**: the second interface appears on the VM.

<UiShot light="/img/xo5/pulumi-vm-network-dual.png" alt="After pulumi up: a second VIF appeared on the VM" url="https://your-xo/#/vms/…/network" />

## Clean up

Delete everything this program created:

<Terminal shell title="destroy the VM, then the stack">{`
pulumi destroy
pulumi stack rm dev
`}</Terminal>

## State management

:::warning
The Pulumi state describes your infrastructure and can contain sensitive values. Keep it in a backend you trust.
:::

<Terminal shell title="choose where the state is stored">{`
pulumi login --local               # in your home directory
pulumi login s3://my-pulumi-state  # or a self-hosted bucket (s3, gs, azblob)
`}</Terminal>

## Debugging

<Terminal shell title="run Pulumi with debug output (increase -v for more detail)">{`
pulumi up --debug
pulumi up --logtostderr -v=9
`}</Terminal>

Only enable debug logs while troubleshooting: they are very verbose.

## Going further

- **All resources and functions**: the provider also manages cloud-init configurations, extra disks (VDIs), networks, ACLs, resource sets… Since it wraps the Terraform provider, the [Terraform provider reference](https://registry.terraform.io/providers/vatesfr/xenorchestra/latest/docs) describes every argument; the names are the same, in your language's case (`name_label` becomes `nameLabel` in TypeScript).
- **Package reference** for your language: [npm](https://www.npmjs.com/package/@vates/pulumi-xenorchestra), [PyPI](https://pypi.org/project/pulumi-xenorchestra/), [Go](https://pkg.go.dev/github.com/vatesfr/pulumi-xenorchestra/sdk/v2/go/xenorchestra), [NuGet](https://www.nuget.org/packages/Pulumi.Xenorchestra).
- **Build templates in code** with [Packer](./packer-provider.md).

## Related links

- [pulumi-xenorchestra on GitHub](https://github.com/vatesfr/pulumi-xenorchestra) (source code, releases, issues)
- [Pulumi documentation](https://www.pulumi.com/docs/)
- [Terraform / OpenTofu provider](./terraform-provider.md)
- Community: [XCP-ng forum](https://xcp-ng.org/forum/category/29/infrastructure-as-code), [Discord](https://discord.com/invite/ZpNq8ez)
