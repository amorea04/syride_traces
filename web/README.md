# Webapp « Analyse traces de vol »

Site statique (React + Vite) publié sur Cloudflare Pages : `https://syride-analyse.pages.dev`.
Feuille de route : [`../ROADMAP_WEBAPP.md`](../ROADMAP_WEBAPP.md). Contrat de données : [`../src/web_export/schema.json`](../src/web_export/schema.json).

> Le code front arrive en phase 2. Ce fichier consigne pour l'instant les vérifications de la phase 0.

## Garde-fous du dépôt (une fois par clone)

```bash
git config core.hooksPath .githooks
```

Le hook `.githooks/pre-commit` refuse tout commit contenant `*.pkl`, `*.db`, `*.sqlite*`, `.env`, `*.gpx`, `*.igc`, `*.kml`,
`web/public/data/**`, un dossier `<pilote>/traces/**` ou un fichier de plus de 2 Mo. Les données réelles ne vont **jamais** sur GitHub :
elles partent du Mac vers Cloudflare avec `wrangler pages deploy`.

## Conditions gratuites vérifiées (phase 0.2, le 15/11/2026)

### Cloudflare Pages, offre Free

| Point | Constat | Source |
|---|---|---|
| Prix | 0 €, offre Free | [pages.cloudflare.com](https://pages.cloudflare.com/) |
| Requêtes et bande passante (fichiers statiques) | « requests to static assets are free and unlimited » sur les offres gratuite et payante | [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) |
| Builds | 500 par mois (on n'en utilise aucun : upload direct `wrangler`) | [Limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Taille max d'un fichier | 25 Mio | [Limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Nombre max de fichiers | 20 000 par site | [Limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Functions | Non utilisées (site 100 % statique), donc pas de quota Workers consommé | [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) |
| Moyen de paiement | Non demandé pour l'offre Free. **Ne jamais en enregistrer** (contrainte 0 €). À reconfirmer à la création du compte. | — |

Notre usage : < 2 Mo de données, ~200 fichiers (dont ~150 insights), largement sous les limites.

### OpenFreeMap (tuiles de la carte des sites)

| Point | Constat | Source |
|---|---|---|
| Prix, compte, clé | Gratuit, **sans inscription ni clé API**, sans cookies | [openfreemap.org](https://openfreemap.org/) |
| Limites | « no limits on the number of map views or requests » ; usage commercial autorisé | [openfreemap.org](https://openfreemap.org/) |
| Attribution | Obligatoire (OpenFreeMap, OpenMapTiles, OpenStreetMap) ; MapLibre l'ajoute automatiquement | [openfreemap.org](https://openfreemap.org/) |
| Styles | `https://tiles.openfreemap.org/styles/positron` (sobre, clair), `…/bright`, `…/liberty` ; style sombre disponible | [Quick start](https://openfreemap.org/quick_start/) |
| Hors ligne (PWA) | Cache des tuiles déjà vues uniquement ; pas de téléchargement en masse (> 3 000 tuiles ou 50 Mo interdit sans accord) | [openfreemap.org](https://openfreemap.org/) |

Plan de repli si l'une de ces conditions change : ROADMAP_WEBAPP.md §10.

## Développement : données servies par `npm run dev`

Le serveur de dev et `npm run preview` servent `web/public/data/` (vraies données, ignorées par Git) sous `/data/`.
Pour utiliser les données synthétiques commitées à la place (e2e, CI, démo sans données réelles) :

```bash
VITE_DATA_DIR=tests/fixtures/data npm run dev      # ou dans un fichier web/.env.local : VITE_DATA_DIR=tests/fixtures/data
```

La variable (chemin relatif à `web/` ou absolu) est lue par un petit plugin de `vite.config.ts` qui répond à `/data/*` depuis ce dossier
(dev et preview ; `npm run build` copie toujours `public/data/`). `npm run e2e` la positionne tout seul sur `tests/fixtures/data`
et lance Playwright sur le build ; installer le navigateur une fois avec `npx playwright install chromium`.

Les filtres globaux vivent dans l'URL : `?pilote=j2f&activite=parapente&du=2024-01-01&au=2024-12-31&voile=…&site=12`
(paramètres répétables pour pilote, voile et site ; valeurs par défaut absentes).

## Poids et budgets (phase 6.2)

`npm run build && npm run size` affiche le poids gzip du JS initial (le script de `index.html` et ses `modulepreload`) et des données
initiales (`meta.json`, `flights.<hash>.json`, `sites.<hash>.json`), et **échoue** au-delà de 250 Ko (JS) ou 250 Ko (données, relevé de 200 Ko : D21).
`npm run analyze` (= `ANALYZE=1 vite build`) écrit en plus `dist/stats.html` (visualiseur `rollup-plugin-visualizer`) : ne pas le publier.

Découpage : chaque page est un chunk (`React.lazy`), ECharts est importé à la carte (`src/theme/echarts.ts` : `echarts/core` et les seuls
graphiques, composants et rendu canvas utilisés ; composant `echarts-for-react/lib/core` dans `ChartFrame`) et MapLibre est chargé par
`import()` à l'ouverture d'une carte. Un nouveau type de graphique ou de composant ECharts doit être ajouté à la liste `echarts.use([...])`.

## Hors ligne (PWA, phase 6.4)

`public/manifest.webmanifest` et les icônes (`scripts/gen-icons.mjs` régénère les PNG, `public/icon.svg` est la source vectorielle) rendent
l'application installable. `public/sw.js` (service worker écrit à la main, enregistré en production seulement par `src/pwa.ts`) s'appuie sur
`public/sw-routing.js`, des fonctions pures testées par `tests/sw.test.ts` :

- coquille : `index.html` et les fichiers qu'il référence sont précachés à l'installation ; les autres fichiers de `/assets/*` (chunks de page)
  sont servis cache-first et enregistrés à la première utilisation (la page signale aussi au service worker ceux qu'elle a déjà chargés) ;
- `data/meta.json` : **stale-while-revalidate**. Le service worker sert la copie en cache puis la met à jour : après un nouveau déploiement
  de données, la première ouverture affiche encore les anciennes données et la suivante les nouvelles (le meta n'est servi depuis le cache que si
  ses fichiers de données initiaux y sont aussi, sinon on passe par le réseau) ;
- `data/*.json` hashés et `data/insights/*` : cache-first ; ceux que ni le `meta.json` courant ni le précédent ne référencent sont purgés ;
- tuiles OpenFreeMap : cache-first dans un cache plafonné à 300 entrées (éviction FIFO) ; styles : réseau d'abord ;
- navigation : réseau d'abord, sinon `index.html` en cache, sinon `offline.html`. Hors ligne, une page jamais ouverte affiche un message
  (son chunk n'est pas en cache) au lieu d'une page blanche ;
- aucun cache pour syride.com ni pour un autre domaine. Changer `VERSION` dans `sw-routing.js` purge tous les anciens caches à l'activation.

Les e2e bloquent le service worker (`serviceWorkers: 'block'` dans `playwright.config.ts`) ; seul `e2e/pwa.spec.ts` le laisse agir.
