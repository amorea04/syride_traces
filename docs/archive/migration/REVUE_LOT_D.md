# Revue du lot D (L'Avocat du diable)

Diff relu : `8d70456` (contre `9f44392`). Aucun fichier de code modifié.

## Vérifications faites

- Tests : `pytest scraping_tests web_export/tests` : **177 passés** (Python 3.8.16). Pas de syntaxe 3.9+.
- **A/B sur une copie du vrai `flights.db`** (scratchpad), `sync_pilot` + `load_pilot_frames` sur le vrai `main_path`,
  ancien code (`9f44392`) contre nouveau, AdrienM et j2f : mêmes vols (506 / 1 059), **aucun écart de valeur** sur les
  colonnes communes, mêmes coordonnées, même file d'attente (`files_by_pilot=None` : 0 / 18). Colonnes ajoutées :
  `vario_min`, `hauteur_sol_max`, `heure_plafond`, `syride_status`. Aucun fichier du vrai `main_path` modifié (mtime et taille).
- Migration d'une base remplie par l'ancien code : `connect` deux fois, puis `sync_pilot` : **0 recalcul**, stats copiées
  en `track_source='gpx'`. Idempotent.
- **`reconcile_pilot` sur les vraies listes** (`_migration_captures/act_adrien_1000.html`, `arp_5000.html`, `fe_5000.html`)
  et une **copie** des JSON : aucun faux « modifié » dû au format (`flight_time` « 1h 06min » contre « 01:06:27 », `"None"`),
  les modifications trouvées sont réelles (voile « Dolpo » → « Dolpo 3 », noms tronqués « BOXER J MOU » → « BOXER J MOUIS »,
  site renommé, type changé) ; AdrienM : absents = `2093221`, `2844756`, exactement les deux vols connus. Deuxième passage :
  rien de nouveau, rien de modifié.

## Constats

### 1. Premier `reconcile_pilot` : réécriture de TOUS les JSON — important (bloque la porte III telle qu'écrite)

`flights_db.py:847-853`. Aucun des 9 793 JSON réels n'a la clé `syride_status` ; `data.get("syride_status") != "present"`
est donc vrai pour chaque vol listé et le JSON est réécrit. Mesuré sur la copie d'AdrienM : **506 / 506 JSON réécrits** au
premier passage. Contraire au §2 du plan (« jamais de réécriture massive des JSON ») et au critère de la porte III
(« aucun JSON réécrit sans changement réel »). Conséquences : 9 800 écritures avec `fsync`, tous les mtime changent,
`sync_pilot` relit tout, une synchronisation (iCloud, Dropbox, sauvegarde) voit tout changer.
Correction : clé absente = « présent » implicite. N'écrire `syride_status` dans le JSON que pour `absent` et pour le retour
d'un vol `absent` (on réécrit alors `"present"` ou on supprime la clé) ; le statut `present` vit dans la base
(`_upsert_json` : `data.get("syride_status") or ("present" if vu dans la liste ...)`, ou simplement mis à jour par
`reconcile_pilot` dans la base comme `last_seen_list`). Ajouter un test : JSON ancien sans `syride_status`, mtime inchangé
après `reconcile_pilot`.

### 2. JSON illisible écrasé par les seuls champs de liste — important (perte de données)

`flights_db.py:812-820`. « Nouveau » est décidé par `num not in known` (base), pas par l'absence du dossier ou du JSON.
Or `sync_pilot` ignore un JSON illisible (`continue`, ligne 203-205) et le retire de la base. Reproduit : un `200.json`
tronqué contenant `plafond`, `gain`… est **remplacé** par un JSON de liste (champs de fiche à `None`) et compté « nouveau ».
Correction : tester `os.path.exists(json_path)` ; si le fichier existe mais est illisible, ne rien écrire, le signaler
dans le rapport (`"unreadable": [...]`).

### 3. Fiche brute corrompue : `zlib.error` non attrapée, `sync_pilot` plante — important

`syride_scraper.py:531` (`except (OSError, EOFError, UnicodeDecodeError)`). Un gzip dont les données deflate sont abîmées
lève `zlib.error` (pas une sous-classe d'`OSError`). Reproduit : `load_sheet_raw` lève, `sync_pilot` lève
(`_read_fv_config` ← `_update_derived`), donc tout l'index et le pkl tombent pour un seul fichier ; `reparse_pilot`
(ligne 937, hors du `try`) aussi.
Correction : ajouter `zlib.error` (et par prudence `Exception` avec un avertissement nommant le fichier) ; `None` en retour.

### 4. Garde-fou 80 % trop faible contre une liste tronquée par `limit` — important

`flights_db.py:803-804`. Une liste coupée par `limit=1000` sur un pilote de 1 100 vols Syride donne 91 % : la garde ne
se déclenche pas et ~100 vols anciens sont marqués `absent` à tort. Le cas existe : « air race pro » a 1 473 vols,
`arp_1000.html` en renvoie exactement 1 000. Le marqueur de fin `syride-no-more-activity` n'est présent dans **aucune**
capture réelle (même complète), il ne peut pas servir. De plus `len(list_items)` compte les vols non Syride et les
doublons, alors que le dénominateur ne compte que les vols Syride.
Correction : paramètre `complete: bool` fourni par l'appelant (faux si `len(activity_ids) >= limit` demandé) et aucune
marque `absent` si `complete` est faux ; compter seulement les items Syride (`is_syride`) dédoublonnés dans le ratio.

### 5. `date_publication` arrive dans les JSON puis dans le pkl — important (format du pkl, P29)

`flights_db.py:811-818` et `588-593`. `parse_activities_response` (le format que le lot E passera) ajoute
`date_publication` ; les vols nouveaux l'écrivent dans leur JSON, et `load_pilot_frames` ne la retire pas (il retire
`altitude_max`, `nom_vol`, `historique_liste`, `adresse_zip`). Vérifié sur la copie de Florent_Essar : colonne
`date_publication` dans le DataFrame (2 valeurs, le reste devient `"-1"` après `assign_data_types`). Colonne non validée.
Correction : `data.pop("date_publication", None)` dans `load_pilot_frames` (on peut la garder dans le JSON).

