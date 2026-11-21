# Brief lot E : session navigateur, phase 1 par la liste, profils à fichiers, CLI (Le Pilote d'essai)

Plan : `src/MIGRATION_SCRAPING.md` (acte IV, scènes 8 à 10, matrice §2, décisions §7). Contrat : `src/migration/SYRIDE_API.md`.
Worktree : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Pas de commit, pas de changement de branche, pas de `git stash`.**
Python `/Users/Adrien/opt/anaconda3/bin/python` (3.8.16). **Aucune dépendance nouvelle** (HTTP : `urllib.request` de la
bibliothèque standard). Français sobre. `selenium` et `undetected_chromedriver` ne sont pas installés dans cet anaconda :
les tests doivent passer sans eux (modules factices si besoin, comme dans `scraping_tests/test_flights_db.py`).

Déjà fait (lis le code) : lot A (contrat), lot B (`syride_parsing` : `parse_id_rider`, `parse_activities_response`,
`parse_flight_sheet_full`, `parse_fv_config`, `is_turnstile_gate`), lot C (`track_stats`), lot D (`flights_db` :
`reconcile_pilot`, `get_global_queue(..., files_by_pilot, backfill_raw)`, `write_duplicates_report`, `reparse_pilot`,
`get_id_rider`/`set_id_rider`, `summary` ; `syride_scraper` : `save_sheet_raw`, `save_list_snapshot`).

## Règle absolue (Turnstile)

Le code ne fait **jamais** de `POST /ajax/vols/autoriser-affichage.php` lui-même et ne lit **jamais** `ficheVol.php`
directement. La fiche s'obtient **uniquement** comme aujourd'hui : navigation Chrome vers `/fr/pilotes/<p>/<num>`, la page
de Syride ouvre elle-même la fiche et exécute son widget Turnstile ; on lit l'iframe `#popupIframe`. Si un défi Turnstile
demande une action (`is_turnstile_gate` sur la page parente), message clair et **attente que l'humain le valide**, sur le modèle
de `wait_for_cloudflare` (rappel toutes les 60 s), puis reprise. Les jetons `flight_token` de la liste ne sont donc pas utilisés.

## Fichiers autorisés

`src/syride_scraper.py`, `src/browser_session.py`, `src/params_scrap_syride.py`, `src/main.py`, `src/debug_flight_page.py`,
`src/flights_db.py` (**seulement** pour ajouter `dry_run=False` à `reconcile_pilot` : en simulation, calculer le rapport sans
écrire ni JSON ni base ; et retirer `date_publication` du pkl dans `load_pilot_frames` comme `nom_vol`),
tests `src/scraping_tests/test_session.py`, `src/scraping_tests/test_phase1.py`, `src/scraping_tests/test_cli.py`.

## Travail

### 1. Transport HTTP de la liste (`syride_scraper.py`)

- `HttpTransport(user_agent=<UA Chrome générique>, timeout=60)` avec `get_text(url, referer)` : `urllib.request`, en-têtes
  `Referer` (obligatoire, voir contrat), `User-Agent` générique, `Accept-Language: fr`. Aucune information personnelle.
  Erreur HTTP → exception explicite avec le code. Gère `gzip` si la réponse est compressée.
