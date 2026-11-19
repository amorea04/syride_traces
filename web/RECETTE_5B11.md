# Recette croisée 5B.11 : Bilan web × rapport HTML

Date de la recette : 19 novembre 2026. Branche `web/phase-5b-bilan`.

## Résultat global

Sur les 3 couples testés, **toutes les phrases du récit** (synthèse, meilleur jour, journée type, rythme, quand, où, matos, records, persona, écart, équivalences, jalons) sont **identiques** au rapport, et les chiffres le sont aussi, à **trois familles d'écarts près**, toutes expliquées ci-dessous :

1. **Site « vide » compté par le Python** (AdrienM : 34 sites dans le rapport, 33 dans le Bilan). Le Bilan a raison, le Python est à corriger.
2. **Durées à la minute près** : le Bilan lit des durées arrondies à 0,1 min, le rapport les lit exactes. Écart de ±1 min sur certains totaux.
3. **Contenus du rapport non repris par le Bilan** (choix de conception) ou **découpés différemment** (tableau des sites et zones par discipline).

Deux petites corrections ont été faites côté front (voir §5). Aucune modification de `src/rapport/` ni de `src/web_export/`.

## 1. Couples testés

| Couple | Pourquoi | Vues comparées |
|---|---|---|
| AdrienM 2025 | pilote de référence, 120 vols, nouveaux sites, 3 records battus | Tout, Parapente, Paramoteur |
| j2f 2025 | 112 vols, voile « inconnue », 2 records battus | Tout, Parapente, Paramoteur |
| JJvole 2025 | surtout paramoteur (11 vols sur 16), peu de vols (couverture partielle de la distance) | Tout, Parapente, Paramoteur |

Les trois années sont **entières** (coupure 2025-12-31), donc la coupure est la même dans le rapport et le Bilan quels que soient les jours de génération. Années comparées : 2024 et 2023 (les 2 années précédentes où le pilote a volé, pour les 3 pilotes), côté rapport (variante « 2024,2023 ») comme côté Bilan (`?comparer=2024,2023`). Les cas « année en cours » (écart à date) ne sont pas couverts par cette recette.

## 2. Méthode

