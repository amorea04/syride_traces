# Brief commun, phase 5B : Bilan pilote × année

Lis d'abord `web/BRIEF_PHASE2.md`, `BRIEF_PHASE3.md`, `BRIEF_PHASE4.md` puis `BRIEF_PHASE5.md` : contexte technique, interdits, conventions, socle réutilisable, compte rendu attendu. **Tout s'applique**, sauf ce qui suit.
Puis dans `ROADMAP_WEBAPP.md` : §3.3 bis, §4.5, §5.4 bis, §6, §8 « Phase 5B », §11 (D9, D11, D12, D16).
Références visuelles : `web/design/maquette-bilan.html` et `web/design/comparaison-bilan.md` (ce qui est repris du rapport, ce qui change). Référence fonctionnelle : le rapport HTML (`src/rapport/report_data.py`, `report_html.py`, `report.js` ; exemple généré : `html_reports/2026_html_reports/AdrienM_rapport_vol_2026.html`). Palette B « Encre ».

## Branche et état
- Branche `web/phase-5b-bilan` (déjà créée ; **aucune opération git**).
- Deux lots tournent **en parallèle dans le même dossier** : ne touche qu'aux fichiers de ton lot. Tout le reste est en lecture seule. Besoin dans un fichier partagé : adaptateur dans tes fichiers + signalement dans ton compte rendu.
- **Socle posé par le maître d'œuvre (lecture seule)** :
  - `src/pages/PilotYear.tsx` : route `/pilote/:slug/:annee`, chargement des insights, cas introuvable / chargement / erreur / discipline sans vol, mention des filtres ignorés, ordre des sections. Il fournit le contexte.
  - `src/components/bilan/BilanContext.tsx` : `useBilan()` donne `pilot, slug, year, discipline, flights` (année du bilan, discipline, arrêtée à `cutoff`), `history` (toutes années, discipline), `compareYears`, `compareFlights`, `setCompareYears`, `availableYears`, `story` (récit Python de la discipline, non null), `insights`, `cutoff`, `ongoing`, `refDate`. **Toute section lit ses données ici** ; aucune section ne refiltre `useData().flights` par elle-même.
  - `src/lib/bilan.ts` : sélection des vols, années disponibles, années comparées (paramètre d'URL `comparer`), années adjacentes. Le lot A écrit son test `src/lib/bilan.test.ts`.
  - `src/components/bilan/Bilan*.tsx` : **bouchons** (`return null`) ; chaque lot remplace les siens. Chaque section se rend elle-même dans un `Section` (`@/components/common/Section`) avec l'ancre imposée ci-dessous, et renvoie `null` si elle n'a rien à montrer.

## Règles communes de la phase
- **Seul le filtre global « activité » s'applique** (= discipline du récit, `by_disc` des insights). Pilote, période, sites et voiles sont ignorés (mention déjà affichée par la page). Raison : chiffres et textes doivent rester ceux du récit Python et du rapport (recette croisée 5B.11).
- **Règles du rapport** (`build_report`) : année du bilan arrêtée à `cutoff` si elle est en cours ; **années comparées entières** ; défaut : 2 années précédentes où le pilote a volé. Les écarts « à date » (année en cours) suivent ce que fait le rapport, **vérifie dans `report_data.py`** avant de calculer quoi que ce soit, et reproduis-le.
- **Textes** : les phrases viennent **telles quelles** des insights (`story.texts`, `story.gap.text`, `story.persona`, `story.milestones[].title/detail`, `story.equivalences`). Aucune règle de récit réécrite en TS (§3.3 bis). Les textes contiennent des espaces insécables : ne les normalise pas. Le « tu » n'existe que sur cette page (D11), et uniquement via ces textes ou des libellés de section.
- Indicateurs génériques (KPI, sparklines, cumuls, rythme, records, sites, voiles) : **réutilise le socle TS** (`@/lib/records` `computeKpis`/`topRecords`/`siteRows`/`wingRows`/`instrumentRows`/`computeCoverage`/`computeHighlights`/`deltaPct`, `@/lib/rhythm`, `@/lib/compare` `cumulativeCurves`/`dayOfLeapYear`, `@/lib/dashboard`, `@/lib/mapSites`, `@/lib/format`), déjà testé contre `report_data.py`. Logique nouvelle = fonctions pures dans **le fichier lib de ton lot**, testées.
- **Or (`gold`) = records et nouveautés uniquement** (jalons `gold`, nouveaux sites, nouvelles voiles, « Nouveau record ! »). Années comparées : couleurs `y0..y2` **doublées d'un motif** (tirets, pointillés ; voir `components/compare/visuals.ts` et `seriesStyle('annees', i)`). Volumes : vert/rouge ; autres écarts : neutres (`DeltaPill`).
- **Refus** : pas de radar, badge, médaille, confetti, podium, scène de ciel, compteur animé, percentile de groupe, croisement sites × mois, projection de fin d'année ni jauge d'objectif (D16), rejeu animé ni récap PNG (phase 8).
- **D12, absolu** : aucune trace ni géométrie de vol ; positions **des sites** seulement. Jalons, records et vols mènent à la **fiche vol** `/vol/:key` (`FilterLink`) ; le lien Syride est une icône `IconExternalLink` (`syrideFlightUrl`, `target="_blank" rel="noopener noreferrer"`, `aria-label` « Voir la trace sur Syride »). Un jalon sans vol (`flight: null`) mène à la fiche jour si elle existe (`DaySheet` du bloc Rythme), sinon n'est pas cliquable.
- Graphiques : `ChartFrame` (`ariaLabel` + « Voir les données »). Mobile 360 px sans débordement ; clair et sombre soignés ; conteneur de lecture 1 120 px max (§6) si le gabarit ne le fait pas déjà.
- Performance : `useMemo` sur tout calcul ; aucun O(n²).

---

## Lot A : en-tête, aperçu, histoire, rythme, comparaison

Fichiers à toi : `src/components/bilan/{BilanHeader,BilanToc,BilanOverview,BilanStory,BilanRhythm,BilanComparison}.tsx`, `src/components/bilan/bilanA.css` (si besoin), `src/lib/bilanOverview.ts` (+ `.test.ts`), `src/lib/bilan.test.ts`, `src/components/bilan/bilanA.test.tsx`, `e2e/bilan.spec.ts`.

- **`BilanHeader` (5B.2)** : bandeau aplat bleu nuit + lignes topographiques légères en SVG inline (comme le hero du rapport, **sans** animation), lisible en clair et en sombre.
  - Titre « Bilan {année} · {pilote} », mention « à date du … » si `ongoing`, lien vers la page pilote.
  - **Sélecteur d'année** : flèches ← → (`adjacentYears`) + liste des années ; changer d'année conserve les filtres (`useFilterSearch`) **et** le paramètre `comparer` seulement s'il reste valide (sinon on le retire).
  - **Puces des années comparées** (0 à 2 parmi les années précédentes ; `setCompareYears`), avec leur couleur et leur motif.
  - 4 KPI (vols, heures, sites, km) ; persona (`label`, `why`, secondaires écrites en clair, sans pastille) ; phrase d'écart `gap.text` (+ `note`) ; **équivalence** avec bouton ↻ qui fait tourner `story.equivalences` (masqué s'il n'y en a qu'une, rien si aucune).
