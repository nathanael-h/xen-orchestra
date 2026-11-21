# Plan : documentation DevOps / Kubernetes / cloud native

> Document de travail (non publié : il est hors de `docs/docs/`, Docusaurus ne le construit pas).
> État analysé le 2026-11-21 : fork `nathanael-h/xen-orchestra` (master) + branche par défaut de chaque dépôt `vatesfr/*`.

## 1. Objectifs

1. Pour chaque outil, une page **« Getting started » pas à pas**, en anglais, très didactique.
2. **Centraliser** la doc utilisateur sur le site Docusaurus de `docs/` (servi sur `docs.xen-orchestra.com`) et **supprimer les doublons** dans les dépôts.

## 2. Cartographie actuelle

Légende : ✅ complet · 🟡 partiel / à reprendre · ❌ absent · ⚠️ obsolète

### 2.1 Pages existantes sur le site XO (`docs/docs/automation/`, catégorie « Automation & API »)

| Page | Lignes | Contenu | État |
| --- | --- | --- | --- |
| `terraform-provider.md` | 260 | Tutoriel complet : install, auth, 1re VM, mise à jour, logs | ✅ — ⚠️ version `~> 0.40` (dernière : v0.41.2) |
| `pulumi-provider.md` | 264 | Tutoriel complet TypeScript : install, auth, 1re VM, mise à jour, state | ✅ — TypeScript seulement |
| `packer-provider.md` | 83 | Squelette minimal, renvoie vers l'exemple du dépôt | 🟡 pas de vrai pas-à-pas — ⚠️ `>= v0.9.0` (dernière : v0.12.0) |
| `powershell-module.md` | 137 | Install, connexion, pipeline, exemple snapshot | ✅ — ⚠️ `1.0.0-beta` (dernière : 1.1.0-beta) ; tableau des cmdlets en doublon avec le README |
| `ansible.md` | 211 | Inventaire dynamique : config, vault, groupes, playbook, debug | ✅ |
| `kubernetes.md` | 227 | **Recette Hub MicroK8s** uniquement (+ section CCM / rotation du token) | ✅ pour la recette ; rien sur CCM/CSI/CAPI en standalone |
| `restapi.md`, `mcp.md` | — | Hors périmètre, mais `restapi.md#authentication` sert de référence pour les tokens | — |
| Go SDK, CCM, CSI, CAPI | — | — | ❌ aucune page |

### 2.2 Documentation dans les dépôts des outils

