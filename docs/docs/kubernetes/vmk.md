---
sidebar_position: 2
sidebar_label: VMK (technology preview)
description: 'VMK, Vates Managed Kubernetes, lets you create, scale and upgrade Kubernetes clusters from Xen Orchestra 6, with upstream Cluster API under the hood.'
---

# VMK: Vates Managed Kubernetes

<TechPreview />

**VMK** (Vates Managed Kubernetes) brings a managed Kubernetes experience to your own XCP-ng pools. You create, scale and upgrade Kubernetes clusters from Xen Orchestra 6, and the clusters appear as first-class objects, next to your VMs and hosts.

## What VMK does

From the **Kubernetes** section of the Xen Orchestra 6 tree view, you can:

- **create a cluster**: give it a name, a Kubernetes version, and the number of control plane and worker nodes,
- **scale it**: change the number of workers, or of control plane nodes (1 for no fault tolerance, 3 to survive one failure, 5 for two),
- **upgrade Kubernetes**: nodes are replaced one by one with fresh ones on the new version, control plane first, then workers,
- **download its kubeconfig**, to use `kubectl`, Helm and your usual tools,
- **delete it**, together with the VMs behind it,
- **pause reconciliation**, for the whole cluster or a single node, during maintenance,
- **cordon, uncordon and drain** nodes.

Each cluster also has its own dashboard: status, version, replicas, nodes with a link to their VM, and CPU, memory and network charts.

## How it works

VMK does not invent a new lifecycle engine: it puts Xen Orchestra in front of the upstream [Cluster API](https://cluster-api.sigs.k8s.io/), the standard the Kubernetes ecosystem uses to manage clusters declaratively.

```
 Xen Orchestra 6 ──create / scale / upgrade──►  Management cluster (a VM deployed by XO)
       ▲                                         Cluster API + kubeadm + cluster-api-provider-vates
       │                                                         │ creates and replaces VMs
       │                                                         ▼
       └──── status, nodes, kubeconfig ────────  Workload cluster on your XCP-ng pool
                                                 + XO cloud controller manager + XO CSI driver
```

1. You act in Xen Orchestra (web interface or REST API). XO turns your request into Cluster API resources.
2. A **management cluster**, running in a VM that Xen Orchestra deploys and runs for you, reconciles them.
3. The **Cluster API provider** creates the node VMs of your **workload cluster** on your XCP-ng pool.
4. In each workload cluster, the **cloud controller manager** maps every node to its VM, and the **CSI driver** puts persistent volumes on your storage repositories.
5. Xen Orchestra shows the result: status, version, nodes and kubeconfig.

## Components

VMK is built on three open source Vates projects. Each can also be used on its own, with any Kubernetes cluster running on XCP-ng; their documentation lives in their repositories.

| Component | What it does | Documentation |
| --- | --- | --- |
| **cluster-api-provider-vates** | Cluster API infrastructure provider: creates, replaces and deletes the node VMs on XCP-ng, and rolls them during upgrades | [vates-capi.readthedocs.io](https://vates-capi.readthedocs.io/) · [GitHub](https://github.com/vatesfr/cluster-api-provider-vates) |
| **xenorchestra-cloud-controller-manager** | Links each Kubernetes node to its VM, sets topology labels from pools and hosts, and removes nodes whose VM is gone | [GitHub](https://github.com/vatesfr/xenorchestra-cloud-controller-manager) |
| **xenorchestra-csi-driver** | Persistent volumes for your pods, created as virtual disks on your XCP-ng storage repositories | [GitHub](https://github.com/vatesfr/xenorchestra-csi-driver) |

## Requirements

- An **XCP-ng 8.3** pool with room for a few VMs per cluster.
- **Xen Orchestra 6**, latest version.
- **Internet access** from the node VMs: they download their components.
- A **lab or non-critical environment**.

## Current limits

- One worker pool per cluster: all workers have the same size.
- Scaling is manual: no autoscaling.
- Each cluster gets its own control plane VMs.
- VMK manages clusters, not the workloads inside them: use `kubectl`, Helm or your usual tools for those.
- Air-gapped sites are not covered.
- Screens, API and behavior can change between preview builds.

## VMK or the Kubernetes recipe?

| | [Kubernetes recipe](microk8s-recipe.md) | VMK |
| --- | --- | --- |
| Status | Available | Technology preview |
| Interface | XO 5 Hub | XO 6, Kubernetes section |
| Kubernetes distribution | MicroK8s | Upstream Kubernetes (kubeadm) |
| Lifecycle after creation | Manual (MicroK8s tools) | Scale, upgrade, delete from XO |
| Cluster API | No | Yes |
