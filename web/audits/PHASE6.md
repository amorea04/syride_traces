# Phase 6, lot 2 : Lighthouse, responsive, libellés

## 6.3 Lighthouse mobile (20/11/2026)

Mesure : `lighthouse@13.6.0` (via `npx`, aucune dépendance ajoutée), profil mobile par défaut (CPU x4, 4G lente simulée), `vite preview` sur le port 5193 avec les **vraies** données (9 584 vols). Les rapports JSON/HTML sont dans `web/audits/lighthouse/{avant,apres}/` et **ignorés par git** (ils contiennent des noms de pilotes et de sites réels).

| Page | Perf avant | Perf après | A11y avant | A11y après | Bonnes pratiques | LCP avant / après | TBT avant / après | CLS avant / après |
|---|---|---|---|---|---|---|---|---|
| `/` | 58 | 52 | 91 | 100 | 100 / 100 | 2,7 s / 5,9 s | 12 370 ms / 1 570 ms | 0 / 0 |
| `/vols` | 69 | 67 | 100 | 100 | 100 / 100 | 4,4 s / 4,6 s | 600 ms / 620 ms | 0,005 / 0,006 |
| fiche vol | 57 | 70 | 100 | 100 | 100 / 100 | 4,6 s / 4,6 s | 1 250 ms / 530 ms | 0,091 / 0 |
| `/sites` | 55 | 56 | 100 | 100 | 100 / 100 | 4,7 s / 4,7 s | 1 360 ms / 1 520 ms | 0,092 / 0,016 |
| fiche site | 46 | 53 | 96 | 100 | 100 / 100 | 7,1 s / 6,3 s | 1 350 ms / 1 350 ms | 0,123 / 0,016 |
| page pilote | 50 | 57 | 100 | 100 | 100 / 100 | 6,0 s / 5,9 s | 1 380 ms / 930 ms | 0,091 / 0 |
| Bilan | 43 | 52 | 94 | 100 | 100 / 100 | 6,3 s / 6,3 s | 5 520 ms / 1 420 ms | 0,009 / 0,01 |

Cibles : accessibilité et bonnes pratiques atteintes partout. **Performance (>= 90) non atteinte** : voir « Reste à décider ».

Corrections faites
- Accessibilité : `p-text` / `m-text` assombris (contraste 4,13 puis 4,28 : texte vermillon et azur sur fond `bg`, désormais `#b8401c` et `#1f58c4`, paires ajoutées à `tokens.test.ts`) ; cases vides du ruban des voiles masquées aux lecteurs d'écran (boutons sans nom) ; lien du texte courant du Bilan souligné ; cibles tactiles de la fiche site >= 24 px (liens des records, icône Syride en `md`).
- Performance : MapLibre n'est chargé que quand une carte approche de l'écran (`lib/nearViewport.ts`) : sur `/`, 9,3 s de script simulé en moins ; les graphiques ECharts ne sont instanciés qu'à l'approche de l'écran (`ChartFrame`) ; le chunk de la page demandée est téléchargé en parallèle des données (`preloadRoute`, `main.tsx`) ; le repli de chargement occupe tout l'écran, ce qui supprime le CLS du pied de page.

Reste à décider (hors périmètre du lot)
- Le LCP simulé (4,5 à 6,5 s) est dominé par la chaîne `meta.json` puis `flights.<hash>.json` (240 Ko gzip) à 1,6 Mbps, puis le décodage (CPU x4) : mesuré hors simulation, le LCP est d'environ 1 s. Tenir 90 en mobile simulé passe par la réduction du poids de `flights.json` (même sujet que le budget données 200 Ko, en attente d'Adrien), ou par un rendu partiel avant la fin du décodage.
- `/` : LCP avant 2,7 s car la page n'affichait alors que le squelette (TBT 12 s qui n'était pas compté dans le LCP) ; le contenu réel arrive plus tard, d'où l'écart apparent.

À vérifier seulement après déploiement (non reproductible en `vite preview`) : service worker (cache-first des `/assets`, SWR de `meta.json`, hors ligne), en-têtes de `public/_headers` (CSP, Cache-Control immuable, compression brotli de Cloudflare), HTTP/2 et latence réelle. Lighthouse relancé sur l'URL déployée donnera la valeur définitive.

