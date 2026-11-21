# Plan : documentation DevOps / Kubernetes / cloud native

> Document de travail (non publié : il est hors de `docs/docs/`, Docusaurus ne le construit pas).
> État analysé le 2026-11-21 : fork `nathanael-h/xen-orchestra` (master) + branche par défaut de chaque dépôt `vatesfr/*`.

## 1. Objectifs

1. Pour chaque outil, une page **« Getting started » pas à pas**, en anglais, très didactique.
2. **Centraliser** la doc utilisateur sur le site Docusaurus de `docs/` (servi sur `docs.xen-orchestra.com`) et **supprimer les doublons** dans les dépôts.

## 1bis. Décisions prises (2026-11-21)

| Sujet | Décision |
| --- | --- |
| URL cible | `docs.xen-orchestra.com` |
| CCM, CSI, CAPI | **Pas encore couverts par les souscriptions de support Vates.** Ce sont les briques de **VMK** (voir §1ter). → **Priorité basse**, marqués *tech preview* |
| CAPI / readthedocs | **On ne touche pas** à `vates-capi.readthedocs.io` pour l'instant : pas de migration, la doc XO se contente d'une page de présentation qui y renvoie |
| Phase 4 (alléger les README des dépôts `vatesfr/*`) | **Oui**, dans le périmètre |
| Pulumi | **Onglets multi-langages** (TypeScript, Python, Go, C#, YAML) |
| Validation | Pas d'environnement de test réel ; mock [`vatesfr/xo-api-sim`](https://github.com/vatesfr/xo-api-sim) disponible (voir §8) |

## 1ter. VMK — ce que ça change pour la doc

Source : page de présentation <https://cdn.vates.tech/vmk/> (technology preview, montrée à KubeCon NA 2026).

- **VMK (Vates Managed Kubernetes)** est une **fonctionnalité de Xen Orchestra 6** : une section *Kubernetes* dans l'arbre, des clusters et nœuds en objets XO de premier niveau, et un endpoint REST `/rest/v0/kubernetes`. Prérequis : XCP-ng 8.3, dernière version de XO 6, accès internet depuis les VMs des nœuds.
- Sous le capot, c'est le Cluster API upstream : un **cluster de management** (une VM déployée par XO) fait tourner Cluster API, **cluster-api-provider-vates** et kubeadm. Chaque cluster de workload reçoit le **CCM** et le **CSI** XO.
- **Neuf actions dans l'UI** : créer, scaler (workers / control plane 1-3-5), upgrader (rolling), télécharger le kubeconfig, supprimer, mettre en pause la réconciliation (cluster ou nœud), cordon/uncordon, drain.
- **Limites de la preview** : un seul pool de workers, pas d'autoscaling, pas d'air-gap, pas pour la production, UI / API / comportement susceptibles de changer entre builds.
- **Accès** : sur inscription (formulaire « Apply for the technology preview »).
- Le code VMK **n'est pas encore dans ce dépôt** : aucune trace d'UI Kubernetes ni de route REST `kubernetes` dans `@xen-orchestra/web*`, `@xen-orchestra/rest-api` ou `xo-server`, en dehors de la recette Hub.

**Conséquences sur le plan :**

1. La doc Kubernetes n'est plus une simple collection d'outils DevOps. Elle s'organise autour d'un **parcours produit** : la recette MicroK8s (XO 5 Hub, supportée aujourd'hui) d'un côté, VMK (XO 6, tech preview) de l'autre.
2. Pour la grande majorité des lecteurs, CCM, CSI et CAPI deviennent des **composants de VMK** et non des outils à installer soi-même. Sur le site XO, une page *Components* les présente (rôle, lien vers le dépôt / readthedocs pour un usage autonome). Les getting started autonomes CCM et CSI **restent dans les dépôts**, déjà bien fournis.
3. Les pages VMK suivent l'UI de XO 6 : on ne les écrit **qu'avec un build de preview disponible**, pour avoir de vraies captures et des étapes justes. D'ici là, une seule page *VMK technology preview* : présentation, architecture, prérequis, limites, lien d'inscription.
4. Une section *Kubernetes* de premier niveau dans la sidebar est plus juste qu'une sous-rubrique d'« Automation & API ». VMK est une fonctionnalité de l'UI, pas un outil d'automatisation.

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

## 4. Arborescence cible

### 4.1 « Automation & API » (outils DevOps)

```
Automation & API
├── Overview: choose your automation tool        (nouveau — tableau « quel outil pour quoi »)
├── Authenticate your tools (API tokens)         (nouveau — page partagée, supprime 6 doublons)
├── REST API · MCP                               (existant, inchangé)
├── Infrastructure as Code
│   ├── Terraform / OpenTofu                     (existant, à rafraîchir)
│   ├── Pulumi                                   (existant, à rafraîchir + onglets TS/Python/Go/C#/YAML)
│   └── Packer                                   (à réécrire en vrai pas-à-pas)
└── Scripting & configuration management
    ├── Ansible dynamic inventory                (existant)
    ├── PowerShell module                        (existant, à rafraîchir)
    └── Go SDK                                   (nouveau)
```

### 4.2 Nouvelle catégorie de premier niveau « Kubernetes »

```
Kubernetes
├── Overview: run Kubernetes on XCP-ng           (nouveau — recette MicroK8s vs VMK : statut, support,
│                                                  version de XO, cas d'usage ; tableau de choix)
├── Kubernetes recipe (MicroK8s, XO 5 Hub)       (déplacé depuis automation/kubernetes.md, supporté ;
│                                                  section CCM réduite à un lien vers Components)
├── VMK — Vates Managed Kubernetes (tech preview)
│   ├── Technology preview overview              (nouveau, maintenant : quoi, architecture, prérequis,
│   │                                              limites, comment rejoindre la preview)
│   ├── Getting started: your first cluster      (plus tard, avec un build de preview : créer → kubeconfig → kubectl)
│   ├── Manage clusters                          (plus tard : scale, upgrade, pause, delete)
│   ├── Manage nodes                             (plus tard : cordon, drain, pause d'un nœud)
│   └── REST API: /rest/v0/kubernetes            (plus tard, quand l'API sera stabilisée)
└── Components (CAPI provider, CCM, CSI)         (nouveau, une page : rôle de chacun dans VMK, usage autonome
                                                  → liens vers dépôts et vates-capi.readthedocs.io)
```

Toutes les pages VMK et *Components* commencent par une admonition commune : *Technology preview: for lab and non-critical environments, not covered by Vates support subscriptions yet*. C'est un composant MDX partagé, qu'on retire en un seul endroit au lancement du produit.

Redirection Docusaurus à prévoir : `/kubernetes` (ancienne URL de `automation/kubernetes.md`) → nouvelle URL de la recette.

Les getting started, guides et références de CCM, CSI et CAPI **restent dans leurs dépôts / sur readthedocs** pendant la preview. On réévaluera au lancement de VMK.

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
| 1 | Authenticate your tools (API tokens) — page partagée | `restapi.md#authentication` + recettes | Haute |
| 2 | Overview: choose your automation tool | synthèse | Haute |
| 3 | Go SDK — Getting started (v2 REST, mention v1) | Go SDK `README.md`, `docs/v2/01-overview.md`, `examples/` | Haute |
| 4 | Packer — vrai pas-à-pas (Debian/Ubuntu ISO → template utilisable par Terraform) | Packer `README.md`, `examples/` | Haute |
| 5 | Pulumi — refonte avec onglets TS / Python / Go / C# / YAML | page XO + `docs/_index.md` du dépôt | Haute |
| 6 | Rafraîchissement Terraform (0.41.x), PowerShell (1.1.0-beta), Packer (0.12) + dédoublonnage | tags | Haute (rapide) |
| 7 | Gabarit getting started appliqué aux pages existantes (Terraform, Ansible, PowerShell) | pages XO | Moyenne |
| 8 | Kubernetes — Overview (recette vs VMK) + déplacement de la recette dans la catégorie *Kubernetes* + redirection | page VMK, `kubernetes.md` | Basse |
| 9 | VMK — Technology preview overview | page VMK | Basse |
| 10 | Kubernetes — Components (CAPI, CCM, CSI) | README des 3 dépôts | Basse |
| 11 | VMK — Getting started, Manage clusters, Manage nodes, REST API | build de preview XO 6 | **Bloqué** (pas de build ni de code dans ce dépôt) |
| 12 | Allègement des README des dépôts (phase 4) | dépôts `vatesfr/*` | Après publication |

## 7. Phasage

1. **Phase 0 — socle** : sous-catégories de la sidebar, page « Authenticate your tools », page overview des outils, composant d'admonition *tech preview*, gabarit getting started.
2. **Phase 1 — DevOps (outils supportés)** : Go SDK, Packer pas-à-pas, Pulumi multi-langages, rafraîchissement Terraform / PowerShell / Ansible, suppression des doublons sur le site XO.
3. **Phase 2 — Kubernetes** : catégorie *Kubernetes*, overview recette vs VMK, déplacement de la recette (+ redirection), page *VMK technology preview*, page *Components*.
4. **Phase 2bis — VMK pas-à-pas** (quand un build de preview est disponible) : getting started, gestion des clusters et des nœuds, API REST.
5. **Phase 3 — dépôts `vatesfr/*`** : une PR par dépôt pour réduire README / `docs/` utilisateur à un renvoi vers `docs.xen-orchestra.com`, en gardant la référence générée (registries, chart Helm, godoc) et la doc contributeur. **Exceptions** : CAPI (readthedocs inchangé) et CCM / CSI (leur doc reste dans les dépôts pendant la preview : on ajoute seulement un lien « Part of VMK » vers la doc XO).

Chaque phase = une PR séparée.

## 8. Validation des pas-à-pas

Pas d'environnement réel. Le mock [`vatesfr/xo-api-sim`](https://github.com/vatesfr/xo-api-sim) simule **uniquement l'API REST** (`/rest/v0/*`, auth par token/cookie, création de VM via `pools/:id/actions/create_vm`, actions VM, VDI/VIF/VBD). Il ne simule **pas** l'API JSON-RPC websocket (`/api/`).

| Outil | API utilisée | Testable avec le mock ? |
| --- | --- | --- |
| PowerShell | REST | ✅ oui (lecture, actions VM, snapshots selon couverture des handlers) |
| Go SDK v2 | REST | ✅ oui |
| Go SDK v1 | JSON-RPC websocket | ❌ |
| Terraform / OpenTofu | JSON-RPC websocket (via Go SDK v1) | ❌ — `terraform init`/`validate` seulement |
| Pulumi | idem Terraform (bridge) | ❌ — `pulumi preview` jusqu'à l'auth seulement |
| Ansible inventory | JSON-RPC websocket | ❌ |
| Packer | XAPI + SSH sur l'hôte XCP-ng | ❌ — `packer init`/`validate` seulement |
| CCM / CSI / CAPI | Go SDK (v1.22 / v1.13) | ❌ (et besoin d'un cluster) |
| VMK (`/rest/v0/kubernetes`) | REST | ❌ pas d'endpoint dans le mock aujourd'hui ; à ajouter au mock si on documente l'API |
| Recette Kubernetes, token CCM | REST (création de token) | 🟡 seule la commande `curl` de création de token |

Méthode : chaque bloc de commande est marqué dans la PR comme **vérifié (mock)**, **vérifié (syntaxe : init/validate)** ou **à valider sur une vraie infra**. Les sorties attendues non vérifiées sont reprises des dépôts (tests, exemples) et signalées aux relecteurs.
