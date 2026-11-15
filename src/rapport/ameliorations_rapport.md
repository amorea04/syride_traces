# Feuille de route : améliorer le rapport HTML « Ton année de vol »

*Révision du 13 novembre 2026 (soir). Remplace la version du même jour.*

**Sur quoi repose cette révision.** Relecture complète de `report_html.py`, `report_data.py`, `report_charts.py`, `report.css`, `report.js`, `report_textes.md`, `generate_reports.py` et `create_report.ipynb` dans leur état actuel ; régénération des rapports 2026 de trois pilotes (AdrienM, j2f, LiLi06) avec ce code ; mesure du poids section par section ; lecture du rapport d'AdrienM dans un navigateur en thème clair, en thème sombre et en largeur téléphone (375 px) ; profil des colonnes du pkl (taux de remplissage, valeurs).

Légende : effort **S** = quelques heures · **M** = 1 à 2 jours · **L** = 3 jours ou plus. Impact : ★ (confort) à ★★★ (change la perception du rapport).

---

## 0. En bref

### Ce qui a changé depuis la version précédente

**Tâches terminées** (vérifiées dans le code et à l'écran) :

| Tâche | Constat |
|---|---|
| T01 · Docstring de `report_html.py` | Alignée sur les fichiers réels |
| T04 · Pastilles d'écart | Vert / rouge pour vols, heures, jours ; bleu / ambre ailleurs (`VOLUME_KPIS`), expliqué dans l'intro de l'aperçu |
| T05 · Orange réservé au paramoteur | `--brand` = bleu d'accent ; points de carte indigo en « Tout », couleur de la discipline sinon |
| T06 · Années distinguées par le trait | Tirets et pointillés sur les courbes, hachures et points sur les barres, gris assombri |
| T07 · Double infobulle | Les `<title>` sont retirés au chargement et reportés en `aria-label` |
| T08 · Animations à l'entrée à l'écran | Classe `.in-view` posée par `IntersectionObserver`, avec filet de sécurité de 4 s |

**Corrections apportées à l'ancienne feuille de route** (elle se trompait ou devinait) :

| Ancienne affirmation | Réalité mesurée | Conséquence |
|---|---|---|
| « Poids probablement élevé, à mesurer » | 770 à 945 ko par rapport. La section **Rythme pèse 55 à 57 %** du fichier (activité par mois 244 ko, calendrier 209 ko, cumul 72 ko) | Le poids est acceptable aujourd'hui, mais chaque nouveau graphique pré-rendu en 12 variantes coûte cher : voir 6.2 |
| « Carte lourde » (D4, T29) | Le fond de carte pèse **7 à 9 ko**, soit 1 % du fichier | T29 retirée. Le vrai défaut de la carte est la lisibilité (cercles superposés), pas le poids |
| « 366 arrêts de tabulation » | **1 500 à 2 200** éléments `tabindex="0"` par rapport (calendrier × 3 disciplines + toutes les barres de toutes les variantes) | T12 remonte en priorité |
| « Vols au plafond < 50 m écartés » (texte `limites`) | **Aucun filtre de ce type dans `report_data.py`.** Pour j2f, 18 vols sans statistiques sur 118 sont comptés dans les totaux | Texte faux à corriger (T40) et transparence chiffrée à faire (T11) |
| Équivalence « × Everest » avec la somme des gains | `gain` est absent ou nul pour **40 %** des vols 2026 | Équivalence affichée seulement si la mesure couvre assez de vols |
| Colonne `distance_cumulee` | Le code utilise `distance` (remplie à 97 %), pas `distance_cumulee` (71 %). Le glossaire décrit pourtant « Distance cumulée » | Glossaire à corriger (T40) |
| Communauté : « top X % des pilotes » (F17) | 13 pilotes en 2026 : un percentile n'a pas de sens et n'est pas anonyme | F17 reformulée en option « groupe », soumise à validation |
| Python 3.9 | L'environnement actuel est Python 3.8.16 (anaconda) | Rester compatible 3.8 |

**Ajouts** : façons de voler (colonne `types` : site, treuil, rando, bord de mer, moteur), coordonnées de repli `mean_longitude` / `mean_latitude`, carte par zones, socle JSON des vols pour les interactions, tableaux enrichis, corrections de contraste repérées à l'écran, barre mobile, ton éditorial et quiz (qui n'avaient pas de tâche).

**Retraits** : optimisation du poids de la carte (T29), visite guidée (T32), radar de profil, sites × mois, mode de thème « Ciel », percentile de communauté.

### État au 14 novembre 2026 : les 10 chantiers prioritaires sont faits

Les dix chantiers ci-dessus sont implémentés (tâches cochées en section 11). Vérifications : les 151 rapports pilote × année du pkl se génèrent sans erreur, aucun ne dépasse 1 Mo ; test d'autonomie et syntaxe JS validés ; relecture au navigateur en grand écran et à 375 px, en clair et en sombre.

| Pilote 2026 | Avant | Après |
|---|---|---|
| AdrienM | 924 ko | 944 ko |
| j2f | 872 ko | 899 ko |
| LiLi06 | 769 ko | 825 ko |

Le poids reste presque stable malgré les ajouts : l'allègement (T39) et la carte rendue une seule fois ont libéré la place. **Marge restante sous le budget de 1 Mo : environ 55 ko** ; la prochaine fonctionnalité lourde devra s'appuyer sur le JSON des vols plutôt que sur du pré-rendu.

Nouveautés structurantes à connaître pour la suite :
- `#flights-data` (JSON des vols) et ses fonctions JS (`flightsOn`, `flightDatesFor`, `flightUrl`) servent de socle aux interactions ;
- un seul panneau (`openSheet` / `closeSheet`) porte la fiche du jour et la fiche de site : à réutiliser ;
- `render_md` gère `{{^clé}}` (sinon) et `ReportBuilder.variant()` choisit des variantes de phrases stables ;
- nouvelles couleurs : `--gold`, `--w-*` (façons de voler) ; hero : `--hero-bg1/2`, `--halo` (`.hero[data-main]`), `--topo-o`.

