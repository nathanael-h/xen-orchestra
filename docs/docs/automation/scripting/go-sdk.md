---
slug: /automation/go-sdk
sidebar_position: 3
description: 'Write your first Go program against Xen Orchestra with the official Go SDK: list VMs, snapshot one and wait for the task.'
---

# Xen Orchestra Go SDK

## Introduction

The [Xen Orchestra Go SDK](https://github.com/vatesfr/xenorchestra-go-sdk) is the official Go client for the Xen Orchestra (XO) API. It is the library behind the [Terraform provider](../infrastructure-as-code/terraform-provider.md) and the Kubernetes components, and you can use it to write your own tools, controllers or integrations.

**In this guide, you will** write a small Go program that lists your VMs, then a second one that snapshots a VM and waits for the operation to finish.

The SDK ships two clients in the same module:

| Client | Package | API used | When to use it |
| --- | --- | --- | --- |
| **v2** (recommended for new code) | `github.com/vatesfr/xenorchestra-go-sdk/v2` | [REST API](../restapi.md) | New programs. Typed, context-aware, testable with mocks |
| v1 (legacy) | `github.com/vatesfr/xenorchestra-go-sdk/client` | JSON-RPC over WebSocket | Existing code, and features not yet in the REST API |

:::info
The v2 client is still growing. When you need an operation it does not offer yet, it gives you access to the v1 client with `client.V1Client()`, so you can use both side by side.
:::

## Before you start

- [ ] A running **Xen Orchestra** instance connected to an **XCP-ng** pool.
- [ ] **Go 1.25** or newer (`go version`).
- [ ] An **API token**: see [Authenticate your tools](../authentication.md).

## Step 1: create a Go project

<Terminal shell title="create the project and add the SDK">{`
mkdir xo-go-quickstart && cd xo-go-quickstart
go mod init example.com/xo-go-quickstart
go get github.com/vatesfr/xenorchestra-go-sdk@latest
`}</Terminal>

`go get` ends with a line like `go: added github.com/vatesfr/xenorchestra-go-sdk v1.22.1`.

## Step 2: give the SDK your credentials

The SDK reads its settings from environment variables. For the v2 client, the URL starts with `https://`:

<Terminal shell title="point the SDK at your XO instance">{`
export XOA_URL=https://your-xo-hostname
export XOA_TOKEN=your-token
# export XOA_INSECURE=true   # only if XO uses a self-signed certificate
`}</Terminal>

<details>
<summary>All the supported variables</summary>

| Variable | Purpose | Default |
| --- | --- | --- |
| `XOA_URL` | URL of your XO instance (**required**) | |
| `XOA_TOKEN` | API token (recommended) | |
| `XOA_USER`, `XOA_PASSWORD` | Username and password, if you don't use a token | |
| `XOA_INSECURE` | `true` to skip TLS certificate verification | `false` |
| `XOA_CLIENT_TIMEOUT` | HTTP timeout, as a Go duration | `30s` |
| `XOA_RETRY_MODE` | `none` or `backoff` | `none` |
| `XOA_RETRY_MAX_TIME` | Maximum time between retries | `5m` |
| `XOA_DEVELOPMENT` | `true` for verbose development logs | `false` |

To configure the SDK from code instead (for example from your own configuration file), use `config.NewWithValues`.

</details>

## Step 3: list your VMs

Create `main.go`:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/vatesfr/xenorchestra-go-sdk/pkg/config"
	v2 "github.com/vatesfr/xenorchestra-go-sdk/v2"
)

