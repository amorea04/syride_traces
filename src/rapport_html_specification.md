# Rapport HTML « Mon année de vol » : descriptif à valider

> Document de travail. Rien n'est encore généré : le but est de valider la structure, le contenu
> et les choix techniques avant de coder. Les éléments marqués **[à confirmer]** sont des points
> où je ne veux pas inventer (définitions Syride, choix de ta part).

## 1. Objectif

Un fichier `.html` unique, à ouvrir dans un navigateur (ou à envoyer par mail), qui raconte
l'année de vol d'un pilote : **didactique** (on comprend ce que l'on regarde), **informatif**
(chiffres, records, tendances) et **soigné** (lisible sur téléphone, agréable à parcourir).

Périmètre par défaut : **un pilote × une année**, comme le PDF actuel. Le rapport est généré
depuis le même `global_flights_data.pkl` que l'application Dash.

## 2. Point de départ : ce que contient déjà le PDF

D'après `report_functions.py` (le notebook `create_report.ipynb` n'est pas encore relu) :

- **Chiffres généraux** : nombre de vols, temps total, dates du premier et du dernier vol,
  répartition parapente / paramoteur (nombre de vols et temps, en %), distance totale / moyenne /
  maximale, vitesse moyenne et maximale, plafond moyen et max, vario max, facteur g, nombre de sites.
  Les records renvoient vers la fiche Syride du vol concerné.
- **Graphiques** : courbe des heures de vol cumulées, calendrier mensuel des vols (couleur selon le
  type de vol), barres par mois / jour de la semaine / heure de décollage.
- **Tableaux** : sites pratiqués, voiles utilisées.
- **Trois chapitres** : général, parapente, paramoteur.

Le HTML reprend tout cela et ajoute : mise en récit, explications, comparaison avec l'année
précédente, liste complète des vols.

## 3. Prérequis : corrections communes au PDF et au HTML

| Problème constaté | Correction prévue |
|---|---|
| Le PDF lit `flight_url` et `heure_decolage`, que le pipeline ne produit pas | Les calculer dans une étape de préparation du rapport (`flight_url` depuis `pilote` + `num_activite`, `heure_decolage` depuis `heure`), **sans modifier le pkl** |
| Chemins `/Users/Adrien/...` codés en dur (logo, couverture, dossier de sortie) | Paramètres dans `params_scrap_syride.py` |
| `applymap` (supprimé dans pandas 3) | `DataFrame.map` **[à confirmer : version de pandas]** |
| Vols Syride dont la fiche n'a pas été lue : absents du pkl | Mention explicite dans la section « Données et limites » |

## 4. Données utilisées

| Colonne du pkl | Usage |
|---|---|
| `date`, `annee`, `mois`, `jour_semaine`, `saison` | Calendrier, rythme, saisons |
| `heure` (heure de décollage) | Répartition par heure (`heure_decolage` dérivée) |
| `duree_vol_minutes` | Temps de vol (totaux, moyennes, cumul) |
| `type_vol` | Parapente / paramoteur |
| `site`, `longitude`, `latitude` | Sites, carte des sites |
| `voile`, `instrument` | Matériel |
| `distance_cumulee`, `vitesse_max`, `vitesse_moyenne`, `plafond`, `gain`, `vario_max`, `g_max` | Performances et records |
| `pilote`, `num_activite` | Lien vers la fiche Syride du vol |

Cas limites à traiter proprement : année sans vol, un seul vol, parapente ou paramoteur absent,
vols sans coordonnées, valeurs manquantes. Une section sans donnée est **masquée**, jamais affichée vide.

## 5. Structure de la page

La navigation se fait par un menu fixe en haut (ancres) ; chaque section a un titre, une phrase
d'interprétation générée à partir des données, puis la visualisation.

| # | Section | Contenu | Visualisation |
|---|---|---|---|
| 1 | **En-tête** | Titre, pilote (lien Syride), année, période couverte, date de génération | 4 chiffres « héros » : vols, heures, sites, kilomètres |
| 2 | **L'année en un coup d'œil** | Phrase de synthèse, jours de vol, durée moyenne, plafond max | Cartes de chiffres animées |
| 3 | **Le rythme de l'année** | Courbe cumulée, calendrier, mois les plus actifs, plus longue période sans voler | Courbe d'aire, calendrier annuel (une case par jour), barres par mois |
| 4 | **Quand vole-t-on ?** | Jour de la semaine, heure de décollage, saisons | Barres, « horloge » des heures de décollage |
| 5 | **Où ?** | Sites les plus fréquentés, nouveaux sites de l'année | Tableau triable, barres, carte schématique (points proportionnels au nombre de vols) |
| 6 | **Avec quoi ?** | Voiles et instruments : vols, heures, vitesse moyenne | Tableaux, barres de répartition |
| 7 | **Performances et records** | Top 5 par critère (plafond, vitesse max, distance, vario, g, durée), avec lien vers la fiche | Podiums / listes classées |
| 8 | **Parapente et paramoteur** | Les mêmes indicateurs séparés par discipline | Onglets (général / parapente / paramoteur) |
| 9 | **Par rapport à l'an dernier** | Évolution en % (vols, heures, sites, records) | Flèches et barres comparées ; section masquée si pas d'année précédente |
| 10 | **Tous les vols** | Liste complète | Tableau avec tri, filtre par type, recherche par site ou voile |
| 11 | **Glossaire, données et limites** | Définitions, méthode, vols exclus, date de mise à jour | Texte |