1. **Données fraîches.** Le `meta.json` des insights datait du 15 novembre alors que le pkl a été modifié le 19. Tout a donc été régénéré : `python src/export_web.py` (flights, sites, insights ; 9 584 vols, 150 fichiers d'insights ; fichiers générés, ignorés par git). Les 3 rapports ont été régénérés avec `python src/rapport/generate_reports.py --pilot <P> --year 2025 --format html --output <scratchpad>/recette` à partir du même pkl. Rien n'a été écrit dans `html_reports/`.
2. **Bilan** : serveur de développement sur le port 5193 (arrêté à la fin), pages `/pilote/<slug>/2025?activite=<tout|parapente|paramoteur>&comparer=2024,2023` ouvertes avec Playwright (script dans le scratchpad), texte et tableaux des sections extraits (les « Voir les données » sont dépliés).
3. **Rapport** : parsé en Python (BeautifulSoup). Le rapport contient une variante pré-rendue par discipline et par combinaison d'années comparées ; on prend celle qui correspond.
4. **Comparaison** : scripts dans `/private/tmp/claude-502/-Users-Adrien-Documents-paramoteur-syride-analyze-traces-syride-traces/3133b515-f9b0-4f87-b6e6-847f73503572/scratchpad/recette/` (`cmp3.py` : toute phrase du rapport est cherchée dans la page web ; `cmp4.py` : KPI, persona, écart, cartes et pastilles, tableau de comparaison, jalons, cumul, saisons, mois, jours, heures, voiles, instruments ; `cmp5.py` : records, couverture, zones ; `cmp2.py` : tableau des sites ; `eq.mjs` : équivalences). 9 vues (3 couples × 3 disciplines), environ 45 contrôles par vue.

## 3. Éléments comparés

Légende : **=** identique ; **E1** à **E7** : écart justifié (§4) ; **corrigé** : corrigé côté front pendant la recette.

| Élément | AdrienM | j2f | JJvole | Remarque |
|---|---|---|---|---|
| En-tête : 4 KPI (vols, heures, sites, km) | E1 (sites) | E2 (heures, vue Parapente) | = | |
| Note « sur N vols mesurés » sous les km | corrigé | corrigé | corrigé | absente du Bilan, ajoutée (§5) |
| Persona (étiquette, justification, traits secondaires) | = | = | = | texte du récit |
| Phrase d'écart et note | = | = | = | |
| Équivalences (phrases et ordre, bouton ↻ et bouclage) | = | = | = | rapport = insights = Bilan, 9 vues |
| 8 cartes d'aperçu : jours de vol, durée moyenne, plafond, vitesse | = | E2 (durée moyenne, 1 pastille, Parapente) | = | |
| 4 autres cartes (vols, temps, sites, distance) | E1, E2 | E2 | E2 | le rapport les met dans l'en-tête et le tableau de comparaison ; comparées là |
| Pastilles d'écart par année comparée | = hors E1, E2 | = hors E2 | = hors E2 | signes, flèches et pourcentages |
| Synthèse, meilleur jour, journée type | = | = | = | |
| Vol de l'année (durée, date, site, voile, plafond, distance) | = | = | = | séparateurs différents seulement |
| Jalons (nombre, dates, titres, détails) | = | = | = | 9 vues |
| Rythme : texte, série, pause, meilleure semaine, régularité | = | = | = | formats différents (« 9,5 h » et « 9 h 28 min »), mêmes valeurs |
| Rythme : cumul mensuel de l'année et totaux finaux | = | E2 (1 mois à 0,1 h) | = | |
| Rythme : série de semaines, part du week-end | E5 | E5 | E5 | non repris |
| Rythme : médianes et répartition des durées | E5 | E5 | E5 | non repris |
| Quand : texte, vols par mois (3 années), par jour de semaine, par heure | = | = | = | |
| Quand : saisons (heures, vols, dominante) | = | = | = | |
| Où : texte, site principal, portée, part du site principal | = | = | = | texte du récit |
| Où : nombre de sites et de nouveaux sites | E1 | = | = | |
| Où : tableau des sites en vue « Tout » (vols, nouveaux) | E1 | = | = | durées : E2 |
| Où : tableau des sites en vue Parapente ou Paramoteur | E3 | E3 | E3 | |
| Où : zones (noms, vols) | = (vue Tout) / E3 | = / E3 | = / E3 | le Bilan = `map_zones` des insights par discipline |
| Où : date de découverte des nouveaux sites | E5 | E5 | E5 | non reprise (marque « nouveau » seulement) |
| Matos : voiles (vols, temps, durée, vitesse, gain, vario, g) | = | E2 (1 minute) | = | |
| Matos : instruments | = | E2 | = | |
| Matos : nouvelles voiles | = (aucune) | = (aucune) | = (aucune) | non exercé : aucune nouvelle voile sur les 3 couples |
| Matos : phrase « Un vol sur trois sur site » | E5 | E5 | E5 | non reprise (le Bilan affiche les parts par mode) |
| Records : top 5 × 6 critères (dates, sites, voiles, valeurs) | E2 (1 ligne) | = | = | |
| Records : « Nouveau record ! », écart, ancien record, « Données partielles » | = | = | = | AdrienM 3 records battus, j2f 2 |
| Comparaison KPI × années (10 lignes, pastilles) | E1, E2 | E2 | E2 | |
| Comparaison : « Données partielles » dans le tableau | corrigé | | corrigé | manquait dans le Bilan (§5) |
| Couverture des données (GPX, fiche seule, sans stats, placés, 6 mesures) | = | = | = | |
| Couverture : date « Données mises à jour le » | E4 | E4 | E4 | 19 novembre (rapport) / 8 novembre (Bilan) |
| Section « Depuis tes débuts » (carrière) | E5 | E5 | E5 | hors périmètre du Bilan (§5.4 bis) |

## 4. Écarts justifiés

### E1. « 34 sites » (rapport) contre « 33 sites » (Bilan), AdrienM 2025 : le Bilan a raison

**Statut : corrigé (D18, 19/11/2026).** `report_data.prepare_report_df` normalise `site` (strip ; vide, « nan », « none » deviennent NA) et tous les décomptes l'ignorent ; le vol reste compté (durée, km). AdrienM 2025 : 33 sites, 24 nouveaux. L'export web mettait déjà ces vols à `null`.

**Ce n'est pas un site « nan ».** Aucune valeur manquante dans la colonne `site` d'AdrienM 2025. C'est **une chaîne vide** : le vol du **10 mars 2025 à 17 h 52** (`num_activite` 2922240, 44 min, paramoteur) a `site == ''`. Le pkl contient 3 vols dans ce cas (AdrienM, DavidParatrucs79, air race pro).

- **Rapport (Python)** : `d["site"].nunique()` compte `''` comme un site (`src/rapport/report_data.py` lignes 205 et 828) ; `site_counts = s["site"].astype(str).value_counts()` (ligne 940) et `n_new_sites = len(set(s["site"]) - known_sites)` (ligne 1191) le comptent aussi. Conséquences visibles dans le rapport : en-tête « 34 sites », phrase de synthèse « 34 sites », persona « Explorateur · 34 sites différents, dont 25 nouveaux », texte « Tu as découvert 25 nouveaux sites », « Sites différents 34 » (+79 % et +240 % au lieu de +74 % et +230 %), « 5 zones · 34 sites », et une ligne de tableau **sans nom** (« : 1 vol · 44 min · nouveau site, découvert le 10 mars »). Les insights exportés en portent la trace : `new_sites` contient `{"site": "", "first_date": "2025-03-10"}` et la liste des sites d'une zone contient `""`. Même effet en vue Paramoteur (13 contre 12).
- **Bilan (TS)** : l'export web range ce vol sans site (identifiant nul) ; `computeKpis` ne compte que des sites nommés : 33 (24 nouveaux dans le tableau). Le tableau des sites est identique ligne à ligne aux 33 sites nommés du rapport, et les pastilles 2024 (19) et 2023 (10) sont les mêmes.
- **Qui a raison** : le Bilan. Un vol sans site n'est pas un 34ᵉ site.
- **Effet à connaître** : tant que le Python n'est pas corrigé, **la page du Bilan est incohérente avec elle-même** pour AdrienM (carte « Sites différents » et KPI d'en-tête : 33 ; phrases du récit : 34 et « 25 nouveaux » pour 24 sites marqués « nouveau »). Je n'ai pas aligné le front sur le Python : on y copierait l'erreur et on casserait la cohérence avec les autres pages.
- **Correction proposée (Python, non faite)** : dans `report_data.prepare_report_df` (ligne 97), normaliser une fois la colonne `site` (`strip`, puis `''`, `nan`, `None` → `NA`) et passer en `dropna()` avant `nunique`, `value_counts`, `known_sites`, `new_sites` et la constitution des zones. Puis régénérer rapports et insights. À défaut, corriger à la source (scraper) en ne laissant pas de site vide.

