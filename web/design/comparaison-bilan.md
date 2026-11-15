# Bilan interactif et rapport HTML : ce qui est repris, ce qui change

Comparaison entre `maquette-bilan.html` (page `/pilote/:slug/:annee`, §5.4 bis) et le rapport pilote × année (`src/rapport/`, exemple : `html_reports/2026_html_reports/AdrienM_rapport_vol_2026.html`). La maquette montre AdrienM en 2026, année en cours. Les chiffres viennent de `web/public/data/` (vols, sites, insights) ; aucune trace, aucune coordonnée par vol.

## Repris du rapport

| Élément | Dans la maquette |
|---|---|
| Ordre des sections | Aperçu, Histoire, Rythme, Quand, Où, Matos, Records, Comparaison, Vols, Données (glossaire). Les ancres du sommaire portent les mêmes noms. |
| Ton et textes | « Tu » ; les textes viennent tels quels de `insights.texts` (synthèse, rythme, quand, où, matos, records, journée type) et `insights.gap`. |
| Bandeau d'en-tête | Aplat bleu nuit avec lignes topographiques légères, 4 KPI (vols, heures, sites, km), phrase d'écart avec l'année précédente, équivalence avec le bouton ↻. |
| Persona | Texte « profil Régulier » avec sa justification. Les personas secondaires sont écrites en clair dans la phrase, sans pastille. |
| Cartes KPI | 8 cartes (vols, temps, jours, sites, durée moyenne, distance, plafond, vitesse max) avec sparkline mensuelle et pastilles d'écart avec les années comparées. Mêmes règles : vert et rouge pour les volumes, bleu et ambre pour le reste. |
| Années comparées | Choix par puces en haut de page (2025, 2024, 2023), motif tirets ou pointillés en plus de la couleur. |
| Courbe cumulée | Heures cumulées de l'année superposées aux années comparées, réticule et infobulle donnant la valeur de chaque année à date. |
| Calendrier et tuiles | Calendrier jour par jour coloré par discipline (4 niveaux), tuiles série, pause, meilleure semaine, régularité. |
| Jalons | `insights.milestones`, en or pour les records et les nouveautés. |
| Records | Top 5 par critère, « Nouveau record ! » avec l'écart avec l'ancien record (`insights.records_beaten`). |
| Carte | Cercles proportionnels, nouveaux sites cerclés d'or, zones `map_zones` (devenues boutons de cadrage). |
| Comparaison | Tableau KPI × années avec pastilles d'écart. |
| Données | Tableau de couverture (GPX, fiche seule, sans statistiques) et glossaire. |

## Ce qui change, et pourquoi

| Changement | Raison |
|---|---|
| Une page vivante, pas un document : on peut changer d'année avec les flèches, filtrer par discipline, choisir les années comparées, ouvrir un vol ou une fiche jour. | D9 : le Bilan est la vue consultable à tout moment, y compris l'année en cours. Le rapport reste le document souvenir. |
| Chaque jalon, record et vol mène à la **fiche vol** de la webapp. Le lien « trace sur Syride » est une icône dans les listes, pas un lien par ligne. | D12 : pas de trace dans la webapp ; la fiche vol est la porte d'entrée vers Syride. |
| Pas de scène de ciel, pas de compteur animé : le bandeau est un aplat sobre. | Refus d'Adrien (scène de ciel). |
| Pas de radar : la comparaison utilise un tableau et un **graphique en haltère** (disque, carré, anneau selon l'année). | Refus d'Adrien (radar). T34. |
| Sommaire en barre de défilement horizontale sous les filtres, au lieu de la colonne latérale du rapport. | Même navigation sur mobile et sur grand écran, sans colonne. |
| Section **Histoire** : frise des jalons sur deux colonnes, chaque jalon menant au vol. La courbe cumulée porte aussi des losanges d'or sur les jalons. | §5.4 bis, points 3 et 4. |
| Calendrier en 12 mini-mois sur mobile. | §5.1, point 5. |
| Tableau « Tous tes vols » avec recherche, export CSV et records en or ; en version complète, virtualisé. | Composant partagé avec la page `/vols`. |
| Toutes les couleurs viennent des jetons communs (`tokens-B.json`) et non plus de la feuille de style du rapport. | D5 : la webapp a sa propre identité ; le rapport garde la sienne. |
| Variantes mobile des graphiques (viewBox plus étroit, texte lisible), et « Voir les données » sous les graphiques. | Accessibilité (§6) : table alternative pour chaque graphique. |

## Volontairement non repris (v1)

- La **projection de fin d'année** et l'**objectif personnel** (jauge, `localStorage`) ont été retirés de la maquette le 15/11/2026, à la demande d'Adrien : la page ne contient plus ni section « Projection », ni entrée de sommaire correspondante, ni stockage local.
- Le **rejeu animé** de l'année et le **récap PNG à partager** : propres au rapport de fin d'année, phase 8 au plus tôt.
- Les rapports eux-mêmes : la webapp ne les publie ni ne les relie (D4).
- Le percentile de groupe, les médailles, les confettis, le croisement sites × mois : refus d'Adrien.

## Limites de la maquette

- La maquette est statique : les boutons (filtres, onglets, ↻) ne recalculent rien, sauf l'équivalence, les puces d'années et la bascule d'aperçu.
- Les chiffres « avant » des records récents (tableau de bord) sont fictifs ; les valeurs du Bilan, de la fiche vol et de la page pilote viennent des données réelles.
- Une comparaison côte à côte d'écrans entre le rapport et la maquette reste à faire au moment de la publication en artefact.