### 6. Règle des doublons trop large, et interaction avec `remove_duplicate_flights` — important

`flights_db.py:716-741`. Évaluée en lecture seule sur tous les JSON réels (23 pilotes, 9 793 vols) :

| Règle | Paires | j2f | air race pro | Au_Phil_du_vent | yanis | jeanlouisksu |
|---|---|---|---|---|---|---|
| actuelle : heure ±10 min, durée ±2 min | **202** | 11 | 120 | 24 | 12 | 12 |
| heure ±3 min, durée ±60 s | 105 | 0 | 100 | 2 | 2 | 0 |
| **heure ±3 min, durée ±60 s, les deux vols ≥ 5 min** | **103** | 0 | 100 | 0 | 2 | 0 |
| strictement identiques (heure et durée à la seconde) | 102 | 0 | 100 | 0 | 1 | 0 |

Les ~100 paires en trop sont des vols de treuil de 2 à 6 min enchaînés (numéros consécutifs, départs espacés de 4 à
10 min, plafonds différents) : faux positifs. Les vrais doublons sont **identiques** (même heure, même durée à la seconde,
même plafond, numéros éloignés : `1100867`/`1106781`, et `1080424` présent 4 fois). La règle proposée (≥ 5 min) garde
les 102 identiques plus `yanis 3754310/3565652` (17 / 18 min, plafond 1 769 / 1 762, plausible) et écarte les sauts de
2 min d'Au_Phil_du_vent. Les deux vols absents d'AdrienM n'ont pas de jumeau le même jour : ce sont de vraies
suppressions, pas des doublons. Proposition : règle « même date, heure ±3 min, durée ±60 s, deux vols ≥ 5 min » ;
dans le rapport, trier d'abord les paires dont un vol est `absent` ; mettre à jour l'en-tête de
`write_duplicates_report` (lignes 884-886).

Interaction : `analyze_functions.remove_duplicate_flights` écarte déjà les doublons stricts du pkl avec une clé qui
contient `plafond`, `gain`, `vitesse_max`. Avec le rattrapage progressif des fiches brutes, un jumeau reçoit ses stats
de `fv-config` (plafond ±2 m par rapport au GPX, scène 3) avant l'autre : la clé diffère, **le doublon revient dans le
pkl et compte deux fois** jusqu'à ce que les deux fiches soient récupérées. Correction possible : dans
`load_pilot_frames`, écarter (ou marquer) le vol dont `duplicate_of` pointe vers un jumeau strict ; ou calculer la clé de
`remove_duplicate_flights` sur les valeurs de fiche du JSON (avant `apply_track_stats`) ; à défaut, mettre en file les
jumeaux ensemble pour le rattrapage.

### 7. Ordre de la file avec `files_by_pilot=None` différent de HEAD — mineur

`flights_db.py:410-419`. Avant : vols « infos ou GPX manquants » mêlés, du plus récent au plus ancien, puis IGC seul.
Maintenant : tous les « infos manquantes » d'abord, puis « GPX manquant ». Avec `--max-sheets N`, les N vols traités
changent (P4). Demandé par le brief pour le nouveau mode, mais `None` devait reproduire l'actuel.
Correction : avec `files_by_pilot is None`, garder l'ancienne clé `(igc_only, -num)`.

### 8. `flight_kind` peut rendre `"raw"`, absent du dict de `browser_session` — mineur (lot E)

`flights_db.py:435` / `browser_session.py:437-439` : `kinds = {"info+files", "info", "files"}` → `KeyError` dès que le
lot E passera `files_by_pilot` avec `backfill_raw=True`. Sans effet tant que `None` (aucun item « raw » en file). À
signaler dans le brief du lot E.

### 9. Fiche non compressée lue mais jamais détectée — mineur

`flights_db.py:185` : `has_raw` ne regarde que `<num>.sheet.html.gz`, alors que `load_sheet_raw` accepte
`<num>.sheet.html`. Une fiche non compressée n'est ni utilisée ni comptée. Correction : détecter les deux.

### 10. Fiche brute sans trace exploitable relue à chaque passage — mineur

`flights_db.py:295-296`. Si `coords_done=0` (pas de `fv-config` exploitable et ni GPX ni KML), la fiche est
décompressée et analysée par BeautifulSoup à **chaque** `sync_pilot`. Rare d'après le lot A (fv-config présent même en
2022), mais coûteux pour un profil sans fichiers. Correction : mémoriser l'échec (ex. `coords_done=-1` tant que
`has_sheet_raw` ne change pas).

### 11. `list_hash` écrit mais jamais lu — mineur

`flights_db.py:871-873`. La comparaison se fait champ par champ contre le JSON (ce qui marche bien sur les données
réelles) ; la colonne est donc morte. La garder comme information ou l'utiliser pour éviter de relire le JSON quand
l'empreinte de la liste n'a pas changé.

### 12. Vols non Syride anciens ajoutés au disque — information pour la recette A/B

La réconciliation complète crée les vols jamais vus par l'ancien défilement : Florent_Essar, **43 nouveaux** dont
**41 non Syride** (2020-2025) et 2 vols Syride de 2024 importés tard. Les non Syride sans stats restent hors du pkl
(comportement attendu), mais le compte « vols non Syride (31) » de P22 et l'ensemble des dossiers changent : à prévoir
dans `compare_pkl.py` (lot F).