### Mesure sur l'URL déployée (phase 7, 20/11/2026)

`lighthouse@13.6.0`, profil mobile par défaut, `https://syride-analyse.pages.dev` (Cloudflare Pages, HTTP/2, brotli). Rapports dans `web/audits/lighthouse/deploye/` (ignorés par git).

| Page | Perf | A11y | BP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| `/` | 52 | 100 | 100 | 4,5 s | 4 050 ms | 0 |
| `/vols` | 77 | 100 | 100 | 3,5 s | 560 ms | 0,006 |
| `/pilote/j2f/2025` | 57 | 100 | 100 | 4,7 s | 1 170 ms | 0,01 |
| `/sites` | 61 | 100 | 100 | 3,9 s | 1 180 ms | 0,016 |

Le déploiement ne change presque rien à la performance simulée : le frein est le calcul côté navigateur (TBT, CPU x4), surtout sur `/`, et la chaîne `meta.json` puis `flights.json`. Accessibilité et bonnes pratiques restent à 100. 6.3 reste ouvert : chantier d'optimisation à part.

### Chantier de performance (20/11/2026)

Mesure : `lighthouse@13.6.0`, profil mobile par défaut, `vite preview` (gzip) du build réel sur le port 5193, vraies données (9 584 vols). Deux passes « après » (écart entre passes : 1 à 3 points). Rapports dans `web/audits/lighthouse/63-avant/`, `63-apres/` et `63-apres-2/` (ignorés par git).

| Page | Perf avant | Perf après | LCP avant / après | TBT avant / après | FCP | CLS après | A11y / BP |
|---|---|---|---|---|---|---|---|
| `/` | 53 | 71 et 74 | 5,9 s / 5,0 s | 1 220 ms / 320 à 410 ms | 1,7 s / 1,6 s | 0 | 100 / 100 |
| `/vols` | 71 | 76 et 77 | 4,6 s / 4,5 s | 490 ms / 300 à 330 ms | 1,7 s / 1,6 s | 0 | 100 / 100 |
| `/pilote/j2f/2025` | 53 | 68 et 69 | 6,3 s / 5,4 s | 1 140 ms / 420 à 450 ms | 1,7 s / 1,6 s | 0 | 100 / 100 |
| `/sites` | 59 | 62 et 63 | 4,7 s / 4,7 s | 1 050 ms / 790 à 880 ms | 1,6 s / 1,6 s | 0,016 | 100 / 100 |

