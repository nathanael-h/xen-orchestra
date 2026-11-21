---
slug: /automation/packer-provider
sidebar_position: 3
description: 'Build a reusable, cloud-init-ready Ubuntu template on XCP-ng with Packer and the Vates XenServer plugin, step by step.'
---

# Packer plugin

## Introduction

[Packer](https://developer.hashicorp.com/packer) builds machine images from code: you describe an image once, and rebuild it identically whenever you need a fresh one. On XCP-ng, Packer builds **golden VM templates** (an installed OS, its updates, the guest agent, your own tools) instead of you preparing them by hand.

Vates maintains the [XenServer Packer plugin](https://github.com/vatesfr/packer-plugin-xenserver), validated with **XCP-ng 8.3**. It is developed alongside the [Terraform provider](./terraform-provider.md): the templates you build with Packer are ready to be cloned into VMs by Terraform, [Pulumi](./pulumi-provider.md), the [REST API](../restapi.md) or the Xen Orchestra web interface.

**In this guide, you will** build an **Ubuntu 24.04** template from the official installer ISO, fully unattended, and find it in Xen Orchestra.

## How it works

```
 your workstation                      XCP-ng pool primary
┌──────────────┐  XAPI + SSH   ┌──────────────────────────────────────┐
│ packer build │ ────────────► │ 1. downloads the ISO to an ISO SR    │
└──────────────┘               │ 2. creates a VM and boots the ISO    │
                               │ 3. types the boot command (VNC)      │
                               │ 4. Ubuntu autoinstall runs unattended│
                               │ 5. Packer SSHes in, runs provisioners│
                               │ 6. VM shut down, turned into template│
                               └──────────────────────────────────────┘
```

:::note
Unlike the other tools of this section, the plugin talks **directly to the XCP-ng pool primary** (XAPI and SSH), not to the Xen Orchestra API. Xen Orchestra then sees and manages the resulting template like any other.
:::

## Before you start

- [ ] An **XCP-ng 8.3** pool, and the address and `root` password of its **pool primary** (master).
- [ ] An **ISO storage repository** (SR) on the pool, where Packer uploads the installer, and a regular SR for the VM disk.
- [ ] **Packer 1.10** or newer on your workstation: see the [Packer installation guide](https://developer.hashicorp.com/packer/install).
- [ ] **Internet access** from your workstation (to download the ISO) and from the VM network (the installer downloads packages and the guest agent).

## Step 1: create the project

Create a directory with the following layout. We fill each file in the next steps.

```
ubuntu-template/
├── ubuntu-2404.pkr.hcl      # what to build
└── http/
    ├── meta-data            # empty file, required by autoinstall
    └── user-data            # answers for the Ubuntu installer
```

<Terminal shell title="create the layout">{`
mkdir -p ubuntu-template/http && cd ubuntu-template
touch http/meta-data
`}</Terminal>

## Step 2: describe the unattended installation

Ubuntu's installer reads its answers from a `user-data` file ([autoinstall](https://canonical-subiquity.readthedocs-hosted.com/en/latest/intro-to-autoinstall.html)). Packer puts this file on a virtual CD attached to the VM.

Create `http/user-data`:

```yaml
#cloud-config
autoinstall:
  version: 1
  identity:
    hostname: ubuntu-server
    username: packer
    # Hash of the password 'ubuntu', generate yours with: mkpasswd -m sha-512
    password: "$6$exDY1mhS4KUYCE/2$zmn9ToZwTKLhCw.b4/b.ZRTIZM30JZ4QrOQ2aOXJ8yk96xpcCof0kxKwuX1kqLG/ygbJ1f8wxED22bTL4F46P0"
  ssh:
    install-server: true
    allow-pw: true
  packages:
    - ca-certificates
    - curl
  late-commands:
    # Install the Xen guest agent, so XCP-ng and XO see the VM's IP and metrics
    - 'echo "deb [trusted=yes] https://gitlab.com/api/v4/projects/xen-project%252Fxen-guest-agent/packages/generic/deb-amd64/ release/" > /target/etc/apt/sources.list.d/xen.list'
    - curtin in-target --target /target -- apt-get update
    - curtin in-target --target /target -- apt-get install -y xen-guest-agent
```

:::warning
The hash above is the one of the example in the plugin repository. Generate your own password hash (`mkpasswd -m sha-512`, from the `whois` package) and put the matching clear-text password in step 3. The account only serves during the build: remove or lock it in a provisioner if your template must not keep it.
:::

## Step 3: describe the build

Create `ubuntu-2404.pkr.hcl`:

```hcl
packer {
  required_plugins {
    xenserver = {
      version = ">= v0.12.0"
      source  = "github.com/vatesfr/xenserver"
    }
  }
}

# Connection to the pool primary, read from PKR_VAR_* environment variables
variable "remote_host" {
  type      = string
  sensitive = true
}
variable "remote_username" {
  type    = string
  default = "root"
}
variable "remote_password" {
  type      = string
  sensitive = true
}
variable "sr_name" {
  type        = string
  description = "SR for the VM disk"
}
variable "sr_iso_name" {
  type        = string
  description = "ISO SR where Packer uploads the installer"
}

# Read the official checksums: they give the name of the latest 24.04 ISO
# and its checksum, so the build always uses a verified, current ISO
data "http" "ubuntu_sums" {
  url = "https://releases.ubuntu.com/24.04/SHA256SUMS"
}

locals {
  # [0] = checksum, [1] = file name, e.g. ubuntu-24.04.3-live-server-amd64.iso
  ubuntu_iso = regex("([A-Za-z0-9]+)[\\s\\*]+(ubuntu-[0-9.]+-live-server-amd64\\.iso)", data.http.ubuntu_sums.body)
  timestamp  = regex_replace(timestamp(), "[- TZ:]", "")
}

source "xenserver-iso" "ubuntu-2404" {
  # Where to build
  remote_host     = var.remote_host
  remote_username = var.remote_username
  remote_password = var.remote_password
  sr_name         = var.sr_name
  sr_iso_name     = var.sr_iso_name

  # Installation media, verified with the official checksum
  iso_url      = "https://releases.ubuntu.com/24.04/${local.ubuntu_iso[1]}"
  iso_checksum = "sha256:${local.ubuntu_iso[0]}"

  # The VM to create: start from an XCP-ng built-in template close to the OS
  clone_template  = "Ubuntu Focal Fossa 20.04"
  vm_name         = "ubuntu-24.04-gold"
  vm_description  = "Built by Packer at ${local.timestamp}"
  vm_memory       = 4096
  vcpus_max       = 2
  vcpus_atstartup = 2
  disk_size       = 20480

  # Answers for the installer, served on a virtual CD
  cd_files = ["http/meta-data", "http/user-data"]

  # Keys typed on the VM console to start the unattended installation
  boot_command = [
    "c<wait5>",
    "set gfxpayload=keep<enter>",
    "linux /casper/vmlinuz autoinstall ---<enter>",
    "initrd /casper/initrd<enter>",
    "boot<enter>"
  ]

  # How Packer logs into the installed VM (must match user-data)
  ssh_username     = "packer"
  ssh_password     = "ubuntu"
  ssh_wait_timeout = "60m"

  # Keep the result as a template on the pool, export nothing
  format  = "none"
  keep_vm = "on_success"
}

build {
  sources = ["xenserver-iso.ubuntu-2404"]

  # Wait for cloud-init to finish before Packer shuts the VM down
  provisioner "shell" {
    inline           = ["echo ubuntu | sudo -S cloud-init status --wait"]
    valid_exit_codes = [0, 2]
  }
}
```

A few settings deserve a word:

- **`iso_url` and `iso_checksum`**: both come from the official `SHA256SUMS` file, so the build always picks the latest 24.04 point release and verifies it.
- **`clone_template`**: the XCP-ng built-in template used as a starting point, which sets the right virtual hardware for the OS. List the ones available on your pool, then pick the closest Ubuntu one:

  <Terminal shell title="on the pool primary: list the Ubuntu built-in templates">{`
  xe template-list params=name-label | grep -i ubuntu
  `}</Terminal>

- **`format = "none"` and `keep_vm = "on_success"`**: the VM stays on the pool and becomes a template, nothing is exported to your workstation. Use `format = "xva"` to also get an exportable file.

## Step 4: provide the credentials

Packer reads variables from `PKR_VAR_<name>` environment variables, so no secret ends up in the file:

<Terminal shell title="set the build variables">{`
export PKR_VAR_remote_host=192.168.1.10        # the pool primary
export PKR_VAR_remote_password='your-root-password'
export PKR_VAR_sr_name='Local storage'          # SR for the VM disk
export PKR_VAR_sr_iso_name='ISO library'        # ISO SR
`}</Terminal>

## Step 5: build

Download the plugin, check the file, then build:

<Terminal shell title="initialize, validate, build">{`
packer init .
packer validate .
packer build .
`}</Terminal>

- `packer init` downloads the plugin: `Installed plugin github.com/vatesfr/xenserver v0.12.0`.
- `packer validate` answers `The configuration is valid.`
- `packer build` takes a while (download, installation, updates): typically 15 to 30 minutes. You can watch the installation live from the VM's **Console** tab in Xen Orchestra.

The build ends with:

```
Build 'xenserver-iso.ubuntu-2404' finished after ...
```

:::tip If you see…
- **The build waits forever for SSH**: open the VM console in XO. If the installer asks questions, the boot command did not start autoinstall: increase `<wait5>` (slow hosts), or check that `user-data` starts with `#cloud-config`.
- **`Error uploading ISO`**: `sr_iso_name` must be an ISO SR that is writable from the pool primary.
- **Authentication errors**: `remote_host` must be the **pool primary**, not another host of the pool.
:::

## Check that it works

In Xen Orchestra, open **Home → Templates** and search for `ubuntu-24.04-gold`: your template is there. Create a VM from it (**New → VM**, then pick the template): it boots straight into the installed Ubuntu, with the guest agent reporting its IP address.

## Clean up

Delete the `ubuntu-24.04-gold` template from **Home → Templates**, and the installer ISO from the ISO SR if you no longer need it.

## Going further

- **Rebuild regularly**: run `packer build -force .` to replace the existing template with the same name, for an always up-to-date golden image.
- **Deploy from the template**: use it as the `template` of a [Terraform](./terraform-provider.md) or [Pulumi](./pulumi-provider.md) VM.
- **Customize**: add `provisioner` blocks (shell scripts, Ansible…) to install your tools before the image is sealed. See the [Packer documentation](https://developer.hashicorp.com/packer/docs).
- **Other distributions**: the [examples directory](https://github.com/vatesfr/packer-plugin-xenserver/tree/main/examples) also has CentOS kickstart examples.
- **All the builder options** (networks, UEFI, tags, export formats…): the [builder reference](https://github.com/vatesfr/packer-plugin-xenserver/blob/main/docs/builders/iso/xenserver-iso.html.markdown).

## Related links

- [packer-plugin-xenserver on GitHub](https://github.com/vatesfr/packer-plugin-xenserver) (releases, examples, builder reference)
- [Packer documentation](https://developer.hashicorp.com/packer/docs)
- [Ubuntu autoinstall reference](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html)
- [Terraform provider](./terraform-provider.md), to deploy VMs from the templates you build
