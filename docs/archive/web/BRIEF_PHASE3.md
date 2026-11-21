# Brief commun, phase 3 : tableau de bord

Lis d'abord `web/BRIEF_PHASE2.md` (contexte technique, interdits, conventions, compte rendu attendu : **tout s'applique**), puis dans `ROADMAP_WEBAPP.md` : §5.0 (gabarit, conventions communes), §5.1 (tableau de bord, ta référence fonctionnelle), §6 (direction artistique), §8 « Phase 3 », §11 (D12 à D17).
Maquette de référence : `web/design/maquette-tableau-de-bord.html` (+ captures `web/design/captures/tableau-de-bord-B-*.png`). Palette retenue : **B « Encre »** (`web/src/theme/tokens.ts`, variables CSS `--sr-<jeton>`, ex. `var(--sr-p)`).

## Branche et état
- Branche `web/phase-3-tableau-de-bord` (déjà créée ; ne change pas de branche, aucune opération git).
- Le socle de la phase 2 est en place, **réutilise-le au lieu de recoder** :
  - données : `useData()` (`@/data/DataProvider` : `meta`, `flights`, `sites`, `siteById`), type `Flight` (`@/data/flight`, dérivés `year`, `month`, `weekday`, `season`, `hour`, `dayKey`, `key`) ;
  - filtres : `useFiltersStore` (`@/store/filters`, `setFilters`), `useFilteredFlights()` (sélection courante), `flightMatches(f, filters, omit)` et `applyFilters` (`@/lib/filters`) ;
  - calculs : `@/lib/stats` (`getFlightParams`, `groupFlights`, `AXES`, `computeMetrics`), `@/lib/metrics` (`METRICS`, 19 métriques, libellés), `@/lib/rhythm` (`computeRhythm`, `weekHourMatrix`, `dailySummaries`, `cumulativeSteps`, `seasonsBreakdown`, `flightModes`, distributions), `@/lib/records` (`computeKpis`, `deltaPct`, `durationStats`, `topRecords`, `wingRows`, `siteRows`, `instrumentRows`, `computeCoverage`, `computeHighlights`), `@/lib/numeric`, `@/lib/format` (**tout formatage de nombre/date passe par là**), `@/lib/syride` (`syrideFlightUrl`) ;
  - thème : `useEchartsTheme()`, `disciplineColor()`, `categoricalColors()`, `colors`, `yearPatterns` (`@/theme/tokens`), style de carte `@/theme/map` ;
  - liens internes qui conservent les filtres : `FilterLink` / `useFilterSearch()` (`@/components/FilterLink`).
- **Primitives partagées déjà écrites par le maître d'œuvre (ne les modifie pas ; si un besoin manque, signale-le)** :
  - `@/components/common/Section` : carte de section (`id`, `title`, `subtitle`, `actions`) ;
  - `@/components/common/ChartFrame` : enveloppe ECharts (thème, `ariaLabel` obligatoire, hauteur, `table` pour « Voir les données », `onEvents`) ;
  - `@/store/highlight` : surlignage croisé éphémère (`useHighlightStore`, `highlightsDay`).

## Contrat d'intégration
- Chaque bloc est un composant **autonome** exporté nommément, qui prend la sélection en prop : `flights: readonly Flight[]` (déjà filtrée), plus ce dont il a besoin. Il rend sa propre `<Section>`. Le maître d'œuvre assemble la page `Dashboard.tsx` : **ne touche pas** à `pages/Dashboard.tsx`, `AppLayout`, `router.tsx`, ni aux fichiers d'un autre lot.
- Logique de calcul nouvelle = fonction pure dans un fichier `web/src/lib/<ton-lot>.ts` **à toi**, testée (`*.test.ts` à côté, fixtures via `tests/flightFactory.ts`). Les composants restent minces.
- **Date de référence « aujourd'hui »** : `meta.data_updated_at` (dernière mise à jour des données), pas l'horloge ; repli sur la date du dernier vol.
- **Clic = filtre** : un clic sur une barre, une case ou un point catégoriel appelle `useFiltersStore.getState().setFilters(...)` (pilote → `pilots: [slug]`, site → `sites: [id]`, voile → `wings: [nom]`, année/mois → `dateFrom`/`dateTo` couvrant la période). Un clic sur un vol (point du nuage, ligne d'un fil) navigue vers `/vol/:key` via `FilterLink` ou `useNavigate` + `useFilterSearch()`.
- **Survol = surlignage** : quand un élément représente un site, une voile, un mois ou un pilote, appelle `setHighlight` au survol et `setHighlight(null)` à la sortie ; si ton bloc affiche ces éléments, lis `highlight` et atténue les autres (opacité ~0,25).
- **Couleurs** : une couleur = un sens. Parapente `--sr-p`, paramoteur `--sr-m`, les deux `--sr-b` ; **or (`gold`) réservé aux records et nouveautés** ; volumes en hausse/baisse `up`/`down`, écarts neutres `nup`/`ndown` ; catégories `c1..c8` ; calendrier `cal-{p,m,b}{1..4}` ; modes `w-*`. Dans ECharts, lis les valeurs via `colors[scheme]` (schéma courant : `useComputedColorScheme('light')` de Mantine).
- **Sélection vide** : chaque bloc doit afficher un message sobre (« Aucun vol pour ces filtres. ») sans planter, et tolérer `null` partout (mesures absentes).
- **Mobile 360 px** : rien ne déborde horizontalement (les tableaux larges scrollent dans leur conteneur).
- **Performances** : `useMemo` sur les agrégats ; un changement de filtre doit rester < 100 ms sur ~9 600 vols.
- Accessibilité : `ariaLabel` explicite sur chaque graphique, `table` « Voir les données » sur chaque graphique de données.
- Tests : Vitest pour chaque fonction pure ; un test de rendu simple (`@testing-library/react`, voir `src/App.test.tsx` et `tests/setup.ts` pour le montage avec Mantine) par composant principal, dont le cas « sélection vide ».

## Vérifications de fin de lot
`cd web && npm run lint && npm run typecheck && npm test` au vert. Si tu veux voir le rendu, lance `npm run dev` en arrière-plan sur un port libre et utilise un composant de démonstration temporaire **que tu supprimes ensuite** (ne modifie pas Dashboard.tsx).
