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
