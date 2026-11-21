# Feuille de route : refonte de la webapp « Analyse traces de vol »

> Version 1.4 du 15/11/2026 (v1.4 : phase 0, contrat de données figé dans `src/web_export/schema.json`, cf. §4.0 ; v1.1 : intégration du rapport HTML pilote × année ; v1.2 : décisions D1 à D11 ; v1.3 : **D12, aucune trace publiée**, chaque référence à une trace renvoie vers Syride). Maître d'œuvre : Claude (Opus). Maître d'ouvrage : Adrien.
>
> **Règle D12** : la webapp **ne publie aucune trace**, ni GPX, ni IGC, ni polyligne simplifiée, ni profil, ni mini-trace. Chaque fois qu'une trace est évoquée, on renvoie vers la page du vol sur syride.com, qui l'a déjà publiée : `https://www.syride.com/fr/pilotes/<pilote>/<num_activite>`. Les GPX restent utilisés **localement** pour calculer des statistiques (`track_stats.py`), mais seules ces valeurs agrégées sont publiées.
>
> **Positionnement (D9)** : la **webapp** est l'outil vivant, toujours disponible, qui couvre **tous les pilotes** et sert à **suivre l'activité collective tout au long de l'année**. Le **rapport HTML** (`src/rapport/`) reste un document autonome, édité **une fois en fin d'année** pour garder un récapitulatif. Les deux ont des objectifs différents et coexistent. La webapp ne publie pas les rapports.
> Remplace la webapp Dash de https://amoreau.pythonanywhere.com.
> Contrainte absolue : **0 € de coût**, ni hébergement, ni nom de domaine, ni API payante, ni carte bancaire enregistrée.

---

## Sommaire

