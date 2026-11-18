# Brief commun, phase 4 : vols (liste et fiche)

Lis d'abord `web/BRIEF_PHASE2.md` puis `web/BRIEF_PHASE3.md` : contexte technique, interdits, conventions, contrat d'intégration, socle réutilisable, compte rendu attendu. **Tout s'applique**, sauf ce qui suit.
Puis dans `ROADMAP_WEBAPP.md` : §5.0, §5.2 (liste), §5.3 (fiche), §6, §8 « Phase 4 », §11 (D12, D15, D17).
Maquette de référence de la fiche : `web/design/maquette-fiche-vol.html` (+ `web/design/captures/fiche-vol-B-*.png`). Palette B « Encre ».

## Branche et état
- Branche `web/phase-4-vols` (déjà créée ; aucune opération git).
- Deux lots tournent **en parallèle dans le même dossier** : ne touche qu'aux fichiers de ton lot (liste ci-dessous). Fichiers partagés en lecture seule : tout le reste de `web/src/`.
- `@/lib/syride` existe déjà (`syrideFlightUrl(pilot, num)`, `syridePilotUrl(pilot)`), testé : réutilise-le, ne le modifie pas. `syride_num` est toujours renseigné (schéma : entier ≥ 1).
- `Flight.key` = `pilotSlug-syrideNum` ; une page reçoit `:key` via `useParams()`.
- Les pages ont le droit d'être assemblées par toi (exception au brief phase 3) : chaque lot possède sa page.

