# Audit de cohérence des statistiques (tâche 1.5)

Base : `global_flights_data.pkl` (9 635 vols, 23 pilotes), `flights.db` en lecture seule (comparaison fiche/GPX), `uniformisation.json`, `sites_coordinates.json`. Rien n'a été modifié ; scripts dans `/private/tmp/claude-502/audit_phase1/`. Seuil « Données partielles » : moins de 80 % de vols renseignés et > 0.

## 1. Couverture par métrique (% de vols renseignés et > 0)

| Métrique | Global | Parapente | Paramoteur | gpx (8 760) | fiche (610) | aucune (265) |
|---|---|---|---|---|---|---|
| distance | 97,2 | 96,5 | 98,3 | 97,3 | 95,6 | 95,5 |
| distance_cumulee | 96,4 | 94,9 | 98,7 | 99,1 | 98,4 | 0 |
| vitesse_moyenne | 94,6 | 92,7 | 97,5 | 97,3 | 95,6 | 0 |
| vitesse_max, plafond, g_max | 97,2 | 96,1 | 99,1 | 100 | 100 | 0 |
| **gain** | **84,7** | **77,1** | 97,2 | 88,3 | **70,5** | 0 |
| vario_max | 91,5 | 87,0 | 98,7 | 93,9 | 96,2 | 0 |
| durée | 100 | 100 | 100 | 100 | 100 | 100 |
| heure, site, types, instrument | 100 (site : 3 vols à site vide) | | | | | |
| **voile** (hors « inconnue » et « autre voile ») | **78,7** | 80,7 | **75,5** | | | |

Par année : seule 2026 chute (distance_cumulee 74,6 ; vitesse_max, plafond, g_max 75,3 ; vario 67,5) parce que les **265 vols « aucune » sont tous de 2026** (fiches pas encore lues, `incomplet` = True ; par pilote : yanis 66, Au_Phil_du_vent 60, jeanlouisksu 39, LiLi06 31, j2f 18, DavidParatrucs79 13). Les autres années sont à 91-100 %, sauf gain en 2018 (63,3 %) et voile de 2015 à 2022 (57 à 82 %, minimum 57,1 % en 2016).

Points sous 80 % :
- **gain** (parapente 77,1 %, source fiche 70,5 %, 2018). Ce n'est pas un manque de données : 1 207 vols ont un gain réellement égal à 0 (plafond > 0 ; 986 « Vol site », 114 « Vol rando »), typiquement un décollage au point haut. Hors « aucune », gain > 0 pour 87,1 %. Le null du contrat est correct, mais « Données partielles » serait trompeur sur le gain.
- **voile** : 1 922 vols (19,9 %) sont « inconnue » et 126 « autre voile ». Six pilotes sont à 0 % (Julien16, Rémydu24, Tof Torsac, ToriVsUke, fabrice_f, j2f ; 1 810 vols), donc le filtre voile est inutilisable pour eux. `flights.json` exporte « inconnue » comme une voile (index de `dict.wing`) : **décision d’Adrien (15/11/2026) : « inconnue » reste une voile à part entière**, ni null ni masquée.
- Les 265 vols « aucune » sont à « Données partielles » par construction (stats absentes).
- Toutes les distances et altitudes du pkl sont des **entiers** (0 non-entier) : la résolution de la distance est 1 km alors que 4 369 vols (45 %) font moins de 5 km. Les vitesses moyennes des vols courts sont donc imprécises.

## 2. Fiche Syride vs GPX

D'où viennent les colonnes (`flights_db.apply_gpx_stats`) : `distance`, `date`, `flight_time`, `site` viennent de la page liste (référence) ; `*_activite` et `distance_cumulee`, `vario_max`, `g_max` de la fiche ; `duree_vol`, `plafond`, `gain` du GPX (priment sur la fiche) ; `vitesse_max` de la fiche, le GPX seulement en repli ; `vitesse_moyenne` = distance / durée GPX. Comparaison fiche (`data_json`) vs GPX (`gpx_stats`) sur 8 883 vols de `flights.db`, et colonnes jumelles du pkl :

