# Brief commun, phase 5C : retours de la recette d'Adrien (19/11/2026)

Lis d'abord `web/BRIEF_PHASE2.md` à `BRIEF_PHASE5B.md` : contexte technique, interdits (D12 : aucune trace publiée ; aucune donnée réelle commitée), conventions, socle réutilisable. **Tout s'applique**, sauf ce qui suit.
Puis dans `ROADMAP_WEBAPP.md` : §6 (direction artistique), §8 « Phase 5C » (**la spécification de référence de chaque point**), §11 (D19, D20).

## Branche et état
- Branche `web/phase-5c-recette` (déjà créée ; **aucune opération git** : ni commit, ni stash, ni checkout).
- Deux lots tournent **en parallèle dans le même dossier** : ne touche qu'aux fichiers de ton lot (liste ci-dessous, plus les fichiers que tu crées). Tout le reste est en lecture seule. Besoin dans un fichier de l'autre lot : signale-le dans ton compte rendu, sans le modifier.
- Ne touche pas à `sites_coordinates.json` (modification en cours d'Adrien) ni à `ROADMAP_WEBAPP.md`.

## Règles communes
- Mantine 8, ECharts 5, React Router 7 : regarde comment le code existant fait avant d'ajouter une dépendance (aucune nouvelle dépendance npm).
- Textes en français, sobres, typographie française (espaces insécables via `NBSP` de `@/lib/format`). Pas de badge, médaille ni décor.
- Mode clair et sombre ; mobile 360 px sans débordement horizontal de la page ; accessibilité clavier (focus visible, `aria-*`).
- Logique nouvelle = fonctions pures testées (Vitest). `useMemo` sur les calculs.

---

## Lot A : navigation, filtres, accès au Bilan (5C.1 à 5C.4)

Fichiers à toi : `src/components/{navigation.ts,AppHeader.tsx,FilterLink.tsx,FilterPanel.tsx,ActiveFilters.tsx,AppLayout.tsx}`, `src/components/common/DetailNav.tsx` (nouveau, + test), `src/pages/{Flight,Site,Pilot,PilotYear}.tsx` (insertion de `DetailNav` et, pour `PilotYear`, la mention des filtres ignorés), `src/components/pilot/{PilotHeader,YearCards}.tsx`, `src/components/flight/FlightHeader.tsx`, `src/components/site/{SiteHeader,PageHeading}.tsx` (seulement si nécessaire pour placer le fil d'Ariane), `src/lib/{filters,filterSummary}.ts` (+ tests), `src/store/{filters,useFiltersUrlSync,useFilterSummary,useFilteredFlights}.ts` (+ tests), `src/components/dashboard/{StatChart,KpiBand}.tsx`, `src/lib/dashboard.ts` (+ test) si la variation des KPI y est calculée, `web/PARITE_DASH.md`, `e2e/filtres.spec.ts`, `e2e/navigation.spec.ts` (nouveau). Tout autre fichier qui lit `Filters` et casse à la compilation à cause de `years` : adaptation minimale autorisée, à lister dans le compte rendu.

- **5C.1** menu actif : `Link` simple dans `AppHeader`, `aria-current` venant uniquement de `isNavActive`. Test unitaire + e2e sur les 4 pages de détail.
- **5C.2** `DetailNav` (fil d'Ariane avec filtres conservés, « ← Retour » : historique si `location.key !== 'default'`, sinon liste parente ; Échap pareil, sauf si un tiroir, une fenêtre ou un menu Mantine est ouvert : vérifie `document.querySelector('[role=dialog]')` ou équivalent). Sur fiche vol, fiche site, page pilote et Bilan.
- **5C.3** bouton principal « Voir le bilan {dernière année} » + menu des autres années dans l'en-tête pilote ; cartes « Bilan 2025 → ».
- **5C.4** filtre multi-années (D19), tout ce que liste la feuille de route, y compris `PARITE_DASH.md` #12, URL `annees=`, clic sur une barre de `StatChart`, variation des KPI, mention dans le Bilan.
- e2e : `navigation.spec.ts` (menu actif, retour, Échap), `filtres.spec.ts` (années multiples, URL, résumé).

## Lot B : graphiques, infobulles, matrices, haltères, face-à-face (5C.5 à 5C.9)

Fichiers à toi : `src/theme/echarts.ts`, `src/components/common/{CellTooltip.tsx (nouveau),Dumbbell.tsx,dumbbell.css,Dumbbell.test.tsx}`, `src/components/rhythm/**`, `src/lib/rhythmBlocks.ts` (+ test), `src/lib/rhythm.ts` (+ test), `src/components/site/SiteSeasonality.tsx`, `src/components/pilot/{CareerSection,SitesFaceToFace,WingTimeline}.tsx`, `src/components/pilot/pilot.css`, `src/components/gear/**`, `src/components/dashboard/EvolutionChart.tsx`, `src/components/bilan/{BilanWhen,BilanComparison,BilanRhythm}.tsx`, `src/components/bilan/{bilanA,bilanB}.css`, `src/components/compare/CompareDumbbells.tsx`, `src/components/flight/SiteVsOthers.tsx`, `src/lib/{siteAggregates,sites}.ts` (+ tests), les tests unitaires des composants que tu modifies, `e2e/infobulles.spec.ts` (nouveau).

- **5C.5** « Ses sites face à face » (D20) : tous les sites du pilote (seuil 1 pour cet usage, constante dédiée ; `SiteVsOthers` et la page site gardent `MIN_SITE_FLIGHTS_PILOT`), nombre de vols à côté du nom, note grise « peu de vols » sous 3 vols, message actuel sous 2 sites. Sous-titre et texte de bas de bloc mis à jour.
- **5C.6** plus d'aplat `shadow` au-dessus des barres : `SiteSeasonality`, `CareerSection`, `DurationHistogram`, `BilanWhen`, `EvolutionChart` et tout graphique en barres de tes fichiers ; règle posée dans `theme/echarts.ts` (axisPointer par défaut sans aplat masquant, `emphasis` avec `focus: 'series'` ou barres estompées). Vérifie le rendu sombre. `StatChart` est au lot A : si le thème ne suffit pas pour lui, signale-le.
- **5C.7** `CellTooltip` commun (survol, focus clavier, toucher) sur `CalendarHeatmap` (date, vols, durée, disciplines, sites, « Clic : fiche du jour »), `SiteSeasonality`, `WeekHourMatrix` et sa copie dans `BilanWhen`, `WingRibbon`, `WingTimeline`. Contour sur la cellule survolée. `title` natifs retirés (garde `aria-label`). Contenu des infobulles calculé par des fonctions pures testées. Attention aux performances : **une seule** infobulle par grille (délégation d'événements), pas un `Tooltip` Mantine par case (le calendrier a 365 cases).
- **5C.8** voir la feuille de route, diagnostic confirmé par Adrien : la matrice de saisonnalité d'un site peu volé se réduit à 12 h–19 h et n'occupe qu'un coin de la carte. Plage horaire fixe 8 h à 20 h (élargie si des vols en sortent) dans `hoursWindow` ou une variante ; matrices et calendrier en pleine largeur de carte (cases ≥ 12 px, hauteur plafonnée pour rester lisible à 1 440 px) ; année affichée et sélecteur près du titre du bloc Rythme ; option « 12 derniers mois » glissants, défaut quand l'année en cours a moins de 6 mois écoulés (date de référence = date des données, pas l'horloge). Garde les props de `CalendarHeatmap` rétrocompatibles (le Bilan l'utilise via `BilanRhythm`).
- **5C.9** légende au-dessus des haltères (`Dumbbell` : symbole, couleur, motif, nom) + infobulle par point (série, valeur), dans Comparer et `BilanComparison` ; légende + infobulles « barre = étendue min–max des sites, point = ce site, trait = moyenne » dans `SitesFaceToFace` et `SiteVsOthers`.
- e2e `infobulles.spec.ts` : survol puis focus clavier d'une case du calendrier, infobulle visible avec la date ; une case de la matrice d'un site ; légende des haltères dans Comparer.

## Vérifications de fin de lot
`cd web && npm run lint && npm run typecheck && npm test` au vert, puis **seulement tes** specs e2e (`npx playwright test e2e/<ta-spec>`) et les specs existantes des pages que tu as touchées. Si l'autre lot casse la compilation au même moment, signale-le au lieu de corriger ses fichiers. Rendu clair, sombre et 360 px vérifié sur les vraies données : `npm run dev -- --port 519X --strictPort` en arrière-plan (lot A 5191, lot B 5192), arrêté ensuite. Le port 5180 est celui du maître d'œuvre, n'y touche pas.
Compte rendu final (court) : fichiers créés ou modifiés, choix faits, écarts au brief, besoins signalés dans les fichiers de l'autre lot, résultat des vérifications.
