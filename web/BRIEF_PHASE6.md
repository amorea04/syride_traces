# Brief commun, phase 6 : finitions, performance, accessibilité, PWA

Lis d'abord `web/BRIEF_PHASE2.md` à `BRIEF_PHASE5C.md` : contexte technique, interdits (D12 : aucune trace publiée ; aucune donnée réelle commitée), conventions, socle réutilisable. **Tout s'applique**, sauf ce qui suit.
Puis dans `ROADMAP_WEBAPP.md` : §6 (direction artistique), §8 « Phase 6 » (spécification de référence), §9.1, §11.

## Branche et état
- Branche `web/phase-6-finitions` (déjà créée ; **aucune opération git** : ni commit, ni stash, ni checkout).
- Ne touche pas à `sites_coordinates.json` (modification en cours d'Adrien) ni à `ROADMAP_WEBAPP.md`.
- Les lots s'enchaînent **l'un après l'autre** (ils touchent les mêmes fichiers) : lot 1 (6.1, 6.2, 6.4), puis lot 2 (6.3, 6.5, 6.6). L'audit 6.7 est fait par le maître d'œuvre.

## Mesures de départ (20/11/2026, `npm run build`)
- Un seul chunk JS : `index-*.js` 3 030 Ko, **913 Ko gzip** (budget 250 Ko gzip). CSS 309 Ko, 46 Ko gzip. Worker MapLibre 520 Ko (chargé seulement par la carte).
- `echarts-for-react` importe **tout** ECharts (`import ReactECharts from 'echarts-for-react'`, `import * as echarts from 'echarts'` dans `theme/echarts.ts`). Séries utilisées : `bar`, `line`, `scatter`, `heatmap` (vérifie, plus composants grid, tooltip, legend, markLine/markArea, dataZoom, visualMap… selon l'usage réel).
- Toutes les pages sont importées statiquement dans `router.tsx`. MapLibre est importé statiquement par `SitesMap.tsx` et `SiteMiniMap.tsx`.
- Données initiales : `flights.<hash>.json` 927 Ko brut, **250 Ko gzip**, 197 Ko brotli q11 (Cloudflare compresse à la volée, à qualité plus basse : compte sur ~250 Ko). `meta.json` 2,6 Ko gzip, `sites` 10 Ko gzip.

## Règles communes
- Aucune nouvelle dépendance npm **d'exécution**. En dépendance de développement, seuls `rollup-plugin-visualizer` (6.2) et, si vraiment utile, `lighthouse` (6.3) sont autorisés, versions épinglées. Pas de `vite-plugin-pwa` / Workbox : service worker écrit à la main, court et testé.
- CSP de `public/_headers` : à respecter (pas de script inline ; si le service worker ou le manifest l'exigent, ajuste la CSP au plus juste et dis-le).
- Textes en français, sobres, typographie française (`NBSP` de `@/lib/format`). Pas de badge, médaille ni décor.
- Les mocks `vi.mock('maplibre-gl')` et les tests existants doivent rester verts.

---

## Lot 1 : découpage, budgets, PWA (6.1, 6.2, 6.4)

- **6.1 Découpage**
  - Routes en `React.lazy` + `Suspense` (repli sobre : squelette ou `Loader` Mantine centré, sans saut de mise en page). Le tableau de bord peut rester dans le chunk initial s'il ne tire pas ECharts/MapLibre ; sinon lazy aussi. Précharge au survol des liens du menu si c'est simple (facultatif).
  - ECharts à la carte : `echarts/core` + `use([...])` des seuls charts, composants et du `CanvasRenderer` utilisés ; `ReactEChartsCore` de `echarts-for-react/lib/core` avec `echarts={echarts}`. Un seul module central (par ex. `src/theme/echarts.ts` ou `src/components/common/Chart.tsx`) ; les composants l'utilisent au lieu d'importer `echarts-for-react`. Les types `EChartsOption` etc. peuvent rester en `import type`.
  - MapLibre paresseux : `import('maplibre-gl')` dynamique (et son CSS) dans `SitesMap` et `SiteMiniMap`, ou composant carte en `React.lazy`. Les tests qui mockent `maplibre-gl` doivent continuer de marcher.
  - Mantine / tabler : vérifie que les icônes sont importées une à une (tree-shaking) ; `@mantine/dates` + `dayjs` seulement là où ils servent.
- **6.2 Budgets** : `rollup-plugin-visualizer` derrière une variable (`ANALYZE=1 npm run build` → `dist/stats.html`, jamais publié par défaut). Script `npm run size` (Node, sans dépendance) qui affiche les tailles gzip du JS initial (chunks chargés par `index.html` + leurs `modulepreload`) et des données initiales, et **échoue** au-delà de 250 Ko / 200 Ko. Pour les données (250 Ko gzip aujourd'hui) : mesure le poids gzip de chaque colonne de `flights.json` (vraies données, en local), identifie les leviers (colonnes inutilisées par le front, précision des flottants, dictionnaires de chaînes déjà en place ?) et applique ceux qui ne changent **pas** le contrat de façon cassante, dans `src/export_web.py` + schéma + types générés + fixtures + tests pytest, en gardant le contrat §4 cohérent. Si le budget ne peut être tenu sans changement de contrat notable, arrête-toi et décris les options chiffrées dans le compte rendu.
- **6.4 PWA**
  - `public/manifest.webmanifest` (nom « Syride analyse », `lang: fr`, `display: standalone`, couleurs du thème Encre, `start_url` / `scope` compatibles avec `BASE_URL`) ; icône sobre en SVG + PNG 192/512 et `maskable` (motif géométrique simple aux couleurs D13, pas de logo Syride) ; `<link rel="manifest">`, `theme-color` clair/sombre, `apple-touch-icon` dans `index.html`.
  - `public/sw.js` écrit à la main, enregistré en production seulement (`import.meta.env.PROD`) :
    - coquille (`index.html`, assets hashés) : precache minimal de `index.html` + cache-first des `/assets/*` (immuables) ;
    - `/data/meta.json` : **stale-while-revalidate** ; `/data/*.<hash>.json` et `/data/insights/*` : cache-first (immuables) ;
    - tuiles OpenFreeMap déjà vues : cache-first dans un cache dédié **plafonné** (par ex. 300 entrées, éviction FIFO) ;
    - navigation hors ligne : `index.html` en cache, sinon page `offline.html` sobre ;
    - nettoyage des anciens caches à l'`activate` (version de cache), purge des données hashées qui ne sont plus référencées par le `meta.json` courant si c'est simple.
  - Aucun cache des liens syride.com. Le service worker ne doit jamais servir un `meta.json` d'une vieille version quand le réseau répond (SWR : on sert le cache puis on met à jour ; au chargement suivant la nouvelle version s'affiche — c'est acceptable, documente-le dans `web/README.md`).
  - Tests : logique de routage du SW extraite en fonctions pures testables (Vitest) si possible ; e2e `pwa.spec.ts` : manifest servi et valide, SW enregistré sur `vite preview`, une page rechargée hors ligne (`context.setOffline(true)`) s'affiche.

## Lot 2 : Lighthouse, responsive, libellés (6.3, 6.5, 6.6)

- **6.3 Lighthouse mobile** sur `vite preview` avec les **vraies** données (port 5193) : `/`, `/vols`, une fiche vol, `/sites`, une page pilote, un Bilan. Cibles : Perf ≥ 90, A11y ≥ 95, Bonnes pratiques ≥ 95. Corrige ce qui fait échouer (contrastes, noms accessibles, tailles de cibles, `lang`, images sans dimensions, CLS…). Rapports JSON/HTML dans `web/audits/lighthouse/` (ignorés par git si contenant des données réelles — vérifie `.gitignore` liste blanche) ; tableau de synthèse des scores dans `web/audits/PHASE6.md`.
- **6.5 Responsive** : script Playwright `scripts/captures.mjs` (ou spec dédiée hors CI) qui photographie toutes les routes à 360, 768, 1280 et 1920 px, clair et sombre, sur les **fixtures** (les captures sont archivables) dans `web/audits/captures/`. Corrige débordements horizontaux, chevauchements, textes tronqués. Ajoute un e2e qui vérifie l'absence de défilement horizontal à 360 px sur chaque route.
- **6.6 Passe éditoriale** : accents (É, À majuscules), espaces insécables avant `: ; ! ? »` et entre nombre et unité, unités cohérentes (`h`, `min`, `km`, `m`, `km/h`), guillemets français, termes cohérents d'une page à l'autre (vol / session, site / décollage, voile / aile, plafond / altitude max…) : dresse le glossaire retenu dans `web/audits/PHASE6.md` puis applique-le. Ne change pas le sens des textes ; mets à jour les tests qui citent les libellés.

## Vérifications de fin de lot
`cd web && npm run lint && npm run typecheck && npm test && npm run build && npm run size` au vert, puis `npx playwright test` complet. Rendu clair, sombre et 360 px vérifié sur les vraies données : `npm run dev -- --port 5193 --strictPort` (ou `preview`) en arrière-plan, arrêté ensuite.
Compte rendu final (court) : fichiers créés ou modifiés, mesures avant/après (tableau), choix faits, écarts au brief, résultat des vérifications.

---

## Recette d'Adrien du 20/11/2026 (6.8 à 6.10)

Trois lots **en parallèle dans le même dossier**, sans fichier commun. Ne touche qu'aux fichiers de ton lot (plus ceux que tu crées) ; besoin ailleurs : signale-le, ne modifie pas. **Ne lance pas Playwright** (les trois lots partagent le port 4173) : le maître d'œuvre lance la suite e2e complète à la fin ; mets à jour ou écris tes specs e2e quand même. Lance `npm run lint`, `npm run typecheck` et `npx vitest run <tes fichiers>` ; si un autre lot casse la compilation, signale-le.

- **6.8 Survol des sites sur les cartes** (lot carte) : `src/components/map/**`, `src/theme/map/**`, leurs tests, `e2e/sites.spec.ts`. Sur la carte des sites (page `/sites` et tableau de bord, même composant `SitesMap`) : au survol d'un site, infobulle légère (popup MapLibre `closeButton: false`, `closeOnClick: false`, classe dédiée, sans interaction) avec le nom du site et son nombre de vols (et la discipline dominante si déjà dans les propriétés) ; au survol d'un cluster : « N sites · M vols » si l'info est disponible, sinon « N sites ». Curseur `pointer`. L'infobulle de survol disparaît au `mouseleave`, au déplacement de la carte et quand le popup du clic s'ouvre. Rien sur écran tactile (le clic suffit). Mode heatmap : pas d'infobulle. Contenu construit en DOM (`textContent`), pas de HTML interprété. Styles clair/sombre cohérents avec le popup existant. Fonction pure du texte de l'infobulle, testée.
- **6.9 Comparer vide à l'ouverture** (lot comparer) : `src/pages/Compare.tsx`, `src/lib/compare.ts` (+ test), `src/components/compare/**`, `e2e/comparer.spec.ts`. Sans `ids` dans l'URL, aucune sélection par défaut : sélecteur vide, et à la place des sections un message sobre : « Choisissez au moins 2 pilotes à comparer. » / « Choisissez un pilote, puis au moins 2 de ses années. » / « Choisissez au moins 2 sites à comparer. ». Changer de mode vide la sélection. Une URL avec `ids` valides (liens venant d'autres pages) marche comme avant. Les `DEFAULT_NOTE` « Sélection proposée… » disparaissent. Mode années : choisir un pilote coche ses deux années les plus récentes (comportement actuel de `onPilotChange`, à garder).
- **6.10 Durée des vols, croisée** (lot durée) : `src/components/rhythm/FlightScatter.tsx` (renommage possible), `src/lib/rhythmBlocks.ts` (+ test) ou nouveau `src/lib/durationCross.ts` (+ test), `src/theme/echarts.ts` seulement si un module ECharts manque (préférer les modules déjà chargés : scatter, line, bar), les tests du composant, `e2e/tableau-de-bord.spec.ts` pour ce bloc seulement. Le bloc « Durée et plafond » devient « Durée des vols » avec un sélecteur « selon » (SegmentedControl ou Select, au choix selon la place à 360 px) :
  - mesures continues → nuage durée (axe Y) × mesure (axe X), comme aujourd'hui : plafond, distance, puis toute autre mesure par vol disponible et pertinente dans `MEASURES` (dénivelé, vitesse moyenne… vérifie ce qui existe ; pas de mesure absente à plus de 50 %) ;
  - catégories → « nuage en bandes » : une colonne par catégorie, points dispersés horizontalement de façon déterministe (jitter pseudo-aléatoire graine fixe, pas `Math.random`), trait horizontal de la **médiane** par colonne (série `line` ou `scatter` en symbole trait), infobulle de colonne : catégorie, nombre de vols, médiane et durée max. Catégories : mois (janv. à déc.), heure de décollage (tranches d'1 h, même plage que les matrices : 8 h à 20 h élargie si besoin), voile et site (les 12 plus volés de la vue filtrée, triés par nombre de vols, le reste regroupé en « Autres » s'il existe) ;
  - couleur = discipline comme aujourd'hui ; clic sur un point = fiche du vol ; mode `large` au-delà de 3 000 points conservé ; le tableau « Voir les données » s'adapte (pour les catégories : catégorie, vols, médiane, max) ; texte de bas de bloc mis à jour ; choix mémorisé dans l'URL seulement si c'est déjà l'usage du bloc, sinon état local.
  - Calculs en fonctions pures testées (catégorisation, top 12 + Autres, médianes, jitter déterministe).

Compte rendu court : fichiers, choix, écarts, vérifications.