- `fetch_pilot_list(transport, pilote, id_rider=None) -> (html_brut_concaténé, parsed)` :
  - `id_rider` absent → page `https://www.syride.com/fr/pilotes/<pilote encodé>` + `parse_id_rider` ;
  - `activites.php?limit=5000&l=fr&idRider=<id>&apli=0` (Referer = page du pilote) ;
  - si pas de marqueur de fin et qu'au moins 5000 activités sont revenues : pagination `append=1&beforeId=<dernier id_activite>`
    par pas de 1000 jusqu'au marqueur de fin (garde-fou : 50 pages) ;
  - `ValueError` du parser ou id introuvable → `PilotPageError` (HTML enregistré pour diagnostic comme aujourd'hui).
  - Renvoie aussi `complete` : vrai seulement si la dernière page a renvoyé **moins** d'activités que la limite demandée
    (le marqueur de fin n'est pas fiable d'après la revue du lot D). Passe-le à `reconcile_pilot(..., complete=complete)` :
    sans liste complète, aucun vol n'est marqué absent.
- Supprime `scroll_until_known`, `_visible_activity_ids`, `get_all_navs` (plus utilisés ; vérifie avec `grep`).

### 2. Phase 1 (`browser_session.py`)

`identify_new_traces` est remplacé par `sync_pilot_list(conn, transport, path, pilot, dry_run=False) -> dict` :
`get_id_rider`/`set_id_rider` (cache), `fetch_pilot_list`, `save_list_snapshot` (pas en dry-run), `reconcile_pilot(...,
dry_run=dry_run)` avec les vols de `parsed["flights"]`, puis affichage d'un bilan d'une ligne par pilote :
`<pilote> : N vols sur Syride, X nouveaux, Y modifiés, Z absents, W réapparus[, garde-fou déclenché]`.
Fin de phase 1 : `write_duplicates_report` (pas en dry-run) et une ligne « K doublon(s) probable(s), voir <chemin> ».
**La phase 1 n'ouvre plus Chrome.** En `--dry-run`, elle tourne aussi (lecture seule).

### 3. Phase 2 (`browser_session.py`, `syride_scraper.py`)

- `_read_flight_iframe` : pendant l'attente de l'iframe, si `is_turnstile_gate(page parente)` → `wait_for_turnstile(driver)`
  (message, attente de l'humain, reprise). `wait_for_cloudflare` inchangé.
- `read_flight_sheet` renvoie maintenant `(sheet, links, track, html, n_rate_limits)` via `parse_flight_sheet_full` ;
  adapte les appelants.
- `process_flight(..., need_raw=True, files=())` :
  1. lecture de la fiche → `save_sheet_raw` **immédiatement** ;
  2. mise à jour du JSON avec `sheet` (sans `adresse_zip`) comme aujourd'hui ;
  3. trace absente (`track is None`) et pas de lien GPX → statut `nolink` (même effet qu'aujourd'hui : `mark_no_link`) ;
  4. téléchargements **seulement** pour les extensions de `files` (`("gpx", "igc")` pour AdrienM) et seulement si
     `need_gpx` / `need_igc` ; logique actuelle conservée (lien expiré → relecture de fiche pour le GPX, limite de
     téléchargement → mode infos seules, etc.).
- `process_pilots(..., files_by_pilot=None, backfill_raw=True, files_override=None)` : passe `files_by_pilot` à
  `get_global_queue` (jamais `None` dans le nouveau code : `{}` si aucun profil) ; ajoute `"raw"` aux `kinds` du bilan ;
  le bilan de fin affiche aussi le nombre de vols sans fiche brute (`summary()["no_raw"]`).
- Chrome n'est ouvert que si la file de la phase 2 n'est pas vide (comme aujourd'hui `get_driver` paresseux).

### 4. Profils à fichiers et CLI

- `params_scrap_syride.py` : `FICHIERS_PAR_PILOTE = {"AdrienM": ("gpx", "igc")}` avec le commentaire du plan (scène 10).
  `PILOTES` inchangé.
- `main.py` :
  - `--files auto|none|gpx|gpx,igc` (défaut `auto` = `FICHIERS_PAR_PILOTE` ; sinon la valeur s'applique à tous les pilotes
    de l'exécution) ;
  - `--fill-igc 1` : ne concerne que les pilotes dont les fichiers incluent `igc` ; message si aucun ;
  - `--backfill-raw 0|1` (défaut 1) ;
  - `--reparse 1` : pour les pilotes de l'exécution, `reparse_pilot` (sans réseau ni Chrome), puis pkl comme d'habitude ;
    incompatible avec le scraping dans la même exécution ? Choisis le plus simple : `--reparse 1` fait la réanalyse **à la
    place** des phases 1 et 2, puis la phase 3 et le pkl ;
  - `--scroll` : accepté, sans effet, message « option obsolète » s'il est donné ;
  - docstring du module mise à jour (phases, nouvelles options).
- `debug_flight_page.py` : ajoute au résumé la liste des requêtes réseau syride.com (via `performance.getEntriesByType`
  exécuté dans la page), sans valeur de cookie ni jeton (masque les paramètres `token`, `key`).

### 5. Tests (sans réseau, sans Chrome)

- `test_phase1.py` : `FakeTransport` servant `scraping_tests/fixtures/activites_sample.html` (+ un petit HTML avec marqueur de
  fin pour la pagination) ; `sync_pilot_list` sur une arborescence `tmp_path` : nouveaux vols créés, bilan correct, idRider mis
  en cache, `dry_run` n'écrit rien (aucun fichier créé, base inchangée), `PilotPageError` sur réponse vide, pagination.
- `test_session.py` : `process_flight` avec `read_flight_sheet` et `download_trace_via_browser` remplacés (monkeypatch) :
  fiche brute toujours enregistrée ; profil sans fichiers → aucun téléchargement ; profil `("gpx","igc")` → 2 téléchargements ;
  trace absente sans lien → `nolink` ; limite de téléchargement → `download_blocked`. `is_turnstile_gate` déclenche bien
  l'attente (fausse page, `time.sleep` remplacé).
- `test_cli.py` : analyse des options (`--files`, `--scroll` obsolète, `--reparse`) via une fonction `parse_args(argv)` extraite
  de `main()`.

## Vérification

`make test-py PYTHON=/Users/Adrien/opt/anaconda3/bin/python` vert. Puis **simulation réelle, lecture seule** :
Attention : même en `--dry-run`, `process_pilots` met à jour `flights.db` (comportement actuel) ; or la base du vrai dossier
ne doit pas être migrée depuis cette branche. Ajoute donc à `main.py` une option `--db <chemin>` (défaut : `<main_path>/flights.db`)
transmise à `process_pilots(db_path=...)` et à la génération du pkl si elle l'accepte, copie la vraie base dans ton scratchpad
et lance `cd src && /Users/Adrien/opt/anaconda3/bin/python main.py --dry-run 1 --pilots AdrienM,j2f --db <scratchpad>/flights.db` :
la phase 1 lit les listes par
HTTP et affiche les bilans sans rien écrire ; la phase 2 liste ce qui serait fait. Vérifie avec `find … -newer` qu'aucun
fichier du vrai dossier de données n'a été modifié. **Ne lance jamais `main.py` sans `--dry-run 1`** : l'essai réel se fera
avec Adrien (porte IV).

## Compte rendu final

Signatures, options CLI, tests, sortie (abrégée) de la simulation réelle, écarts au brief.
