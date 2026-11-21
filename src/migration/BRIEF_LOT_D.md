# Brief lot D : stockage, index, réconciliation, réanalyse (L'Archiviste)

Plan de référence : `src/MIGRATION_SCRAPING.md` (acte III, scènes 4 à 7 ; matrice §2 ; décisions §7). Lis-le d'abord.
Worktree : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Pas de commit, pas de changement de branche, pas de `git stash`.**
Python `/Users/Adrien/opt/anaconda3/bin/python` (3.8.16 : pas de `list[str]`, `X | None`, `match`). Aucune dépendance nouvelle.
Français sobre dans les commentaires et messages. Code lisible, pas de sur-ingénierie.

Le lot C est fait : `track_stats.compute_track_stats(track_dict)`, `compute_gpx_stats(path)`, `TRACK_STAT_FIELDS`,
`STATS_VERSION = 3` (lis `src/track_stats.py`).

## Fichiers autorisés

- `src/flights_db.py`
- `src/syride_scraper.py` : **uniquement** des fonctions de stockage (ajouts à côté de `save_flight_data`)
- `src/syride_parsing.py` : **uniquement** l'ajout d'une fonction minimale `parse_fv_config(html) -> dict | None`
  (bs4 : `script#fv-config`, `json.loads`, `None` si absent ou illisible). Le lot B l'enrichira (validation) plus tard.
- `src/create_global_pkl.py` seulement si nécessaire pour les nouvelles colonnes (le moins possible)
- Tests : `src/scraping_tests/test_flights_db.py`, `src/scraping_tests/test_reconcile.py`, `src/scraping_tests/test_storage.py`
  (le dossier et son `conftest.py` existent déjà ; ne les casse pas)

Interdits : `browser_session.py`, `main.py`, `params_scrap_syride.py` (lot E), `web/`, `src/web_export/` (sauf lecture).

## Données réelles

