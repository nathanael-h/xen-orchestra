# Proposition : intégrer la doc avancée des dépôts d'outils sans la dupliquer

> Document de travail (non publié). Contexte : les getting started sont centralisés sur docs.xen-orchestra.com ; pour les pages **avancées** (références, choix d'implémentation, fonctionnement détaillé, ex. [`vdi-lookup-and-identification.md`](https://github.com/vatesfr/xenorchestra-csi-driver/blob/main/docs/references/vdi-lookup-and-identification.md)), l'équipe veut les garder dans les dépôts tout en les rendant visibles dans la doc XO, sans duplication ni dérive.

## TL;DR

**Recommandation : synchronisation par PR automatique (option B).**

- Les pages restent écrites **dans le dépôt de l'outil**, à côté du code.
- Un script les copie dans la doc XO et ouvre une PR. Pendant la copie, il :
  - ajoute un front matter (titre, lien « Edit this page » vers la source, commit d'origine),
  - réécrit les liens vers des fichiers non copiés,
  - ajoute un bandeau « page synchronisée ».
- Le site XO reste construit **à partir de fichiers versionnés dans `xen-orchestra`** : aucun accès réseau au build.

Récupérer le Markdown **au moment du build** est techniquement possible, mais **déconseillé ici**. La raison : `yarn build` à la racine du monorepo (`build:doc`) reconstruit la doc pour **chaque installation de XO depuis les sources**. Voir l'option A.

Un prototype fonctionne avec les 4 pages `docs/references/` du CSI driver (§5).

## 1. Contraintes propres à la doc XO

| Constat | Conséquence |
| --- | --- |
| `package.json` racine : `"build": "turbo run build … && yarn build:doc"` | La doc est reconstruite à chaque build de XO depuis les sources, y compris hors ligne ou en air-gap. Un fetch réseau au build casserait ces installations. |
| `docusaurus.config.ts` : `onBrokenLinks: 'throw'` | Un lien cassé dans une page distante ferait **échouer le build de XO** pour tout le monde. |
| La doc est embarquée dans xo-server (`docusaurus.embed.config.ts`) | Le contenu doit correspondre à une version de XO, donc être figé dans le dépôt, et non changer d'un build à l'autre. |
| Recherche fédérée Typesense déjà en place (docs.xen-orchestra.com, docs.vates.tech, docs.xcp-ng.org) | Ajouter un site de plus à la recherche est une option peu coûteuse (option C). |

## 2. Ce que Docusaurus sait faire nativement

Vérifié dans le code source de Docusaurus (facebook/docusaurus, novembre 2026, v3.10) et dans le prototype :

| Fonction | Utilité ici |
| --- | --- |
| Front matter `custom_edit_url` | « Edit this page » renvoie vers le fichier **dans le dépôt source**. Les contributeurs modifient donc à la source, ce qui évite la dérive. |
| Front matter `format: md` (ou `markdown.format: 'detect'`) | Les pages synchronisées sont lues en **CommonMark**, pas en MDX : un `<` ou un `{` dans du texte venant d'un dépôt ne casse pas le build. |
| Option `editUrl` sous forme de **fonction** | Alternative globale à `custom_edit_url`. |
| Plusieurs instances de `@docusaurus/plugin-content-docs` (`id`, `path`, `routeBasePath`) | Si un outil a beaucoup de pages, il peut avoir sa propre arborescence, sa barre latérale, et même ses propres **versions** alignées sur les releases de l'outil. |
| `markdown.parseFrontMatter`, `markdown.preprocessor` | Hooks de transformation au build. Ils ne servent pas pour aller chercher le contenu. |

Docusaurus n'a **pas** de fonction native pour récupérer du contenu distant.

## 3. Les options

### A. Récupérer le contenu au build (plugin ou script de pré-build)

Les moyens possibles :

- [`docusaurus-plugin-remote-content`](https://github.com/rdilweb/docusaurus-plugin-remote-content) : v4.0.0, **dernière release en novembre 2023**, compatible Docusaurus 3. Il télécharge des fichiers listés par URL au démarrage du build, ou via une commande CLI (`noRuntimeDownloads`).
- `@acid-info/docusaurus-remote-content` : 1.0.4-alpha, peu utilisé.
- Un script `prebuild` maison (`git clone --sparse`), ou des sous-modules git.

| ➕ | ➖ |
| --- | --- |
| Toujours à jour, aucune PR à relire | Accès réseau à GitHub **à chaque build de XO**, y compris les installations depuis les sources : build cassé hors ligne, en air-gap ou en cas de limite de débit GitHub |
| | Build **non reproductible** : le même commit XO produit une doc différente d'un jour à l'autre |
| | Une erreur dans un dépôt d'outil (lien cassé, MDX invalide) **casse le build de XO** |
| | Contenu publié sans relecture par l'équipe doc |
| | Sous-modules : lourds dans un monorepo, et `yarn build` depuis les sources demanderait `git submodule update` |

Variante : ne récupérer le contenu que dans le pipeline de déploiement du site public, pas dans `build:doc`. Cela règle le problème des installations, mais le site public et la doc embarquée dans xo-server divergent, et la publication se fait toujours sans relecture.

**Verdict : déconseillé.**

### B. Synchronisation par PR automatique ✅ recommandée

1. Un **manifeste** dans `xen-orchestra` (`docs/external-docs.json`) liste, pour chaque source : le dépôt, la référence (branche ou **tag de release**), le dossier source et la destination dans la doc.
2. Un **script** (`sync-external-docs.mjs`) récupère chaque source (clone partiel et superficiel), **régénère entièrement** le dossier de destination et applique les transformations :
   - titre tiré du premier `# H1` ;
   - `custom_edit_url` vers la source ;
   - `format: md` ;
   - `source_repo` et `source_commit` dans le front matter ;
   - liens relatifs vers des fichiers non synchronisés réécrits en URL GitHub figées au commit synchronisé ;
   - bandeau « Synced page » en tête.
3. Un **workflow GitHub Actions** (planifié, et déclenchable à la main) lance le script et ouvre ou met à jour **une seule PR** (`bot/external-docs-sync`, via `peter-evans/create-pull-request`). Le build de la doc tourne sur cette PR : un problème venant de l'amont est détecté **avant** d'arriver sur `master`.
4. *Optionnel, mode « push »* : dans chaque dépôt d'outil, un petit workflow déclenche la synchro (`repository_dispatch`) dès qu'un fichier de `docs/references/` change, au lieu d'attendre le passage planifié. Il faut alors une GitHub App ayant accès en écriture à `xen-orchestra`.

| ➕ | ➖ |
| --- | --- |
| Une **seule source de vérité** : le dépôt de l'outil | Délai de publication (un jour, ou quelques minutes en mode push) |
| Build XO **hors ligne et reproductible** : le contenu est versionné dans `xen-orchestra` | Une PR de bot à relire et fusionner |
| Le contenu est **relu**, et testé par le build avant publication | Les dépôts d'outils suivent quelques conventions légères (§4) |
| Les pages profitent de la recherche, du menu, du thème et des retours lecteurs de la doc XO | |
| « Edit this page » renvoie à la source, et une modification faite à la main dans la copie est **écrasée** à la synchro suivante | |
| Possibilité de figer sur un **tag de release** pour documenter la version publiée, pas `main` | |

**Garde-fous contre la dérive :**

- Le dossier de destination est entièrement régénéré : une modification faite à la main ne survit pas.
- Le bandeau et `custom_edit_url` orientent les contributeurs vers la source.
- *Optionnel* : un contrôle CI qui refuse une PR modifiant un dossier synchronisé, sauf si elle vient de la branche du bot.

### C. Laisser la doc avancée dans les dépôts, publiée à part

C'est le choix actuel pour CAPI (readthedocs). La doc XO garde une page d'index qui y renvoie, et le site externe peut être ajouté à la **recherche fédérée Typesense**.

| ➕ | ➖ |
| --- | --- |
| Aucune duplication, aucun outillage | Parcours éclaté : autre site, autre style, autre recherche (sauf intégration Typesense) |
| Adapté à une doc très volumineuse et versionnée (CAPI) | Plusieurs sites à maintenir |

### D. Lier simplement vers GitHub

C'est ce que fait la page VMK aujourd'hui : un tableau de liens vers les dépôts. Coût nul, mais la doc avancée est hors du site, de sa recherche et de son style. C'est un bon état de départ, pas une cible.

## 4. Conventions demandées aux dépôts d'outils (option B)

- Les pages à publier sont dans un dossier dédié (ex. `docs/references/`), en Markdown simple, **sans JSX**.
- Chaque page commence par un **titre `# H1`**. Le prototype a trouvé une page qui commence par un `##` : son titre retombe alors sur le nom du fichier.
- Les liens internes sont **relatifs** (`other-page.md#section`) ; les images sont dans le même arbre, avec un chemin relatif.
- Les ancres doivent correspondre aux titres. Le build XO le vérifie et a déjà trouvé une ancre cassée (§5).

## 5. Prototype

Les fichiers sont dans ce dossier :

| Fichier | Rôle |
| --- | --- |
| `external-docs.json` | Manifeste : CSI driver, `docs/references` → `docs/kubernetes/csi-driver-reference` |
| `sync-external-docs.mjs` | Script de synchronisation, sans dépendance (Node et git uniquement) |
| `docs-sync.yml` | Brouillon du workflow côté `xen-orchestra` (pull planifié + PR) |
| `notify-xo-docs.yml` | Brouillon du workflow optionnel côté dépôt d'outil (mode push) |

Résultat sur `vatesfr/xenorchestra-csi-driver@30cf30bc` :

- 4 pages générées, **`yarn build` réussi**.
- Les pages s'intègrent au menu (Kubernetes → *CSI driver: technical reference*), et « Edit this page » ouvre `github.com/vatesfr/xenorchestra-csi-driver/edit/main/docs/references/…`.
- Les liens entre pages synchronisées restent internes. Les liens vers `docs/migrations/…`, non synchronisé, sont réécrits vers GitHub.
- **Bug détecté dans la doc CSI** : `local-storage.md` contient un lien vers `#vm-live-migration`, une section qui n'existe pas (également cassé sur GitHub).

Ce qui reste à faire avant une mise en production :

- copier les **images** référencées ;
- ajouter un mode `--check` pour le contrôle CI anti-dérive ;
- choisir les références (`main` ou dernier tag de release) ;
- choisir entre une destination dans le menu principal ou une instance de docs par outil.

Pour essayer, depuis `docs/` :

```bash
node proposals/external-docs/sync-external-docs.mjs
yarn build
```

Le dossier `docs/kubernetes/csi-driver-reference/` est alors généré. Supprime-le ensuite si tu ne veux pas le garder.

## 6. Proposition de mise en œuvre

1. Valider l'option B avec l'équipe, ainsi que les conventions du §4.
2. Commencer par le **CSI driver** (`docs/references/`) et le **CCM** (`docs/node-out-of-service.md`, `docs/faq.md`), dans la section Kubernetes, avec le bandeau tech preview.
3. Activer le workflow planifié (pull), puis le mode push si le délai gêne.
4. CAPI reste sur readthedocs (option C) ; envisager de l'ajouter à la recherche fédérée.