### E2. Durées à ±1 minute : précision d'export 0,1 min

**Statut : corrigé (D18).** `duration_min` est exporté avec 4 décimales (secondes entières à 0,003 s près) : totaux et durées affichées identiques au rapport. Poids de `flights.json` : environ 887 Ko brut / 237 Ko gzip avant, 906 Ko / 240 Ko après (+18 Ko brut, +3 à 7 Ko gzip).

L'export `flights.json` stocke `duration_min` arrondi à 0,1 min (`src/web_export/flights.py`, `_duration`), alors que le rapport somme les minutes exactes. Chaque vol porte jusqu'à 0,05 min d'erreur ; les erreurs s'additionnent dans les totaux, et un arrondi à la minute peut basculer. Exemples : AdrienM 2024 « 72 h 07 » (rapport, 4 327,02 min) contre « 72 h 08 » (Bilan, 4 327,5) ; vol de 1 h 45 min 27 s affiché « 1 h 46 » ; j2f Parapente 2025 « 31 h 58 » contre « 31 h 57 » (1 917,88 min exactes, 1 917,2 après export, des valeurs comme 3,55 devenant 3,5). Des pastilles de durée moyenne en découlent (+1 036 % contre +1 035 %, +116 % contre +117 %).

Tous les écarts relevés sont de **1 minute** (ou 1 point de pourcentage sur une pastille). Ils ne se corrigent pas côté front : l'information n'est pas dans les données chargées.
**Correction proposée (Python)** : exporter `duration_min` avec 2 décimales (erreur ≤ 0,005 min par vol), ou en secondes entières. Poids du fichier : quelques dizaines de Ko bruts.

### E3. Tableau des sites et zones par discipline