| Paire | n | Écart médian | p95 | Au-delà du seuil (justification) |
|---|---|---|---|---|
| plafond fiche vs GPX | 8 882 | 0 | 0 | 0 : identiques à 100 % |
| gain fiche vs GPX (fiche > 0) | 6 677 | 0 | 0 | 0 ; mais 1 164 vols ont gain fiche 0/absent et gain GPX > 0 : le GPX comble |
| durée fiche vs GPX | 8 190 | 1 s | 1 s | **3** vols > 1 min (la fiche est à la seconde) ; 1 aberrant : yanis 2209109, GPX 1 440 min vs 6,3 min |
| durée liste (`flight_time`) vs GPX | 8 883 | 1 s | 1 s | 2 vols > 5 min |
| vitesse_max fiche vs GPX | 8 882 | 4 km/h | 12 km/h | **2 561** vols > 10 % (28,8 %), **353** > 25 % (sauts GPS ; GPX en moyenne +3 km/h) |
| `distance` vs `distance_activite` | 9 110 | 0 | 0 | 0 : identiques |
| `date` vs `date_activite` | 9 370 | 0 j | 0 j | 0 |
| `site` vs `site_activite` | 9 635 | | | 4 576 libellés différents, tous expliqués par l'uniformisation (Magnac Lavalette Treuil/Paramoteur 3 175, Fayard→Fayards 800, 51 « None ») ; `site_activite` n'est pas à exporter |
| `vitesse_moyenne` vs distance / durée liste | 9 370 | 0,03 km/h | 0,2 km/h | 168 vols > 1 km/h : tous des vols courts (médiane 5,5 min), effet de la distance entière |

Conclusion : plafond, gain, durée, distance et date sont cohérents ; seule `vitesse_max` diverge entre fiche et GPX, et le pipeline garde justement la fiche (1 seul vol repris du GPX).

## 3. Valeurs aberrantes (par gravité décroissante)

