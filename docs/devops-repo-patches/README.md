# Phase 3 patches for the `vatesfr/*` tool repositories

These patches shorten the READMEs of the tool repositories and point them to the
guides on docs.xen-orchestra.com, as planned in `../DEVOPS_DOCS_PLAN.md`.
They could not be pushed from this session (no write access to `vatesfr/*`).

**Apply them only once the new pages are live on docs.xen-orchestra.com**, otherwise
the links are broken.

| Patch | Repository | Changes |
| --- | --- | --- |
| `terraform-provider-xenorchestra.patch` | vatesfr/terraform-provider-xenorchestra | Docs section points to the getting started guide + registry reference; debug section reduced to a link |
| `pulumi-xenorchestra.patch` | vatesfr/pulumi-xenorchestra | Getting started link; **fixes** `XOA_USERNAME` → `XOA_USER` (the provider reads `XOA_USER`) and the Go module path (`sdk` → `sdk/v2`) |
| `packer-plugin-xenserver.patch` | vatesfr/packer-plugin-xenserver | Getting started link; **fixes** the broken link to the builder reference in `examples/README.md` |
| `xo-powershell.patch` | vatesfr/xo-powershell | Getting started link; the incomplete cmdlet list and examples are replaced by `Get-Command` and a link to the guide |
| `xenorchestra-go-sdk.patch` | vatesfr/xenorchestra-go-sdk | Getting started link |

Not touched, as decided: cluster-api-provider-vates (readthedocs), xenorchestra-cloud-controller-manager
and xenorchestra-csi-driver (VMK technology preview).

To apply one, from a clone of the target repository:

```bash
git am /path/to/xo-powershell.patch
```