## 6. Textes générés automatiquement

Les phrases sont construites par des règles (pas d'IA au moment de la génération), donc
reproductibles. Exemple de synthèse :

> En 2025, tu as volé **42 h 18 min** réparties sur **61 vols** et **9 sites**. Ton mois le plus
> actif est **juillet** (14 vols). Ton plus haut vol a atteint **2 450 m**.

Règles : singulier/pluriel, formats français (`42 h 18 min`, espace avant l'unité, virgule décimale),
aucune phrase quand la donnée manque, ton neutre (« tu » ou « le pilote » selon le rapport **[à confirmer]**).

## 7. Encarts didactiques (brouillon)

Dans les sections concernées, un encart repliable « Comment lire ceci ? ». Définitions prévues :

- **Vario max** : vitesse ascensionnelle maximale atteinte, en m/s.
- **Facteur g** : accélération ressentie, en multiples du poids ; 1 g = au repos.
- **Plafond** : altitude maximale du vol.
- **Gain** : **[à confirmer : définition exacte de Syride]**
- **Distance cumulée** : **[à confirmer : définition exacte de Syride]**
- **Vitesse moyenne / maximale**, **vol parapente / paramoteur** : règle de classement utilisée
  par le pipeline (type « Vol moteur » = paramoteur, quelques voiles forcées).

Ces textes seront dans un fichier markdown **éditable sans toucher au code** (voir §9).

## 8. Design

- **Ambiance** : ciel et orange (clin d'œil à l'app actuelle), fond clair très doux, cartes
  arrondies avec ombres légères, beaucoup d'espace.
- **Couleurs des disciplines** : parapente / paramoteur / les deux, dans une palette lisible par
  les daltoniens (le PDF utilise vert / rouge / violet, difficile à distinguer).
- **Typographie** : polices système (aucun chargement externe), grands chiffres pour les héros.
- **Thème sombre** automatique selon le navigateur, avec bouton de bascule.
- **Animations sobres** : compteurs qui s'incrémentent, barres qui se remplissent, désactivées si
  l'utilisateur demande moins d'animations.
- **Responsive** : lisible sur téléphone (cartes empilées, tableaux défilables).
- **Impression / export PDF du navigateur** : feuille de style dédiée, sections sans coupures
  disgracieuses.
- **Accessibilité** : contrastes suffisants, textes alternatifs, navigation clavier, info jamais
  portée par la couleur seule.

## 9. Architecture technique proposée

```
report_data.py      préparation : filtre pilote/année, colonnes dérivées, tous les indicateurs
                    (retourne des dictionnaires : testable sans HTML)
report_charts.py    graphiques en SVG (courbe, calendrier, barres, carte schématique)
report_html.py      assemblage : textes markdown + données + graphiques -> un seul fichier .html
report_textes.md    textes du rapport (titres, phrases à trous, glossaire) : modifiable à la main
```

- **Markdown + données** : `report_textes.md` contient les textes avec des repères, par exemple
  `{{nb_vols}}` ou `{{graphique: calendrier}}`. Le générateur remplit les repères avec les données,
  convertit le markdown en HTML et insère les graphiques. Tu peux donc retoucher le discours
  sans lire le code.
- **100 % autonome** : CSS, JavaScript et graphiques sont dans le fichier, aucune requête
  externe : il s'ouvre hors ligne. Les graphiques sont des SVG générés par Python, avec un peu de
  JavaScript pour les infobulles, le tri des tableaux, les onglets et le thème. Taille attendue :
  de l'ordre de quelques centaines de Ko (estimation, à mesurer).
- **Appel depuis le notebook** : une seule fonction, par exemple
  `build_report(df, pilot="AdrienM", year=2025, output="rapport.html")`.
- **Vérifications** : tests sur données synthétiques (année vide, un seul vol, un seul type de vol)
  et ouverture du HTML généré pour contrôle visuel.

## 10. Décisions par défaut (dis-moi si tu veux changer)

| Sujet | Choix par défaut | Alternative |
|---|---|---|
| Graphiques | SVG maison : léger, hors ligne, imprimable | Plotly intégré : plus interactif (zoom), mais le fichier pèse plusieurs Mo |
| Carte des sites | Fond géographique vectoriel Natural Earth intégré au HTML, hors ligne | Fond de carte détaillé OpenStreetMap : nécessite internet à l'ouverture |
| Périmètre | Un pilote × une année | Rapport multi-années ou multi-pilotes |
| Comparaison | Avec l'année précédente si elle existe | Sans comparaison |
| Langue du ton | Tutoiement | Vouvoiement ou 3ᵉ personne |

## 11. Plan de réalisation

1. **Préparation des données** (`report_data.py`) avec tests sur données synthétiques.
2. **Graphiques SVG** (`report_charts.py`).
3. **Assemblage et design** (`report_html.py`, `report_textes.md`), premier rapport complet à relire.
4. **Itérations** sur le rendu : tes retours sur le contenu, les couleurs, les textes.
5. **PDF amélioré** : après lecture du notebook, correction du PDF existant et réutilisation
   de `report_data.py` pour que PDF et HTML affichent exactement les mêmes chiffres.

## 12. Ce dont j'ai besoin

- Le notebook `create_report.ipynb`, pour voir comment le PDF est appelé (choix du pilote et de
  l'année, chemins).
- Les versions de `pandas` et de `fpdf2` utilisées (`pip list`).
- Tes remarques sur ce descriptif : sections à ajouter, retirer ou renommer.
