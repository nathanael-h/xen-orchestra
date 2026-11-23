# Analyse : `docusaurus-plugin-remote-content`

> Document de travail (non publié), complément de [`../README.md`](../README.md). Analyse faite le 2026-11-23 sur la v4.0.0 (npm), identique à la branche `main` du dépôt.

## Fiche d'identité

| | |
| --- | --- |
| Dépôt | [RDIL/docusaurus-plugin-remote-content](https://github.com/RDIL/docusaurus-plugin-remote-content) (redirigé depuis `rdilweb/…`), licence MIT, 112 étoiles, non archivé |
| Dernière release | **v4.0.0, 20 novembre 2023**. Elle ajoute Docusaurus 3. Le code n'a pas changé depuis : les commits suivants ne sont que des montées de version Dependabot (dernier commit : mars 2025) |
| Taille | **244 lignes** de TypeScript (`src/index.ts`, `types.ts`, `utils.ts`), **aucun test**, aucune CI |
| Dépendances | `axios`, `rimraf`, `pretty-ms`, `picocolors` |
| Maintenance | Le mainteneur cherche un co-mainteneur ([#55](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/55), ouverte depuis 2022). Il dit relire les PR mais ne plus avoir le temps de corriger lui-même ([#51](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/51)) |

## Fonctionnement

Le plugin télécharge en HTTP (axios) une **liste explicite** de fichiers (`documents`) depuis une URL de base (`sourceBaseUrl`), et les écrit dans `outDir`. Un hook `modifyContent(filename, content)` permet de renommer un fichier ou de transformer son contenu.

Deux modes :

- **Par défaut (« constant sync »)** : le téléchargement se fait **au chargement de la config**, donc à chaque commande Docusaurus (`build`, `start`, `serve`…). Les fichiers sont supprimés après le build (`performCleanup`). C'est l'option A de la proposition, déconseillée pour XO.
- **CLI (`noRuntimeDownloads: true`)** : rien n'est téléchargé au build. Les commandes `docusaurus download-remote-<name>` et `clear-remote-<name>` téléchargent ou suppriment à la demande. **Ce mode s'intègre dans l'option B** : le workflow de synchro lance `download-remote-*`, puis ouvre la PR.

## Bugs constatés

Je les ai testés sur une copie de la doc XO (Docusaurus 3.10.2) avec les pages `docs/references/` du CSI driver, en mode CLI.

| # | Problème | Gravité pour XO | Issue amont |
| --- | --- | --- | --- |
| 1 | Avec `noRuntimeDownloads: true`, `performCleanup` vaut toujours `true` par défaut : **`docusaurus build` supprime les fichiers synchronisés pourtant commités**. Testé : 3 fichiers supprimés du dépôt après un build, y compris un build en échec. Pour XO, chaque `yarn build` depuis les sources laisserait un dépôt modifié et des pages manquantes | **Bloquant** sans `performCleanup: false` explicite | Proche de #98 (fermée sans correctif dans le code) |
| 2 | Un fichier **JSON** valide fait planter l'écriture (`ERR_INVALID_ARG_TYPE`) : axios le transforme en objet | Moyenne (ex. `_category_.json`) | aucune |
| 3 | Un fichier **renommé** par `modifyContent` n'est jamais nettoyé : `clear-remote` supprime le nom d'origine | Moyenne : fichiers orphelins, donc dérive | aucune |
| 4 | Un document **retiré de la liste** reste sur le disque après un nouveau téléchargement | Moyenne : pages fantômes | aucune |
| 5 | Les options du plugin sont **sérialisées dans le JavaScript public** du site : un en-tête `Authorization` passé dans `requestConfig` fuite. Testé : la valeur se retrouve dans `build/assets/js/main.*.js` | Haute si on utilise un token | [#79](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/79) |
| 6 | `documents` sous forme de fonction asynchrone n'est pas attendu (`for…of` sur une `Promise`) | Faible, mais nécessaire pour lister un dossier via l'API GitHub | [#37](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/37), [#75](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/75) (contournement) |
| 7 | Une erreur réseau ne dit pas quel document a échoué | Faible | aucune |
| 8 | `modifyContent` peut renvoyer un nom de fichier qui sort de `outDir` (`../..`) | Faible (config maîtrisée) | aucune |
| 9 | En mode par défaut : `download-remote-x` lance aussi toutes les autres instances | Sans objet en mode CLI | [#46](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/46) |
| 10 | En mode par défaut : boucle de rechargement en `yarn start`, `ECONNRESET` avec de nombreuses instances | Sans objet en mode CLI | [#51](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/51), [#45](https://github.com/RDIL/docusaurus-plugin-remote-content/issues/45) |

Ce que le plugin ne fait pas, et qui reste à écrire dans `modifyContent` ou autour :

- lister un dossier (il faut l'API GitHub, ou une liste en dur) ;
- connaître le commit synchronisé ;
- réécrire les liens. Sans réécriture, les liens `../migrations/…` des pages CSI **font échouer le build XO** (`onBrokenLinks: 'throw'`) ;
- ajouter le front matter et le bandeau ;
- copier les images (une seconde instance en `arraybuffer`).

## Correctifs proposés

Le patch [`0001-fix-keep-downloaded-files-intact.patch`](0001-fix-keep-downloaded-files-intact.patch) corrige les points **1 à 8**, sans rien casser pour les utilisateurs actuels :

- les fichiers sont écrits tels que téléchargés (`responseType: "text"`, et le binaire est géré) ;
- `performCleanup` vaut `false` par défaut quand `noRuntimeDownloads` est `true` ;
- un manifeste `outDir/.remote-content-<name>.json` liste les fichiers écrits. Le nettoyage l'utilise (fichiers renommés compris), et un nouveau téléchargement supprime les fichiers obsolètes ;
- `documents` et `modifyContent` peuvent être asynchrones ;
- `requestConfig` peut être une **fonction**. Docusaurus ne sérialise pas les fonctions dans le bundle : c'est vérifié, les fonctions de config sont absentes de `main.js`. Les secrets restent donc sur la machine de build ;
- les erreurs nomment le document et l'URL ;
- écrire hors de `outDir` est refusé ;
- le CHANGELOG et le README sont mis à jour.

Vérifié sur la copie de la doc XO avec le plugin corrigé :

| Scénario | Résultat |
| --- | --- |
| `download-remote-csi` puis `build` | ✅ build OK, fichiers commités **intacts** (`git status` propre) |
| Fichier JSON | ✅ écrit tel quel |
| `requestConfig` en fonction avec un en-tête « secret » | ✅ absent du bundle |
| Document retiré de la liste (fonction `documents` async), puis nouveau téléchargement | ✅ fichier supprimé |
| `clear-remote-csi` avec un fichier renommé | ✅ dossier vidé, manifeste compris |
| Document inexistant | ✅ `[csi] Failed to download "nope.md" from https://raw.githubusercontent.com/…: 404` |
| Nom de fichier en `../../../escaped.md` | ✅ refusé |

Points 9 et 10 non corrigés : ils ne concernent que le mode par défaut, que nous n'utiliserions pas. Le #46 demanderait de détecter la commande CLI en cours au chargement du plugin.

## Plugin corrigé ou script maison ?

| Critère | Plugin (mode CLI + correctifs) | Script du prototype (`../sync-external-docs.mjs`) |
| --- | --- | --- |
| Intégration Docusaurus | ✅ commandes `docusaurus download-remote-<name>` | Script Node séparé |
| Lister un dossier source | Appel à l'API GitHub dans `documents` (avec un token en CI pour la limite de débit, possible sans fuite grâce au correctif) | ✅ natif (clone partiel git) |
| Figer sur un commit et l'afficher | Résoudre le SHA dans la config (config async), puis l'injecter dans l'URL et dans `modifyContent` | ✅ natif |
| Front matter, liens, bandeau | À écrire dans `modifyContent`, environ 40 lignes dans `docusaurus.config.ts` | ✅ intégré |
| Régénération complète du dossier | ✅ avec le correctif (manifeste) | ✅ |
| Images | Seconde instance par source | À ajouter (copie depuis le clone) |
| Dépendances ajoutées à la doc XO | 4 (axios, rimraf, pretty-ms, picocolors) | 0 (Node et git) |
| Maintenance | Amont peu actif : correctifs à faire accepter, ou fork `@vates/…` | Code à nous, environ 120 lignes |

**Recommandation :**

- **Proposer le patch en amont** de toute façon (PR sur RDIL/docusaurus-plugin-remote-content, en citant #79). Le point 1 est un piège pour tout utilisateur du mode CLI.
- **Pour XO**, le plugin n'apporte pas grand-chose de plus : il télécharge des fichiers par HTTP, et tout ce qui compte pour nous (listing, commit, liens, front matter) reste à écrire. Il ajoute en plus 4 dépendances et une dépendance à un amont peu actif. Je recommande de **garder le script** et de n'adopter le plugin que si l'équipe tient aux commandes Docusaurus intégrées. Dans ce cas, il faut le plugin corrigé : patch accepté en amont, ou fork, ou copie locale dans `docs/plugins/`.
- Si le mainteneur cherche toujours un co-mainteneur (#55), Vates pourrait le devenir. C'est une option si plusieurs sites Vates (XO, XCP-ng, Vates) adoptent ce mécanisme.

## Reproduire

Depuis un clone de `RDIL/docusaurus-plugin-remote-content` :

```bash
git am /path/to/0001-fix-keep-downloaded-files-intact.patch
yarn build
```