| Outil | Dépôt | Doc présente dans le dépôt | Publiée où | Nature |
| --- | --- | --- | --- | --- |
| Terraform / OpenTofu | `vatesfr/terraform-provider-xenorchestra` | `docs/index.md`, `docs/resources/*.md`, `docs/data-sources/*.md` (générés par tfplugindocs depuis `templates/` + `examples/`) ; README (install, **section debug en doublon**) ; CONTRIBUTING | **Terraform Registry** (+ OpenTofu registry) | Référence ressources/data-sources → **doit rester** (format imposé par le registry) |
| Pulumi | `vatesfr/pulumi-xenorchestra` | `docs/_index.md` (exemples 5 langages), `docs/installation-configuration.md` ; README ; `examples/` | **Pulumi Registry** | Référence + install → doit rester (format registry). ⚠️ dépôt peu actif (dernier commit 2026-02, provider TF embarqué 0.37) |
| Packer | `vatesfr/packer-plugin-xenserver` | README (usage, remplacement de templates, build) ; `docs/builders/iso/xenserver-iso.html.markdown` (référence de toutes les options) ; `examples/README.md` + exemple Ubuntu | **Packer Integrations** (HashiCorp) via `docs/` | Référence builder → doit rester |
| PowerShell | `vatesfr/xo-powershell` | README 136 l. (prérequis, install, liste des cmdlets, exemples, pipeline) ; `docs/design.md`, `docs/implementation-notes.md` (dev, quasi vides) | GitHub + PowerShell Gallery | **Doublon** avec la page XO |
| Go SDK | `vatesfr/xenorchestra-go-sdk` | README ; `docs/v1/` (overview) ; `docs/v2/01..06` (overview, architecture, migration v1→v2, implémentation de service, lazy v1 client, tests d'intégration) ; `examples/v1`, `examples/v2` | GitHub + pkg.go.dev | Mélange utilisateur (overview, migration) / contributeur (archi, services, tests) |
| Ansible | `ansible-collections/community.general` (externe, pas Vates) | Doc du plugin `xen_orchestra` | docs.ansible.com | Référence upstream → on ne la touche pas, on lie |
| Kubernetes CCM | `vatesfr/xenorchestra-cloud-controller-manager` | README (contrôleurs, config, variables d'env) ; `docs/install.md` (prérequis, token, kubectl, Helm, reverse proxy, RBAC, troubleshooting) ; `docs/node-out-of-service.md` ; `docs/faq.md` ; `docs/release.md`, `docs/cosign.md` ; README du chart Helm | GitHub uniquement | Doc utilisateur **uniquement dans le dépôt** ; recoupe `kubernetes.md` (fonctions du CCM, token) |
| Kubernetes CSI | `vatesfr/xenorchestra-csi-driver` | README ; `docs/README.md` (index) ; `install.md`, `install-helm.md`, `install-static.md`, `usage.md`, `topology.md` ; `migrations/` (v0.2→0.3, v0.3→0.4) ; `references/` (local storage, VDI lookup, VBD reconciliation, volume handle) ; `development.md`, `release.md` ; README du chart | GitHub uniquement | Doc utilisateur riche, **uniquement dans le dépôt** |
| Kubernetes CAPI | `vatesfr/cluster-api-provider-vates` | **Site MkDocs complet** (~40 pages) : concept (4), getting started (prérequis, install, quickstart, tutoriel en 3 parties), guides (kubeadm, Vates Kube OS, Talos ×4, Rancher, ClusterClass, IPAM, VIP, networking, SSH keys, VM naming), operations (upgrade, troubleshooting, releasing), reference (CRDs ×4, templates, bootstrap), contributing (archi, dev, tests) ; + `templates/*/README.md` ; README ; AGENTS.md, REPORT.md, TOFIX.md | **vates-capi.readthedocs.io** (site séparé) | Le plus gros chantier de centralisation |

Dernières versions (tags) : Terraform v0.41.2 · Pulumi v2.4.0-alpha.1 · Packer v0.12.0 · PowerShell 1.1.0-beta · Go SDK v1.22.1 · CCM v1.3.0 · CSI v1.0.0-rc.2 · CAPI v1.1.0-rc6.

### 2.3 Doublons identifiés

| Sujet | Où il est dupliqué |
| --- | --- |
| Auth / variables d'env Terraform (`XOA_URL`, `XOA_TOKEN`…) | page XO + `docs/index.md` (registry) |
| Debug Terraform (`TF_LOG_PROVIDER`) | page XO + README Terraform |
| Exemples Pulumi | page XO + `docs/_index.md` (registry) |
| Liste des cmdlets PowerShell + exemples | page XO + README xo-powershell |
| Fonctions du CCM, création/rotation du token | `kubernetes.md` + README CCM + `docs/install.md` CCM |
| Prérequis CCM pour le CSI | `install.md` CSI + doc CCM |
| Création d'un token API XO | répétée dans Terraform, Pulumi, PowerShell, CCM, CSI, CAPI |
| Préparation d'un template cloud-init | Terraform, Pulumi, CAPI (prérequis), Packer |
| CAPI tout entier | site readthedocs séparé (aucune page XO) |

## 3. Principe de centralisation proposé

| Type de contenu | Où il vit | Pourquoi |
| --- | --- | --- |
| Concepts, getting started, guides, opérations (upgrade, troubleshooting) | **docs.xen-orchestra.com** (ce dépôt) | Point d'entrée unique pour l'utilisateur, recherche fédérée, style homogène |
| Référence générée et imposée par un registry (ressources Terraform, Pulumi registry, options du builder Packer, `values.yaml` des charts Helm via helm-docs, godoc) | **dépôt de l'outil** | Générée depuis le code, versionnée avec l'outil ; la page XO **y renvoie** au lieu de la recopier |
| Doc contributeur (dev, release, archi, tests, AGENTS.md) | **dépôt de l'outil** | Ne concerne pas l'utilisateur final |
| README des dépôts | **court** : 1 paragraphe, badge, install en 1 ligne, lien « 📖 Documentation → docs.xen-orchestra.com/… », liens contributeur | Supprime les doublons sans casser GitHub |

Règle : un fait = un seul endroit. Les pages XO **renvoient** à la référence générée ; les dépôts **renvoient** au guide XO.

## 4. Arborescence cible (sidebar « Automation & API »)

```
Automation & API
├── Overview: choose your automation tool        (nouveau — tableau « quel outil pour quoi »)
├── Authenticate your tools (API tokens)         (nouveau — page partagée, supprime 6 doublons)
├── REST API · MCP                               (existant, inchangé)
├── Infrastructure as Code
│   ├── Terraform / OpenTofu                     (existant, à rafraîchir)
│   ├── Pulumi                                   (existant, à rafraîchir + onglets Python/Go)
│   └── Packer                                   (à réécrire en vrai pas-à-pas)
├── Scripting & configuration management
│   ├── Ansible dynamic inventory                (existant)
│   ├── PowerShell module                        (existant, à rafraîchir)
│   └── Go SDK                                   (nouveau)
└── Kubernetes & cloud native
    ├── Overview (recipe vs Cluster API, rôle du CCM et du CSI, schéma)   (nouveau)
    ├── Kubernetes recipe (MicroK8s)             (existant, section CCM allégée → lien)
    ├── Cloud Controller Manager
    │   ├── Getting started                      (nouveau, depuis docs/install.md)
    │   ├── Configuration                        (depuis README)
    │   ├── Node out-of-service                  (migré)
    │   └── FAQ & troubleshooting                (migré)
    ├── CSI driver
    │   ├── Getting started (Helm)               (nouveau, depuis install*.md)
    │   ├── Provisioning volumes (usage)         (migré)
    │   ├── Topology & placement                 (migré)
    │   ├── Upgrading (migrations)               (migré)
    │   └── Technical references                 (migré)
    └── Cluster API (CAPI)
        ├── Concepts                             (migré, 4 pages → 1 ou 2)
        ├── Getting started (prérequis + install + quickstart)  (migré/réécrit)
        ├── Tutorial: a cluster from A to Z      (migré)
        ├── Guides: kubeadm, Talos, Rancher, Vates Kube OS, ClusterClass, IPAM, VIP, networking, SSH keys, VM naming  (migrés)
        ├── Operations: upgrading, troubleshooting  (migrés)
        └── Reference: CRDs, templates, bootstrap   (migré, ou lien si on garde readthedocs pour la référence)
```

## 5. Gabarit d'une page « Getting started »

Toutes les pages getting started suivent le même plan, pour être didactiques et prévisibles :

1. **What you'll build** — le résultat en une phrase + capture/schéma.
2. **How it works** — schéma (qui parle à quoi : XO API, hôte XCP-ng, cluster…).
3. **Before you start** — checklist cochable (versions minimales, accès réseau, token, template).
4. **Step 1…N** — une action par étape, commande copiable (`<Terminal>`), **sortie attendue** affichée, encadré « If you see… » pour l'erreur la plus courante.
5. **Check that it works** — commande de vérification + résultat attendu.
6. **Clean up** — comment tout supprimer.
7. **Next steps** — liens vers guides et référence (registry, chart, dépôt).
8. **Troubleshooting** — 3 à 5 problèmes fréquents.

Composants Docusaurus existants réutilisés : `<Terminal>`, `<UiShot>`, `<UiDetail>`, admonitions ; à ajouter : `<Tabs>` pour les langages (Pulumi, Go) et les méthodes d'install (Helm / kubectl).

## 6. Pages manquantes ou à refaire (backlog)

| # | Page | Source principale | Priorité |
| --- | --- | --- | --- |
| 1 | Kubernetes & cloud native — Overview | synthèse | Haute |
| 2 | CCM — Getting started | CCM `README.md`, `docs/install.md` | Haute |
| 3 | CSI — Getting started | CSI `docs/install.md`, `install-helm.md` | Haute |
| 4 | CAPI — Getting started (+ migration du site) | CAPI `docs/getting-started/**` | Haute |
| 5 | Go SDK — Getting started | Go SDK `README.md`, `docs/v2/01-overview.md`, `examples/` | Haute |
| 6 | Packer — vrai pas-à-pas (Debian/Ubuntu ISO → template utilisable par Terraform) | Packer `README.md`, `examples/` | Moyenne |
| 7 | Authenticate your tools (API tokens) | `restapi.md#authentication` + recettes | Moyenne |
| 8 | Overview: choose your automation tool | synthèse | Moyenne |
| 9 | CCM / CSI / CAPI — pages secondaires (config, usage, topology, guides, ops, migrations) | dépôts | Moyenne |
| 10 | Rafraîchissement versions Terraform / Packer / PowerShell / Pulumi | tags | Basse (rapide) |
| 11 | Allègement des README + redirection readthedocs | dépôts `vatesfr/*` | Après publication |

## 7. Phasage proposé

1. **Phase 0 — socle** : nouvelle arborescence (sous-catégories), page « Authenticate your tools », gabarit getting started, overview Kubernetes.
2. **Phase 1 — Kubernetes** : CCM, CSI, CAPI getting started (c'est là qu'il n'y a rien aujourd'hui).
3. **Phase 2 — DevOps** : Go SDK, Packer pas-à-pas, rafraîchissement Terraform / Pulumi / PowerShell, dédoublonnage.
4. **Phase 3 — migration des pages secondaires** CCM / CSI / CAPI.
5. **Phase 4 — dépôts** : PR dans chaque dépôt `vatesfr/*` pour réduire README/`docs/` à un renvoi, et redirection de vates-capi.readthedocs.io.

Chaque phase = une PR séparée sur le fork, plus facile à relire.