En **lecture seule** : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/<pilote>/traces/`.
Ne jamais écrire dans ce dossier, ni dans son `flights.db`, ni dans son pkl. Pour un essai sur données réelles : base SQLite
dans ton scratchpad (`flights_db.connect("<scratchpad>/flights.db")` + `sync_pilot` sur le vrai `main_path` ne fait que lire
les dossiers… **vérifie-le** : `sync_pilot` ne doit écrire que dans la base).

## Travail

### 1. Stockage brut (`syride_scraper.py`)

- `save_sheet_raw(main_repertoire, num, html)` → `<main_repertoire>/traces/<num>/<num>.sheet.html.gz` (gzip niveau 6, écriture
  atomique `.tmp` + `os.replace`, comme `save_flight_data`).
- `load_sheet_raw(folder, num) -> str | None` (accepte aussi `<num>.sheet.html` non compressé).
- `save_list_snapshot(main_repertoire, html, keep=5)` → `<main_repertoire>/_raw/activites_<AAAAMMJJ-HHMMSS>.html.gz`,
  ne garde que les `keep` plus récents. Vérifie que `initiate_search` et `analyze_functions.get_json_files` ignorent `_raw/`.

### 2. Index `flights.db` (`flights_db.py`)

Migrations `ALTER TABLE` dans `connect`, sur le modèle existant, idempotentes :
`has_sheet_raw INTEGER DEFAULT 0`, `track_source TEXT`, `track_stats TEXT`, `syride_status TEXT DEFAULT 'unknown'`,
`last_seen_list TEXT`, `list_hash TEXT`, `duplicate_of TEXT`. Nouvelle table `pilots(pilot TEXT PRIMARY KEY, id_rider TEXT,
updated TEXT)` avec `get_id_rider(conn, pilot)` / `set_id_rider(conn, pilot, id_rider)`.

`sync_pilot` / `_update_derived` :
- détecte `<num>.sheet.html.gz` → `has_sheet_raw` (même logique que `has_gpx`, à chaque passage) ;
- **trace prioritaire** : fv-config (fiche brute) > GPX > KML.
  - coordonnées de départ : premier point de fv-config si disponible, sinon comportement actuel ; un vol dont les coordonnées
    viennent d'un GPX/KML et qui reçoit ensuite une fiche brute garde ses coordonnées (pas de recalcul inutile) ;
  - statistiques : `track_stats` (JSON) = `compute_track_stats` si fiche brute exploitable, sinon `compute_gpx_stats` ;
    `track_source` = `fv-config` / `gpx` / `NULL` ; recalcul si `version` ≠ `STATS_VERSION` ou si une fiche brute apparaît
    alors que la source était `gpx`. `gpx_stats`/`gpx_done` : garde les colonnes (compatibilité) mais le code lit `track_stats`.
- `syride_status` de la base recopié depuis le JSON (`data.get("syride_status", "unknown")`).

`apply_gpx_stats` → renomme en `apply_track_stats` (garde `apply_gpx_stats` comme alias) :
- mêmes règles qu'aujourd'hui pour `GPX_STAT_FIELDS` (la trace prime, sauf `vitesse_max` qui ne comble qu'un manque) ;
- `source_stats` = `"trace"` si fv-config, `"gpx"`, `"fiche"` ou `"aucune"` (mêmes valeurs qu'avant + `"trace"`) ;
- **nouvelles colonnes** (décision 3) : `vario_min`, `hauteur_sol_max`, `heure_plafond` ajoutées depuis la trace fv-config ;
  `vario_max` et `g_max` du JSON (fiche) restent prioritaires, la trace ne comble qu'un manque ; sans trace fv-config ces
  colonnes valent `None` (**jamais 0**).
- `load_pilot_frames` : ajoute la colonne `syride_status` ; garantit la présence des nouvelles colonnes (None) même si aucun vol
  n'en a. Vérifie que `create_global_pkl` → `analyze_functions.prepare_data` / `start_pipeline` accepte ces colonnes sans les
  convertir en 0 (lis `assign_data_types`, `valeurs_manquantes`) ; si une étape les détruit ou les remplit, adapte au minimum
  et signale-le. Puis `make test-py` (depuis la racine du worktree) doit rester vert.

### 3. Réconciliation (`flights_db.reconcile_pilot`)

`reconcile_pilot(conn, main_path, pilot, list_items, today=None) -> dict`
- `list_items` : liste de dicts **au format de `get_nav_infos_bs`** (clés `pilote, id_activite, num_activite, types, site,
  date, heure, flight_time, voile, distance, altitude_max, instrument, is_syride`, + éventuellement `nom_vol`) pour la liste
  **complète** du pilote. Les clés `flight_token`/`expires`/`token` éventuelles ne sont jamais écrites sur disque.
- `LIST_FIELDS` = champs de liste hachés (`types, site, date, heure, flight_time, voile, distance, altitude_max, instrument,
  nom_vol` quand présent) ; `list_hash` = sha1 du JSON trié de ces champs.
- Nouveau vol (dossier absent) → JSON créé comme `browser_session.identify_new_traces` aujourd'hui (champs de fiche à `None`,
  sauf `adresse_zip` absent), via `syride_scraper.save_flight_data`.
- Vol connu, `list_hash` différent du hash recalculé depuis son JSON → mise à jour **des seuls champs de liste** dans le JSON
  et ajout à `historique_liste` (liste de `{"date", "champ", "avant", "apres"}`). Attention : les anciens JSON ont des valeurs
  `"None"` texte et parfois un format différent ; ne signale **pas** de modification quand seule la représentation d'une
  valeur manquante diffère (`None` / `"None"` / `""`). Teste ce cas.
- Vol du disque (Syride, `is_syride` vrai) absent de la liste → `syride_status = "absent"` écrit dans le JSON (seulement s'il
  change) ; **rien n'est supprimé** (décision 1). Vol `absent` qui réapparaît → `"present"`.
- Vols présents : `syride_status = "present"` écrit dans le JSON **seulement s'il change** ; `last_seen_list` mis à jour **dans
  la base uniquement** (pour ne pas réécrire tous les JSON à chaque lancement).
- Garde-fou : si `len(list_items) < 0.8 × vols Syride connus du pilote`, aucune marque `absent`, et le rapport le dit.
- Doublons probables : même pilote, même `date`, `heure` à moins de 10 min, `flight_time` à moins de 2 min d'écart, numéros
  différents → `duplicate_of` dans la base (le plus petit numéro pointe vers… choisis et documente) ; jamais de suppression.
- Retour : `{"new": [...], "modified": [{"num", "fields"}], "absent": [...], "reappeared": [...], "duplicates": [(a, b)],
  "guard_triggered": bool}`.
- `write_duplicates_report(conn, main_path, pilots)` → `<main_path>/_rapport_doublons.txt` (lisible, trié).

### 4. File d'attente (`get_global_queue`)

Nouvelle signature compatible : `get_global_queue(conn, pilots, fill_igc=False, tasks="all", files_by_pilot=None,
backfill_raw=True)`.
- `files_by_pilot` : `{pilote: ("gpx", "igc")}` ; `None` = comportement actuel (tous les pilotes téléchargent GPX, `--fill-igc`
  pour l'IGC) afin que le code actuel de `browser_session` fonctionne encore tant que le lot E n'est pas fait.
- Pilote **sans** fichiers : `need_gpx = need_igc = False` ; il est à compléter s'il lui manque les infos de fiche ou la fiche brute.
- Pilote avec fichiers : comme aujourd'hui, + fiche brute.
- `need_raw` ajouté à chaque item. Ordre : (1) infos manquantes, (2) GPX manquant (profils à fichiers), (3) IGC seul,
  (4) fiche brute seule (rattrapage) — exclue si `backfill_raw=False` ; dans chaque groupe, numéro décroissant.
- Les vols `no_link=1` restent exclus. `flight_kind` gère `raw`.
- `summary` : ajoute `no_raw` et `absent`.

### 5. Réanalyse hors ligne

`reparse_pilot(conn, main_path, pilot) -> dict` : pour chaque vol avec fiche brute, `syride_parsing.parse_flight_sheet(html)`
→ réécrit les champs de fiche du JSON **seulement si le contenu change** (comparaison des valeurs, pas des dates) ; puis
`sync_pilot`. Retour : `{"read": n, "updated": n, "errors": [...]}`. Sans réseau.

### 6. Tests (pytest, sans réseau, sans données réelles ; arborescences de pilotes fictives dans `tmp_path`)

`test_storage.py` (gzip, atomicité, rotation des instantanés, `_raw` ignoré), `test_flights_db.py` (migration d'une base à
l'ancien schéma créée dans le test puis `connect` deux fois : idempotent ; priorité fv-config > GPX ; recalcul quand une fiche
apparaît ; nouvelles colonnes à None sans trace ; file d'attente avec et sans `files_by_pilot` ; `backfill_raw`),
`test_reconcile.py` (nouveau, modifié, faux positif `"None"`/`None`, absent, réapparu, garde-fou 80 %, doublons, aucun JSON
réécrit quand rien ne change : compare les `mtime`). Pour fabriquer une fiche brute de test, écris un petit HTML contenant
`<script id="fv-config" type="application/json">{...}</script>` avec une trace synthétique.

## Vérification

```
cd src && /Users/Adrien/opt/anaconda3/bin/python -m pytest scraping_tests web_export/tests -q -p no:cacheprovider -p no:dash
```
Puis essai réel en lecture seule : base dans ton scratchpad, `sync_pilot` + `load_pilot_frames` sur `AdrienM` et `j2f` du vrai
`main_path` ; compare au même calcul fait avec le code de `HEAD` (extrait dans le scratchpad) : même nombre de vols, mêmes
valeurs hors nouvelles colonnes (`source_stats` peut rester `gpx`, aucune fiche brute n'existe encore). Vérifie avec
`ls -la` / `stat` avant-après qu'aucun fichier du vrai `main_path` n'a été modifié.

## Compte rendu final

Signatures ajoutées/modifiées, résultat des tests, résultat de l'essai réel (chiffres), modifications éventuelles du pipeline pkl,
écarts au brief et pourquoi.