Le rapport affiche **un seul tableau de sites et une seule carte** (toute l'année, toutes disciplines) quelle que soit la discipline choisie ; seules les phrases changent. Le Bilan, lui, applique le filtre « activité » au tableau et utilise les `map_zones` des insights **par discipline** (le récit « où » de la discipline en parle). En vue « Tout », tableau et zones sont identiques (aux durées E2 près). En vue Parapente ou Paramoteur, le Bilan est plus cohérent avec le texte affiché (ex. AdrienM Paramoteur : 12 sites, 2 zones « Magnac Lavalette » et « Pompignan 02 » comme dans `by_disc.paramoteur.map_zones`). Quand il n'y a qu'une zone, le Bilan n'affiche que le bouton « Tout », comme le rapport qui ne dessine des zones que pour plusieurs groupes éloignés.

### E4. « Données mises à jour le » : 19 novembre (rapport) contre 8 novembre (Bilan)

**Statut : corrigé (D18).** Nouveau champ `meta.data_refreshed_at` (max de `date_update`, comme le rapport) affiché dans l'en-tête, le pied de page, le Bilan (« Comprendre les chiffres ») et À propos ; `data_updated_at` reste la date du dernier vol (références « à date »), affichée « Dernier vol le … » sur À propos.

Le rapport affiche le maximum de la colonne `date_update` du pkl (ici 2026-11-19). Le Bilan (et le pied de page de l'application) affiche `meta.data_updated_at`, qui est la **date du vol le plus récent** (`src/web_export/meta.py`). Ce sont deux notions différentes sous un même libellé. **Décision proposée** : soit ajouter au `meta.json` un champ de date de mise à jour réelle (max de `date_update`), soit renommer le libellé en « Dernier vol le … ». Non corrigé : touche au schéma ou aux libellés partagés.

### E5. Contenus du rapport non repris dans le Bilan

Choix de conception du brief (Bilan interactif, pas un récap souvenir) ou éléments hors liste de la tâche : section « Depuis tes débuts » ; médianes (vol, plafond, vitesse, distance) et répartition des durées ; « Série de N semaines de suite · X % de tes vols le week-end » ; date de découverte de chaque nouveau site ; phrase « Un vol sur trois sur site (35 %) » (le Bilan montre les parts par mode) ; rejeu animé et récap PNG (phase 8). Ils ne sont pas des écarts de valeur.

### E6. Cartes d'aperçu : jeu de 8 cartes différent

Le Bilan affiche les 8 cartes demandées par le brief (vols, temps, jours volés, sites, durée moyenne, distance, plafond max, vitesse max). Le rapport a 8 cartes différentes (jours de vol, durée moyenne, plus long vol, plus longue distance, plafond, vitesse max, vario max, facteur g max), car ses vols, heures, sites et km sont dans l'en-tête. Les définitions sont les mêmes pour les cartes communes ; les mesures absentes du Bilan (plus long vol, vario, g) apparaissent dans ses records. À décider seulement si Adrien veut aligner les jeux de cartes.

### E7. Formats

Valeurs égales, présentation différente : dates avec année dans les records du Bilan, durées de zone en heures décimales (« 46,5 h » contre « 46 h 32 min »), meilleure semaine en « 9 h 28 min » (rapport : « 9,5 h »), régularité « 68 % » avec « 36 semaines actives sur 53 » (rapport : « 36 / 53 semaines »), étiquettes de jalon « RECORD » et « NOUVEAUTÉ », liens vers la fiche vol au lieu de « Voir la journée ».

## 5. Corrections faites côté front

1. **`BilanHeader.tsx` (et `bilanA.css`)** : le rapport indique « sur N vols mesurés » sous les km de l'en-tête quand la distance manque à certains vols ; le Bilan ne le disait pas. Ajout de la note (sans pastille, comme le rapport). Test dans `bilanA.test.tsx`.
2. **`BilanComparison.tsx`** : le rapport ajoute la pastille « Données partielles » à côté de la distance du tableau de comparaison quand plus de 20 % des vols n'ont pas la mesure ; le Bilan l'avait sur les cartes et les records mais pas dans ce tableau. Ajout du composant `CoverageNotice`. Test dans `bilanA.test.tsx`.

## 6. Écarts restants et décisions pour Adrien

| N° | Écart | Cause | Proposition | Décision |
|---|---|---|---|---|
| E1 | 34 contre 33 sites (AdrienM), « 25 nouveaux » contre 24, +79 % contre +74 % | site vide `''` compté par le Python | normaliser `site` dans `prepare_report_df` | **corrigé** (D18) |
| E2 | ±1 min sur des totaux et quelques pastilles | `duration_min` arrondi à 0,1 min à l'export | exporter 4 décimales | **corrigé** (D18) |
| E4 | date « mises à jour le » différente | deux définitions sous un libellé | champ `data_refreshed_at` dans `meta.json` | **corrigé** (D18) |
| E6 | jeu de 8 cartes différent | brief | aucune, sauf demande | à décider si besoin |

Fichiers modifiés : `web/src/components/bilan/BilanHeader.tsx`, `web/src/components/bilan/BilanComparison.tsx`, `web/src/components/bilan/bilanA.css`, `web/src/components/bilan/bilanA.test.tsx`, ce fichier. Les données de `web/public/data/` ont été régénérées (ignorées par git).