Corrections faites
- ECharts (187 Ko gzip, ~430 ms d'évaluation en CPU x4) n'est plus une dépendance statique des pages : `ChartFrame` le charge à la demande (`EChart.tsx`, `React.lazy`), seulement quand un graphique approche de l'écran **et** que le navigateur est inactif (`whenNearViewportIdle`), donc après la première peinture. Même règle pour MapLibre (`SitesMap`, `SiteMiniMap`).
- Tableau de bord : les sections sous l'activité collective ne sont calculées et montées qu'à l'approche de l'écran (`components/common/Deferred.tsx`, l'ancre `id` reste en place pour les liens et les tests).
- Bilan pilote × année : les sections après l'aperçu sont montées juste après la première peinture, dans un rendu de fond que React découpe en tranches (`Deferred when="background"`) ; le contenu reste présent sans défilement (sommaire, e2e). La fiche du jour demandée depuis l'aperçu avant le montage de la section Rythme est reprise à son montage.
- Rendu qui suit l'arrivée des données en transition (`startTransition` dans `DataProvider`) : React le découpe au lieu d'une seule tâche longue.
- Tableau des sites : 30 premières lignes, puis les ~400 autres en rendu de fond (`useDeferredValue` avec valeur initiale).
- Calculs : « Derniers vols » (tri complet de 9 600 vols avec concaténation de chaînes dans le comparateur, ~400 ms en CPU x4) remplacé par une sélection des N premiers (`topN`, horodatage calculé une fois par vol), idem pour les derniers vols d'un site ; `median` trie un `Float64Array` (tri natif) ; le décodage de `flights.json` met en commun les dérivés de date (année, mois, jour de semaine, saison).
- Chaîne de données : le chargement démarre dès l'évaluation de `main.tsx` (`preloadAppData`), et le build injecte dans `index.html` un `<link rel="preload" as="fetch" crossorigin>` vers `flights.<hash>.json` et `sites.<hash>.json` lus dans `meta.json` (plugin `syride-data-preload` de `vite.config.ts`, qui suit `VITE_DATA_DIR`) : le téléchargement des vols part en parallèle du JS au lieu d'attendre l'appli puis `meta.json`. Vérifié : un seul téléchargement, aucune erreur console. `meta.json` reste lu sans cache ; si les données changent sans nouveau build, l'appli suit `meta.json` et le préchargement est seulement perdu.

Essayé sans effet, retiré : panneau de filtres en chunk séparé (Combobox et floating-ui restent tirés par d'autres composants, gain < 2 Ko).

Pourquoi 90 n'est pas atteint
- Le LCP simulé (4,5 à 5,4 s) est désormais limité par le volume transféré avant le premier contenu utile : ~240 Ko gzip de `flights.json` plus ~240 Ko de JS et 30 Ko de CSS, partagés sur la 4G lente simulée (1,6 Mbit/s). Avec les données de test (5 Ko), `/` monte à 82 (LCP 3,7 s) : même avec des données minuscules, 90 demanderait aussi d'alléger le JS initial (React DOM et Mantine ≈ 100 Ko gzip dans `index`).
- `/sites` : la carte est visible au chargement, MapLibre (300 Ko gzip, ~1,3 s d'évaluation simulée) y est indispensable ; c'est l'essentiel du TBT restant.

Pistes restantes (décision d'Adrien)
- Format colonnaire de `flights.json` (une liste par colonne au lieu d'une liste par vol) : 239 Ko gzip -> 188 Ko mesuré sur les données actuelles (brotli : 196 Ko aujourd'hui, moins encore en colonnaire). Change le contrat de données (`schema_version`, export Python, `decodeFlights`, fixtures) : à décider avec le budget données 200 Ko (D21).
- Pré-rendu au build du haut des pages (HTML statique du tableau de bord) : LCP sans attendre ni JS ni données, mais chantier lourd (rendu serveur de Mantine et du routeur, filtres dans l'URL).
- `/sites` : afficher d'abord une image statique de la carte, MapLibre au premier geste.

## 6.5 Responsive

`npm run build && npm run captures` photographie 12 routes x 4 largeurs (360, 768, 1280, 1920) x clair/sombre = 96 captures JPEG (qualité 50, 15 Mo) dans `web/audits/captures/`, sur les **fixtures** uniquement, et liste les débordements horizontaux. Un test e2e (`e2e/responsive.spec.ts`) vérifie l'absence de défilement horizontal à 360 px sur chaque route.

Correction : fiche site à 768 px, la grille de 4 chiffres clés débordait de 27 px (`SimpleGrid` à `sm`) : passée à `md`. Aucun autre débordement, aucun chevauchement relevé par le script ; relecture visuelle des captures à faire par Adrien (les images pleine page sont longues).

## 6.6 Glossaire retenu

| Notion | Terme retenu | Évité |
|---|---|---|
| Un enregistrement | vol | session, sortie |
| Lieu de décollage | site (« site de décollage » si besoin de précision) | spot, lieu |
| Aéronef | voile (catégorie : matériel) | aile |
| Altitude maximale d'un vol | plafond (« Plafond max » pour un maximum agrégé) | altitude max |
| Vitesse / vario maximaux | « Vitesse max », « Vario max » (partout, y compris libellés des statistiques) | « maximale », « maximal » |
| Cumul de durées | « Heures de vol » | « Temps de vol » |
| Durée d'un seul vol | « Durée » | |
| Première utilisation d'une voile | « Premier vol le … » | « Première sortie » |

Typographie : espace insécable avant `: ; ! ?`, à l'intérieur des guillemets français « », entre un nombre et son unité (`h`, `min`, `km`, `km/h`, `m`, `%`) dans les libellés et messages (` ` en TS, `&nbsp;` en JSX) ; apostrophes droites remplacées par `’` dans les textes visibles (sauf `legacyLabel`, repris tel quel de Dash). Les accents des majuscules étaient déjà corrects.