Bornes retenues : vitesse_max ≤ 130 km/h parapente / ≤ 150 paramoteur ; plafond ≤ 4 500 m parapente / 3 500 paramoteur ; vario ≤ 12 m/s ; g ≤ 5 parapente / ≤ 6 paramoteur ; durée ≤ 480 min ; vitesse moyenne (distance / durée) ≤ 100 / 110 km/h ; distance_cumulee ≥ 0,8 × distance. Dénombrement : vitesse_max 3 vols, plafond 3, vario 20, g 12, durée > 480 min 3, cumul < distance 14 (dont 7 sous 0,8 ×), gain > plafond 18 (17 d'au plus 14 m, mono-site côtiers pour la plupart ; 1 de 123 m : jeanlouisksu 376958, Fayards 2017-09-24), durée < 2 min 84.

| # | Pilote, num_activite, date | Valeur | Correction amont proposée (non appliquée) |
|---|---|---|---|
| 1 | WIL24, 1508407, 2021-11-20 | paramoteur, vitesse_max 204, moyenne 117 km/h, 165 km en 84 min | Hors parapente/paramoteur (avion ?). Aucune règle par vol n'existe : ajouter une liste `vols_exclus` (pilote, num) à `uniformisation.json` |
| 2 | air race pro, 2477275 / 2477281 / 2477282 / 2477283 / 2497702 / 2624401 / 2653483 (03 à 07/2024) | voile « biplan celebrity », vitesse_max 123 à 143 | **Bug de règle** : `voiles_exclues` contient `biplan celebri` (tronqué), la voile réelle est `biplan celebrity` : 7 vols d'avion restent dans le pkl. Corriger la valeur dans `voiles_exclues` |
| 3 | air race pro, 2535557, 2024-04-30 | vitesse_max 151, moyenne 96,7 (piper tandem, 45 km en 28 min) | `vols_exclus` ou vérifier la fiche |
| 4 | yanis, 2209109, 2023-07-04 | durée GPX 23:59:59 vs 6,3 min : vitesse_moyenne 0,1 faux | `apply_gpx_stats` : ignorer la durée GPX si elle s'écarte de plus de 5 min de `flight_time` ; sinon `vols_exclus` |
| 5 | air race pro, 178863 (2016-08-30) et 216690 (2016-11-02) | vario_max 25,0 et 24,6 | Règle d'export `vario_max > 12` → null |
| 6 | 18 autres vols vario_max 12,1 à 19,7 | jeanlouisksu 6, air race pro 9, Tof Torsac 4, Nico16 1, 2014-2018 | Même règle (vario issu d'anciens boîtiers) |
| 7 | DavidParatrucs79, 1940248 (2022-11-19) | g_max 8,8 ; 6 autres vols du même pilote à 6,2-7,2, plus Kams16 2796928 à 6,8 | Règle `g_max > 6` (paramoteur) → null, à valider par Adrien |
| 8 | air race pro, 414730 / 418901 / 418902 / 421609 / 421610 / 421611 (01-02/2018) | distance 7 à 17 km, distance_cumulee 1 à 2, gain 0 | Règle d'export `distance_cumulee < distance` → null (14 vols au total) |
| 9 | yanis, 3597439 (2026-07-11, incomplet) | durée 627 min | Vérifier à la lecture de la fiche |
| 10 | yanis, 1759137 (2022-07-16) | durée 553 min, moyenne 5,1 km/h, cumul 133 vs distance 47 | Vérifier sur la fiche |
| 11 | LiLi06 3621229 (2026-07-30) | plafond 5 055, gain 3 011, 246 min | Non invalidé par les bornes, à confirmer ; idem LiLi06 2814682 et yanis 2904854 (plafond 4 786 et 4 610, gain 0) |

## 4. Catégories

- **types** : 77 vols avec espace final (« Vol site » 62, « Vol treuil » 14, « Vol rando » 1). Sans effet sur l'export (`mode_of` fait `strip()` ; `dict.mode` = 5 valeurs propres vérifiées dans `flights.json`) ; à corriger quand même à la source (`strip` dans `assign_data_types`).
- **sites** (436) : 0 groupe de variantes casse/accents ; 4 noms avec espaces multiples (« Chalvet  Ouest » 34 vols, « Les Mottes   Le Mur » 29, « Base  Ulm Pulss » 4, « Haut Du Comte   Les Bruches » 1) : à ajouter à `uniformisation.json` (« site »). Quasi-doublons à distance d'édition 1, tous **légitimes** (Accous-500/800, Secondigne 02/03, Aubas/Arbas).
- **voiles** (94) : « rodéo » (20) / « rodeo » (2) ; « inkuma 3p » (32) / « ikuma 3p » (1) ; « eon3 » (1) / « eona 3 » (263) ; « artik 2 » (1) / « artik » (51) à vérifier. Les autres quasi-doublons sont des modèles distincts (leaf 2/3, eden 5/7/8…), à ne pas fusionner. « inconnue » (1 922) et « autre voile » (126) sont des valeurs d'attente.
- **instrument** (4 : Nav, Nav XL, Evolution, GPS) : propre.
- **sites_coordinates.json** : clé vide `""` (`n_files` 3, 46,16 N / -0,014 E), moyenne de 3 points de départ sans rapport (ces 3 vols sont à 25, 64 et 64 km de la moyenne) : 3 vols (AdrienM 2922240, DavidParatrucs79 2654219, air race pro 2801235) ont un site vide dans le pkl, correctement exportés à `site: null` (3 dans `flights.json`) ; le schéma exclut cette clé. 24 clés du JSON ne correspondent plus à aucun vol (anciennes variantes avant uniformisation, p. ex. « Calci Aire », « Peyraude »), sans effet.
- **Sites sans coordonnées** : 16 sites, 28 vols (vols sans GPX) : lat/lon null dans `sites.json`.
- **Écart coordonnées moyennes vs `sites_coordinates.json`** : 0 site à plus de 5 km (maximum 0,53 km, Calciaire) ; la moyenne vient du même calcul. Dispersion interne : 27 vols à plus de 5 km de la moyenne de leur site, dont les 3 vols à site vide (> 20 km).

## 5. Dates

- **12 vols** à date 1901-12-13 (20:45, Fayards, air race pro, num 1188396 à 1946871) : clones d'un même vol (25,4 min, 16 km, plafond 530), correctement exclus (`excluded_flights` = 12 ; `flights.json` : 9 623 lignes, date minimale 2014-03-01, 0 date nulle).
- Heures manquantes : **0** (aucune « 00:00 »), 2 vols hors 5 h-22 h. Aucune date postérieure au 08/11/2026.
- **Doublons potentiels** (même pilote, date, heure) : 28 groupes / 71 vols, dont le groupe sentinelle (12). Hors sentinelle : 27 groupes / 59 vols, dont 24 groupes / 53 vols strictement identiques (durée, distance, plafond), p. ex. Nico16 1013259/1013261 (2020-06-24), et un doublon « aucune » + « gpx » (yanis 3724665 / 3754314, 2026-08-04). Trois groupes sont des vols distincts (Florent_Essar 976722/976723, air race pro 2001143/2039857). Aucune clé `pilote-num` en double.

## 6. Contrôle D12

Le pkl contient `longitude`, `latitude`, `mean_longitude`, `mean_latitude` par vol (360 vols sans point de départ propre) : **aucune ne doit être exportée**, l'info de position passe par l'index de site. `web/public/data/flights.8d1017866c.json` existe : ses 21 colonnes sont celles du contrat (`key` … `syride_num`), aucune ne contient lat/lon/mean/coord, toutes les lignes ont 21 valeurs, les seules clés JSON sont `schema_version, columns, dict, pilot_slugs, rows`. **Conforme à D12.** `sites.json` ne porte que des coordonnées de site (`lat`, `lon`).

## 7. Recommandations

1. **Corriger en amont** : `voiles_exclues` : `biplan celebri` → `biplan celebrity` (7 vols d'avion).
2. **Corriger en amont** : fusionner `rodeo`→`rodéo`, `ikuma 3p`→`inkuma 3p`, `eon3`→`eona 3` ; normaliser les 4 sites à espaces multiples ; `strip()` sur `types`.
3. **Exclure** : ajouter une liste `vols_exclus` (pilote, num) : WIL24 1508407, air race pro 2535557, yanis 2209109 (ou règle durée GPX/liste > 5 min) ; dédoublonner les 24 groupes identiques.
4. **Règles d'export à valider par Adrien** (mesure → null, jamais corrigée) : `vario_max > 12`, `g_max > 6` paramoteur, `distance_cumulee < distance`.
5. **Afficher « Données partielles »** : les 265 vols « aucune » (2026, en attente de fiche) ; les métriques voile pour les 6 pilotes à 0 % ; ne pas l'appliquer au gain (zéros légitimes) (« inconnue » reste une voile, décision d’Adrien).
6. **Ne rien faire** : écarts fiche/GPX de plafond, gain, durée, distance, date (identiques) ; quasi-doublons de sites ; gain > plafond (17 vols sur 18 d'au plus 14 m) ; coordonnées de site (0 écart > 5 km).
7. **Nettoyer** la clé vide de `sites_coordinates.json` et les 24 clés obsolètes (cosmétique, le schéma les ignore).

## Suites données par Adrien (15/11/2026)

- Valeurs aberrantes : **conservées** (rares mais possibles), aucune règle « mesure → null ».
- `biplan celebri` → `biplan celebrity` dans `voiles_exclues` : 7 vols d'avion retirés.
- Doublons strictement identiques : **supprimés** (`remove_duplicate_flights`, voile ignorée dans la comparaison, plus petit `num_activite` conservé) : 29 doublons + 11 clones de la date 1901. Pkl : 9 635 → 9 588 vols.
- Les autres recommandations (fusions de voiles, `vols_exclus`, nettoyage de `sites_coordinates.json`) restent ouvertes.

