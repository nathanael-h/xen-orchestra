---
slug: /automation
sidebar_position: 1
sidebar_label: Overview
description: 'Pick the right tool to automate Xen Orchestra, from the REST API to Terraform, Pulumi, Packer, Ansible, PowerShell and the Go SDK.'
---

# Automate Xen Orchestra: choose your tool

Everything you do in the Xen Orchestra (XO) web interface can also be done from code. This page helps you pick the right tool for the job, then sends you to a step-by-step guide.

## Which tool for which job?

| I want to… | Use | Guide |
| --- | --- | --- |
| Call XO from any language or from `curl` | **REST API** | [REST API](restapi.md) |
| Let an AI assistant query or act on my infrastructure | **MCP server** | [Model Context Protocol](mcp.md) |
| Describe my VMs, networks and disks in declarative files, and keep them in Git | **Terraform** or **OpenTofu** | [Terraform / OpenTofu provider](infrastructure-as-code/terraform-provider.md) |
| Do the same, but in TypeScript, Python, Go, C# or YAML | **Pulumi** | [Pulumi provider](infrastructure-as-code/pulumi-provider.md) |
| Build reusable VM templates (golden images) from an ISO | **Packer** | [Packer plugin](infrastructure-as-code/packer-provider.md) |
| Configure the software inside my VMs with playbooks that always target the right VMs | **Ansible** | [Ansible dynamic inventory](scripting/ansible.md) |
| Script day-to-day operations (start, stop, snapshot, export…) on Windows, Linux or macOS | **PowerShell** | [PowerShell module](scripting/powershell-module.md) |
| Write my own tool, controller or integration in Go | **Go SDK** | [Xen Orchestra Go SDK](scripting/go-sdk.md) |
| Run Kubernetes clusters on XCP-ng | **Kubernetes recipe** or **VMK** | [Kubernetes](/category/kubernetes) |

:::tip Typical combination
A common workflow chains three tools: **Packer** builds a cloud-init-ready template, **Terraform** (or Pulumi) clones it into VMs, and **Ansible** configures what runs inside them.
:::

## How the tools talk to Xen Orchestra

Every tool goes through Xen Orchestra, except Packer, which talks directly to an XCP-ng host:

| Tool | Talks to | Protocol | Authentication |
| --- | --- | --- | --- |
| REST API, MCP, PowerShell, Go SDK (v2) | Xen Orchestra | REST over HTTPS (`https://`) | API token (recommended) or username and password |
| Terraform / OpenTofu, Pulumi, Go SDK (v1) | Xen Orchestra | JSON-RPC over WebSocket (`wss://`) | API token (recommended) or username and password |
| Ansible dynamic inventory | Xen Orchestra | JSON-RPC over WebSocket | Username and password only |
| Packer | XCP-ng host | XAPI + SSH | Host `root` credentials |

Whatever the tool, start by giving it its own credentials: see [Authenticate your tools](authentication.md).

## Get help

- **Commercial support**: open a ticket from your customer portal.
- **Community**: the [Infrastructure as Code category of the XCP-ng forum](https://xcp-ng.org/forum/category/29/infrastructure-as-code) and the [Discord community](https://discord.com/invite/ZpNq8ez).