1. [État des lieux](#1-état-des-lieux)
2. [Objectifs et périmètre](#2-objectifs-et-périmètre)
3. [Architecture cible et justification des choix](#3-architecture-cible-et-justification-des-choix)
4. [Contrat de données](#4-contrat-de-données)
5. [Spécification fonctionnelle (écrans)](#5-spécification-fonctionnelle-écrans)
6. [Direction artistique](#6-direction-artistique)
7. [Organisation : agents, niveaux de modèle, sessions](#7-organisation--agents-niveaux-de-modèle-sessions)
8. [Phases détaillées (lots de travaux)](#8-phases-détaillées-lots-de-travaux)
9. [Qualité, tests et critères d'acceptation](#9-qualité-tests-et-critères-dacceptation)
10. [Risques et parades](#10-risques-et-parades)
11. [Décisions d'Adrien](#11-décisions-dadrien-tranchées-le-15112026)
12. [Check-list de suivi](#12-check-list-de-suivi)

---

## 1. État des lieux

### 1.1 La webapp actuelle (`src/app.py`, `src/app_functions.py`)

- **Une seule page Dash** sans routage. Elle contient :
  - un bandeau orange avec la date de mise à jour ;
  - une barre latérale fixe de 300 px avec 5 filtres : pilotes, activité, années, voiles, sites ;
  - 4 cartes de résumé (vols, heures, sites, pilotes) ;
  - 6 cartes de caractéristiques au format « moy. (max) » ;
  - 7 onglets de graphes en barres (pilote, année, mois, voile, jour, saison, site), avec 19 statistiques au choix ;
  - 1 carte `scatter_mapbox` des sites.
- **2 callbacks.** Le principal, `update_dashboard`, a 18 sorties et recalcule tout à chaque changement de filtre, sans cache.
- **Données** : `pickle.load` au démarrage de `global_flights_data.pkl` (9 635 vols, 36 colonnes, 2,9 Mo). Le fichier est téléversé à la main sur PythonAnywhere, puis il faut un « Reload » manuel.
- **Dette technique**
  - `dash-mantine-components` est figé sur l'API 0.12 (supprimée depuis), et `scatter_mapbox` est déprécié dans plotly 6.
  - Aucune version n'est épinglée, la mise en page n'est pas responsive et il n'y a pas de tests.
  - Une erreur survient sur une sélection vide (`round(nan)`).
  - Les libellés sont sans accents (« fevrier ») et contiennent des « - - » décoratifs.
  - Le filtre initial « paramoteur » est discutable, alors que le parapente est majoritaire.
- **Manques** : il n'y a ni fiche de vol, ni liste de vols, ni lien vers Syride, ni évolution dans le temps, ni comparaison de pilotes, ni suivi de l'activité collective. Les traces, elles, restent consultables sur Syride, et la webapp y renverra (D12).

### 1.2 Le pipeline de données (local, sur le Mac)

```
syride.com ──(Selenium + undetected-chromedriver, manuel, Cloudflare)──► <pilote>/traces/<num>/{num.json,num.gpx,num.igc}
          └─► flights.db (SQLite, table `flights`, cache des dossiers)
          └─► create_global_pkl.py + analyze_functions.py (+ uniformisation.json, sites_coordinates.json)
          └─► global_flights_data.pkl ──(upload manuel)──► PythonAnywhere
          └─► src/rapport/ (rapports HTML autonomes et PDF par pilote et par année)
```

- **Volumes**
  - 23 pilotes, 9 793 vols en base, dont 9 635 conservés : 5 977 en parapente et 3 658 en paramoteur.
  - 436 sites et 94 voiles. Environ 1 000 à 1 700 vols de plus par an.
- **Traces**
  - 9 399 GPX, **1,3 Go**, soit **≈ 1 850 points par vol en moyenne** (max ≈ 9 200).
  - 9 187 IGC.
- **Ce qui ne change pas** : le scraping reste **local et manuel**. Il a besoin d'un Chrome visible, d'un humain pour Cloudflare et d'un quota d'environ 50 fiches par jour. On ne l'automatise pas dans le cloud.

### 1.3 Le rapport HTML pilote × année (`src/rapport/`), la vraie référence de qualité

Le rapport est bien plus abouti que la webapp Dash. Il sert de **référence fonctionnelle et graphique** pour la refonte.

**Architecture du rapport**
- Chaîne : `report_data.py` (calculs, dicts) → `report_charts.py` (SVG faits main) → `report_html.py` (assemblage) → `report.css` et `report.js` inlinés. Le résultat est un fichier autonome de moins de 1 Mo, sans réseau.
- Les textes viennent de `report_textes.md`.
- CLI : `generate_reports.py --pilot --year --format --compare`.
- 13 pilotes × 2025/2026 sont déjà générés dans `html_reports/`.
- Le chemin PDF (`generate_pdf_report.py`) est **cassé** : il importe des fonctions qui n'existent plus. Il est hors périmètre ici.

**Les 11 sections du rapport**
1. **Hero** : 4 KPI, persona, écart avec l'année dernière, « équivalences ».
2. **Aperçu** : 8 cartes KPI avec sparkline et pastilles d'écart avec les années comparées, puis meilleur jour, « journée type », vol de l'année, part parapente/paramoteur et modes de vol.
3. **Histoire** : frise de 12 jalons et rejeu animé de l'année.
4. **Rythme** :
   - courbe d'heures cumulées par année avec réticule ;
   - calendrier avec des tuiles série, pause, meilleure semaine et régularité qui surlignent les jours ;
   - tuiles par saison ;
   - histogramme des durées avec médianes ;
   - barres mensuelles en vols ou en heures.
5. **Quand** : matrice jour × heure (heat-map) et « créneau favori ».
6. **Où** :
   - carte SVG zonée (clustering en lien simple à 80 km, nommée « Autour de … »), nouveaux sites en anneau doré, fiche site au clic ;
   - tableau des sites ;
   - portée : site le plus éloigné du site principal.
7. **Matos** : voiles avec barres, ruban voile × mois, « voile du moment », instruments.
8. **Records** : top 5 sur 6 critères, « Nouveau record ! » par rapport à l'historique du pilote, nuage de points durée × plafond.
9. **Comparaison** : tableau KPI × années avec pastilles.
10. **Carrière** : barres empilées par année, avec une étoile sur la meilleure.
11. **Vols et glossaire** :
    - tableau des vols triable et filtrable, records en doré ;
    - glossaire ;
    - transparence sur la couverture des données (GPX, fiche ou aucune ; pastille « Données partielles » au-delà de 20 % de manques).

**Interactions du rapport**
- Filtres globaux : discipline et années comparées.
- **Filtres croisés** (site, voile, mois, jour, mode) qui surlignent le calendrier, la carte et le ruban.
- Fiche jour en modale (jour précédent et suivant), infobulles riches qu'on peut épingler au toucher.
- Raccourcis clavier, sommaire collant, rejeu, export PNG d'un récap 1080 × 1350.

**Indicateurs « récit »** (dans `report_data.py`)
- `compute_rhythm` :440 : série de jours, plus longue pause, meilleure semaine, régularité en semaines actives, part du week-end.
- `year_gap` :838 : avance ou retard en heures sur l'année précédente, à date (seuil ±30 min).
- `compute_records_history` :344.
- `compute_milestones` :1080 : jalons Nᵉ vol, Nᵉ heure, records, nouveaux sites et voiles, reprises.
- `compute_map_zones` :735 et `compute_reach` :779.
- **Personas** (`PERSONA_RULES` :1029) : 12 règles pondérées (treuilleur, marcheur, plafond, explorateur, régulier, lève-tôt…), avec des seuils calibrés sur les pilotes réels.
- **Équivalences** : Paris–Marseille, Mont-Blanc, Everest…
- Textes variés tirés de façon déterministe par `crc32(pilote|année|clé)`.

**Système de design du rapport**, validé par Adrien :
- Polices système, chiffres tabulaires.
- Accent bleu `#1d4ed8` en clair, `#7db0ff` en sombre ; fond `#f3f6fb` en clair, `#0b1220` en sombre.
- **Une couleur, un sens** :
  - orange `#ea580c` = parapente, cyan `#0891b2` = paramoteur, ardoise = les deux ;
  - **or réservé aux records et nouveautés** ;
  - vert et rouge pour les volumes, bleu et ambre pour les écarts neutres ;
  - années distinguées aussi par des tirets ou hachures, jamais par la couleur seule.
- AA, `prefers-reduced-motion`, mobile 375 px.

**Refusés explicitement par Adrien** (14/11/2026, `ameliorations_rapport.md`, `docs/archive/rapport/BRIEF_COMMUN.md`) :
- badges, médailles, confettis ;
- scène de ciel (nuages, parapente animé), thème « Ciel » ;
- **profil radar** ;
- croisement sites × mois ;
- visite guidée ;
- percentile de groupe.

**Idées encore ouvertes du rapport, naturelles dans une webapp :**
- T14 : état dans l'URL et « copier le lien ».
- T24 : export CSV et « copier mon résumé ».
- T31 : projection de fin d'année et jauge d'objectif.
- T34 : graphiques en haltère (dumbbell) pour comparer les années.
- T35 : pays visités.
- T38 : rendu 100 % client. **C'est exactement la webapp.**

### 1.4 Ce qu'on garde

- Toute la chaîne Python amont : scraping, `flights_db.py`, `analyze_functions.py`, les fichiers d'uniformisation.
- Le **générateur de rapports `src/rapport/`**, qui continue de produire des HTML autonomes partageables hors ligne. Ses calculs « récit » sont **réutilisés tels quels** par l'export web (cf. §3.4).
- La logique de calcul des 19 statistiques (`create_grouped_df`) et les indicateurs génériques du rapport (KPI, distributions, rythme, records), qu'on **porte** en TypeScript pour qu'ils réagissent aux filtres.
- Le **système de design du rapport** (§1.3), qui devient la base de celui de la webapp.
- Les fichiers de référence maintenus à la main.

---

## 2. Objectifs et périmètre

### 2.1 Objectifs

| # | Objectif | Mesure de réussite |
|---|---|---|
| O1 | **Gratuit pour toujours** | Aucun moyen de paiement enregistré nulle part ; tous les services en offre gratuite sans expiration |
| O2 | **Rapide** | Premier affichage < 1,5 s en 4G ; changement de filtre < 100 ms ; Lighthouse Performance ≥ 90 |
| O3 | **Beau et sobre** | Style éditorial et professionnel, sans gadgets (cf. préférences des rapports HTML) ; mode clair et sombre ; mobile d'abord |
| O4 | **Plus riche** | Activité collective, liste des vols, fiche de vol (chiffres et contexte, trace sur Syride), pages pilote et site, évolution temporelle, comparaison, records |
| O5 | **Mise à jour en 1 commande** | `make publish` (ou `uv run python src/publish.py`) exporte, construit et déploie |
| O6 | **Maintenable** | Code typé, testé, CI verte, dépendances épinglées, README de déploiement |

### 2.2 Hors périmètre de la v1

- Le scraping dans le cloud, impossible ou fragile pour les raisons vues au §1.2.
- L'écriture de données par les utilisateurs : commentaires, téléversement de traces, comptes.
- **Toute publication de trace** : carte de trace, profils d'altitude, de vitesse ou de vario, superpositions, rejeu, mini-traces (D12). On renvoie vers Syride.

---

## 3. Architecture cible et justification des choix

### 3.1 Le principe clé : **site 100 % statique, calculs dans le navigateur**

Le jeu de données est minuscule : 9 635 lignes. Une fois réduit aux colonnes utiles et compressé, il pèse **≈ 300 à 500 Ko en gzip**. Un serveur Python qui recalcule des `groupby` à chaque clic n'a donc **aucune raison d'exister**. On précalcule tout en local et on publie des fichiers statiques. Le navigateur filtre et agrège en mémoire, en moins de 20 ms pour 10 000 lignes.

Les conséquences :
- l'hébergement statique est gratuit et illimité en bande passante ;
- il n'y a ni serveur qui s'endort, ni « Reload » manuel ;
- tout est filtré instantanément, et le site fonctionne même hors ligne (PWA).

```
┌────────────────────────── Mac d'Adrien (inchangé + 1 étape) ──────────────────────────┐
│ scraping ► dossiers pilotes ► flights.db ► global_flights_data.pkl                    │
│                                     │                                                 │
│                          src/export_web.py  (NOUVEAU, Python)                         │
│                                     ▼                                                 │
│   web/public/data/  flights.json  sites.json  meta.json  insights/   (aucune trace)   │
│                                     │                                                 │
│                      npm run build  (Vite)  ► web/dist/                               │
│                                     │                                                 │
│               wrangler pages deploy web/dist   (upload direct, sans passer par Git)    │
└─────────────────────────────────────┼─────────────────────────────────────────────────┘
                                      ▼
                    Cloudflare Pages (gratuit) ─► https://syride-analyse.pages.dev  (accès public)
```

### 3.2 Choix techniques

| Couche | Choix | Pourquoi | Alternatives écartées |
|---|---|---|---|
| Hébergement | **Cloudflare Pages**, offre gratuite | Bande passante illimitée et 500 déploiements par mois. **Upload direct avec `wrangler`** : les données ne passent jamais par GitHub, ce qui respecte la `.gitignore` en liste blanche actuelle. Sous-domaine `*.pages.dev` gratuit. Pas de carte bancaire requise. | **GitHub Pages** (gratuit seulement si le dépôt est public, et il faut versionner les données). **Netlify ou Vercel** (quotas de bande passante, conditions commerciales). **PythonAnywhere** (serveur inutile, domaine figé). |
| Langage front | **TypeScript** | Typage du contrat de données et refactorisation sûre. C'est la langue native du web. | Python dans le navigateur avec Pyodide (lourd, plusieurs Mo de WASM) |
| Framework | **React 19 + Vite** | Écosystème le plus large (cartes, tableaux, graphiques), et les agents de code y sont les plus fiables. Build statique trivial. | SvelteKit (élégant, mais écosystème plus petit) ; Next.js (inutile sans serveur) |
| Composants UI | **Mantine 8**, thémé avec nos propres jetons (§6) | Adrien connaît déjà Mantine par `dash-mantine-components`. Mode sombre natif, composants riches (MultiSelect, DatePicker, Table), sobre par défaut, entièrement thémable. | shadcn/Tailwind (plus de travail de design) ; MUI (style Google marqué) |
| Graphiques | **Apache ECharts 5** via `echarts-for-react` | Performant (canvas), thèmes clair et sombre, barres, lignes, calendrier heatmap, boxplot, zoom et brush. | Plotly.js (≈ 3,5 Mo, lent) ; Recharts (SVG, lent sur les longues séries) ; Observable Plot (peu interactif) |
| Cartographie | **MapLibre GL JS** + tuiles **OpenFreeMap** (vectorielles, gratuites, **sans clé ni compte**). Usage limité aux **sites** (points, clusters, heatmap des sites), jamais aux traces (D12). | Rendu WebGL fluide, clustering natif, style personnalisable (sobre). | Mapbox (clé et quota payant au-delà) ; Leaflet (acceptable aussi, mais moins fluide pour le clustering et la heatmap) ; Google Maps (payant) |
| Tableau | **TanStack Table v8** + virtualisation (`@tanstack/react-virtual`) | Tri, filtres et 10 000 lignes fluides, sans dépendance au style. | AG Grid (lourd) ; Mantine React Table (OK, mais couplé) |
| État et URL | **Zustand** + synchronisation des filtres dans l'URL (query string) | Liens partageables (« les vols de j2f en 2025 sur tel site »), retour arrière du navigateur. | Redux (trop lourd) |
| Routage | **React Router 7** (mode SPA, `HashRouter` ou `_redirects` Cloudflare) | Pages pilote, site et vol avec URL propre. | — |
| Agrégations | **Module TS maison** (`src/lib/stats.ts`) testé contre Python | 10 000 lignes : pas besoin de DuckDB-WASM (≈ 6 Mo). On garde le contrôle exact des règles (vols incomplets, valeurs ≤ 0 ignorées). | DuckDB-WASM ; Arquero (en solution de repli si la complexité grandit) |
| Traces | **Aucune trace publiée (D12)**. Lien « Voir la trace sur Syride » (nouvel onglet, `rel="noopener"`) construit depuis `syride_num` | Les traces sont déjà publiées par Syride. Le site publié reste minuscule (moins de 2 Mo de données au total). | Polylignes simplifiées en local (abandonné, décision d'Adrien) |
| PWA | `vite-plugin-pwa` (cache des données et des tuiles visitées ; les liens Syride nécessitent le réseau) | Consultation sur le terrain, au décollage, sans réseau. | — |
| Tests | **Vitest** (unitaires), **Playwright** (bout en bout, déjà disponible), **pytest** (export Python) | — | — |
| Qualité | ESLint, Prettier, `tsc --noEmit`, Ruff (Python) | — | — |
| CI | **GitHub Actions** (lint, typecheck, tests sur des fixtures **synthétiques**, sans les vraies données) | Le dépôt `amorea04/syride_traces` est **public** (D8), donc les minutes sont illimitées et gratuites. | — |

### 3.3 bis Répartition des calculs : génériques en TS, « récit » en Python

On évite deux pièges : réécrire en TypeScript les 1 000 lignes de règles du rapport (double maintenance), ou figer toute la webapp en précalculé (filtres impossibles).

| Famille | Exemples | Où c'est calculé | Pourquoi |
|---|---|---|---|
| **Génériques filtrables** | KPI, moyenne, médiane et max, distributions (mois, jour, heure, saison), matrice jour × heure, histogramme des durées, courbes cumulées, calendrier, rythme (série, pause, meilleure semaine, régularité, part du week-end), top N des records, tables sites, voiles et instruments, couverture des données | **Navigateur (TS)**, `web/src/lib/` | Doivent réagir instantanément à n'importe quelle combinaison de filtres (pilotes, période, site…) |
| **Récit pilote × année** | Persona et justification, jalons (frise), écart avec l'année précédente, records battus contre l'historique, équivalences, zones de carte, portée, nouveaux sites et voiles, phrases issues de `report_textes.md` | **Python, précalculé à l'export**, en appelant **directement les fonctions de `src/rapport/report_data.py`** | Logique riche, déjà testée et validée par Adrien. Seuils calibrés sur les vrais pilotes. Une seule source de vérité, partagée par le rapport HTML et la webapp. |

Le Python et le TS partagent la même règle de base (« moyennes et max ignorent les valeurs ≤ 0 », `_positive` dans le rapport et `get_flight_params` dans l'app). Un **test de non-régression croisé** garantit que les KPI génériques TS donnent les mêmes valeurs que `compute_kpis` et `compute_rhythm` du rapport (cf. phase 2.5).

### 3.4 Arborescence cible du dépôt

```
syride_traces/
├── ROADMAP_WEBAPP.md                 ← ce document
├── Makefile                          ← make export / build / publish / test
├── src/                              ← Python existant (inchangé, sauf ajouts ci-dessous)
│   ├── export_web.py                 ← NOUVEAU : pkl/db → web/public/data (statistiques uniquement, aucune trace)
│   ├── web_export/                   ← NOUVEAU : modules d'export (schéma, vols, sites, récits)
│   │   ├── schema.py
│   │   ├── insights.py               ← appelle src/rapport/report_data.py → insights/<pilote>-<année>.json
│   │   └── tests/
│   ├── rapport/                      ← EXISTANT : report_data.py devient importable sans effets de bord
│   ├── publish.py                    ← NOUVEAU : export + build + deploy
│   └── app.py, app_functions.py      ← ARCHIVÉS en fin de projet (dossier legacy/)
└── web/                              ← NOUVEAU : application front
    ├── package.json, vite.config.ts, tsconfig.json, eslint.config.js
    ├── public/
    │   ├── data/                     ← GÉNÉRÉ, ignoré par Git
    │   └── _redirects, _headers      ← config Cloudflare (SPA, cache)
    ├── src/
    │   ├── main.tsx, App.tsx, router.tsx
    │   ├── theme/                    ← jetons de design, thème Mantine, thème ECharts, style de carte
    │   ├── data/                     ← chargement, types générés depuis le schéma, cache
    │   ├── lib/                      ← stats.ts, rhythm.ts, records.ts, filters.ts, format.ts, syride.ts (liens), texts.ts
    │   ├── store/                    ← filtres (Zustand) et synchronisation URL
    │   ├── components/               ← KpiCard, DeltaPill, FilterBar, StatChart, CumulativeChart, CalendarHeatmap,
    │   │                               WeekHourMatrix, DurationHistogram, WingRibbon, ScatterChart, MapView,
    │   │                               FlightTable, DaySheet, Timeline, CoverageNotice…
    │   └── pages/                    ← Dashboard, Flights, Flight, Pilots, Pilot, PilotYear (bilan), Sites, Site,
    │                                   Compare, Records, About
    ├── tests/                        ← vitest + fixtures anonymisées
    └── e2e/                          ← playwright
```

> ⚠️ La `.gitignore` est en **liste blanche**. Il faudra ajouter `!/web/`, `!/Makefile` et `!/ROADMAP_WEBAPP.md`, puis exclure `web/node_modules/`, `web/dist/`, `web/public/data/` et `web/.wrangler/`.

---

## 4. Contrat de données

Le contrat est écrit **une seule fois** en JSON Schema (`src/web_export/schema.json`). Les types TypeScript en sont **générés** (`json-schema-to-typescript`), et l'export Python est **validé** contre lui (`jsonschema`). Une incompatibilité casse la CI, jamais la production.

### 4.0 Ajustements faits en figeant le schéma v1 (phase 0.5)

`schema.json` fait foi ; les exemples ci-dessous sont indicatifs. Écarts avec la v1.3 de ce document :
- **`key` remplace `id`** comme 1ʳᵉ colonne de `flights.json` : `"<pilote_slug>-<num_activite>"` (unicité vérifiée : 0 doublon pilote × `num_activite` dans le pkl).
- **`pilot_slugs`** (aligné sur `dict.pilot`) : le slug est calculé une seule fois, en Python ; `dict.pilot` garde le pseudo Syride exact pour les liens.
- **`has_gpx` supprimé** : redondant avec `source == "gpx"`.
- **Mesures ≤ 0 exportées en `null`** (distance, vitesses, plafond, gain, vario, g) : strictement équivalent à `_positive` du rapport et de l'app. Le pkl contient 272 distances, 1 207 gains et 557 varios ≤ 0.
- **`dict.mode`** = libellés courts de `mode_of` (Site, Treuil, Rando, Bord de mer, Moteur).
- **Dates** : motif ≥ 1980, la sentinelle 1901 est refusée par le schéma (12 vols concernés). Les vols écartés sont comptés dans `meta.counts.excluded_flights`.
- **`meta.json`** liste aussi les fichiers d'insights, eux aussi hashés : `insights/<pilote_slug>-<année>.<hash>.json`.
- **`sites.json`** est un objet `{schema_version, sites: [...]}`, et `id` = index du site dans `dict.site`.
- Insights : structure de §4.5 reprise, à resserrer en phase 1.5 bis (champ `v`).

**Phase 1 (15/11/2026)** : nouveaux écarts, `schema.json` toujours en v1 :
- **La colonne `key` est retirée de `flights.json`.** Elle fait gagner ≈ 180 Ko brut et ≈ 30 Ko gzip. Le front recalcule la clé : `pilot_slugs[pilot] + "-" + syride_num`. `syride_num` devient obligatoire, car il est renseigné pour 100 % des vols. `FlightKey` reste le format des URL `/vol/:key` et des références de vol dans les insights.
- **« inconnue » reste une voile à part entière** (décision d'Adrien) : elle n'est ni null ni masquée. Seuls les restes textuels « nan » et « none » sont exportés en null.
- **`Story` resserrée** :
  - persona : `PersonaKey` en enum, et `secondary` en objets `{key, label, why}` ;
  - gap : statut `egal`, ajout de `ref_year`, `ongoing` et `note` ;
  - jalons : `title` et `detail`, avec `kind` en enum ;
  - `new_sites` et `new_wings` deviennent des objets ;
  - `map_zones` reçoit `top`, `flights` et `minutes` ;
  - `reach` reçoit `main_site` ;
  - `texts` a 8 clés fixes.

  La carte par zones et la portée sont aussi calculées par discipline, alors que le rapport HTML ne les donne que pour « tout ».
- **Budget de poids mesuré en brotli**, ce que Cloudflare sert réellement : `flights.json` fait 190 Ko en brotli et 231 Ko en gzip.

### 4.1 `data/meta.json` (~1 Ko, jamais mis en cache)

```json
{
  "schema_version": 1,
  "generated_at": "2026-11-15T21:04:00Z",
  "data_updated_at": "2026-08-31",
  "counts": { "flights": 9635, "pilots": 23, "sites": 436, "wings": 94 },
  "files": { "flights": "flights.3f9a1c.json", "sites": "sites.81bd02.json" }
}
```

Les noms de fichiers contiennent un **hash de contenu** : cache immuable d'un an, et invalidation automatique à chaque publication.

### 4.2 `data/flights.<hash>.json`, au format **colonnaire**

Le format colonnaire (une liste par colonne) donne ≈ 3× moins de volume que des objets ligne par ligne :

```json
{
  "columns": ["id","pilot","activity","date","time","site","wing","instrument","mode",
              "duration_min","dist_km","dist_cum_km","speed_avg","speed_max","ceiling_m","gain_m",
              "vario_max","g_max","incomplete","source","has_gpx","syride_num"],
  "dict": { "pilot": ["air race pro","j2f",...], "site": [...], "wing": [...], "instrument": [...],
            "mode": ["treuil","rando","..."], "source": ["gpx","fiche","aucune"], "activity": ["parapente","paramoteur"] },
  "rows": [[ 0, 1, 0, "2025-06-14", "10:32", 37, 12, 54, 18.2, 31.0, 24.1, 41.0, 1240, 380, 4.2, 1.7, 0, 1, 45.12, 0.31 ], ...]
}
```

**Règles**
- Les champs catégoriels sont des **index dans `dict`** : pilote, site, voile, activité.
- Les champs dérivés **ne sont pas exportés** (année, mois, jour de la semaine, saison). Le front les recalcule depuis `date`, en une seule fonction testée.
- Une valeur inconnue s'écrit `null`. Jamais 0 ou −1, jamais la date « 1901 » : ces vols ont `date: null` et sont signalés dans la page « Qualité des données ».
- Valeurs numériques arrondies : 1 décimale pour les vitesses et distances, entier pour les altitudes.
- `id` = identifiant stable `"<pilote_slug>-<num>"`, stocké dans une colonne `key` à part, pour construire l'URL `/vol/:key`.
- `mode` = mode de vol (treuil, rando…), dérivé de la colonne `types` **avec la même fonction que** `prepare_report_df` (`report_data.py:97`), importée et non recopiée.
- `source` = provenance des stats (`source_stats` : gpx, fiche ou aucune), pour la transparence sur la couverture.
- `syride_num` = `num_activite`. Il sert à construire **le** lien vers la trace : `https://www.syride.com/fr/pilotes/<pilote>/<num>` (fonction unique `syrideFlightUrl()` dans `lib/syride.ts`, testée). Quand il manque, le lien vers la trace est masqué et on renvoie vers la page du pilote sur Syride.
- **Pas de `lat`/`lon` par vol** : un point de décollage est déjà un morceau de trace (D12). La position d'un vol sur une carte est celle de **son site** (`sites.json`, coordonnées moyennes du site).
- `has_gpx` = un booléen qui indique seulement si les statistiques viennent d'un GPX (transparence sur la couverture).
- `dist_km` = colonne `distance` (remplie à 97 %), qui est la distance de référence comme dans le rapport. `dist_cum_km` (71 %) reste secondaire.
- Taille cible : **≤ 700 Ko brut et ≤ 220 Ko gzip**.

### 4.3 `data/sites.<hash>.json`

`[{ "id": 37, "name": "Montbron", "lat": 45.6, "lon": 0.5, "flights": 812, "pilots": 9, "activities": {...} }]`

Ce fichier corrige l'anomalie de la clé vide `""` dans `sites_coordinates.json`.

### 4.4 ~~`data/tracks/`~~ : supprimé (D12)

Aucun fichier de trace n'est produit ni publié. Les GPX et IGC restent sur le Mac et ne servent qu'au calcul local des statistiques déjà présentes dans le pkl (`track_stats.py`).

### 4.5 `data/insights/<pilote_slug>-<année>.json` : récit précalculé, chargé à la demande

C'est le produit de `src/web_export/insights.py`, qui appelle les fonctions de `src/rapport/report_data.py`. Il y a **3 variantes par fichier**, une par discipline (`tout`, `parapente`, `paramoteur`), comme les `by_disc` du rapport.

```json
{ "v": 1, "pilot": "j2f", "year": 2025, "cutoff": "2025-12-31",
  "by_disc": { "tout": {
      "persona": { "main": "regulier", "secondary": ["fidele"], "label": "…", "why": "…" },
      "gap": { "status": "avance", "minutes": 340, "flights": 12, "text": "…" },
      "milestones": [ { "date": "2025-03-02", "kind": "nth_flight", "value": 100, "gold": false, "text": "…", "flight": "j2f-1234" } ],
      "records_beaten": [ { "metric": "plafond", "value": 2450, "previous": 2210, "flight": "j2f-1301" } ],
      "equivalences": [ "…" ],
      "new_sites": [ … ], "new_wings": [ … ],
      "map_zones": [ { "name": "Autour de Montbron", "sites": [ … ], "bbox": [ … ] } ],
      "reach": { "farthest_site": "…", "km": 84, "main_share": 0.62 },
      "texts": { "synthese": "…", "journee_type": "…" } } } }
```

- Les textes sont **déjà rendus** en Python, avec le moteur de `report_textes.md` et le tirage `crc32`. Le front ne fait qu'afficher, ce qui garantit la cohérence avec le rapport HTML.
- Volume : environ 23 pilotes × 1 à 12 années, soit ≈ 150 fichiers de quelques Ko.
- On ne génère que les couples (pilote, année) qui ont au moins 1 vol.

### 4.6 Confidentialité : tranchée (D1, D2)

- **Accès public**, sans authentification, comme aujourd'hui.
- **Pas de floutage** : toutes les données proviennent de syride.com où elles sont déjà publiquement accessibles. La webapp ne rend public rien de nouveau.
- **Aucune trace publiée (D12)** : ni géométrie, ni point de décollage par vol, ni profil. On renvoie toujours vers Syride.
- On ne publie **jamais** :
  - les identifiants Syride (`.env`) ;
  - le profil Chrome ;
  - la base `flights.db` brute ;
  - les GPX et IGC, ni aucune donnée géométrique qui en dérive.
- Mention en pied de page : « Données issues de syride.com. Outil personnel, non affilié à Syride. » Elle évite toute confusion avec le service officiel.
- Les **rapports HTML autonomes ne sont pas publiés** (D4).

---

## 5. Spécification fonctionnelle (écrans)

### 5.0 Gabarit commun

- **En-tête fin** : nom de l'app, navigation (Tableau de bord · Vols · Pilotes · Sites · Comparer), bascule clair/sombre, date de mise à jour.
- **Barre de filtres globale**, persistante d'une page à l'autre et synchronisée avec l'URL :
  - Pilotes (multisélection avec recherche ; « tous » = aucun choisi, sans l'entrée artificielle « Tous les pilotes »)
  - Activité (contrôle segmenté : Tout · Parapente · Paramoteur ; par défaut **Tout**)
  - Période (plage de dates, plus des raccourcis : cette année, 12 derniers mois, année N…)
  - Voiles, Sites (multisélection, options **en cascade** selon les autres filtres, avec compteur de vols)
  - Puces récapitulatives des filtres actifs et bouton « Réinitialiser »
  - **Valeurs par défaut (D6)** : activité « Tout », tous les pilotes, toutes les périodes.
- **Pied de page** : date de mise à jour des données, mention « Données issues de syride.com. Outil personnel, non affilié à Syride. », lien vers la page À propos.
- **Desktop** : filtres dans une barre latérale repliable. **Mobile** : tiroir du bas.
- Tous les nombres sont au format français : espace pour les milliers, virgule décimale, « 2 096 h 01 ». On réutilise les règles de `src/rapport/report_format.py`.
- **Conventions communes reprises du rapport**
  - **Pastilles d'écart** (`DeltaPill`) : vert et rouge pour les volumes (vols, heures, jours volés), bleu et ambre pour les autres KPI. Elles ne jugent jamais une vitesse ou un plafond comme « bien » ou « mal ».
  - **Mention « Données partielles »** quand plus de 20 % des vols de la sélection n'ont pas la mesure affichée. Une infobulle donne la répartition gpx, fiche ou aucune.
  - **Infobulles riches**, épinglables au toucher. **Fiche jour** en modale, avec les vols du jour et les boutons jour précédent et suivant ; on l'ouvre depuis le calendrier ou la frise.
  - **Raccourcis clavier** : `1`, `2`, `3` pour la discipline, `t` pour le thème, `?` pour l'aide, `/` pour la recherche, `Échap`.
  - **Surlignage croisé** : survoler un site, une voile ou un mois surligne les éléments correspondants dans le calendrier, la carte et le ruban de la page (repris des filtres croisés T56). Un clic transforme le surlignage en filtre global.

### 5.1 Tableau de bord `/` : **parité** avec l'existant, en mieux

0. **Activité collective** (nouveau, raison d’être de la webapp selon D9 ; placé **sous** le bandeau de KPI, D14)
   - **« La saison du groupe »** : heures cumulées depuis le 1ᵉʳ janvier pour tous les pilotes, superposées à la même courbe de l'année précédente, avec la phrase d'écart (« le groupe a 34 h d'avance sur 2025 à date »). Réutilise `CumulativeChart` et la logique `year_gap`.
   - **Derniers vols** : fil des 10 à 20 vols les plus récents (pilote, site, durée, plafond), avec un lien vers la fiche vol et une icône « trace sur Syride ».
   - **Ce mois-ci / cette semaine** : pilotes actifs, vols, heures, site le plus fréquenté, plus long vol de la période.
   - **Records récents** : records personnels battus dans les 30 derniers jours, tous pilotes confondus. Ils sont mis en avant par la couleur réservée aux records, **sans médaille**.
   - Ces blocs suivent les filtres globaux. On peut donc, par exemple, n'afficher que l'activité paramoteur.
1. **Bandeau de KPI**
   - Vols, Heures de vol, Sites, Pilotes, Distance cumulée totale, Plafond max.
   - Chaque tuile affiche la valeur principale et une **variation par rapport à la période précédente équivalente**, quand une période est filtrée.
2. **Caractéristiques de vol** : un tableau compact « moyenne / médiane / max » pour durée, distance, vitesse moyenne, vitesse max, plafond, vario max et g max. Le max est **cliquable** et ouvre le vol record.
3. **Évolution dans le temps** (nouveau)
   - Courbe des heures et du nombre de vols par mois, avec curseur de zoom.
   - Bascule « cumulé / mensuel » et empilement par pilote ou par activité.
4. **Répartitions** : on retrouve les 7 onglets, avec un sélecteur de **statistique** (les 19 actuelles, renommées proprement) et un sélecteur d'**axe** (pilote, année, mois, voile, jour, saison, site, heure de décollage).
   - Barres horizontales triées pour les catégories longues (sites, voiles), avec un top N et la possibilité de tout afficher.
   - **Clic sur une barre = ajout du filtre correspondant** (exploration croisée).
5. **Rythme** (repris du rapport, calculé sur la sélection)
   - Calendrier en heatmap jour par jour, avec 4 niveaux d'intensité par discipline (`--cal-p/m/b`). Sur mobile, il passe en 12 mini-mois.
   - 4 tuiles au-dessus : plus longue série, plus longue pause, meilleure semaine, régularité (semaines actives sur semaines écoulées). Le clic sur une tuile surligne les jours concernés.
   - Part de vols le week-end et tuiles par saison.
6. **Quand vole-t-on ?** : matrice jour de la semaine × heure de décollage (4 niveaux, totaux en marge), avec la phrase « créneau favori ».
7. **Durées** : histogramme des durées (<15, 15–30, 30–60, 60–120, >120 min) avec les médianes de durée, plafond, vitesse max et distance.
8. **Modes de vol** : barre empilée treuil, rando, etc., et part parapente/paramoteur.
9. **Matériel** : tableau des voiles avec barres en ligne, **ruban voile × mois**, et tableau des instruments.
10. **Nuage de points** : durée × plafond (ou × distance). Chaque point est un vol cliquable vers sa fiche.
11. **Carte des sites**
   - MapLibre avec clustering, cercle proportionnel au nombre de vols, couleur selon l'activité dominante.
   - Clic : popup avec les stats du site et un lien vers sa page.
   - Bascule « heatmap des décollages ».

### 5.2 Liste des vols `/vols` (nouveau)

- Tableau virtualisé, avec les colonnes date, pilote, activité, site, voile, durée, distance, plafond, vitesse max, vario max et g max.
- Tri multicolonne, recherche texte, sélection des colonnes visibles.
- Indicateurs : vol incomplet, statistiques sans GPX.
- Colonne d'action : icône ↗ « Voir la trace sur Syride », dans un nouvel onglet.
- Export CSV de la sélection courante.
- Clic sur une ligne : fiche du vol.

### 5.3 Fiche vol `/vol/:key` (nouveau, sans trace : D12)

- **En-tête** : pilote, date et heure, site, voile, instrument, activité, mode de vol.
- **Bouton principal « Voir la trace sur Syride ↗ »**, très visible, qui ouvre la page du vol sur syride.com. C'est **la** porte d'entrée vers la trace.
- **Chiffres du vol** : durée, distance, distance cumulée, plafond, gain, vitesses, vario max, g max, avec la mention de la source (fiche Syride ou GPX).
- **Ce vol dans son contexte** (la valeur ajoutée par rapport à Syride) :
  - rang du vol parmi ceux du pilote (« 3ᵉ plus long vol de j2f ») et sur le site (« plus haut plafond de l'année à Montbron ») ;
  - barres « ce vol / moyenne du pilote / moyenne du site » pour chaque métrique ;
  - vols du même jour (autres pilotes au même site, avec liens Syride) ;
  - vols précédent et suivant du pilote.
- **Ce site face aux autres (D15)** : indicateurs des vols du site (durée moyenne, distance, plafond, vitesse, vario, nombre de vols et de pilotes, part parapente/paramoteur) positionnés par rapport aux autres sites (sites d'au moins 10 vols), même présentation que « Ce vol face aux moyennes ». Lien vers la page du site.
- **Mini-carte** : position **du site** (pas de trace), avec un lien vers la page du site.

### 5.4 Pilotes `/pilotes` et `/pilote/:slug` (nouveau)

- **Liste** : cartes sobres par pilote (vols, heures, activité principale, dernier vol, première année).
- **Page pilote**
  - KPI du pilote et évolution annuelle.
  - Records personnels (plus long, plus haut, plus loin, vario max…).
  - Sites favoris (carte), voiles utilisées dans le temps (frise).
  - Carte de **ses sites** (cercles proportionnels au nombre de vols, sans trace).
  - **Carrière** : barres empilées par année (heures ou vols, parapente et paramoteur), étoile sur la meilleure année, 4 KPI de carrière.
  - Une **carte cliquable par année**, qui ouvre le Bilan (§5.4 bis).

### 5.4 bis Bilan pilote × année `/pilote/:slug/:annee` (nouveau) : le rapport HTML, en version interactive

**Rôle (D9)** : c'est la vue **vivante** de l'année d'un pilote, consultable à tout moment, y compris l'année en cours. Elle **ne remplace pas** le rapport HTML de fin d'année : ce dernier reste un document souvenir autonome, édité une fois par an, que la webapp ne publie ni ne relie (D4).

On reprend du rapport la structure, le ton (« tu ») et les textes calculés en Python (insights). Les blocs génériques réagissent aux filtres (discipline, site, voile…), et on peut naviguer vers les fiches vol. **La persona et les textes au « tu » n'apparaissent que sur cette page (D11).** Les autres pages restent neutres.

Les fonctions « souvenir » du rapport, le **rejeu animé de l'année** et le **récap PNG à partager**, restent propres au rapport de fin d'année. Elles ne sont **pas** reprises en v1 (phase 8 au plus tôt).

1. **En-tête du bilan**
   - 4 KPI : vols, heures, sites, km. Persona et justification, écart avec l'année dernière, équivalence (bouton ↻).
   - Fond **sobre** : aplat bleu nuit et lignes topographiques légères, comme le hero actuel du rapport. **Pas** de scène de ciel ni d'animation de comptage obligatoire.
   - Un sélecteur d'année avec des flèches pour passer à l'année précédente ou suivante.
2. **Aperçu** : 8 cartes KPI avec sparkline mensuelle et pastilles d'écart avec les années comparées, puis meilleur jour, « journée type » et vol de l'année (lien vers la fiche vol).
3. **Histoire** : frise des jalons (`insights.milestones`), en or pour les records et nouveautés. Chaque jalon mène au vol ou à la fiche jour.
4. **Rythme** :
   - courbe des **heures cumulées** de l'année, superposée aux 1 ou 2 années comparées (tirets ou pointillés en plus de la couleur), avec réticule qui donne la valeur de chaque année à date ;
   - losanges sur les jalons ;
   - calendrier et tuiles comme au §5.1-5.
5. **Quand / Où / Matos** : les mêmes composants que le tableau de bord, scopés pilote × année.
   - Les **zones** de carte du rapport (`insights.map_zones`) deviennent des boutons de cadrage MapLibre (« Autour de Montbron »).
   - Les nouveaux sites sont cerclés d'or.
   - Portée : « site le plus éloigné : X à 84 km ».
6. **Records** : top 5 sur 6 critères, mention « Nouveau record ! » et écart avec l'ancien record (`insights.records_beaten`).
7. **Comparaison avec les années précédentes** : tableau KPI × années avec pastilles, plus des **graphiques en haltère** (T34). **Pas de radar**, refusé par Adrien.
8. ~~**Projection de fin d'année** et jauge d'objectif (T31)~~ : retirées (D16).
9. **Vols de l'année** : tableau des vols (composant de §5.2), avec les records en or.
10. **Actions** :
    - « Copier le lien » (T14) et « Copier mon résumé » en texte (T24) ;
    - export CSV.
11. **Données et limites** : tableau de couverture (GPX, fiche seule ou sans stats) et glossaire.

### 5.5 Sites `/sites` et `/site/:id` (nouveau)

- **Liste** : carte plein écran et tableau triable.
- **Page site** :
  - stats et pilotes présents ;
  - saisonnalité (mois × heure) ;
  - derniers vols sur le site, chacun avec un lien « trace sur Syride » ;
  - records du site ;
  - « Ce site face aux autres » (D15), même composant que sur la fiche vol.

### 5.6 Comparer `/comparer` (nouveau)

- **Mode « Sites » (D17)** : 2 à 4 sites côte à côte (durée moyenne, distance, plafond, vitesse, vario, vols, pilotes, saisonnalité), calculés sur les pilotes sélectionnés dans les filtres globaux : « comment notre groupe vole à Montbron par rapport à Magnac ».

- Choix de 2 à 4 pilotes, ou de 2 à 4 années pour un même pilote.
- KPI côte à côte avec pastilles d'écart, courbes d'heures cumulées superposées (réticule commun), **graphiques en haltère** par métrique (T34) et rythme comparé (régularité, série, part du week-end).
- **Pas de radar ni de percentile de groupe**, tous deux refusés pour le rapport. La comparaison entre pilotes reste factuelle (valeurs côte à côte), sans classement « meilleur ou moins bon pilote ».

### 5.7 Records `/records` (nouveau, sobre : pas de médailles)

- Tableaux « Top 10 » par métrique, avec les filtres globaux appliqués. Les valeurs record sont en **or** (couleur réservée), sans médaille ni podium animé.

### 5.8 À propos et qualité des données `/a-propos`

- Source des données, date de mise à jour, méthode de calcul de chaque statistique (glossaire).
- Compteurs d'anomalies : vols sans date, sans coordonnées, incomplets, voiles non uniformisées.
- C'est utile à Adrien pour la maintenance.

### 5.9 Correspondance entre les 19 statistiques actuelles et les nouveaux libellés

Le libellé de chaque statistique est défini **une seule fois**, dans `web/src/lib/metrics.ts` : identifiant, libellé, unité, agrégation, colonne source, traitement des vols incomplets. L'agent développeur reprend la liste exacte `list_values_graph` de `src/app.py:44` et la logique de `create_grouped_df` (`src/app_functions.py:182`), et produit un tableau de correspondance dans la PR de la phase 3.

---

## 6. Direction artistique

**Principe (D5)** : **aucune contrainte de couleur imposée. L'objectif est un rendu esthétique.** Le designer a carte blanche pour proposer une identité propre à la webapp. Le système du rapport (`report.css`) est **une source d'inspiration** (il a fait ses preuves), pas une obligation, puisque les deux produits ont des objectifs différents (D9). Le style souhaité reste « professionnel, moderne, ludique et pédagogique », sans décor inutile.

**Ce qui est imposé, quelle que soit la palette :**
- **Une couleur = un sens**, appliqué de la même façon partout (graphiques, carte, pastilles) :
  - une couleur pour le parapente, une pour le paramoteur, une neutre pour les deux ;
  - une couleur **réservée** aux records et nouveautés ;
  - des couleurs d'années comparées doublées d'un motif (tirets, hachures) ;
  - une paire de couleurs pour les volumes en hausse ou en baisse, et une autre pour les écarts neutres.
- Validation en daltonisme et en contraste AA (skill `dataviz`).
- Rendu soigné en clair **et** en sombre.

Les valeurs ci-dessous sont celles du rapport, données **à titre de point de départ**. Le designer propose **2 directions de palette** sur les maquettes (2.7), et Adrien choisit.

**Refus à respecter** : badges, médailles, confettis, podium animé, scène de ciel (nuages, parapente animé), thème « Ciel », radar, croisement sites × mois, visite guidée, percentile de groupe.

- **Ton** : tableau de bord éditorial, à la manière d'un rapport d'analyste. Le Bilan garde le « tu » et les textes du rapport ; le reste de l'app est neutre.
- **Typographie (D10)** : **pile de polices système** (`system-ui, -apple-system, "Segoe UI", Roboto, …`). Rien à télécharger, rendu natif et rapide. La hiérarchie passe par les graisses et les tailles. Les chiffres utilisent `font-variant-numeric: tabular-nums`.
- **Palette de départ** (variables de `report.css:5-35`, à réinterpréter librement) :
  - Accent bleu `#1d4ed8` en clair, `#7db0ff` en sombre ; fonds `#f3f6fb` et `#0b1220`.
  - **Une couleur, un sens**, identique partout (graphiques, carte, pastilles) :
    - parapente = orange `#ea580c`, paramoteur = cyan `#0891b2`, les deux = ardoise ;
    - **or = records et nouveautés uniquement** ;
    - années comparées `--y0`, `--y1`, `--y2`, doublées de tirets ou hachures ;
    - vert et rouge pour les volumes, bleu et ambre pour les écarts neutres ;
    - `--w-*` pour les modes de vol, `--cal-*1..4` pour l'intensité du calendrier.
  - La palette catégorielle (pilotes, voiles, sites dans le top N) compte 8 couleurs **qui ne doivent pas entrer en collision** avec les couleurs sémantiques ci-dessus. Elle est validée en daltonisme et en contraste (skill `dataviz`).
- **Mode clair et sombre** : système par défaut, préférence mémorisée, même mécanique que le rapport (`data-theme`). Le style de carte MapLibre est adapté à chaque mode : fond désaturé, routes discrètes et relief léger.
- **Formes** : rayon et ombres douces du rapport, conteneur de 1 120 px pour les pages de lecture (Bilan) et pleine largeur pour le tableau de bord et les cartes.
- **Densité** : grille de 12 colonnes, cartes sans ombres lourdes (bordure de 1 px), beaucoup d'air, icônes fines (Tabler Icons, inclus avec Mantine).
- **Mouvement** : transitions de 150 ms maximum, aucune animation décorative.
- **Accessibilité** : contraste AA, navigation au clavier, `aria-label` sur les graphiques, et tableaux de données alternatifs (« voir les données ») pour chaque graphique.

**Livrables du designer (phase 2)**
1. Fichier de jetons `theme/tokens.ts` : couleurs, espacements, rayons, typographie. **2 directions de palette** sont proposées, dont l'une peut dériver de `report.css`.
2. Thème Mantine, thème ECharts (clair et sombre) et style MapLibre JSON dérivé d'OpenFreeMap « positron » et « dark ».
3. **4 maquettes HTML statiques** (tableau de bord, fiche vol, page pilote, **Bilan pilote × année**), sur desktop et mobile, publiées en artefact pour validation par Adrien **avant** le développement des écrans. La maquette du Bilan est comparée côte à côte avec un rapport HTML existant.

---

## 7. Organisation : agents, niveaux de modèle, sessions

### 7.1 Rôles et niveau de modèle

Principe : **Opus** conçoit, arbitre et relit. **Sonnet** produit le code. **Haiku** fait l'exécution mécanique (recherche, renommage, vérifications, rédaction de fixtures).

| Rôle (agent) | Modèle | Interventions |
|---|---|---|
| **Maître d'œuvre** (session principale) | Opus | Découpage, arbitrages, relecture des PR, intégration, dialogue avec Adrien |
| **Architecte** | Opus (agent `Plan`) | Phase 0 : validation de l'architecture, contrat de données, arborescence. Relecture de la phase 2. |
| **Data engineer** | Sonnet | Phase 1 : `export_web.py`, schéma, tests pytest |
| **Data scientist** | Sonnet | Phase 1 : audit de cohérence des statistiques (fiche ou GPX), portage des indicateurs de rythme. Phase 5B : agrégats « Ce site face aux autres » (D15). |
| **Intégrateur du rapport** | Sonnet, relecture Opus | Phase 1 : rendre `report_data.py` importable, `insights.py`. Phase 5B : page Bilan. Il connaît `src/rapport/` et ses contraintes (Python 3.8, refus d'Adrien). |
| **Designer UI** | Sonnet (avec les skills `artifact-design` et `dataviz`) | Phase 2 : jetons, thèmes, maquettes |
| **Développeur front** | Sonnet | Phases 2 à 6 : composants, pages |
| **Développeur cartographie** | Sonnet | Phases 3 et 5 : MapLibre, carte des sites (clusters, heatmap, cadrage par zones) |
| **Testeur / QA** | Haiku (écriture des tests e2e simples, vérifications) ; Sonnet (scénarios complexes) | Phases 3 à 7 |
| **Explorateur** | Haiku (agent `Explore`) | Recherches ponctuelles dans le code existant |
| **Relecteur de code** | Opus via `/code-review` (niveau `medium`) en fin de phase | Fin de chaque phase |
| **DevOps** | Sonnet | Phase 7 : `publish.py`, wrangler, CI GitHub Actions |

### 7.2 Règles de coordination

- Une phase = **une branche** `web/phase-N-<nom>`, avec PR vers `main` à la fin de la phase et relecture Opus avant fusion.
- Le parallélisme n'est utilisé que quand les lots ne touchent **pas les mêmes fichiers**, chacun dans son worktree. Par exemple, en phase 1, l'export Python d'un côté et le scaffold du front de l'autre.
- Chaque agent reçoit un **brief autonome** : fichiers concernés, contrat de données (§4), critères d'acceptation (§9), interdits (ne jamais committer de données réelles).
- Les vraies données ne sortent jamais du Mac, sauf vers Cloudflare au déploiement. La CI tourne sur `web/tests/fixtures/`, des données **synthétiques**.

### 7.3 Gestion du contexte : quand faire `/clear`, `/compact` ou une nouvelle session

| Moment | Action |
|---|---|
| Après validation de cette feuille de route | **`/clear`**, puis on repart avec « Lis ROADMAP_WEBAPP.md, attaque la phase 0 ». Le document se suffit à lui-même. |
| Fin de chaque phase (PR fusionnée, cases cochées) | **`/clear`**. L'état vit dans le dépôt et dans la check-list, pas dans la conversation. |
| Milieu d'une phase longue (3 et 5), quand la conversation dépasse beaucoup d'échanges | **`/compact`**, en précisant « garde : phase en cours, fichiers touchés, décisions prises, tâches restantes ». |
| Lots parallèles indépendants (phase 1 : export Python et scaffold du front ; phase 4 : pages pilote et pages site) | **Nouvelles sessions** lancées par le maître d'œuvre, une par lot, en worktree. Rapport de fin vers la session principale. |
| Correctif ou idée hors sujet découvert en route | Carte « nouvelle session » proposée, sans dériver dans la session en cours. |

---

## 8. Phases détaillées (lots de travaux)

Charge estimée en **sessions de travail** (environ 1 à 3 h avec Claude, validation d'Adrien comprise).

### Phase 0 : Cadrage et décisions (≈ 1 session) · Opus

- **0.1** Adrien tranche les décisions du §11 : confidentialité, nom du sous-domaine, accès restreint ou non, publication des rapports.
- **0.2** Vérifier **à date** les conditions gratuites :
  - Cloudflare Pages (pas de carte requise, 25 Mio par fichier, 500 builds par mois) ;
  - OpenFreeMap (usage sans clé) ;
  - (Cloudflare Access n'est plus nécessaire : accès public, D1.)
  On consigne les liens et la date dans `web/README.md`.
- **0.3** Créer le compte Cloudflare (gratuit, **sans moyen de paiement**). C'est Adrien qui le fait : création de compte et mot de passe.
- **0.4** Mettre à jour la `.gitignore` (liste blanche : `web/`, `Makefile`, `ROADMAP_WEBAPP.md`).
- **0.5** Figer le contrat de données §4 en `schema.json` (version 1).
- **Sortie** : décisions consignées dans §11, schéma commité, compte prêt.

### Phase 1 : Export des données web (≈ 2 sessions) · Sonnet (data engineer et data scientist), relecture Opus

Peut tourner **en parallèle** de la phase 2.1 (scaffold).

- **1.1** `src/web_export/schema.py` : chargement et validation de `schema.json`.
- **1.2** `export_flights()` : pkl vers `flights.json` colonnaire.
  - Dictionnaires de catégories, `null` pour les inconnues, suppression de la date « 1901 », arrondis, clé stable.
  - Tests : nombre de lignes égal à celui du pkl, aucune valeur sentinelle, aller-retour.
- **1.3** `export_sites()` : à partir des vols et de `sites_coordinates.json`, sans la clé vide, avec les comptes par site.
- ~~**1.4** Traces~~ : supprimé (D12).
- **1.5** Audit du data scientist (rapport court dans la PR) : cohérence des statistiques entre la fiche Syride et le GPX, taux de couverture par métrique, liste des valeurs aberrantes à corriger en amont (`uniformisation.json`). **Contrôle** : aucune colonne de coordonnées par vol dans l'export.
- **1.5 bis** **Insights** (intégrateur du rapport) :
  - On vérifie que `src/rapport/report_data.py` (et `report_html.py` pour le moteur de textes `render_md` et `variant`) est importable **sans effet de bord**. Sinon, on extrait le moteur de textes dans `src/rapport/report_texts.py`, **sans changer le rendu du rapport HTML**.
  - `src/web_export/insights.py` produit `insights/<pilote>-<année>.json` (§4.5) pour chaque couple (pilote, année) et chaque discipline : persona, écart, jalons, records battus, équivalences, nouveaux sites et voiles, zones, portée, textes.
  - **Test** : pour 2 pilotes, les textes et valeurs du JSON sont identiques à ceux du rapport HTML généré (`check_reports.py` peut servir de base).
- **1.6** `meta.json` avec hashes de contenu, et purge des anciens fichiers hashés.
- **1.7** CLI : `uv run python src/export_web.py [--only flights|sites|insights] [--pilot X] [--full]`.
- **1.8** Fixtures synthétiques anonymisées : 3 pilotes fictifs et 50 vols. Elles sont générées par un script (`make fixtures`) et servent à la CI.
- **Sortie** : `web/public/data/` généré en moins de 30 s, tests pytest verts, taille totale mesurée et notée ici.

### Phase 2 : Socle front et design (≈ 2 sessions) · Sonnet (développeur et designer), relecture Opus

- **2.1** Scaffold `web/` :
  - Vite, React, TS strict ;
  - ESLint, Prettier, Vitest, Playwright ;
  - versions **épinglées** et `package-lock.json` commité ;
  - `.nvmrc` (Node LTS).
- **2.2** Types générés depuis `schema.json` (`npm run gen:types`).
- **2.3** Couche données :
  - `loadMeta()`, `loadFlights()` : décodage colonnaire vers un tableau d'objets typés, avec les champs dérivés (année, mois, jour, saison, heure) calculés une fois ;
  - `loadTrack(key)` avec cache LRU ;
  - gestion d'erreur et de chargement (squelettes).
- **2.4** Store des filtres (Zustand) et synchronisation bidirectionnelle avec l'URL.
  - Fonction pure `applyFilters(flights, filters)`.
  - Options en cascade calculées avec un compteur de vols.
- **2.5** `lib/stats.ts` : portage exact de `get_flight_params` et `create_grouped_df`, avec les 19 métriques de `metrics.ts`.
  - `lib/rhythm.ts` et `lib/records.ts` : portage des indicateurs **génériques** du rapport.
    - `compute_kpis` :195, dont jours volés, médianes.
    - `week_hour_matrix` :240 et `_duration_stats` :507.
    - `compute_rhythm` :440 : série, pause, meilleure semaine, régularité, série de semaines, part du week-end ; mêmes conventions (semaine du 1ᵉʳ janvier, pas de pause après le dernier vol).
    - `_records` :310, `_highlights` :383, `_coverage` :526, `compute_career` :801, `delta_pct` :831.
  - **Test de non-régression** : un script Python produit `expected_stats.json` sur les fixtures, en appelant **à la fois** `app_functions.py` et `report_data.py`, et Vitest compare (tolérance 1e-6).
- **2.6** `lib/format.ts` : nombres, durées et dates en français (`Intl`).
- **2.7** Designer :
  - jetons, thème Mantine, thème ECharts (clair et sombre), style MapLibre ;
  - **4 maquettes** publiées en artefact (dont le Bilan, comparé au rapport HTML) ;
  - **⏸ validation d'Adrien obligatoire avant la phase 3.**
- **2.8** Gabarit : en-tête, navigation, barre de filtres (desktop et mobile), routeur et pages vides, bascule de thème, page 404.
- **2.9** `_redirects` (fallback SPA) et `_headers` :
  - `data/*.hash.json` et `assets/*` : `Cache-Control: immutable` ;
  - `meta.json` : `no-cache`.
- **Sortie** : l'app démarre avec `npm run dev` sur les vraies données, les filtres fonctionnent dans l'URL, et les tests de non-régression des statistiques sont verts.

### Phase 3 : Tableau de bord, parité et plus (≈ 2 à 3 sessions) · Sonnet (front et cartographie)

- **3.0** Bloc « Activité collective » (§5.1-0) : saison du groupe (cumul de l'année contre l'année précédente, phrase d'écart), fil des derniers vols avec liens vers Syride, ce mois-ci et cette semaine, records personnels récents.
- **3.1** `KpiCard` et bandeau de KPI, avec variation sur la période précédente.
- **3.2** Tableau « Caractéristiques » (moyenne, médiane, max), avec lien vers le vol record.
- **3.3** `StatChart` générique : axe × métrique, barres verticales ou horizontales selon la cardinalité, top N, tri.
  - Clic : ajout du filtre.
  - Bouton « voir les données ».
- **3.4** Évolution temporelle (mensuel ou cumulé, empilement) avec dataZoom.
- **3.5** Bloc Rythme :
  - `CalendarHeatmap` (4 niveaux par discipline, 12 mini-mois sur mobile, navigation au clavier par flèches) ;
  - tuiles série, pause, meilleure semaine et régularité, qui surlignent les jours ;
  - tuiles par saison et part du week-end ;
  - `DaySheet`, la fiche jour en modale avec jour précédent et suivant.
- **3.5 bis** `WeekHourMatrix`, `DurationHistogram` avec médianes, barre des modes de vol, tableau des voiles, `WingRibbon` (voile × mois), tableau des instruments, `ScatterChart` (durée × plafond ou distance).
- **3.5 ter** `DeltaPill` et `CoverageNotice` (« Données partielles » au-delà de 20 %), surlignage croisé au survol, raccourcis clavier.
- **3.6** `MapView` des sites : clustering, taille selon le nombre de vols, popup, heatmap en option, ajustement du cadrage sur la sélection.
- **3.7** États vides (« aucun vol pour ces filtres »), y compris le cas qui plantait l'app Dash.
- **3.8** Tests e2e : chargement, filtre pilote, l'URL reflète le filtre, clic sur une barre puis filtre ajouté, mode sombre.
- **3.9** **Revue de parité** : liste ligne à ligne des fonctions de l'app Dash, chacune cochée comme présente ou remplacée.
- **Sortie** : tableau de bord ≥ ancienne app sur toutes les fonctions, et tous les blocs génériques du rapport sont disponibles en composants réutilisables.
- **Contexte** : c'est la phase la plus lourde. **2 sessions en parallèle possibles** : (a) KPI, StatChart, évolution, carte, et (b) blocs Rythme, Quand, Durées, Matériel, Nuage, dans des fichiers de composants distincts. `/compact` conseillé en milieu de phase.

### Phase 4 : Vols, liste et fiche (≈ 1 session) · Sonnet (front)

- **4.1** `/vols` : TanStack Table virtualisée, tri, recherche, colonnes au choix, export CSV, icône ↗ vers la trace sur Syride.
- **4.2** `lib/syride.ts` : `syrideFlightUrl()` et `syridePilotUrl()`, avec tests (encodage des pseudos avec espaces ou accents, `syride_num` absent).
- **4.3** Fiche vol : en-tête, bouton « Voir la trace sur Syride », chiffres et sources.
- **4.4** Bloc « Ce vol dans son contexte » : rangs, barres vol / pilote / site, vols du même jour, vols précédent et suivant.
- **4.5** Mini-carte du site (sans trace).
- **4.6** Contrôle D12 : un test e2e vérifie qu'aucune requête réseau ne charge de géométrie de vol et que le DOM ne contient aucune polyligne de trace.
- **4.7** e2e : liste, puis fiche, puis le lien Syride pointe vers la bonne URL.
- **Sortie** : n'importe quel vol est consultable en moins de 500 ms, et sa trace est à un clic sur Syride.

### Phase 5 : Pilotes, sites, comparaison, records (≈ 2 sessions) · Sonnet, **2 sessions parallèles possibles** (pilotes/comparaison d'un côté, sites/records de l'autre)

- **5.1** `/pilotes` et `/pilote/:slug` : KPI, évolution, carrière (barres empilées, étoile sur la meilleure année), records personnels, sites favoris, frise des voiles, carte de ses sites, cartes d'accès aux Bilans annuels.
- **5.2** `/sites` et `/site/:id` : stats, pilotes, saisonnalité mois × heure, derniers vols (liens Syride), records du site.
- **5.3** `/comparer` : 2 à 4 pilotes ou années, KPI côte à côte avec pastilles, cumuls superposés avec réticule commun, graphiques en haltère (T34). **Pas de radar.**
- **5.4** `/records` : top 10 par métrique, avec les filtres appliqués.
- **5.5** `/a-propos` : glossaire des métriques, compteurs de qualité des données, crédit « Créée par : Adrien Moreau » (ici seulement, pas dans le pied de page).
- ~~**5.6** Publication des rapports HTML~~ : abandonné (D4).
- **Sortie** : toutes les pages du §5 sont livrées, sauf le Bilan (phase 5B).

### Phase 5B : Bilan pilote × année, le rapport en version interactive (≈ 2 sessions) · Sonnet (intégrateur du rapport et front), relecture Opus

Prérequis : phases 1.5 bis (insights) et 3 (composants génériques).

- **5B.1** Route `/pilote/:slug/:annee`, chargement de `insights/<pilote>-<année>.json`, sélecteur d'année ; la discipline est prise dans le filtre global.
- **5B.2** En-tête du bilan : 4 KPI, persona, écart avec l'année précédente, équivalence avec ↻ ; fond sobre, bleu nuit et lignes topographiques.
- **5B.3** Aperçu : 8 cartes KPI avec sparkline et pastilles d'écart avec les années comparées (choix de 0 à 2 années, 2 précédentes par défaut, comme `--compare`), meilleur jour, journée type, vol de l'année.
- **5B.4** Histoire : `Timeline` des jalons (or = records et nouveautés), avec lien vers le vol ou la fiche jour.
- **5B.5** Rythme : `CumulativeChart` multi-années (tirets et hachures, réticule, losanges des jalons), puis réutilisation des blocs de la phase 3.
- **5B.6** Où : carte MapLibre avec boutons de cadrage par zone, nouveaux sites cerclés d'or, portée, tableau des sites.
- **5B.7** Records de l'année et mention « Nouveau record ! » avec écart ; tableau de comparaison KPI × années et graphiques en haltère.
- ~~**5B.8** Projection de fin d'année et jauge d'objectif (T31)~~ : retiré (D16).
- **5B.9** Actions :
  - copier le lien et copier le résumé (T14, T24) ;
  - CSV ;
  - (le rejeu et le récap PNG restent propres au rapport de fin d'année, cf. phase 8).
- **5B.10** Données et limites : couverture et glossaire.
- **5B.11** **Recette croisée** : pour 3 couples (pilote, année), toutes les valeurs et phrases du Bilan sont identiques à celles du rapport HTML de `html_reports/`, à date de coupure égale. Les écarts sont justifiés par écrit.
- **5B.12** e2e : ouvrir un Bilan, changer d'année, clic sur un jalon qui mène à la fiche vol, export PNG.
- **Sortie** : le rapport HTML a son équivalent interactif dans la webapp, sans double maintenance des règles de récit.

### Phase 5C : Retours de la recette d'Adrien (≈ 1 à 2 sessions) · Sonnet (front), relecture Opus

Recette en main propre d'Adrien du 19/11/2026, sur toutes les pages livrées en phases 3 à 5B. Prérequis : phase 5B fusionnée. **Deux lots parallèles possibles** dans le même dossier, sans fichier commun : lot A = navigation, filtres et pages pilote, vol et site (5C.1 à 5C.5) ; lot B = graphiques, infobulles et calendriers (5C.6 à 5C.9).

**Navigation**
- **5C.1 Menu actif sur les pages de détail.** Sur `/pilote/:slug`, `/pilote/:slug/:annee`, `/vol/:key` et `/site/:id`, aucune entrée du menu n'est soulignée. Cause trouvée : `isNavActive` (`components/navigation.ts`) gère déjà ces préfixes, mais `FilterLink` en mode `nav` passe par le `NavLink` de React Router. Celui-ci calcule son propre `aria-current` : il ne le pose que sur `/pilotes` exact et écrase la valeur fournie. Correction : dans `AppHeader`, un `Link` simple dont `aria-current` vient uniquement de `isNavActive`. Règles : un vol sous « Vols », un pilote ou un bilan sous « Pilotes », un site sous « Sites ». Test unitaire sur `isNavActive`, et un e2e qui vérifie `aria-current="page"` sur les 4 pages de détail.
- **5C.2 Retour et fermeture.** Sur les fiches vol et site, la page pilote et le Bilan :
  - **fil d'Ariane** sobre sous l'en-tête, avec les filtres conservés : « Vols › 12 juin 2025 · AdrienM », « Sites › Montbron », « Pilotes › AdrienM › Bilan 2025 » ;
  - **bouton « ← Retour »** qui revient à la page précédente de l'historique s'il en existe une dans l'app (`location.key !== 'default'`), sinon à la liste parente ;
  - la touche Échap fait de même, sauf si un tiroir ou une fenêtre est ouvert.
  - Composant unique `components/common/DetailNav.tsx`, utilisé par les 4 pages.
- **5C.3 Accès au Bilan depuis la page pilote.** Dans l'en-tête de la page pilote, bouton principal « Voir le bilan {dernière année} » et menu des autres années. Les cartes par année restent. Le texte des cartes devient explicite : « Bilan 2025 → ».

**Filtres**
- **5C.4 Plusieurs années dans le filtre.** Le menu « Année… » devient un choix multiple : on coche 2025 et 2023, par exemple. La décision de phase 3 (« années non contiguës non reprises », `docs/archive/web/PARITE_DASH.md` #12) est annulée (D19).
  - Nouvelle dimension `years: number[]` dans `Filters` (`lib/filters.ts`), à côté de la période Du / Au. Un vol passe s'il est dans l'une des années cochées **et** dans la période, si elle est renseignée.
  - Choisir des années vide la période. Choisir une période ne touche pas aux années, mais l'intersection vide est signalée par l'état vide existant.
  - Paramètre d'URL `annees=2025,2023`, compteurs en cascade, ligne « Vue filtrée » (`filterSummary`) : « 2023 et 2025 ».
  - Un clic sur une barre d'année de `StatChart` coche cette seule année.
  - La variation des KPI (« vs période précédente ») est masquée quand des années non contiguës sont cochées, et comparée à l'année précédente pour une seule année.
  - Les raccourcis « Cette année » et « 12 derniers mois » restent des périodes.
  - Mettre à jour `docs/archive/web/PARITE_DASH.md` #12 (statut « présente »), les tests de `filters.ts`, `filterSummary.ts` et `useFiltersUrlSync`, ainsi que l'e2e `filtres.spec.ts`.
  - Le Bilan continue d'ignorer ce filtre ; sa mention des filtres ignorés le cite.
- **5C.5 « Ses sites face à face » sans seuil.** La page pilote prend **tous** les sites du pilote, et non plus ceux d'au moins 10 vols (`MIN_SITE_FLIGHTS_PILOT` passe à 1 pour cet usage ; le seuil de la fiche vol et de la page site ne change pas). Le nombre de vols de chaque site est affiché à côté de son nom. Une note « peu de vols » en gris signale un site de moins de 3 vols, car sa moyenne est fragile. Il faut au moins 2 sites, sinon le message actuel s'affiche.

**Graphiques et infobulles**
- **5C.6 Fin du cadre gris qui masque les barres.** Les histogrammes utilisent `axisPointer: { type: 'shadow' }` : au survol, un aplat `surface-2` est dessiné au-dessus des barres et les masque en mode sombre. Fichiers concernés : `SiteSeasonality`, `CareerSection`, `DurationHistogram` et `BilanWhen`, et tout autre graphique en barres à vérifier. On le remplace par une **mise en avant de la barre survolée**, avec `emphasis` et les autres barres estompées, et par une infobulle par barre (`trigger: 'item'`), ou bien par une ombre placée **derrière** les barres avec une opacité faible. La même règle est posée dans le thème ECharts (`theme/echarts.ts`) pour tous les graphiques.
- **5C.7 Infobulle sur tous les calendriers et toutes les matrices.** Une infobulle légère (composant commun `components/common/CellTooltip.tsx`, avec Mantine `Tooltip` ou `Popover`, ou une bulle positionnée en CSS) apparaît au survol **et** au focus clavier, sur mobile au toucher. Elle concerne :
  - le **calendrier** du bloc Rythme (`CalendarHeatmap`), au tableau de bord, sur la page pilote et dans le Bilan : date, nombre de vols, durée, disciplines, sites, et « Clic : fiche du jour » ;
  - la **matrice mois × heure** de la saisonnalité d'un site (`SiteSeasonality`) : mois, tranche horaire, vols et durée ;
  - la **matrice jour × heure** (`WeekHourMatrix`, et sa copie dans `BilanWhen`) ;
  - le **ruban voile × mois** (`WingRibbon`) et la **frise des voiles** (`WingTimeline`).

  La cellule survolée reçoit un contour. Les attributs `title` natifs éventuels sont retirés pour éviter une double bulle.
- **5C.8 Les matrices et le calendrier « ne comportent que peu de jours ».** Diagnostic confirmé par Adrien le 19/11/2026 sur une capture de la page site (Saisonnalité d'un site de 44 vols) : la plage horaire se réduit aux heures volées (`hoursWindow`, ici 12 h à 19 h) et les cases gardent une taille fixe, si bien que la matrice n'occupe qu'un coin de la carte. Le constat porte sur les pages pilote et site, peu fournies. Surtout, Adrien a lu les colonnes 12 à 19 comme des **jours du mois**, et non comme des heures de décollage : les axes ne sont pas assez explicites. Corrections :
  - **axes nommés** sur toutes les matrices à heures : « Heure de décollage » au-dessus des colonnes, « Mois » ou « Jour » pour les lignes, en-têtes « 8 h », « 9 h »…, infobulle « Août, entre 14 h et 15 h : 3 vols » ;
  - **matrices** mois × heure (`SiteSeasonality`) et jour × heure (`WeekHourMatrix`, `BilanWhen`) : plage horaire **fixe de 8 h à 20 h**, élargie seulement si des vols en sortent, pour que toutes les pages aient la même grille ; le tableau **occupe la largeur de la carte** (cases ≥ 12 px, hauteur plafonnée), défilement horizontal conservé sous 360 px ;
  - **calendrier** (`CalendarHeatmap`) : il occupe la largeur de la carte (cases ≥ 12 px) ; l'année montrée et son sélecteur sont visibles à côté du titre ; option « 12 derniers mois » glissants, qui devient le défaut quand l'année en cours a moins de 6 mois écoulés.
- **5C.9 Légende des haltères.** Dans Comparer, section « Métrique par métrique », et dans le Bilan (`BilanComparison`), le composant `common/Dumbbell` affiche une **légende** au-dessus des lignes : symbole (disque, carré, anneau), couleur et motif de chaque série, avec son nom (pilote, année ou site). Une infobulle au survol d'un point donne la série et la valeur. « Ses sites face à face » et « Ce site face aux autres » reçoivent aussi une **légende** et une **infobulle** sur les barres et les points : la barre est l'étendue min–max des sites, le point la valeur du site, le trait la moyenne.

**Fin de phase**
- **5C.10** Tests : unitaires sur la logique nouvelle (filtre années, navigation, contenu des infobulles) et e2e sur le menu actif, le retour, les années multiples et l'infobulle d'une case de calendrier. Contrôle clair, sombre et 360 px. `/code-review medium`.
- **Sortie** : chaque remarque de la recette du 19/11/2026 est traitée, ou justifiée par écrit si elle ne l'est pas, et revue par Adrien.

### Phase 6 : Finitions, performance, accessibilité, PWA (≈ 1 à 2 sessions) · Sonnet, audit Opus

- **6.1** Découpage du code par route (`React.lazy`) ; ECharts importé à la carte (modules utilisés seulement) ; MapLibre chargé paresseusement.
- **6.2** Budget : JS initial ≤ 250 Ko gzip, données initiales ≤ 250 Ko gzip (relevé de 200 Ko, D21). Mesure avec `rollup-plugin-visualizer`.
- **6.3** Lighthouse (mobile) : Performance ≥ 90, Accessibilité ≥ 95, Bonnes pratiques ≥ 95.
- **6.4** PWA : manifest, icône sobre, cache des données (stale-while-revalidate sur `meta.json`), tuiles déjà vues, page hors ligne.
- **6.5** Revue responsive : 360 px, 768 px, 1280 px et 1920 px, avec captures Playwright archivées.
- **6.6** Passe éditoriale des libellés : accents, unités, glossaire cohérent.
- **6.7** `/code-review medium` sur l'ensemble du dossier `web/`, puis correction des constats.

### Phase 7 : Déploiement, automatisation, bascule (≈ 1 session) · Sonnet (DevOps), validation Opus

- **7.1** `wrangler` installé en devDependency (`npx wrangler login`, fait par Adrien) ; projet Pages créé (`<nom>.pages.dev`).
- **7.2** `src/publish.py` (et `make publish`) :
  1. vérifie que le pkl est plus récent que le dernier export ;
  2. lance `export_web.py` en incrémental ;
  3. `npm ci && npm run build` dans `web/` ;
  4. lance un smoke test Playwright sur `vite preview` (3 pages) ;
  4 bis. **contrôle D12** : refuse de publier si `web/dist` contient un fichier `.gpx`, `.igc` ou `.kml`, un dossier `tracks/`, ou une colonne de coordonnées par vol dans `flights.json` ;
  4 ter. vérifie 3 liens Syride tirés au hasard (requête HEAD) ;
  5. lance `wrangler pages deploy web/dist --project-name <nom> --branch main` ;
  6. affiche l'URL et la taille publiée.
- **7.3** Brancher `publish` **en fin de** `main.py` (option `--publish`) : un scraping suivi d'une publication en une commande.
- **7.4** CI GitHub Actions (code uniquement) : lint, typecheck, vitest, pytest et e2e sur fixtures, à chaque PR. **Aucun secret, aucun déploiement depuis la CI** (les données restent locales).
- ~~**7.5** Accès restreint~~ : abandonné, l'accès reste public (D1).
- **7.6** **Bascule (D7)**
  - On annonce la nouvelle URL `https://syride-analyse.pages.dev` aux pilotes.
  - **Après la recette finale (§9.2) validée**, Adrien supprime la webapp PythonAnywhere, puis le compte si plus rien n'y tourne. Aucune redirection n'est conservée.
  - Avant la suppression, on fait une **sauvegarde locale** du dossier `/home/amoreau/mysite/` (au cas où un fichier n'existerait que là-bas, par exemple le WSGI).
- **7.7** Archivage : `src/app.py` et `src/app_functions.py` vont dans `src/legacy/`. On nettoie `requirements.txt` (séparé en `requirements-scraping.txt` et `requirements-export.txt`, versions épinglées). On retire les dépendances Dash.
- **7.8** Mise à jour du `README.md` racine : schéma du pipeline, commande unique de publication, dépannage.

### Phase 8 : Bonus, après la v1 (à la carte)

- Rejeu animé de l'année et récap PNG dans le Bilan, repris du rapport (exclus de la v1, D9).
- Météo historique du jour du vol (Open-Meteo archive API : gratuite, sans clé, en usage non commercial), affichée dans la fiche vol.
- Statistiques de progression d'un pilote (tendance du plafond et de la durée, régression).
- Partage d'un vol par lien court, avec image OpenGraph générée au build.
- Pays visités (T35), par point-dans-polygone sur `src/rapport/map_data.geojson`, seulement si des vols ont lieu à l'étranger.
- Réparer ou abandonner le PDF (`generate_pdf_report.py` cassé), à décider à part.

---

## 9. Qualité, tests et critères d'acceptation

### 9.1 Définition de « terminé » pour chaque lot

- [ ] Code typé, sans `any` non justifié ; `tsc`, ESLint et Ruff propres
- [ ] Tests unitaires de la logique (stats, filtres, décodage, export)
- [ ] Au moins un test e2e pour chaque page livrée
- [ ] Mode clair et sombre vérifiés, mobile 360 px vérifié
- [ ] Aucune donnée réelle commitée (`git status` contrôlé, CI sur fixtures)
- [ ] PR relue par Opus, puis fusionnée

### 9.2 Critères d'acceptation globaux (recette finale par Adrien)

1. Les KPI du tableau de bord, filtres par défaut « Tout », sont **identiques** à ceux de l'ancienne app avec les mêmes filtres. On tolère l'arrondi et les corrections documentées (dates 1901 exclues).
2. Un changement de filtre met à jour toute la page en moins de 100 ms sur un Mac, et en moins de 300 ms sur un téléphone milieu de gamme.
3. N'importe quelle fiche vol s'affiche en moins de 500 ms en 4G. **Aucune trace n'est publiée** : le site déployé ne contient aucune géométrie de vol (contrôle automatique dans `publish.py`).
4. `make publish` va du pkl à l'URL en ligne en moins de 5 min (incrémental), sans étape manuelle à part le `wrangler login` initial.
5. Coût : 0 €, et **aucun moyen de paiement** enregistré sur Cloudflare ni sur GitHub.

---

## 10. Risques et parades

| Risque | Proba. | Impact | Parade |
|---|---|---|---|
| Changement des conditions gratuites de Cloudflare Pages | Faible | Fort | Le build est un dossier statique standard, portable en 10 min vers GitHub Pages (dépôt public de données séparé) ou Netlify. Procédure documentée dans le README. |
| OpenFreeMap indisponible ou limité | Faible | Moyen | Style de repli : tuiles raster OSM (usage modéré toléré) ou Protomaps (PMTiles hébergé sur Pages, ≤ 25 Mio par fichier : extrait de la France découpé). |
| Fichier > 25 Mio | Très faible | Faible | `flights.json` fait moins de 1 Mo. |
| Écart entre les statistiques TS et Python | Moyenne | Moyen | Test de non-régression automatisé (2.5) et recette (9.2-1). |
| Exposition de données | Faible | Faible | Données déjà publiques sur Syride (D2). Aucune trace publiée (D12), jamais les identifiants ni la base brute (§4.6). |
| Liens Syride cassés (changement de format d'URL chez Syride) | Faible | Moyen | Une seule fonction `syrideFlightUrl()`. `publish.py` vérifie 3 liens au hasard (requête HEAD) et alerte en cas d'échec. |
| Confusion avec le service officiel Syride (nom `syride-analyse`) | Faible | Faible | Mention « non affilié à Syride » en pied de page et dans À propos. Aucun logo ni charte graphique Syride. |
| Dérive du périmètre (trop de bonus) | Forte | Moyen | La phase 8 est séparée et la v1 est gelée après la phase 3 du §8. |
| Divergence entre le rapport HTML et le Bilan web | Moyenne | Moyen | Les règles de récit restent **uniquement** en Python (insights). Les indicateurs génériques sont testés contre `report_data.py` (2.5), avec recette croisée en 5B.11. |
| Une modification de `src/rapport/` casse l'export des insights | Moyenne | Moyen | `insights.py` est couvert par des tests pytest qui tournent aussi quand on modifie le rapport. Un champ `v` versionne le JSON. |
| Retour de gadgets refusés (radar, médailles, ciel) | Moyenne | Faible | La liste des refus est rappelée au §6 et dans chaque brief d'agent. Relecture Opus. |
| Données réelles poussées sur GitHub par erreur | Faible | Fort | `.gitignore` en liste blanche, hook pre-commit qui refuse `web/public/data/**`, CI sur fixtures. |
| Fatigue de maintenance (Node et npm) | Moyenne | Faible | Versions épinglées, Renovate désactivé, mise à jour annuelle planifiée. L'app statique continue de tourner même sans mise à jour. |

---

## 11. Décisions d'Adrien (tranchées le 15/11/2026)

| # | Question | Décision | Conséquence dans la feuille de route |
|---|---|---|---|
| D1 | Accès public ou restreint ? | **Public** | Pas de Cloudflare Access (7.5 abandonné) |
| D2 | Flouter les décollages privés ? | **Non** : toutes les données viennent de syride.com, où elles sont déjà accessibles. Rien de nouveau n'est rendu public. | Pas de floutage (§4.6) |
| D3 | Sous-domaine | **`syride-analyse`**, soit `https://syride-analyse.pages.dev` | Mention « non affilié à Syride » en pied de page |
| D4 | Publier les rapports HTML autonomes dans l'app ? | **Non** | 5.6 abandonné ; pas de lien de téléchargement dans le Bilan |
| D5 | Couleurs | **Aucune contrainte, rendu esthétique avant tout** | Le designer propose 2 directions de palette (2.7) ; la cohérence sémantique reste obligatoire (§6) |
| D6 | Filtre activité par défaut | **« Tout »** | §5.0 |
| D7 | PythonAnywhere après la bascule | **Supprimé** quand la nouvelle webapp est disponible et fonctionnelle | 7.6 : suppression après recette, sauvegarde préalable de `mysite/` |
| D8 | Dépôt public ou privé ? | **Public, et c'est très bien ainsi.** Pas besoin de dépôt privé (voir détail ci-dessous) | CI illimitée et gratuite ; vigilance sur ce qu'on commite |
| D9 | Le Bilan web remplace-t-il les rapports HTML ? | **Non.** La webapp couvre tous les pilotes et sert au **suivi collectif tout au long de l'année**. Le rapport est un **récap souvenir édité une fois en fin d'année**. Les objectifs sont différents. | Bloc « Activité collective » en tête du tableau de bord (§5.1-0). Le Bilan est la vue vivante d'un pilote, sans rejeu ni récap PNG (§5.4 bis) |
| D10 | Polices | **Pile système** | §6 |
| D11 | Persona et textes au « tu » | **Seulement sur le Bilan** | §5.4 bis |
| D12 | Publier des traces (même simplifiées) ? | **Non.** Chaque référence à une trace renvoie vers syride.com, qui les a déjà publiées. | §4.4 supprimé, fiche vol sans carte de trace, phases 1.4 et 4 allégées, pas de superposition ni de mini-trace, contrôle automatique dans `publish.py` et en e2e |
| D13 | Palette (2.7) | **Direction B « Encre »**, avec **parapente vermillon `#e4572e`** et **paramoteur azur `#2f6fe0`** (inversés par rapport à la proposition). Jetons : `web/design/tokens-B.json`. | §6 ; thème dans `web/src/theme/` |
| D14 | Ordre du tableau de bord | **« Vue d'ensemble » (KPI) au-dessus de « Activité collective »** | §5.1 |
| D15 | Fiche vol | Ajout de **« Ce site face aux autres »** : les vols du site comparés aux autres sites (durée, distance, plafond, vitesse, vario, vols, pilotes, part des disciplines), même langage visuel que « Ce vol face aux moyennes ». Agrégat réutilisé sur la page site. | §5.3, §5.5 |
| D17 | Comparaison de sites par pilote ou groupe | **Oui** : « Ce site face aux autres » existe aussi pour un pilote (bascule « Tous / Ce pilote » sur la fiche vol, section « Ses sites face à face » sur la page pilote), et la page Comparer reçoit un **mode « Sites »** (2 à 4 sites côte à côte, calculés sur la sélection de pilotes des filtres globaux). Un seul module TS d'agrégats par site, réutilisé partout. | §5.3, §5.4, §5.5, §5.6 |
| D16 | Projection de fin d'année et objectif personnel dans le Bilan (T31) | **Retirés** | §5.4 bis point 8 et 5B.8 supprimés |
| D18 | Écarts de la recette croisée 5B.11 | **Corrigés à la source** (19/11/2026) : (1) un site vide (chaîne vide, 3 vols) n'est plus compté comme un site dans le rapport Python et les insights ; (2) les durées sont exportées avec plus de précision, pour retrouver les minutes exactes du rapport ; (3) `meta.json` porte la vraie date de mise à jour des données, et la date du dernier vol est affichée à part | 5B.11, `docs/archive/web/RECETTE_5B11.md` |
| D19 | Sélection de plusieurs années non contiguës | **Oui** (recette du 19/11/2026), ce qui annule la décision de phase 3 | 5C.4 |
| D20 | Seuil de 10 vols dans « Ses sites face à face » (page pilote) | **Supprimé** : tous les sites du pilote | 5C.5 |
| D21 | Budget des données initiales (244 Ko gzip mesurés le 20/11/2026, toutes les colonnes servent) | **Relevé à 250 Ko gzip** (20/11/2026), sans passer au format en colonnes. À revoir quand le fichier approchera la limite (≈ +25 Ko par an) | 6.2 |

**Détail D8 : pourquoi un dépôt public suffit.**
- Avec cette architecture, **le code** va sur GitHub et **les données** vont directement du Mac vers Cloudflare (`wrangler`). Elles ne passent jamais par GitHub. La `.gitignore` en liste blanche l'impose déjà.
- Vérification faite le 15/11/2026 sur tout l'historique Git :
  - **aucun mot de passe ni identifiant** en dur ; les identifiants sont dans `.env`, ignoré, et `.env.template` ne contient que des valeurs d'exemple ;
  - **`global_flights_data.pkl`** a été commité le 20/05/2024 (`dc7febb`), puis retiré le 15/11/2026 (`109ecfb`). Il reste donc lisible dans l'historique. D'après D2, ce sont des données déjà publiques sur Syride, donc **aucune action requise**. Si Adrien préfère l'effacer, il faut une réécriture d'historique (`git filter-repo --path global_flights_data.pkl --invert-paths` puis un push forcé). C'est une opération irréversible, à faire seulement sur demande explicite.
- Garde-fous à mettre en place (0.4 et 7.4) :
  - un hook pre-commit qui refuse `*.pkl`, `*.db`, `.env`, `web/public/data/**`, `*.gpx` et `*.igc` ;
  - une CI qui ne tourne que sur des fixtures synthétiques ;
  - aucun secret dans GitHub Actions, puisque le déploiement se fait depuis le Mac.

## 12. Check-list de suivi

> Cocher au fil de l'eau (`- [x]`). Chaque phase se termine par une PR fusionnée puis par un `/clear`.

### Phase 0 : Cadrage
- [x] 0.1 Décisions D1 à D11 tranchées et consignées au §11 (15/11/2026), puis D12
- [x] 0.2 Conditions gratuites vérifiées et datées (Cloudflare Pages, OpenFreeMap) : `web/README.md`, 15/11/2026
- [x] 0.3 Compte Cloudflare créé **sans moyen de paiement** (15/11/2026, par Adrien ; authentification future par `npx wrangler login`, aucun mot de passe stocké)
- [x] 0.4 Hook pre-commit anti-données (pkl, db, .env, gpx, igc, kml, `web/public/data`, `<pilote>/traces/`, > 2 Mo) : `.githooks/pre-commit`, activé par `git config core.hooksPath .githooks`
- [x] 0.4 bis `.gitignore` mise à jour (`web/`, `Makefile`, roadmap ; exclusions `node_modules`, `dist`, `public/data`)
- [x] 0.5 `schema.json` v1 commité (`src/web_export/schema.json`, validé avec jsonschema 4.17, draft 2020-12)
- [ ] **`/clear`**

### Phase 1 : Export des données web
- [x] 1.1 Module schéma et validation (`src/web_export/schema.py`)
- [x] 1.2 `flights.json` colonnaire, sans sentinelles, tests pytest : 9 587 vols, 1 écarté (date 1901)
- [x] 1.3 `sites.json` : clé vide corrigée, 435 sites, dont 16 sans coordonnées (`lat` et `lon` à null)
- [x] 1.5 Audit de cohérence des statistiques (`docs/archive/web_export/AUDIT_PHASE1.md`) ; aucune coordonnée par vol dans l'export (vérifié)
- [x] 1.5 bis Le rapport HTML est importable sans effet de bord. `insights.py` réutilise `ReportBuilder` : 150 fichiers. Le test d'identité avec le rapport HTML passe (AdrienM et j2f 2025). Les rapports HTML sont identiques octet par octet avant et après les 2 retouches de `src/rapport/`.
- [x] 1.6 `meta.json` et hashes de contenu, purge des anciens fichiers
- [x] 1.7 CLI `export_web.py` (`--only`, `--pilot`, `--full`, `--out`, `--pkl`)
- [x] 1.8 Fixtures synthétiques et `make fixtures` (`web/tests/fixtures/data/`) ; 58 tests pytest au vert (`make test-py`, qui ajoute `-p no:dash` à cause du plugin pytest de Dash, cassé dans l'environnement anaconda)
- [x] Taille publiée mesurée : **2,6 Mo brut, 0,58 Mo gzip, 153 fichiers**. Détail : `flights` 888 Ko brut, 231 Ko gzip, ≈ 190 Ko brotli ; `sites` 55 Ko ; insights 1,65 Mo brut, 339 Ko gzip, 11 Ko en moyenne par fichier, chargés à la demande.
- [ ] ⚠️ Durée de l'export complet : **51 s**, au-delà de la cible de 30 s. Les insights prennent 46 s, sur 8 processus. **Piste pour la phase 7** : export incrémental qui ne régénère que les pilotes dont les vols ont changé, plus l'année en cours.
- [x] Décisions d'Adrien sur l'audit (15/11/2026) :
  - **valeurs aberrantes conservées**, car rares mais possibles : aucune mesure n'est neutralisée ;
  - **`biplan celebrity` corrigé** dans `voiles_exclues` : les 7 vols en avion sortent du décompte ;
  - **doublons identiques supprimés** par `remove_duplicate_flights` (`analyze_functions.py`, branché dans `create_global_pkl.py`). Un doublon a les mêmes date, heure, site, type, durée et mesures, quelle que soit la voile (9 groupes ont la même trace sous deux voiles). On garde le plus petit `num_activite`. Le pkl est passé de 9 635 à 9 588 vols : 7 en avion, 29 doublons et 11 copies du vol à date 1901.
- [ ] PR relue et fusionnée · **`/clear`**

### Phase 2 : Socle front et design
- [x] 2.1 Scaffold Vite, React, TS, outillage, versions épinglées
- [x] 2.2 Types générés depuis le schéma
- [x] 2.3 Couche données (meta, flights, sites, insights)
- [x] 2.4 Store des filtres et synchronisation de l'URL, cascades avec compteurs
- [x] 2.5 `stats.ts`, `metrics.ts`, `rhythm.ts`, `records.ts` ; non-régression contre `app_functions.py` **et** `report_data.py` au vert
- [x] 2.6 Formatage français (règles de `report_format.py`)
- [x] 2.7 Jetons (2 directions de palette), thèmes Mantine, ECharts et MapLibre ; 5 maquettes dans `web/design/` (dont le Bilan et Comparer en mode Sites), relues en local plutôt que publiées ; captures hors Git
- [x] 2.7b **Maquettes validées par Adrien** (15/11/2026 : palette B « Encre » inversée, retouches D13 à D16)
- [x] 2.8 Gabarit, navigation, barre de filtres responsive, thème clair et sombre, 404
- [x] 2.9 `_redirects` et `_headers`
- [x] PR relue (`/code-review` medium, 10 constats corrigés) et fusionnée · **`/clear`**

### Phase 3 : Tableau de bord
- [x] 3.0 Bloc « Activité collective » (saison du groupe, derniers vols, ce mois-ci, records récents)
- [x] 3.1 Bandeau de KPI et variations (variation affichée seulement si une date de début est filtrée : même durée juste avant)
- [x] 3.2 Tableau des caractéristiques et liens vers les records
- [x] 3.3 `StatChart` (19 métriques × 8 axes), clic qui ajoute un filtre, « voir les données »
- [x] 3.4 Évolution temporelle
- [x] 3.5 Bloc Rythme : calendrier, tuiles série, pause, semaine et régularité, saisons, fiche jour
- [x] 3.5 bis Matrice jour × heure, histogramme des durées, modes de vol, voiles, ruban voile × mois (24 derniers mois), instruments, nuage de points
- [x] 3.5 ter Pastilles d'écart, mention « Données partielles », surlignage croisé, raccourcis clavier (`1 2 3` aussi en AZERTY, `t`, `/`, `?`, Échap)
- [x] 3.6 Carte des sites MapLibre (clusters, popup avec pilotes, heatmap ; cadrage sur 90 % des vols, quantiles pondérés)
- [x] 3.7 États vides et robustesse (e2e : filtre sans vol, aucune erreur)
- [x] 3.8 Tests e2e du tableau de bord (`web/e2e/tableau-de-bord.spec.ts`, 7 scénarios ; 565 tests unitaires, 13 e2e au vert)
- [x] 3.9 Revue de parité avec l'app Dash (`docs/archive/web/PARITE_DASH.md`) : 94 fonctions, 37 présentes, 40 remplacées, 13 corrigées, 3 abandonnées, 1 reportée (crédit « Créée par » : page À propos seulement, tâche 5.5). Années non contiguës : non reprises (décision d'Adrien)
- [x] PR relue (`/code-review medium`, 10 constats corrigés) et fusionnée (PR #4) · **`/clear`**

### Phase 4 : Vols
- [x] 4.1 Liste des vols virtualisée (tri multicolonne, recherche sans accents, colonnes au choix mémorisées) et export CSV (`;`, BOM, lien Syride)
- [x] 4.2 `syride.ts` (liens) et tests (faits en phase 2)
- [x] 4.3 Fiche vol : en-tête, bouton Syride, chiffres et sources (fiche indépendante des filtres globaux : contexte calculé sur tous les vols)
- [x] 4.4 Ce vol dans son contexte (rangs, comparaisons, même jour, précédent et suivant avec ← →) ; en plus, « Ce site face aux autres » (D15/D17, module `lib/siteAggregates.ts` réutilisable en phase 5, seuil 10 vols, aussi en vue « Ce pilote »)
- [x] 4.5 Mini-carte du site
- [x] 4.6 Contrôle D12 automatisé (`web/e2e/d12.spec.ts`)
- [x] 4.7 Tests e2e des vols (`vols-liste`, `vol-fiche`, `d12` ; 641 tests unitaires, 31 e2e au vert)
- [x] Relecture `/code-review medium` : 10 constats corrigés
- [x] PR relue et fusionnée (PR #5) · **`/clear`**

### Phase 5 : Pilotes, sites, comparaison, records
- [x] 5.1 Pages pilotes (carrière, carte des sites, accès aux Bilans) ; en plus, « Ses sites face à face » (D17), frise des voiles par trimestre ; la page pilote ignore le filtre pilote et applique les autres
- [x] 5.2 Pages sites (saisonnalité mois × heure, derniers vols avec liens Syride, records du site) ; « Ce site face aux autres » calculé sur la vue filtrée (décision d'Adrien, 18/11/2026), mention affichée quand des filtres réduisent la vue
- [x] 5.3 Comparaison : modes Pilotes, Années et Sites (D17), choix dans l'URL ; haltères (`components/common/Dumbbell.tsx`, réutilisable en 5B), cumuls avec réticule commun ; pas de radar
- [x] 5.4 Records : top 10 par métrique, option « un seul vol par pilote » ; départage des ex aequo aligné sur `topRecords` (rapport Python), même vol désigné sur la page pilote (décision d'Adrien, 18/11/2026) ; « Records » ajouté au menu
- [x] 5.5 À propos, glossaire, qualité des données (vols écartés, sites sans coordonnées, couverture, voiles proches) et crédit « Créée par »
- [x] Ligne « Vue filtrée » unique (`lib/filterSummary.ts`) ; zoom des graphiques temporels au Ctrl + molette (la molette fait défiler la page)
- [x] Tests : 731 unitaires, 50 e2e au vert ; contrôle visuel clair, sombre et 360 px sur données réelles
- [x] Relecture `/code-review medium` : 10 constats corrigés
- [x] PR relue et fusionnée (PR #6) · **`/clear`**

### Phase 5B : Bilan pilote × année
- [x] 5B.1 Route, chargement des insights, sélecteur d'année ; seul le filtre « activité » s'applique (les autres sont ignorés, mention affichée) ; années comparées dans l'URL (`comparer`)
- [x] 5B.2 En-tête du bilan (KPI, persona, écart, équivalences ↻), fond sobre bleu nuit et lignes topographiques
- [x] 5B.3 Aperçu (8 KPI avec sparkline mensuelle, pastilles d'écart par année comparée, meilleur jour, journée type, vol de l'année)
- [x] 5B.4 Frise des jalons (or = records et nouveautés), vers la fiche vol ou la fiche jour
- [x] 5B.5 Courbe cumulée multi-années (motifs, réticule, losanges des jalons) et blocs Rythme
- [x] 5B.6 Carte avec cadrage par zone, nouveaux sites cerclés d'or, portée, tableau des sites
- [x] 5B.7 Records (top 5 × 6, « Nouveau record ! » avec écart), comparaison KPI × années et haltères
- ~~5B.8 Projection de fin d'année et jauge d'objectif~~ (retiré, D16)
- [x] 5B.9 Actions : copier le lien, copier le résumé, CSV
- [x] 5B.10 Données et limites (couverture année et carrière), glossaire
- [x] 5B.11 Recette croisée (`docs/archive/web/RECETTE_5B11.md`) : AdrienM, j2f et JJvole 2025, 9 vues ; phrases identiques, écarts corrigés à la source (D18 : sites vides, durées à 4 décimales, `meta.data_refreshed_at`)
- [x] 5B.12 Tests e2e du Bilan (`bilan.spec.ts`, `bilan-details.spec.ts`, 17 scénarios ; l'« export PNG » est remplacé par l'export CSV, le récap PNG restant en phase 8) ; 810 tests unitaires, 67 e2e et 62 pytest au vert
- [x] Relecture `/code-review medium` : 10 constats, 9 corrigés ; reporté en phase 6 : les KPI de l'année sont recalculés par plusieurs sections (à mutualiser dans le contexte du Bilan)
- [x] Grande recette d'Adrien (19/11/2026) : retours consignés en phase 5C
- [x] PR relue et fusionnée · **`/clear`**

### Phase 5C : Retours de recette
- [x] 5C.1 Menu actif sur les pages de détail (vol, site, pilote, bilan)
- [x] 5C.2 Fil d'Ariane, bouton « ← Retour » et Échap sur les fiches vol et site, la page pilote et le Bilan
- [x] 5C.3 Bouton « Voir le bilan » sur la page pilote
- [x] 5C.4 Filtre multi-années (D19)
- [x] 5C.5 « Ses sites face à face » sans seuil de 10 vols (D20)
- [x] 5C.6 Plus de cadre gris qui masque les barres au survol
- [x] 5C.7 Infobulle sur tous les calendriers et toutes les matrices
- [x] 5C.8 Matrices et calendrier pleine largeur, plage horaire fixe 8 h à 20 h, 12 derniers mois (diagnostic confirmé le 19/11/2026)
- [x] 5C.9 Légende et infobulles des haltères et des « face à face »
- [x] 5C.10 Tests, contrôle visuel, `/code-review medium`
- [x] Revue par Adrien, PR relue et fusionnée · **`/clear`**

### Phase 6 : Finitions
- [x] 6.1 Découpage du code, imports à la carte (JS initial 913 → 174 Ko gzip)
- [x] 6.2 Budgets respectés (JS ≤ 250 Ko gzip, données ≤ 250 Ko gzip, D21)
- [ ] 6.3 Lighthouse mobile : Perf ≥ 90, A11y ≥ 95, BP ≥ 95 (20/11/2026 : A11y et BP à 100 partout ; Perf 52 à 77 sur l'URL déployée, frein = calcul navigateur et chaîne de données ; chantier perf du 20/11 en `vite preview` : `/` 53 -> 71-74, `/vols` 71 -> 76-77, bilan 53 -> 68-69, `/sites` 59 -> 62-63, TBT divisé par 2 à 3 ; reste le volume de données et de JS initial, voir `web/audits/PHASE6.md`)
- [x] 6.4 PWA et mode hors ligne
- [x] 6.5 Revue responsive (4 largeurs, captures : `npm run captures`, gardées en local)
- [x] 6.6 Passe éditoriale des libellés (glossaire dans `web/audits/PHASE6.md`)
- [x] 6.7 `/code-review` et corrections (9 constats corrigés)
- [x] 6.8 Recette du 20/11/2026 : infobulle au survol des sites (carte des sites et tableau de bord)
- [x] 6.9 Recette du 20/11/2026 : Comparer vide à l'ouverture
- [x] 6.10 Recette du 20/11/2026 : « Durée des vols » croisée selon 7 mesures ou 4 catégories (mois, heure, voile, site)
- [x] PR relue et fusionnée · **`/clear`**

### Phase 7 : Déploiement et bascule
- [x] 7.1 Projet Cloudflare Pages créé, `wrangler login` fait (par Adrien) (20/11/2026 ; wrangler 4.165 redirige `pages project create` vers Workers : création avec `--force`, une seule fois)
- [x] 7.2 `publish.py` / `make publish` fonctionnel de bout en bout (20/11/2026 : premier déploiement en 83 s avec `npm ci`, 40 s sans ; `_redirects` corrigé, cible `/` au lieu de `/index.html` qui partait en 308)
- [x] 7.3 Option `main.py --publish 1`
- [ ] 7.4 CI GitHub Actions au vert (fixtures uniquement) (`.github/workflows/ci.yml` écrit, à confirmer au premier push)
- [ ] 7.6 ~~Annonce aux pilotes~~ (pas d'annonce, décision d'Adrien du 20/11/2026) ; sauvegarde de `mysite/` ; suppression de la webapp PythonAnywhere (après la recette)
- [x] 7.7 Archivage du code Dash (`src/legacy/`), `requirements` séparés et épinglés (scraping, export, pdf ; selenium, undetected-chromedriver, fastkml, fpdf2 à figer sur l'environnement de scraping)
- [x] 7.8 README à jour
- [ ] **Recette finale §9.2 validée par Adrien** (5 critères)
- [ ] Vérification « 0 € » : aucun moyen de paiement enregistré

### Phase 8 : Bonus (après la v1)
- [ ] Rejeu animé de l'année et récap PNG dans le Bilan (si l'envie vient)
- [ ] Météo historique (Open-Meteo)
- [ ] Tendances de progression
- [ ] Liens de partage et images OpenGraph