## Règles communes de la phase
- **D12, absolu** : aucune trace, aucune polyligne, aucune géométrie de vol. La seule position affichée est celle **du site** (`sites.json`). Toute évocation de trace = lien externe vers `syrideFlightUrl()`, `target="_blank" rel="noopener noreferrer"`, icône `IconExternalLink`, libellé ou `aria-label` « Voir la trace sur Syride ».
- Liens internes : `FilterLink` (conserve les filtres). Pilote → `/pilote/:slug`, site → `/site/:id` (pages encore en bouchon, c'est normal).
- Formatage : `@/lib/format` exclusivement. Mesures absentes : « – » sobre, jamais 0.
- Mobile 360 px : pas de débordement horizontal de page (un tableau large scrolle dans son conteneur).
- Performance : fiche affichée en < 500 ms ; aucun calcul en O(n²) sur ~9 600 vols ; `useMemo`.

---

## Lot A : liste des vols `/vols` (4.1)

Fichiers à toi : `src/pages/Flights.tsx`, `src/components/flights/**`, `src/lib/flightsTable.ts` (+ `.test.ts`), `e2e/vols-liste.spec.ts`.

- Données : la sélection filtrée `useFilteredFlights()` (les filtres globaux s'appliquent).
- TanStack Table v8 + `@tanstack/react-virtual` (virtualisation des lignes, ~9 600 lignes fluides). Colonnes : date (+ heure), pilote, activité (pastille de couleur discipline), site, voile, durée, distance, plafond, vitesse max, vario max, g max ; colonnes masquables (au moins instrument, mode, gain, distance cumulée, vitesse moyenne, source disponibles et masquées par défaut).
- Tri multicolonne (shift-clic), `null` toujours en fin quel que soit le sens. Tri par défaut : date + heure décroissantes.
- Recherche texte (pilote, site, voile, instrument, mode ; insensible à la casse **et aux accents**), avec un compteur « N vols ».
- Indicateurs discrets : vol incomplet ; statistiques sans GPX (`source !== 'gpx'`), avec infobulle explicative.
- Colonne d'action : icône ↗ vers la trace sur Syride (le clic ne déclenche pas la navigation de la ligne).
- Clic (et Entrée au clavier) sur une ligne : fiche `/vol/:key` en conservant les filtres.
- Export CSV de la sélection **courante** (filtres + recherche, ordre de tri, colonnes visibles) : fonction pure dans `flightsTable.ts` ; séparateur `;`, BOM UTF-8, nombres à virgule décimale sans séparateur de milliers, échappement RFC 4180 ; colonne lien Syride incluse ; nom `vols-AAAA-MM-JJ.csv` (date de `meta.data_updated_at`).
- Choix des colonnes visibles et tri : mémorisés dans `localStorage` (try/catch), pas dans l'URL.
- État vide sobre.
- e2e : la page charge, la recherche réduit le compteur, le tri change l'ordre, un clic sur une ligne ouvre la bonne fiche (URL `/vol/<key>`), le lien Syride d'une ligne a la bonne URL, l'export CSV télécharge un fichier dont l'en-tête et le nombre de lignes sont corrects.

## Lot B : fiche vol `/vol/:key` (4.3 à 4.7)

Fichiers à toi : `src/pages/Flight.tsx`, `src/components/flight/**`, `src/lib/flightContext.ts` (+ `.test.ts`), `src/lib/siteAggregates.ts` (+ `.test.ts`), `e2e/vol-fiche.spec.ts`, `e2e/d12.spec.ts`.

- **Population de référence** : la fiche ne dépend **pas** des filtres globaux (un vol a le même contexte quels que soient les filtres) ; elle compare sur tous les vols (`useData().flights`). Les liens sortants conservent les filtres.
- **4.3 En-tête** : pilote (lien), date et heure en toutes lettres, site (lien), voile, instrument, activité, mode. **Bouton principal « Voir la trace sur Syride ↗ »**, très visible. **Chiffres du vol** : durée, distance, distance cumulée, plafond, gain, vitesses moyenne et max, vario max, g max ; mention de la source (« fiche Syride », « GPX », « aucune ») et du statut incomplet.
- **4.4 Ce vol dans son contexte** (`flightContext.ts`, fonctions pures) :
  - rangs : parmi les vols du pilote (toutes années, et l'année du vol) et parmi ceux du site (toutes années, et l'année) pour durée, distance, plafond, vitesse max ; formuler seulement les rangs parlants (ex. top 3 ou top 10 %) en phrases sobres : « 3ᵉ plus long vol de j2f », « plus haut plafond de 2025 à Montbron ». Ex aequo : même rang. Or (`gold`) réservé à un rang 1.
  - **Ce vol face aux moyennes** : par métrique, barres « ce vol / moyenne du pilote / moyenne du site » (moyennes en ignorant les `null`, règle des valeurs ≤ 0 déjà appliquée à l'export) ; écart neutre (`nup`/`ndown`), jamais « bien » ou « mal ».
  - **Vols du même jour** : autres vols ce jour-là au même site (tous pilotes), avec liens fiche et Syride ; puis, à part, les autres vols du pilote ce jour-là ailleurs s'il y en a.
  - **Précédent et suivant du pilote** (ordre date + heure + syrideNum), liens fiche ; touches ← et → (sans conflit avec les raccourcis existants, inactives dans un champ de saisie).
- **D15/D17 Ce site face aux autres** (`siteAggregates.ts`, **module unique réutilisé en phase 5** : conçois une API générale `siteAggregates(flights) → Map<siteId, agrégat>` + positionnement d'un site parmi les sites d'au moins 10 vols : rang et position min/médiane/max par indicateur) : durée moyenne, distance moyenne, plafond moyen, vitesse moyenne, vario max moyen, nombre de vols, nombre de pilotes, part parapente/paramoteur. Même langage visuel que « Ce vol face aux moyennes ». Bascule « Tous / Ce pilote » (D17 : agrégats calculés sur les vols du pilote, sites d'au moins 10 vols **du pilote** ; masquer la bascule ou afficher un message si le pilote n'a pas assez de sites). Site de moins de 10 vols : message sobre. Lien vers la page du site.
- **4.5 Mini-carte** : MapLibre, style `@/theme/map`, un seul marqueur à la position du site, zoom fixe raisonnable, interactions minimales, lien vers la page du site. Site sans coordonnées : pas de carte, message sobre. Réutilise ce qui est faisable de `components/map/` sans le modifier. Dans jsdom, MapLibre n'est pas disponible : simule `maplibre-gl` dans ton test comme `src/components/map/SitesMapSection.test.tsx` (`vi.mock`).
- Vol introuvable : page sobre « Vol introuvable » avec lien vers `/vols`.
- **4.6 Contrôle D12 automatisé** (`e2e/d12.spec.ts`) : sur une fiche vol et sur `/vols`, enregistre toutes les requêtes réseau ; échoue si une URL contient `gpx`, `igc`, `kml`, `track`, `trace` (hors liens `<a>` vers syride.com, qui ne sont pas des requêtes) ou si une réponse JSON locale contient une clé `coordinates`/`geometry` de type `LineString`/`MultiLineString`. Vérifie aussi que la source GeoJSON de la mini-carte ne contient que des `Point` (via `page.evaluate` sur la carte si accessible, sinon sur le DOM : aucun `<path>`/`<polyline>` SVG de trace dans la fiche).
- **4.7 e2e** (`e2e/vol-fiche.spec.ts`) : une fiche se charge avec ses sections, le bouton Syride a l'URL exacte, précédent/suivant naviguent, un vol introuvable affiche le message, aucune erreur de page.

## Vérifications de fin de lot
`cd web && npm run lint && npm run typecheck && npm test` au vert, puis **seulement tes** specs e2e : `npx playwright test e2e/<tes-fichiers>` (le serveur e2e construit l'app sur les fixtures ; si l'autre lot a cassé la compilation à ce moment-là, signale-le au lieu de corriger ses fichiers). Le serveur e2e (port 4173) peut être réutilisé s'il a été lancé par l'autre lot avec un build antérieur : si un échec ressemble à du code absent, relance après quelques minutes et note-le ; le maître d'œuvre repassera toute la suite e2e à la fin. Vérifie le rendu clair/sombre et 360 px (serveur `npm run dev` en arrière-plan sur un port libre, à arrêter ensuite).