**Retouches du 14 novembre, après relecture** : carte (tous les sites dans la vue d'ensemble, halos de zone cliquables), badges retirés, hero refait en bleu nuit avec courbes de niveau. Poids : AdrienM 901 ko, j2f 855 ko, LiLi06 790 ko (marge ≈ 100 ko) ; 151 rapports générés sans erreur.

**Lot du 14 novembre (T51, T02, T11, T15, T13, T23, T16)** : tâches faites par des agents Sonnet (Haiku pour le notebook), relues et vérifiées au navigateur. Poids : AdrienM 887 ko, j2f 857 ko, LiLi06 753 ko ; le plus lourd des 151 rapports est Au_Phil_du_vent 2026 à 927 ko (marge ≈ 70 ko). Sans JavaScript, le calendrier n'a plus d'infobulle par case (choix assumé pour le poids).

Points restés ouverts : impression et mode « mouvement réduit » relus dans le code mais pas vus rendus ; contraste des cercles de carte jugé à l'œil ; aucun test sur un vrai téléphone ; fond de carte pauvre en vue zoomée (décision 6) ; la phrase « nouveaux sites » de la section Où énumère toujours tous les noms (D26, T47).

### Le diagnostic en trois phrases

1. **Le socle est sain** : autonome (vérifié : seuls des liens `href` vers syride.com), chiffres cohérents, thèmes clair et sombre agréables, années et disciplines bien distinguées.
2. **Le rapport reste un tableau de bord** : il montre des totaux et des tops, peu de faits marquants. Trois informations sont calculées et jamais montrées (`best_day`, dates des nouveaux sites, `years_available`), et deux colonnes riches ne sont pas exploitées (`types`, `saison`).
3. **On ne peut presque rien y faire** : survoler, trier, changer de discipline. Rien ne se clique dans le calendrier ni sur la carte, et sur téléphone la barre collante occupe un quart de l'écran.

### Les 10 chantiers au meilleur rapport impact / effort

| # | Chantier | Type | Effort | Impact | Tâches | État |
|---|---|---|---|---|---|---|
| 1 | Assainir : textes faux, contrastes, coordonnées de repli, poids des infobulles | Fond + forme | S | ★★ | T39 à T42 | ✅ fait |
| 2 | Barre collante et grilles sur téléphone | Forme | S/M | ★★★ | T28 | ✅ fait |
| 3 | Équivalences, meilleure journée, phrase d'avance ou de retard sur l'an dernier | Fond | S | ★★★ | T09, T10, T48 | ✅ fait |
| 4 | Façons de voler et saisons | Fond | S | ★★ | T44 | ✅ fait |
| 5 | Socle JSON des vols + fiche du jour au clic sur le calendrier | Interaction | M | ★★★ | T45, T25 | ✅ fait |
| 6 | Frise des jalons et portrait du pilote | Fond | M | ★★★ | T17, T18 | ✅ fait |
| 7 | Hero en scène de ciel, ambiance selon l'heure de décollage | Forme | M | ★★★ | T19 | ✅ fait, puis remplacé (14 novembre) : bleu nuit et courbes de niveau |
| 8 | Badges à débloquer | Ludique | M | ★★★ | T26 | ❌ fait puis retiré (14 novembre) |
| 9 | Records battus + « Depuis tes débuts » | Fond | M | ★★★ | T20, T21 | ✅ fait |
| 10 | Carte par zones, cliquable | Fond + interaction | M | ★★★ | T46 | ✅ fait |

---

## 1. Principes directeurs

- **Autonomie totale, non négociable.** Un seul fichier `.html`. Aucune requête réseau : ni CDN, ni police web, ni image distante, ni `fetch`. Les liens vers Syride restent de simples liens de navigation. Tout le reste est intégré : CSS, JS, police éventuelle en base64, icônes en SVG inline, fond de carte, données JSON.
- **Zéro dépendance JS.** JavaScript natif uniquement.
- **Budget de poids : 1 Mo** pour un pilote à environ 150 vols, hors police éventuelle (aujourd'hui : 0,77 à 0,95 Mo). Règle associée : **plus aucun nouveau graphique pré-rendu en 12 variantes** (discipline × années). Un nouveau graphique est soit décliné par discipline seulement (3 variantes), soit dessiné par le navigateur à partir du JSON des vols (6.2).
- **Ludique mais jamais bloquant.** Toute animation respecte `prefers-reduced-motion` ; aucune interaction n'est indispensable pour lire une information ; aucun son.
- **Une couleur = un sens.** Orange = parapente, cyan = paramoteur (échangés le 14 novembre), bleu / violet / gris = années, vert / rouge = volume en hausse ou en baisse, or = record ou nouveauté. Aucune de ces couleurs ne sert de décoration ailleurs.
- **Accessible.** Navigation clavier, contrastes AA (texte 4,5:1, éléments graphiques 3:1), information jamais portée par la couleur seule.
- **Dégradation propre.** Lisible sur téléphone, imprimable, contenu principal visible même si le JS échoue (les variantes par défaut restent pré-rendues).
- **Textes éditables sans toucher au code** : nouvelles phrases dans `report_textes.md`, seuils dans des constantes nommées.
- **Honnêteté des chiffres.** Une mesure absente pour une partie des vols le dit (« sur 98 vols mesurés »). Le pkl fournit de quoi le faire : `source_stats` (gpx / fiche / aucune) et `incomplet`.
- **Données existantes d'abord.** Colonnes disponibles : `pilote`, `date`, `heure`, `types`, `type_vol`, `site`, `voile`, `instrument`, `duree_vol_minutes`, `distance`, `distance_cumulee`, `vitesse_moyenne`, `vitesse_max`, `plafond`, `gain`, `vario_max`, `g_max`, `longitude`, `latitude`, `mean_longitude`, `mean_latitude`, `saison`, `source_stats`, `incomplet`, `num_activite`, `date_update`. Les pistes qui demandent du scraping supplémentaire sont en section 10.

---

## 2. Diagnostic de l'existant

### 2.1 À conserver

- Architecture : `report_data.py` (calculs) → `report_charts.py` (SVG) → `report_html.py` (assemblage) + textes en `.md`.
- Formatage français soigné, comparaison « à la même date » pour l'année en cours.
- Thèmes clair et sombre : le sombre est réussi (courbe de cumul très lisible, bonne hiérarchie).
- Distinction des années par le trait et le motif, pastilles d'écart à deux sémantiques.
- Aide « Comment lire ceci ? », glossaire, section des limites, impression.
- Fond de carte embarqué, léger, hors ligne.

### 2.2 Défauts constatés

Les références D sont celles de la version précédente ; les nouvelles commencent à D17.

| Réf. | Constat | Où | Correctif | État |
|---|---|---|---|---|
| D1 | Double infobulle | `report.js` | — | **Corrigé** (T07) |
| D2 | Animations jouées avant d'être vues | `report.css`, `report.js` | — | **Corrigé** (T08) |
| D3 | **1 500 à 2 200 arrêts de tabulation** : chaque case du calendrier et chaque barre a `tabindex="0"`, dans chaque variante | `report_charts.py` | Un seul arrêt par graphique, déplacement aux flèches | À faire (T12) |
| D4 | ~~Carte lourde~~ : faux (7 à 9 ko). Reste un défaut de **lisibilité** : deux groupes de sites à 500 km l'un de l'autre donnent des cercles empilés et des étiquettes en conflit | `chart_map` | Carte par zones (T46) | Reformulé |
| D5 | Orange partagé entre marque et paramoteur | `report.css` | — | **Corrigé** (T05) |
| D6 | Années distinguées par la seule couleur | CSS, graphiques | — | **Corrigé** (T06) |
| D7 | Pastilles vertes / rouges pour tout | `delta_pills` | — | **Corrigé** (T04) |
| D8 | Informations calculées jamais montrées : `best_day`, `first_date` des nouveaux sites, `years_available` | `report_data.py` | T10, T17, T21 | À faire |
| D9 | Moyennes sans médianes | `compute_kpis` | T13 | À faire |
| D10 | **Téléphone : la barre collante fait environ 200 px de haut sur 812** (liens, discipline, années, 3 icônes sur 4 lignes). Les cartes de chiffres passent en une seule colonne (8 écrans de défilement). Le calendrier défile horizontalement | CSS, `bar()` | T28 | À faire, **prioritaire** |
| D11 | Poids : mesuré (voir section 0). Section Rythme = 55 à 57 % | `by_disc_cmp` | T39, 6.2 | Mesuré |
| D12 | Docstring erronée | `report_html.py` | — | **Corrigé** (T01) |
| D13 | Notebook : chemin absolu et année codés en dur, `heure_decolage` / `flight_url` recréés alors que `prepare_report_df` le fait, imports inutiles (`plotly`, `matplotlib`), cellule vide ; `prepare_report_df` recalculé sur tout le DataFrame pour chaque pilote | `create_report.ipynb`, `compute_report` | T02 | À faire |
| D14 | Aides repliées, peu découvrables | `card()` | Bouton « ? » rond dans l'en-tête de carte (T16) | À faire |
| D15 | Infobulles au survol seulement, texte brut d'un seul tenant ; `cursor: help` partout | `report.js` | T23 | À faire |
| D16 | `generate_pdf_report.py` importe `load_flights`, `prepare_df`, `get_pilot_year_data` depuis `report_data`, qui n'existent pas : **échec à l'import, confirmé** | `generate_pdf_report.py` | Hors périmètre HTML ; à corriger ou retirer (décision 8) | Ouvert |
| D17 | **Le texte `limites` annonce un filtrage qui n'existe pas** (« plafond < 50 m, sans durée et avions écartés »). Les vols sans statistiques sont comptés dans les vols et les heures, absents des records | `report_textes.md`, `report_data.py` | Corriger le texte, ou appliquer réellement le filtre : à trancher (décision 1) | À faire (T40) |
| D18 | Glossaire : décrit « Distance cumulée » alors que le rapport affiche `distance` | `report_textes.md` | Aligner le texte | À faire (T40) |
| D19 | **Sites absents de la carte alors que leurs coordonnées existent** : la carte lit `longitude` / `latitude` (trace GPX du vol, absente pour 55 % des vols 2026) et ignore `mean_longitude` / `mean_latitude` (coordonnées du site, remplies à 99,6 %). LiLi06 : 34 sites placés sur 57, 50 possibles | `_site_rows` | Repli sur les coordonnées du site | À faire (T41) |
| D20 | **Calendrier clair : une petite journée de parapente est presque invisible** (`--cal-p1` `#cffafe` sur case vide `#e6ecf5`, contraste ≈ 1,1:1). Idem `--cal-m1` | `report.css` | Foncer le niveau 1 ou éclaircir la case vide ; viser 1,5:1 entre vide et niveau 1, 3:1 entre vide et niveau 3 | À faire (T42) |
| D21 | **Texte blanc sur cyan et sur orange sous le seuil AA** : pastilles de discipline et barre de partage (≈ 3,6:1 pour du texte de 11 à 13 px) | `.pill`, `.share-bar` | Fonds foncés pour le texte (`#0e7490`, `#c2410c` : > 5:1) en gardant les teintes vives pour les formes | À faire (T42) |
| D22 | Carte en thème sombre : terres vert olive, hors palette et ternes | `--map-land` sombre | Gris-bleu ardoise cohérent avec les surfaces | À faire (T42) |
| D23 | Le dégradé de la barre de progression utilise `--y1`, la couleur d'une année de comparaison ; la 3ᵉ place des records (bronze) est proche de l'orange paramoteur | `report.css` | Dégradé accent → accent clair ; bronze plus brun | À faire (T42) |
| D24 | « Effacer les filtres » (tableau des vols) remet aussi la discipline globale sur « Tout » | `report.js` | Ne réinitialiser que la recherche et le mois | À faire (T40) |
| D25 | Cliquer une barre de mois fait sauter en bas de page sans prévenir ni proposer de retour ; le sous-titre ne mentionne que le survol | `report.js`, `rythme()` | Annoncer le clic dans le sous-titre ; puce « Filtre : avril ✕ » avec lien de retour | À faire (T40) |
| D26 | La phrase des nouveaux sites énumère jusqu'à 16 noms à la suite | `sentences()` | Chiffre dans la phrase, noms en puces (avec date de découverte) | **Corrigé** (T47) |
| D27 | Le texte de chaque infobulle est écrit deux fois dans le HTML (`data-tip` et `<title>`) : **120 à 145 ko, soit 15 % du fichier** | `report_charts.py` | N'écrire que `<title>` ; le JS le recopie déjà en `data-tip` | À faire (T39) |
| D28 | Pas d'icône d'onglet ; le fichier servi en HTTP déclenche une requête `/favicon.ico` | `head()` | Icône SVG en `data:` URI | À faire (T51) |
| D29 | Sur écran moyen (800 px) la barre collante tient sur deux lignes (≈ 95 px) | `bar()` | Traité avec T28 | À faire |

---

## 3. Le fond : ce que le rapport devrait raconter

Passer de « voici tes totaux » à « voici **ton histoire** de l'année ». Chaque bloc précise la donnée, le calcul et le rendu. Les blocs marqués **JSON** s'appuient sur le socle de données décrit en 6.2.

### A. Raconter l'année

**F1. Portrait du pilote** *(M, ★★★)*
Une étiquette principale et deux secondaires, affichées dans le hero avec un pictogramme. Règles dans un dictionnaire `PERSONA_RULES`, libellés dans `report_textes.md`. Chaque étiquette affiche sa justification au survol (« 71 % de tes vols ont lieu le week-end »).

| Portrait | Règle indicative |
|---|---|
| Lève-tôt | médiane de l'heure de décollage avant 10 h |
| Pilote du soir | médiane à partir de 17 h |
| Pilote du week-end | au moins 65 % des vols le samedi ou le dimanche |
| Fidèle | un site concentre au moins 60 % des vols |
| Explorateur | 10 sites différents ou plus, ou 5 nouveaux sites ou plus |
| Marathonien | durée médiane de 1 h ou plus |
| Régulier | au moins un vol dans 60 % des semaines écoulées |
| Chasseur de plafond | plafond max à 3 000 m ou plus |
| Polyvalent | parapente et paramoteur pèsent chacun au moins 25 % du temps de vol |
| Treuilleur / Marcheur | au moins 30 % de vols au treuil / 20 % de vols rando (colonne `types`) |

Les seuils sont à caler sur les 13 pilotes réels (un script d'essai affiche le portrait de chacun) pour éviter que tout le monde reçoive la même étiquette. Portrait neutre en repli.

**F2. Équivalences concrètes** *(S, ★★★)*
Sous les chiffres du hero, une équivalence à la fois, qui change au clic :
- temps de vol → « X jours complets dans les airs » ;
- distance → « X fois Paris–Marseille » (660 km) ;
- plafond max → « à X m sous le sommet du Mont-Blanc » ou « X fois la tour Eiffel » ;
- nombre de vols → « un vol tous les N jours » ;
- gain cumulé → « X fois l'Everest », **seulement si `gain` est mesuré pour au moins 80 % des vols** (sinon l'équivalence est omise plutôt que sous-estimée).

**F3. Frise des jalons** *(M, ★★★)*
Chronologie horizontale (verticale sur téléphone) : premier vol, 10ᵉ / 25ᵉ / 50ᵉ / 100ᵉ vol, 10ᵉ / 25ᵉ / 50ᵉ / 100ᵉ heure, premier vol sur chaque nouveau site, vols records, meilleure journée, reprise après la plus longue pause. Chaque jalon renvoie vers la fiche Syride. Limiter à une douzaine de jalons (priorité aux records et aux paliers) pour un pilote qui a découvert 16 sites.

**F4. Meilleure journée, journée type et vol de l'année** *(S, ★★)*
- `highlights["best_day"]` enfin affiché : date, nombre de vols, durée, sites.
- Journée type en une phrase : jour, heure, site et voile les plus fréquents.
- **Vol de l'année** : une carte mise en avant pour le vol le plus long (ou le plus haut), avec ses chiffres et le lien vers la fiche.

**F19. Façons de voler** *(S, ★★ ; nouveau)*
La colonne `types` distingue vol sur site, treuil, rando, bord de mer et moteur (AdrienM 2026 : 86 site, 35 treuil, 17 moteur, 1 rando). Aujourd'hui tout est réduit à parapente / paramoteur. Afficher une barre segmentée à côté du partage parapente / paramoteur, avec vols et heures par façon de voler, et une phrase (« Un vol sur quatre au treuil »). Nettoyer les libellés (espaces en fin de chaîne présents dans les données). Ajouter la colonne au tableau des vols et aux filtres.

**F20. Avance ou retard sur l'an dernier** *(S, ★★★ ; nouveau)*
Les chiffres « à la même date » existent déjà (`kpi_equiv`). En tirer la phrase d'ouverture du rapport : « Au 13 novembre, tu as **10 h d'avance** sur 2025 » (ou « 6 h de retard, il reste 7 semaines »). Même information annotée sur la courbe de cumul, au niveau du trait « aujourd'hui ». C'est le fait le plus parlant du rapport et il ne coûte presque rien.

### B. Rythme et régularité

**F5. Séries et régularité** *(S/M, ★★)*
Plus longue série de jours consécutifs, plus longue série de semaines avec au moins un vol, semaines actives sur semaines écoulées, part des vols en week-end, plus longue pause (déjà calculée). Trois pastilles chiffrées ; au clic, les jours concernés s'allument dans le calendrier.

**F21. Saisons** *(S, ★ ; nouveau)*
Colonne `saison` disponible. Quatre tuiles (hiver, printemps, été, automne) avec heures et vols, la saison dominante mise en avant. S'intègre à la section Rythme, sans graphique supplémentaire.

**F6. Projection et objectif (année en cours)** *(M, ★★)*
Projection de fin d'année calée sur la répartition mensuelle de l'année précédente, tracée en pointillés avec la mention « estimation ». Jauge d'objectif : par défaut la meilleure année passée, modifiable (valeur mémorisée dans `localStorage` avec `try/catch`). Pour une année terminée : « bilan face à ta meilleure année ». Priorité abaissée : utile seulement une partie de l'année, et F20 donne déjà l'essentiel.

**F7. Médianes et distribution des durées** *(S/M, ★★)*
Médiane de durée, de plafond et de vitesse dans les chiffres clés (avec le nombre de vols mesurés). Histogramme des durées par tranches (< 15 min, 15–30 min, 30 min–1 h, 1–2 h, > 2 h), vol médian repéré. Décliné par discipline seulement.

**F8. Matrice jour × heure** *(M, ★★)*
Carte de chaleur 7 × heures utiles : montre « le samedi après-midi », ce que deux histogrammes séparés ne montrent pas. Peut **remplacer** les deux graphiques actuels de la section « Quand » en mode sans comparaison, ce qui allège la page au lieu de l'alourdir.

### C. Performances

**F9. Nuage de points** *(M, ★★ ; JSON)*
Un point par vol, axes au choix (durée × plafond, distance × vitesse moyenne), couleur par discipline, records entourés, clic = fiche du vol. Dessiné par le navigateur.

**F10. Records enrichis** *(M, ★★★)*
- **Record personnel battu** : comparer chaque record au meilleur de toutes les années précédentes ; badge « Nouveau record » avec l'écart (« +180 m »). Demande `_records` sur l'historique complet.
- Podium visuel pour les trois premiers ; mention du nombre de vols mesurés pour le critère.
- Médailles reportées dans le tableau des vols (une icône sur la ligne du vol record).
- Nouveau critère : meilleure journée (cumul d'une journée).

### D. Les lieux

**F11. Pays et régions** *(M, ★★)*
Test point-dans-polygone en Python sur `map_data.geojson` pour afficher « N pays ». À faire seulement si des pilotes volent hors de France ; sinon, sans intérêt. Vérifier sur les données avant de coder.

**F12. Rayon d'action, fidélité, nouveaux sites** *(S/M, ★★)*
- Distance entre le site principal et le site le plus éloigné (haversine).
- Part des vols sur le site principal.
- Nouveaux sites : anneau doré sur la carte, puce « découvert le 12 juillet », colonne dans le tableau des sites.

**F22. Fiche de site** *(M, ★★ ; nouveau ; JSON)*
Clic sur un site (carte ou tableau) : vols, heures, premier et dernier vol, voiles utilisées, meilleur vol, mini-calendrier des mois de pratique. Remplace l'ancienne idée « sites × mois » (F13), peu lisible avec 30 à 57 sites.

### E. Le matériel

**F14. Voiles et instruments** *(S/M, ★★)*
La section est aujourd'hui la plus pauvre (deux tableaux, 4 à 11 ko). Ajouter : barres d'heures intégrées au tableau des voiles, ruban « voile × mois » montrant les périodes d'usage, voile du moment (30 derniers jours), première sortie d'une nouvelle voile signalée comme jalon.

### F. Comparaison et trajectoire

**F15. Comparaison visuelle** *(M, ★★)*
Le tableau est exact mais austère. Ajouter, pour chaque indicateur, un segment horizontal reliant la valeur de chaque année (graphique « haltère ») et une couronne sur la meilleure valeur. **Le radar est abandonné** : normalisation arbitraire, lecture difficile, peu fiable avec des mesures manquantes.

**F16. Section « Depuis tes débuts »** *(M, ★★★)*
`years_available` contient l'historique (AdrienM : 2022 à 2026). Heures et vols par année en barres, cumul de carrière (heures, vols, sites, distance), premier vol enregistré, année record. Une seule variante (pas de discipline × années) : barres empilées parapente / paramoteur.

### G. Le groupe *(optionnel, à valider : décision 2)*

**F17. Les autres pilotes** *(M, ★★)*
Le pkl contient 13 pilotes actifs en 2026 : un percentile n'a pas de sens. Deux formes possibles, à valider avec les pilotes car elles ne sont pas anonymes dans un petit groupe :
- **vols partagés** : « tu as volé 14 jours au même endroit qu'un autre pilote du groupe » (sans nom, ou avec les noms si tout le monde est d'accord) ;
- **repères du groupe** : médiane des heures et des vols, sans classement.
Calcul fait une fois pour tous les pilotes, pas à chaque rapport.

### H. Fiabilité des données

**F18. Transparence chiffrée** *(S, ★★★ ; priorité relevée)*
Plus d'un vol sur quatre n'a pas de plafond en 2026 (28 %), et le texte actuel des limites est inexact (D17). Dans « Données et limites », afficher pour le pilote : vols avec trace GPX, avec fiche seule, sans statistiques (`source_stats`), vols sans coordonnées, date de mise à jour. À côté de chaque record et de chaque moyenne : « sur N vols mesurés ». Pastille « données partielles » quand plus de 20 % des vols n'ont pas la mesure.

---

## 4. La forme : esthétique et lisibilité

### 4.1 Direction artistique : « ciel et thermiques »

Un univers cohérent plutôt qu'un thème générique : ciel en dégradé, nuages doux, courbes de thermiques en filigrane, pictogrammes en trait fin (1,75 px, coins arrondis). Tutoiement conservé, humour discret. L'état actuel (bleu nuit, cartes blanches arrondies) est propre et sert de base ; il lui manque une image forte en tête et des pictogrammes.

### 4.2 Palette : état réel et retouches

La séparation des rôles est faite (T05, T06). Restent des retouches de contraste et de cohérence constatées à l'écran :

| Rôle | État actuel | Retouche |
|---|---|---|
| Parapente / paramoteur (formes) | orange `#ea580c` / cyan `#0891b2` | Échangés le 14 novembre (parapente en orange) |
| Parapente / paramoteur (**fond portant du texte**) | texte blanc ≈ 3,6:1 | `#0e7490` / `#c2410c` pour pastilles et barre de partage (D21) |
| Calendrier clair, niveau 1 | quasi invisible sur case vide | Échelle resserrée vers le foncé, case vide plus claire (D20) |
| Années | bleu plein, violet tirets, gris pointillés | Inchangé |
| Marque / décor | bleu d'accent ; dégradé de progression vers le violet des années | Dégradé accent → accent clair (D23) |
| Hero | bleu nuit, halos cyan et orangé | Devient la scène de ciel (4.4) ; les halos restent du décor |
| Carte sombre | terres vert olive | Ardoise `#26324a` environ, frontières plus claires (D22) |
| Points de carte | indigo en « Tout » | Inchangé ; anneau doré pour les nouveaux sites |
| Records | or, argent, bronze orangé | Bronze plus brun (`#b45309`), icône en plus de la couleur |
| Nouveauté, badge, jalon | — | **Or** `#d97706` (clair) / `#fbbf24` (sombre), réservé à cet usage |

**Vérification à automatiser** (`report_checks.py`) : rapport de contraste de chaque paire texte / fond déclarée, et distinction parapente / paramoteur sous simulation de daltonisme (matrices de Machado avec `numpy`).

### 4.3 Typographie

- Titres : soit une police d'affichage intégrée en base64 (WOFF2, sous-ensemble latin, 25 à 45 ko, licence OFL), soit les polices système avec un travail de graisse et d'espacement. Décision 3.
- Texte des graphiques : passer de 12 à 13 px ; sur téléphone les SVG sont réduits et le texte devient trop petit.
- Chiffres tabulaires conservés.

### 4.4 Le hero

- **Scène SVG inline** : ciel en dégradé, deux ou trois nuages en légère parallaxe, une silhouette de voile qui plane. Statique si mouvement réduit, sobre à l'impression.
- **L'ambiance suit le pilote** : la teinte du ciel dépend de l'heure de décollage médiane (aube, plein jour, fin d'après-midi dorée). Chaque rapport devient unique, et c'est justifié par les données.
- Sous les quatre chiffres : portrait (F1), équivalence (F2), phrase d'avance ou de retard (F20).
- Les compteurs se rejouent au changement de discipline.

### 4.5 Mise en page

- Fonds de section alternés pour rythmer le défilement.
- Pictogramme par section à la place du numéro.
- **Cartes de chiffres** : pictogramme, mini-courbe mensuelle, écart. **Deux colonnes sur téléphone** (une seule aujourd'hui).
- Aide : bouton « ? » rond dans l'en-tête de carte (D14).
- Nouveaux sites, voiles, filtres actifs : puces plutôt que phrases longues (D26).
- Pied de page : remerciement, date, clin d'œil (« Bons vols pour 2027 »).

### 4.6 Graphiques

| Graphique | Évolutions |
|---|---|
| Cumul d'heures | Réticule vertical donnant les valeurs de chaque année à la date survolée ; écart à la même date annoté au trait « aujourd'hui » (F20) ; jalons 25 / 50 / 100 h ; projection en pointillés (F6). **Une seule version par discipline**, les années se masquent par classe CSS (6.2) |
| Barres (mois, jours, heures) | Sans comparaison et en « Tout » : barres **empilées parapente / paramoteur** ; couronne sur la barre maximale |
| Calendrier | Séparateurs de mois ; clic = fiche du jour (I2) ; surlignage des séries (F5) ; mini-mois sur téléphone ; contraste corrigé (D20) |
| Carte | Par zones (I5) |
| Tableaux | **Barres intégrées** dans les cellules numériques (vols, heures) ; médailles sur les vols records ; puce « nouveau » |
| Partage | Barre parapente / paramoteur complétée par les façons de voler (F19) |
| Nouveaux | Histogramme des durées (F7), matrice jour × heure (F8), nuage de points (F9), haltères de comparaison (F15), barres par année (F16) |

### 4.7 Téléphone *(priorité relevée)*

Constat à 375 px : barre collante d'environ 200 px, cartes de chiffres sur une colonne, calendrier coupé, texte des graphiques minuscule.

- Barre sur une ligne : titre court + bouton « Filtres » ouvrant un panneau (discipline, années, thème, impression). Navigation entre sections en bandeau défilant unique.
- Cartes de chiffres en 2 colonnes, hero inchangé (déjà en 2 × 2).
- Calendrier en 12 mini-mois (3 × 4), sans défilement horizontal.
- Zones tactiles ≥ 44 px ; infobulles épinglées au toucher (I4).
- `scroll-padding-top` recalculé sur la hauteur réelle de la barre.

### 4.8 Impression

CSS d'impression conservé. Vérifier que frise, badges et fiche du jour ne se coupent pas (`break-inside: avoid`), que les panneaux ouverts au clic sont masqués, et que le hero reste économe en encre.

---

## 5. Interactions et ludique

### 5.1 Interactions

**I2. Fiche du jour** *(M, ★★★ ; JSON)*
Clic, toucher ou Entrée sur une case du calendrier : panneau avec la date, les vols du jour (heure, site, voile, façon de voler, durée, plafond, lien fiche) et les boutons « jour de vol précédent / suivant ». C'est l'interaction la plus attendue : le calendrier attire le clic et ne répond pas.

**I4. Infobulles riches** *(S/M, ★★)*
Bloc structuré (titre en gras, lignes « Sites », « Voiles », pastille de discipline) au lieu d'une phrase. Au toucher : appui = infobulle épinglée, appui ailleurs = fermeture. Remplacer `cursor: help` par `pointer` sur ce qui se clique.

**I5. Carte par zones, cliquable** *(M, ★★★ ; remplace le zoom libre)*
Les sites se regroupent naturellement en quelques zones (AdrienM : Charente, Alpes, Pyrénées). Plutôt qu'un zoom et un glisser à la souris, coûteux et peu pratiques au doigt :
- regroupement automatique en Python (sites à moins de 80 km environ) ;
- vue d'ensemble avec une bulle par zone, et un bouton par zone affichant sa carte zoomée, où les cercles ne se chevauchent plus ;
- taille des cercles au choix : vols ou heures ;
- anneau doré sur les nouveaux sites ; clic sur un site = fiche de site (F22) et filtre du tableau.
Le fond de carte ne pèse que quelques ko par vue : trois ou quatre zones restent négligeables. Le niveau de détail de Natural Earth devient pauvre en zoom fort (quelques segments de côte) ; un fond plus fin est une option (décision 6).

**I3. Filtres croisés** *(M, ★★★ ; JSON)*
Cliquer un site, une voile, un mois, un jour de semaine ou une façon de voler filtre le tableau des vols et surligne les éléments correspondants ailleurs (cases du calendrier, cercle de la carte). Barre de « filtres actifs » en puces avec ✕. Les graphiques agrégés ne sont pas recalculés : surlignage seulement, ce qui reste compatible avec le pré-rendu.

**I6. Cumul interactif** *(M, ★★)*
Réticule vertical, valeurs de toutes les années, clic sur un jalon pour le détail.

**I7. État dans l'adresse** *(S, ★★)*
Discipline, années, thème et filtres dans le fragment (`#disc=parapente&cmp=2025`), relus à l'ouverture. Fonctionne en `file://`. Bouton « Copier le lien de cette vue ».

**I8. Exports** *(S/M, ★★ ; JSON)*
CSV des vols (`Blob`, hors ligne) ; « Copier mon résumé » en texte ; image de partage en PNG via `<canvas>` (avec le mode récap, L2).

**I1. Rejouer l'année** *(M/L, ★★★ ; JSON)*
Bouton ▶ : les cases du calendrier se colorent jour après jour, le compteur d'heures s'incrémente, les jalons s'allument, les sites apparaissent sur la carte. Curseur de temps, pause, vitesse. À faire après la fiche du jour et les jalons, dont il réutilise les données.

**I10. Raccourcis clavier** *(S, ★ ; nouveau)*
`1` `2` `3` pour la discipline, `t` pour le thème, `←` `→` dans le calendrier, `?` pour la liste. Discret, mais c'est le genre de détail qui rend un rapport agréable.

*Retiré : la visite guidée (ancien I9). Une visite en six bulles est intrusive pour un rapport d'une page. Elle est remplacée par des incitations visibles : bouton « ? », libellé « clique une journée » sous le calendrier, légère pulsation des éléments cliquables à leur première apparition.*

### 5.2 Ludique

**L1. Badges et succès** *(M, ★★★)*
Étagère de médailles, états « débloqué » et « verrouillé avec progression » (« 87 / 100 vols »). Exemples : 10 / 50 / 100 vols, 10 / 50 / 100 h, 5 / 10 / 20 sites, nouveau site, série de 3 / 5 jours, vol de plus de 2 h, plafond au-dessus de 2 000 / 3 000 m, vol avant 9 h, parapente et paramoteur le même jour, premier treuil, record personnel battu, vol chaque mois de l'année. Dictionnaire `BADGES`, libellés dans le fichier de textes. Survol = condition exacte ; clic = vol qui l'a débloqué. Les badges dépendant d'une mesure (plafond) ne s'affichent verrouillés que si la mesure existe.

**L3. Quiz de l'année** *(M, ★★ ; reformulé)*
Cinq questions à trois choix en fin de rapport (« Quel est ton mois le plus actif ? », « Combien de sites différents ? »), réponse révélée avec une petite animation, score final. Placé **après** le contenu et replié par défaut : il ne masque aucune information, contrairement à l'ancienne idée de « deviner avant de voir ».

**L4. Micro-interactions** *(S/M, ★★)*
Podium des records qui s'élève, confettis légers au premier affichage d'un record battu ou au déblocage d'un badge, voile qui traverse l'écran au clic sur le titre, ciel du hero qui vire au crépuscule en thème sombre. Tout est coupé si l'utilisateur demande moins de mouvement.

**L5. Ton éditorial vivant** *(S/M, ★★)*
Phrases adaptées aux résultats : félicitations en cas de progression, encouragement en cas de baisse, clin d'œil pour une longue pause. Le moteur de textes ne connaît que `{{?clé}}…{{/clé}}` : ajouter la forme « sinon » `{{^clé}}…{{/clé}}`. Plusieurs variantes par phrase, choisies de façon déterministe (selon le pilote et l'année) pour que deux rapports ne se ressemblent pas mot pour mot.

**L2. Mode récap** *(L, ★★★)*
Vue plein écran en cartes à faire défiler : chiffre phare, mois star, meilleure journée, site préféré, voile, record, portrait, badges, carte de partage téléchargeable. Complément du rapport détaillé, lancé depuis le hero. À faire en dernier : il réutilise tout le reste.

---

## 6. Architecture et contraintes techniques

### 6.1 Données (`report_data.py`)

Nouvelles clés, groupées : `story` (portrait, jalons, équivalences, journée type, avance / retard), `streaks`, `flight_modes` (façons de voler), `seasons`, `coverage` (transparence), `career`, `records_beaten`, `zones` (carte), `badges`, `group` (optionnel). Calcul pur, sans mise en forme.

### 6.2 Rendu : décision recommandée, le modèle hybride

L'ancienne feuille de route repoussait le choix « pré-rendu ou rendu par le navigateur » à plus tard. Les mesures permettent de trancher :

- le pré-rendu en 12 variantes est la cause du poids (Rythme = 55 %) et il interdit les interactions riches ;
- la liste complète des vols en JSON est petite : environ 150 octets par vol, soit **20 à 30 ko** pour un pilote à 150 vols.

**Recommandation : modèle hybride.**

| Couche | Contenu | Rendu |
|---|---|---|
| Socle pré-rendu (existant) | Hero, chiffres clés, cumul, barres, calendrier, carte, tableaux, records | Python → HTML / SVG, lisible sans JS |
| Socle de données (nouveau) | `<script type="application/json" id="flights">` : un enregistrement compact par vol (date, heure, site, voile, discipline, façon de voler, durée, distance, plafond, vitesses, lien) + jalons, badges, zones | Lu par `report.js` |
| Couche interactive (nouveau) | Fiche du jour, fiche de site, filtres croisés, nuage de points, rejeu, quiz, exports | JavaScript à partir du JSON |

Sans JavaScript, le rapport actuel reste entièrement lisible ; seules les interactions nouvelles disparaissent.

**Allègements du socle pré-rendu** (T39) :
1. N'écrire que `<title>` dans les SVG, pas `data-tip` en double : −120 à −145 ko.
2. Cumul : une version par discipline contenant toutes les années, masquées par une classe CSS posée sur le conteneur (`.cmp-off-1 .sk1 { display: none }`). L'axe est calé sur le maximum de toutes les années. 12 variantes → 3.
3. Calendrier : une infobulle courte dans le SVG ; le détail (sites, voiles) vient du JSON au clic.
4. Activité par mois : à réévaluer une fois 1 à 3 faits ; c'est le plus gros bloc (244 ko pour 24 SVG).

Objectif : revenir vers 600 ko avant d'ajouter du contenu.

### 6.3 Performance

- Délégation d'événements déjà en place pour les infobulles : la conserver.
- `applyState()` parcourt tous les `[data-v-disc]` à chaque clic : acceptable ; à surveiller si le nombre de variantes augmente.
- Minifier CSS et JS à la génération (suppression des commentaires et des espaces, sans dépendance) : gain d'une dizaine de ko, faible priorité.

### 6.4 Autonomie : garde-fou automatique

État actuel vérifié : aucun `<link`, aucun `fetch(`, seuls des `href` vers syride.com. Le figer dans un test (`report_checks.py`) qui échoue s'il trouve `<link`, `src="http`, `url(http`, `@import`, `fetch(`, `XMLHttpRequest`, `import(`.

### 6.5 Accessibilité

Un arrêt de tabulation par graphique (D3), panneaux en `role="dialog"` avec retour du focus et fermeture à Échap, contrastes contrôlés (4.2), `prefers-reduced-motion` respecté partout, `aria-live` discret pour annoncer un changement de filtre.

### 6.6 Notebook et génération

- Paramétrer l'année et le dossier de sortie (`params`), supprimer les imports inutiles et la cellule vide, ne plus recréer `heure_decolage` / `flight_url`.
- Appeler `prepare_report_df(df)` une seule fois pour tous les pilotes.
- `try / except ValueError` par pilote, récapitulatif final (rapports créés, poids, pilotes en erreur).
- Optionnel : `index.html` autonome listant les rapports.

### 6.7 Tests

Générateur de DataFrame synthétique pour les cas limites : un seul vol, une seule discipline, aucune coordonnée, un seul site, pilote sans année précédente, pilote avec 5 années, mesures manquantes, année bissextile, 1ᵉʳ janvier (année en cours presque vide). Les trois pilotes réels utilisés ici (AdrienM : deux disciplines et 31 sites ; j2f : 18 vols sans statistiques ; LiLi06 : 57 sites dont 23 sans trace GPX) forment un bon jeu de contrôle visuel.

### 6.8 Compatibilité

Python 3.8 (environnement actuel) : pas de `match`, pas de `X | Y` dans les annotations évaluées, pas de `list[str]` hors annotations différées. Navigateurs récents, ouverture directe en `file://`, iOS Safari.

---

## 7. Plan par lots

| Lot | Contenu | Effort | Résultat visible |
|---|---|---|---|
| **A. Assainir** | T39, T40, T41, T42, T51, T02, T03, T12 | S à M | Rapport juste, plus léger, plus lisible ; base de tests |
| **B. Téléphone** | T28, T23 | M | Rapport confortable sur téléphone |
| **C. Récit, premier niveau** | T09, T10, T48, T44, T11, T15, T13 | M | Le rapport dit des choses nouvelles dès l'ouverture |
| **D. Identité visuelle** | T16, T19, T22, T47 | M à L | Le rapport a une personnalité |
| **E. Jouer** | T45, T25, T14, T24, T46, T17, T18, T26, T50 | L | Le rapport se manipule et récompense la curiosité |
| **F. Approfondir** | T20, T21, T27, T53, T54, T55, T34, T35, T31, T56 | L | Analyses plus fines |
| **G. Grand spectacle** | T30, T49, T36 | L | Rejeu, quiz, récap partageable |
| **H. Sous condition** | T37, T38 | — | Selon décisions |

Ordre conseillé : **A → B → C → D → E**, puis F et G selon l'appétit. Chaque lot se termine par la régénération des trois pilotes de contrôle et une relecture en clair, sombre et téléphone.

---

## 8. Où modifier quoi

| Fichier | Modifications principales |
|---|---|
| `report_data.py` | Repli de coordonnées, façons de voler, saisons, couverture des mesures, séries, jalons, portrait, équivalences, avance / retard, records battus, historique, zones de carte, badges, enregistrements compacts des vols |
| `report_charts.py` | `<title>` seul, un arrêt de tabulation par graphique, cumul à années masquables, barres empilées, histogramme, matrice jour × heure, haltères, calendrier en mini-mois, carte par zones, mini-courbes |
| `report_html.py` | Nouvelles sections et cartes, hero SVG, frise, étagère de badges, panneaux (jour, site), barre de filtres actifs, panneau « Filtres » mobile, JSON des vols, icône d'onglet |
| `report.css` | Retouches de palette et de contraste, jeton « or », mise en page mobile, nouveaux composants, impression |
| `report.js` | Fiche du jour, fiche de site, filtres croisés, infobulles riches, état dans l'adresse, exports, nuage de points, rejeu, quiz, confettis, raccourcis |
| `report_textes.md` | Corrections (limites, glossaire), textes des nouveautés, variantes, libellés de badges et de portraits |
| `report_format.py` | Équivalences, « sur N vols mesurés », pourcentages de couverture |
| `create_report.ipynb` | Paramètres, boucle robuste, récapitulatif |
| Nouveau : `report_icons.py` | Pictogrammes SVG inline |
| Nouveau : `report_checks.py` | Autonomie, poids par section, contrastes, jeu synthétique |

---

## 9. Critères de validation

- **Autonomie** : le test 6.4 passe ; ouverture hors ligne sans erreur en console.
- **Poids** : ≤ 1 Mo pour un pilote à 150 vols ; aucune section au-delà de 40 % (aujourd'hui Rythme est à 55 %).
- **Justesse** : aucun texte n'affirme un traitement qui n'est pas fait ; chaque moyenne ou record indique sa base quand des mesures manquent ; totaux concordants entre hero, cartes, tableaux et graphiques pour toutes les combinaisons.
- **Accessibilité** : moins de 60 arrêts de tabulation pour parcourir la page ; contrastes AA ; lisible sous simulation de daltonisme.
- **Téléphone** (375 px) : barre collante ≤ 64 px ; aucun défilement horizontal de page ; calendrier entièrement visible ; zones tactiles ≥ 44 px.
- **Impression** : pas de coupure au milieu d'une carte, hero sobre.
- **Robustesse** : tous les cas synthétiques produisent un rapport sans erreur ni section vide trompeuse.
- **Ludique** : un pilote découvre sans aide la fiche du jour et au moins un badge ; aucune animation ne gêne la lecture ; « mouvement réduit » coupe tout ce qui bouge.

---

## 10. Décisions à trancher et pistes de données

1. **Vols sans statistiques (D17)** : les compter dans les totaux en le disant clairement (comportement actuel, texte à corriger), ou les exclure comme le texte l'annonce ? Recommandation : les compter, car le vol a bien eu lieu, et afficher la couverture (F18).
2. **Le groupe (F17)** : montrer des informations croisées entre pilotes (vols partagés, médiane du groupe) ? Avec 13 pilotes, ce n'est pas anonyme : accord des pilotes nécessaire.
3. **Police personnalisée (4.3)** : 25 à 45 ko de plus, ou polices système ?
4. **Modèle hybride (6.2)** : valider le JSON des vols embarqué comme base des interactions. Recommandé.
5. **Ton** : jusqu'où pousser le jeu (quiz, confettis) ? Le quiz est replié par défaut, les confettis limités aux records battus.
6. **Fond de carte détaillé (I5)** : disposez-vous d'un jeu de limites départementales à embarquer après simplification, pour les vues zoomées ?
7. **Mode récap (L2)** : vrai mode plein écran, ou simple section en fin de page ?
8. **PDF** : `generate_pdf_report.py` échoue à l'import (D16). Le corriger ou le retirer du paquet ?
9. **Nouvelles données de scraping** (hors périmètre) : traces GPX simplifiées pour dessiner les vols sur la carte, météo du jour, fuseau horaire explicite de `heure` (permettrait de situer les décollages par rapport au lever et au coucher du soleil, calculables hors ligne à partir de la date et des coordonnées).

---

## 11. Checklist d'implémentation

Méthode inchangée : une tâche à la fois ; après chaque tâche, description de ce qui a changé puis attente des instructions. Les numéros des tâches existantes sont conservés ; les nouvelles commencent à T39.

### Terminé

- [x] **T01** · Docstring de `report_html.py` alignée sur les fichiers réels (D12)
- [x] **T04** · Pastilles d'écart à deux sémantiques (D7)
- [x] **T05** · Orange réservé au paramoteur, marque en bleu d'accent, points de carte neutres (D5)
- [x] **T06** · Années distinguées par le trait et le motif (D6)
- [x] **T07** · Double infobulle supprimée (D1)
- [x] **T08** · Animations déclenchées à l'entrée à l'écran (D2)

### Lot A : assainir

- [x] **T40** · Textes et comportements inexacts : limites (D17), glossaire distance (D18), « Effacer les filtres » qui change la discipline (D24), clic sur un mois annoncé et réversible (D25) · S
- [x] **T41** · Coordonnées de repli `mean_longitude` / `mean_latitude` pour placer tous les sites (D19) · S — LiLi06 : 50 sites placés sur 57 (34 avant)
- [x] **T42** · Contrastes et cohérence de palette : calendrier niveau 1, texte sur cyan / orange, carte sombre, dégradé de progression, bronze (D20 à D23) · S
- [x] **T39** · Allègement : `<title>` seul, cumul en une version par discipline, infobulle courte du calendrier (D27, 6.2) · S/M — `<title>` seul et cumul en 3 variantes faits ; l’infobulle du calendrier garde sites et voiles (la fiche du jour donne le détail)
- [x] **T51** · Icône d'onglet intégrée, raccourcis clavier (D28, I10) · S — *fait : icône SVG en `data:` URI ; raccourcis `1` `2` `3`, `t`, `?` (panneau d'aide)*
- [x] **T02** · Notebook : paramètres, imports, `prepare_report_df` une seule fois, récapitulatif (D13) · S — *fait : cellule de paramètres, imports allégés, `prepare_report_df` une seule fois (`df.attrs`), récapitulatif des poids*
- [ ] **T03** · `report_checks.py` : test d'autonomie, poids par section, contrastes, jeu de données synthétique (6.4, 6.7) · M
- [x] **T12** · Un seul arrêt de tabulation par graphique, flèches pour se déplacer (D3) · S/M — calendriers, barres et carte : un arrêt par graphique, flèches, Début / Fin (fait avec T28)

### Lot B : téléphone

- [x] **T28** · Barre collante sur une ligne avec panneau « Filtres », cartes de chiffres en 2 colonnes, calendrier en mini-mois (D10, D29, 4.7) · M — barre de 205 px → 57 px à 375 px ; volet « Filtres » sous 1180 px
- [x] **T23** · Infobulles riches, épinglables au toucher (I4, D15) · S/M — *fait : infobulles en bloc (titre, pastille de discipline, lignes) ; celles du calendrier calculées en JS depuis `#flights-data` (−60 ko sur le plus gros rapport)*

### Lot C : récit, premier niveau

- [x] **T48** · Avance ou retard sur l'an dernier (F20) + ton éditorial à variantes et forme « sinon » (L5) · S/M
- [x] **T09** · Équivalences dans le hero, conditionnées à la couverture des mesures (F2) · S — Everest et distance seulement si la mesure couvre ≥ 80 % des vols
- [x] **T10** · Meilleure journée, journée type, vol de l'année (F4) · S
- [x] **T44** · Façons de voler et saisons (F19, F21) · S
- [x] **T11** · Transparence chiffrée : couverture des mesures, « sur N vols mesurés », pastille « données partielles » (F18) · S — *fait : tableau de couverture dans « Données et limites », « sur N vols mesurés », pastille « Données partielles » (> 20 % manquants)*
- [x] **T15** · Séries et régularité (F5) · S/M — *fait : tuiles au-dessus du calendrier (plus longue série, plus longue pause, meilleure semaine en heures et en vols, régularité) qui allument les jours concernés*
- [x] **T13** · Médianes + histogramme des durées (F7, D9) · S/M — *fait : carte « Durée de tes vols » (histogramme par tranches, vol médian repéré) et ligne de médianes ; cartes de chiffres non modifiées*

### Lot D : identité visuelle

- [x] **T16** · Cartes de chiffres : pictogrammes, mini-courbes, bouton « ? », fonds de section alternés (4.5, D14) · M — *fait : pictogrammes et mini-courbes (dessinées en JS) dans les cartes de chiffres, bouton « ? » rond, fonds de section alternés, pictogramme de section*
- [x] **T19** · Hero : fond bleu nuit, halo de la discipline principale, courbes de niveau en filigrane (`hero_topo`) · M — *la scène de ciel (nuages, voile, ambiance selon l'heure) a été jugée trop artisanale et remplacée le 14 novembre*
- [x] **T22** · Barres empilées parapente / paramoteur, couronne sur le maximum (4.6) · M — *fait le 14 novembre : empilement en « Tout » sans année comparée (pilotes à deux disciplines) ; pas de couronne, valeur du maximum en gras et en or (`--gold-text`) avec mention dans l'infobulle ; +20 ko*
- [x] **T47** · Tableaux enrichis : barres intégrées, médailles, puces des nouveaux sites, colonne façon de voler (4.6, D26) · S/M — *fait le 14 novembre : barres fines sous « Vols » et « Temps de vol » (sites, voiles, instruments), posées en JS ; pas de médaille, records de l'année en gras et en or dans le tableau des vols ; nouveaux sites en puces datées, repliées au-delà de 8 (`NEW_SITES_SHOWN`) ; +4 ko. Le plus lourd des 151 rapports : 951 ko (marge ≈ 45 ko)*

### Lot E : jouer

- [x] **T45** · Socle JSON des vols embarqué (6.2) · S — ≈ 140 octets par vol (19 ko pour AdrienM)
- [x] **T25** · Fiche du jour au clic sur le calendrier (I2) · M
- [ ] **T14** · État du rapport dans l'adresse + « Copier le lien de cette vue » (I7) · S
- [ ] **T24** · Export CSV, « Copier mon résumé » (I8) · S
- [x] **T46** · Carte par zones, taille par vols ou heures, nouveaux sites, fiche de site (I5, F12, F22) · M/L — rayon d’action (part de T35) et fiche de site inclus ; la vue d'ensemble montre tous les sites à leur position, chaque zone entourée d'un halo cliquable (14 novembre)
- [x] **T17** · Frise des jalons (F3) · M
- [x] **T18** · Portrait du pilote, seuils calés sur les pilotes réels (F1) · M — 9 portraits principaux différents sur 26 pilote × année
- [ ] **T50** · Micro-interactions : podium animé (L4) · S/M — *confettis, badges et voile au clic retirés avec les badges et la scène de ciel*

### Lot F : approfondir

- [x] **T20** · Records battus cette année, avec écart (F10) · M
- [x] **T21** · Section « Depuis tes débuts » (F16) · M
- [x] **T27** · Cumul interactif : réticule, jalons (I6) · M — *fait le 14 novembre : réticule (souris, toucher, clavier) avec les valeurs de toutes les années visibles et l'écart ; jalons de la frise en losanges sur la courbe, clic = fiche du jour ; tout en JS (+13 ko)*
- [x] **T53** · Matrice jour × heure (F8) · M — *fait le 14 novembre : carte « Tes créneaux de vol » (tableau 7 jours × heures utiles, totaux en marge, créneau favori) qui remplace les deux histogrammes quand aucune année n'est comparée ; −12 ko*
- [x] **T54** · Nuage de points des vols (F9) · M — *fait le 14 novembre : carte dans « Tes records », durée × plafond ou durée × distance (pas de vitesse moyenne : distance Syride trop floue), cercle = parapente, losange = paramoteur, records entourés, clic = fiche du jour ; +9 ko. Le plus lourd des rapports 2025-2026 : 962 ko (marge ≈ 38 ko)*
- [x] **T55** · Matériel : barres d'heures, ruban voile × mois, voile du moment (F14) · S/M — *fait le 14 novembre : carte « Tes voiles au fil des mois » dessinée en JS depuis `#flights-data` (heures par voile et par mois, clic = fiche du jour), « voile du moment » sur 30 jours ; barres d'heures et jalon « nouvelle voile » existaient déjà. Commentaires de ligne entière retirés du CSS/JS au build (−21 ko)*
- [ ] **T34** · Comparaison visuelle en haltères, couronne sur la meilleure année (F15) · M
- [ ] **T35** · Rayon d'action, fidélité ; pays visités seulement si des vols hors de France existent (F11, F12) · S/M — *en partie : rayon d’action et fidélité faits avec T46 ; pays visités à faire si utile*
- [ ] **T31** · Projection de fin d'année et objectif saisissable (F6) · M
- [x] **T56** · Filtres croisés avec surlignage (I3) · M/L — *fait le 14 novembre : filtres site (fiche de site), voile (tableau et ruban), mois, jour de semaine (matrice), façon de voler, combinés en ET ; puces ✕, pastille « Voir les n vols », surlignage du calendrier, de la carte et du ruban. Non surlignés faute de place : tableaux sites/voiles, barres de mois, matrice. Plus lourd des rapports 2025-2026 : 957 ko (marge ≈ 40 ko)*

- [x] **T57** · Barre allégée et sommaire latéral · M — *fait le 14 novembre à la demande du pilote : barre en trois zones (bouton sommaire « ☰ section ▾ » sous 1280 px, discipline et années au centre, menu « ⋯ » pour thème, impression, raccourcis), sommaire collant dans la marge gauche à partir de 1280 px, « Revenir en haut » flottant en bas à droite. Anneau des nouveaux sites en tirets (distinct du parapente, désormais orange). +5,7 ko : le plus lourd des rapports fait 962 ko (marge ≈ 38 ko)*

### Lot G : grand spectacle

- [x] **T30** · « Rejouer l'année » (I1) · M/L — *fait le 14 novembre : bouton dans le hero et « Tes jalons », vue plein écran (clones du calendrier et de la carte, compteurs, jalons), lecture / pause, curseur, vitesses ×1 ×2 ×4 ; totaux identiques au hero. JS désindenté au build (−18 ko)*
- [ ] **T49** · Quiz de l'année (L3) · M
- [x] **T36** · Mode récap en pages + image de partage (L2, I8) · L — *fait le 14 novembre : décision 7 = plein écran lancé du hero ; jusqu'à 9 pages (`#recap-data` formaté en Python), image PNG 1080 × 1350 via `<canvas>`. Plus lourd des rapports : 980 ko (marge ≈ 20 ko)*

### Lot H : sous condition

- [ ] **T37** · Le groupe : vols partagés, repères, **si validé** (F17, décision 2)
- [ ] **T38** · Rendu complet par le navigateur, **seulement si** le modèle hybride ne suffit pas (6.2)

### Retiré

- ~~**T29**~~ · Optimisation du poids de la carte : elle pèse 1 % du fichier. La lisibilité est traitée par T46.
- ~~**T33**~~ · Carte à zoom libre : remplacée par la carte par zones (T46), plus simple et utilisable au doigt.
- ~~**T32**~~ · Visite guidée : remplacée par des incitations visibles (bouton « ? », libellés, pulsation).
- ~~Radar de profil~~ (ancien T34) : remplacé par les haltères.
- ~~Sites × mois~~ (F13) : remplacé par la fiche de site.
- ~~Thème « Ciel »~~ : un troisième thème n'apporte rien de plus que le hero.
- ~~**T26**~~ · Badges et succès (L1) : implémentés puis retirés à la demande du pilote (14 novembre) ; pas de médailles ni de confettis.
- ~~Scène de ciel du hero~~ (première version de T19) : nuages, voile animée et ambiance selon l'heure jugés trop artisanaux ; remplacés par un fond sobre.
- ~~Percentile de communauté~~ : sans objet avec 13 pilotes.