func main() {
	// Stop everything if XO does not answer within 2 minutes
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Read XOA_URL and XOA_TOKEN from the environment
	cfg, err := config.New()
	if err != nil {
		log.Fatalf("configuration: %v", err)
	}

	// Create the client
	client, err := v2.New(cfg)
	if err != nil {
		log.Fatalf("client: %v", err)
	}

	// List every VM (no limit, no filter)
	vms, err := client.VM().GetAll(ctx, 0, "")
	if err != nil {
		log.Fatalf("list VMs: %v", err)
	}

	fmt.Printf("Found %d VMs\n", len(vms))
	for _, vm := range vms {
		fmt.Printf("- %-20s %-8s %s\n", vm.NameLabel, vm.PowerState, vm.ID)
	}
}
```

Run it:

<Terminal title="run the program">{`
go run .
Found 3 VMs
- web-01               Running  b0c1d2e3-0001-4a00-8000-000000000001
- db-01                Running  b0c1d2e3-0002-4a00-8000-000000000002
- ci-runner-01         Halted   b0c1d2e3-0003-4a00-8000-000000000003
`}</Terminal>

Every service of the client follows the same pattern: `client.VM()`, `client.Host()`, `client.Pool()`, `client.SR()`, `client.VDI()`, `client.Network()`, `client.Template()`, `client.Task()`…

:::tip If you see…
- `XOA_URL is not set, please set it`: the variables of step 2 are not set in this terminal.
- `API error: 401`: the token is wrong, expired or revoked. Check it with the command in [Authenticate your tools](../authentication.md#step-3-check-that-it-works).
- `x509: certificate signed by unknown authority`: XO uses a self-signed certificate. Set `XOA_INSECURE=true`, or better, install a trusted certificate.
:::

## Step 4: act on a VM and wait for the result

Actions in XO (start, shutdown, snapshot…) are **asynchronous**: XO answers at once with a **task ID**, and the work continues in the background. The SDK can wait for the task for you.

Create `snapshot/main.go`, replacing `web-01` with the name of one of your VMs:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/vatesfr/xenorchestra-go-sdk/pkg/config"
	v2 "github.com/vatesfr/xenorchestra-go-sdk/v2"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cfg, err := config.New()
	if err != nil {
		log.Fatalf("configuration: %v", err)
	}
	client, err := v2.New(cfg)
	if err != nil {
		log.Fatalf("client: %v", err)
	}

	// 1. Find the VM by name, with an XO filter
	vms, err := client.VM().GetAll(ctx, 1, "name_label:web-01")
	if err != nil || len(vms) == 0 {
		log.Fatalf("VM web-01 not found: %v", err)
	}
	vm := vms[0]

	// 2. Ask XO to snapshot it: XO answers at once with a task
	taskID, err := client.VM().Snapshot(ctx, vm.ID, "before-upgrade")
	if err != nil {
		log.Fatalf("snapshot: %v", err)
	}
	fmt.Printf("Snapshot of %s started (task %s)\n", vm.NameLabel, taskID)

	// 3. Wait for the task to finish
	task, err := client.Task().Wait(ctx, taskID)
	if err != nil {
		log.Fatalf("wait: %v", err)
	}
	fmt.Printf("Task finished with status: %s\n", task.Status)
}
```

<Terminal title="snapshot the VM">{`
go run ./snapshot
Snapshot of web-01 started (task 070dc92875)
Task finished with status: success
`}</Terminal>

The filter passed to `GetAll` uses the same [syntax as the search bar](../../manage-your-infrastructure/manage_infrastructure.md#live-filter-search) of the XO web interface.

## Check that it works

Open the VM in Xen Orchestra, **Snapshots** tab: the `before-upgrade` snapshot is there. You can also follow the task on the **Tasks** page while the program runs.

## Clean up

Delete the `before-upgrade` snapshot from the VM's **Snapshots** tab, and remove the `xo-go-quickstart` directory.

## Going further

- **Handle errors precisely**: every v2 call returns an `*apierror.Error` with the HTTP status and XO's message. Use `apierror.IsNoSuchObject` and `apierror.IsNotFound` instead of parsing error text.
- **Test your code**: every service is an interface, with generated mocks you can use in unit tests.
- **Migrate from v1**: the repository has a [v1 to v2 migration guide](https://github.com/vatesfr/xenorchestra-go-sdk/blob/main/docs/v2/03-migration-guide.md).
- **Full API reference**: [pkg.go.dev](https://pkg.go.dev/github.com/vatesfr/xenorchestra-go-sdk), and the [examples](https://github.com/vatesfr/xenorchestra-go-sdk/tree/main/examples) of the repository.

## Related links

- [xenorchestra-go-sdk on GitHub](https://github.com/vatesfr/xenorchestra-go-sdk) (source code, examples, contributor documentation)
- [Go package reference](https://pkg.go.dev/github.com/vatesfr/xenorchestra-go-sdk)
- [REST API](../restapi.md)
- [GitHub Issues](https://github.com/vatesfr/xenorchestra-go-sdk/issues)
