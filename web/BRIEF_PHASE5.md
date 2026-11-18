# Brief commun, phase 5 : pilotes, sites, comparaison, records, à propos

Lis d'abord `web/BRIEF_PHASE2.md`, `web/BRIEF_PHASE3.md` puis `web/BRIEF_PHASE4.md` : contexte technique, interdits, conventions, contrat d'intégration, socle réutilisable, compte rendu attendu. **Tout s'applique**, sauf ce qui suit.
Puis dans `ROADMAP_WEBAPP.md` : §5.0, §5.4, §5.5, §5.6, §5.7, §5.8, §6, §8 « Phase 5 », §11 (D12, D15, D17).
Palette B « Encre ». Maquettes : `web/design/maquette-pilote.html`, `web/design/maquette-comparer-sites.html` (+ captures `web/design/captures/pilote-B-*.png`, `comparer-sites-B-*.png`).

## Branche et état
- Branche `web/phase-5-pilotes-sites` (déjà créée ; **aucune opération git**).
- Deux lots tournent **en parallèle dans le même dossier** : ne touche qu'aux fichiers de ton lot. Tout le reste de `web/src/` est en lecture seule. Si un besoin manque dans un fichier partagé, écris un adaptateur dans tes fichiers et signale-le dans ton compte rendu.
- Les routes existent déjà (`src/router.tsx`) avec des pages bouchons : remplace le contenu de **tes** pages. Ne touche ni à `router.tsx`, ni à `AppLayout`, ni à `components/navigation.ts` (le maître d'œuvre ajoutera « Records » au menu).
- Socle à réutiliser plutôt que recoder : `@/lib/records` (`computeKpis`, `topRecords`, `computeCareer`, `deltaPct`, `siteRows`, `wingRows`, `computeCoverage`…), `@/lib/rhythm` (`weekHourMatrix`, `cumulativeSteps`, `computeRhythm`, distributions), `@/lib/siteAggregates` (`siteAggregates`, `positionAmongSites`, `SITE_INDICATORS`, seuils 10 vols), `@/lib/mapSites` (`aggregateSites`, `focusBounds`), `@/lib/dashboard` (`kpiValues`, `stepValueAt`, `latestFlights`…), `@/lib/stats`, `@/lib/metrics`, `@/lib/format`, `@/lib/syride`, composants `common/*` (`Section`, `ChartFrame`, `KpiCard`, `DeltaPill`, `CoverageNotice`), `components/rhythm/*` (`WeekHourMatrix`, etc.), `components/flight/SiteVsOthers`, `components/map/*`, `components/flights/FlightsTable`. Ces composants sont **utilisables tels quels** (props existantes) ; tu ne les modifies pas, sauf exception explicite ci-dessous.

## Règles communes de la phase
- **D12, absolu** : aucune trace ni géométrie de vol. Seules les positions **des sites** apparaissent sur une carte. Toute évocation de trace = lien externe `syrideFlightUrl()` (`target="_blank" rel="noopener noreferrer"`, `IconExternalLink`, « Voir la trace sur Syride »).
- **Filtres globaux** : les pages liste (`/pilotes`, `/sites`, `/records`, `/comparer`) et les pages détail (`/pilote/:slug`, `/site/:id`) travaillent sur `useFilteredFlights()`, **sauf le filtre qui correspond à l'entité de la page** : la page pilote ignore le filtre `pilots` (elle montre toujours ce pilote, en appliquant les autres filtres : activité, période, sites, voiles) et la page site ignore le filtre `sites`. Utilise `flightMatches(f, filters, omit)` de `@/lib/filters`. Indique sobrement sous le titre quand des filtres réduisent la vue (ex. « Vue filtrée : paramoteur, 2025 »). Entité introuvable : page sobre « Pilote introuvable » / « Site introuvable » avec lien vers la liste.
- Une page pilote ou site d'une entité qui existe mais n'a aucun vol avec les filtres : en-tête affiché + message « Aucun vol pour ces filtres. ».
- Liens internes : `FilterLink` (conserve les filtres). Vol → `/vol/:key`, pilote → `/pilote/:slug`, site → `/site/:id`, bilan → `/pilote/:slug/:annee` (bouchon jusqu'à la phase 5B, c'est normal).
- **Refus** : pas de radar, pas de percentile de groupe, pas de médaille/podium/badge, pas de classement « meilleur pilote ». Or (`gold`) réservé aux records et nouveautés.
- Texte neutre (pas de « tu » : réservé au Bilan, D11). Formatage par `@/lib/format` uniquement ; mesure absente : « – ».
- Logique nouvelle = fonctions pures dans `src/lib/<fichier-du-lot>.ts`, testées. Composants minces, `useMemo`, pas d'O(n²) sur ~9 600 vols.
- **Composant haltère réutilisable** (T34) : le lot A l'écrit dans `src/components/common/Dumbbell.tsx` (générique : lignes = métriques, points = séries colorées avec motif, valeurs formatées, « Voir les données ») ; il sera réutilisé par le Bilan en phase 5B.
- Mobile 360 px sans débordement de page ; clair et sombre soignés ; `ariaLabel` + « Voir les données » sur chaque graphique.

---

## Lot A : pilotes (5.1) et comparaison (5.3)

Fichiers à toi : `src/pages/Pilots.tsx`, `src/pages/Pilot.tsx`, `src/pages/Compare.tsx`, `src/components/pilot/**`, `src/components/compare/**`, `src/components/common/Dumbbell.tsx`, `src/lib/pilots.ts` (+ test), `src/lib/compare.ts` (+ test), `e2e/pilotes.spec.ts`, `e2e/comparer.spec.ts`.

- **`/pilotes`** : cartes sobres par pilote (nom, vols, heures, activité principale avec pastille discipline, dernier vol, première année), triables (heures, vols, dernier vol, nom), recherche sans accents. Lien vers la page pilote et lien discret vers son profil Syride (`syridePilotUrl`).
- **`/pilote/:slug`** (référence : maquette pilote) :
  - en-tête : nom, première et dernière date, activité principale, lien Syride du profil ;
  - KPI du pilote (vols, heures, sites, km, plafond max, jours volés) ;
  - **Carrière** : barres empilées par année (bascule heures / vols ; parapente et paramoteur), meilleure année marquée d'une étoile (★, couleur or), 4 KPI de carrière (réutilise `computeCareer`) ;
  - **une carte par année** cliquable vers le Bilan `/pilote/:slug/:annee` (vols, heures, sites de l'année) ;
  - **records personnels** (plus long, plus haut, plus loin, vario, vitesse, g), chacun lié à sa fiche vol et à Syride ;
  - **sites favoris** : carte MapLibre de **ses** sites (cercles proportionnels au nombre de vols, réutilise `components/map` tel quel si possible, sinon un petit composant à toi dans `components/pilot/`) + tableau des sites ;
  - **voiles dans le temps** : frise (période d'usage de chaque voile, épaisseur ou intensité selon le nombre de vols) ;
  - **« Ses sites face à face » (D17)** : ses sites d'au moins 10 vols positionnés les uns par rapport aux autres sur ses propres vols (`siteAggregates` + `positionAmongSites`), même langage visuel que `SiteVsOthers` ; message sobre si moins de 2 sites éligibles ;
  - lien « Voir ses vols » vers `/vols` avec le filtre pilote.
- **`/comparer`** : sélecteur de mode (contrôle segmenté) synchronisé dans l'URL de la page (`?mode=pilotes|annees|sites&ids=...`, via `useSearchParams`, sans casser les paramètres des filtres globaux) :
  - **Pilotes** : 2 à 4 pilotes ; **Années** : 1 pilote + 2 à 4 années ; **Sites** (D17) : 2 à 4 sites, calculés sur les vols de la sélection globale (référence : maquette comparer-sites) ;
  - KPI côte à côte avec `DeltaPill` par rapport à la première colonne (référence) ; volumes en `up`/`down`, autres écarts neutres ;
  - courbes d'heures cumulées superposées avec **réticule commun** (tooltip axis : valeur de chaque série à date) ; en mode Années, axe = jour de l'année ; en modes Pilotes et Sites, axe = date réelle sur la période filtrée ;
  - **haltères** par métrique (durée moyenne, distance moyenne, plafond moyen, vitesse max moyenne, vario moyen, vols, heures) ;
  - rythme comparé (régularité, plus longue série, part du week-end) en tableau ;
  - couleurs de séries : `c1..c4` en modes Pilotes et Sites, `y0..y2`(+motif `yearPatterns`) en mode Années ; chaque série doublée d'un motif (tirets) pour le daltonisme ;
  - état initial utile : si rien n'est choisi, proposer les 2 pilotes (ou sites) les plus actifs de la sélection, en le disant.
- e2e : `/pilotes` liste et ouvre une page pilote ; la page pilote affiche carrière, records, carte d'année → URL du bilan ; `/comparer` en mode Pilotes avec 2 pilotes affiche KPI et haltères, l'URL reflète le choix, recharger la page garde le choix ; mode Sites fonctionne ; aucune erreur de page.

## Lot B : sites (5.2), records (5.4), à propos (5.5)

Fichiers à toi : `src/pages/Sites.tsx`, `src/pages/Site.tsx`, `src/pages/Records.tsx`, `src/pages/About.tsx`, `src/components/site/**`, `src/components/records/**`, `src/components/about/**`, `src/lib/sites.ts` (+ test), `src/lib/quality.ts` (+ test), `e2e/sites.spec.ts`, `e2e/records.spec.ts`, `e2e/a-propos.spec.ts`. **Exception** : tu peux faire évoluer `src/components/flight/SiteVsOthers.tsx` et `src/components/map/**` de façon **rétrocompatible** (props optionnelles), en gardant verts leurs tests existants et `e2e/vol-fiche.spec.ts`.

- **`/sites`** : carte des sites grande hauteur (réutilise `components/map`, clic = page du site) + tableau triable (nom, vols, heures, pilotes, part parapente/paramoteur, dernier vol, plafond max), recherche sans accents ; survol d'une ligne = surlignage du site (`useHighlightStore`) si la carte le gère déjà.
- **`/site/:id`** :
  - en-tête : nom, coordonnées (si connues), mini-carte du site (réutilise `components/flight/SiteMiniMap` s'il convient), nombre de vols et de pilotes, premières et dernières dates ;
  - KPI du site et **pilotes présents** (tableau : vols, heures, dernier vol, lien page pilote) ;
  - **saisonnalité** : matrice mois × heure de décollage (fonction pure dans `lib/sites.ts`, rendu dans l'esprit de `WeekHourMatrix`, 4 niveaux, totaux en marge) + barres par mois ;
  - **derniers vols** sur le site (20), chacun avec lien fiche et lien « trace sur Syride » ;
  - **records du site** : top 5 sur durée, distance, plafond, vitesse max, vario, g (réutilise `topRecords`), valeur record en or ;
  - **« Ce site face aux autres » (D15)** : réutilise `SiteVsOthers` (bascule « Tous / Ce pilote » inutile ici : masque-la par une prop optionnelle) ;
  - lien « Voir les vols de ce site » vers `/vols` avec le filtre site.
- **`/records`** : un tableau « Top 10 » par métrique (durée, distance, distance cumulée si disponible, plafond, gain, vitesse max, vario max, g max), filtres globaux appliqués ; chaque ligne : rang, valeur (rang 1 en or, **sans médaille**), pilote (lien), date, site (lien), lien fiche, lien Syride ; ex aequo = même rang ; onglets ou sélecteur de métrique sur mobile ; option « un seul vol par pilote » (meilleure marque de chaque pilote).
- **`/a-propos`** :
  - source des données (syride.com, lien), date de mise à jour (`meta.data_updated_at`) et d'export (`meta.generated_at`), mention « Outil personnel, non affilié à Syride. » ;
  - **règle D12** expliquée en une phrase (aucune trace publiée, liens vers Syride) ;
  - **glossaire** : chaque métrique de `@/lib/metrics` (libellé, unité, agrégation, règle des valeurs ≤ 0 ignorées, vols incomplets), plus les notions (source fiche/GPX, discipline, régularité, série, pause, « Données partielles » à 20 %) ;
  - **qualité des données** (`lib/quality.ts`) : vols exportés, vols écartés (`meta.counts.excluded_flights`), sites sans coordonnées, vols incomplets, couverture par mesure et par source (gpx / fiche / aucune, réutilise `computeCoverage`), voiles très proches à uniformiser (même nom une fois normalisé : casse, accents, espaces, tirets) ;
  - crédit **« Créée par : Adrien Moreau »** (ici seulement).
- e2e : `/sites` liste, recherche, clic → page site avec ses sections ; site introuvable ; `/records` affiche 10 lignes par métrique et les liens Syride ont la bonne forme ; `/a-propos` affiche glossaire, qualité et crédit ; aucune erreur de page.

## Vérifications de fin de lot
Identiques à la phase 4 : `cd web && npm run lint && npm run typecheck && npm test` au vert, puis **seulement tes** specs e2e (`npx playwright test e2e/<tes-fichiers>`) ; si l'autre lot casse la compilation au même moment, signale-le au lieu de corriger ses fichiers. Vérifie le rendu clair/sombre et 360 px (serveur `npm run dev` en arrière-plan sur un port libre, **différent de celui de l'autre lot** : lot A 5181, lot B 5182 ; arrête-le ensuite).
Compte rendu final (court) : fichiers créés ou modifiés, choix faits, écarts au brief, besoins signalés dans les fichiers partagés, résultat des vérifications.