- **`BilanToc`** : sommaire horizontal défilant, ancres dans l'ordre de la page : `apercu, histoire, rythme, quand, ou, matos, records, comparaison, vols, donnees` ; n'affiche que les ancres présentes dans le DOM.
- **`BilanOverview` (5B.3)**, ancre `apercu` : 8 cartes KPI (vols, temps, jours volés, sites, durée moyenne, distance, plafond max, vitesse max ; **mêmes définitions que les cartes du rapport**, vérifie) avec **sparkline mensuelle** (12 mois) et une pastille d'écart **par année comparée** ; puis `texts.synthese`, meilleur jour (`texts.meilleure_journee` + lien), journée type (`texts.journee_type`), vol de l'année (règle du rapport, lien fiche vol).
- **`BilanStory` (5B.4)**, ancre `histoire` : frise des `story.milestones` (date, titre, détail, or si `gold`), chaque jalon lié au vol ; mise en page deux colonnes sur grand écran, une sur mobile.
- **`BilanRhythm` (5B.5)**, ancre `rythme` : `texts.rythme` ; courbe des **heures cumulées** de l'année superposée aux années comparées (axe jour de l'année, réticule commun, couleurs + motifs ; l'année en cours s'arrête à `cutoff`), **losanges or** sur les jalons ; puis les blocs de la phase 3 (`components/rhythm/*` : calendrier, tuiles série/pause/semaine/régularité, fiche jour) scopés sur `flights`. Réutilise `CumulativeChart` si ses props le permettent, sinon un composant à toi dans `components/bilan/`.
- **`BilanComparison` (5B.7, 2ᵉ moitié)**, ancre `comparaison` : tableau KPI × années (année du bilan + années comparées, pastilles d'écart) et **haltères** (`components/common/Dumbbell`). Message sobre si aucune année comparée.
- Tests unitaires : `bilan.ts` (années, URL `comparer`), `bilanOverview.ts`.
- e2e `e2e/bilan.spec.ts` (sur les fixtures ou les vraies données selon la config Playwright existante) : ouvrir un bilan depuis la page pilote ; flèche ← change d'année et d'URL ; puces d'années comparées → URL `comparer` ; clic sur un jalon → fiche vol ; pilote ou année introuvable ; aucune erreur de page.

## Lot B : quand, où, matos, records, vols, actions, données

Fichiers à toi : `src/components/bilan/{BilanWhen,BilanWhere,BilanGear,BilanRecords,BilanFlights,BilanActions,BilanData}.tsx`, `src/components/bilan/bilanB.css` (si besoin), `src/lib/bilanDetails.ts` (+ `.test.ts`), `src/components/bilan/bilanB.test.tsx`, `e2e/bilan-details.spec.ts`. **Exception** : tu peux faire évoluer `src/components/map/**` de façon **rétrocompatible** (props optionnelles), en gardant verts leurs tests et les e2e existants.

- **`BilanActions` (5B.9)** : barre discrète (pas une section ; pas d'ancre) : « Copier le lien » (URL courante avec filtres et `comparer`), « Copier mon résumé » (texte brut court : titre, 4 KPI, écart, persona, 2 ou 3 faits ; fonction pure testée), « Exporter en CSV » (vols de l'année ; réutilise l'export CSV de `@/lib/flightsTable`, nom `bilan-<slug>-<année>.csv`). Retour visuel « Copié » ; échec du presse-papiers géré.
- **`BilanWhen`**, ancre `quand` : `texts.quand` ; matrice jour × heure, mois et saisons (composants existants `components/rhythm/*`, `StatChart` si adapté) scopés sur `flights`, avec les années comparées en superposition quand le composant le permet déjà (sinon non).
- **`BilanWhere` (5B.6)**, ancre `ou` : `texts.ou` ; carte MapLibre des sites de l'année (cercles proportionnels, réutilise `components/map`) avec **boutons de cadrage par zone** (`story.map_zones` : nom, vols, heures ; `bbox` = emprise des sites) + bouton « Tout » ; **nouveaux sites cerclés d'or** (`story.new_sites`) ; portée (`story.reach` : « site le plus éloigné : X à N km du site principal », part du site principal) ; tableau des sites (vols, heures, nouveau en or, lien page site).
- **`BilanGear`**, ancre `matos` : `texts.matos` ; voiles et instruments de l'année (`wingRows`, `instrumentRows`), modes de vol (`FlightModes`), **nouvelles voiles en or** (`story.new_wings`).
- **`BilanRecords` (5B.7, 1ʳᵉ moitié)**, ancre `records` : `texts.records` ; top 5 sur 6 critères de l'année (`topRecords`), chaque ligne liée à la fiche vol + icône Syride ; **« Nouveau record ! »** (or) sur les vols de `story.records_beaten` avec l'écart et l'année de l'ancien record.
- **`BilanFlights`**, ancre `vols` : tableau des vols de l'année (`components/flights/FlightsTable`, recherche, tri), **vols records en or** (si `FlightsTable` ne le permet pas, une marque dans une colonne à toi ou une prop optionnelle : signale-le).
- **`BilanData` (5B.10)**, ancre `donnees` : tableau de couverture de l'année (`computeCoverage` : GPX, fiche seule, sans stats, par mesure), mention « Données partielles » si besoin, date de coupure, glossaire court des notions du bilan (persona, jalon, écart à date, équivalence, régularité, série, portée, zone) avec renvoi vers `/a-propos`.
- Tests unitaires : `bilanDetails.ts` (résumé texte, cadrage des zones, marquage nouveaux sites/voiles/records).
- e2e `e2e/bilan-details.spec.ts` : sections `quand ou matos records vols donnees` présentes ; bouton de zone recadre sans erreur ; « Nouveau record ! » présent quand `records_beaten` n'est pas vide ; export CSV télécharge `bilan-<slug>-<année>.csv` avec le bon nombre de lignes ; « Copier le lien » ; aucune erreur de page.

## Vérifications de fin de lot
`cd web && npm run lint && npm run typecheck && npm test` au vert, puis **seulement tes** specs e2e (`npx playwright test e2e/<ta-spec>`). Si l'autre lot casse la compilation au même moment, signale-le au lieu de corriger ses fichiers. Rendu clair/sombre et 360 px vérifiés sur un bilan réel (AdrienM 2025 et une année en cours) : `npm run dev` en arrière-plan, lot A port 5191, lot B port 5192, arrêté ensuite.
Compte rendu final (court) : fichiers créés ou modifiés, choix faits (en particulier les règles du rapport retrouvées dans `report_data.py`), écarts au brief, besoins signalés dans les fichiers partagés, résultat des vérifications.
