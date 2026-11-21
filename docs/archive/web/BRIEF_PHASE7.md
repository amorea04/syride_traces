# Brief phase 7 : déploiement, automatisation, bascule

Branche : `web/phase-7-deploiement`. Référence : `ROADMAP_WEBAPP.md` §8 phase 7, §9.2, D12.
Maître d'œuvre : Opus (relecture, intégration, commits). Les agents **ne committent pas**, ne poussent pas, ne changent pas de branche.

## Contexte utile

- Python local : `/Users/Adrien/opt/anaconda3/bin/python` (**3.8.16**) : pas de `list[str]`, pas de `match`, pas de `X | None` (sauf `from __future__ import annotations`). Node 22.
- Pipeline : `src/main.py` (scraping) → `global_flights_data.pkl` → `src/export_web.py` → `web/public/data/` (`meta.json`, `flights.<hash>.json`, `sites.<hash>.json`, `insights/`) → `npm run build` (copie `public/data` dans `web/dist/data`) → Cloudflare Pages.
- `flights.<hash>.json` est colonnaire : clés `schema_version, columns, dict, pilot_slugs, rows` ; colonnes actuelles : `pilot, activity, date, time, site, wing, instrument, mode, duration_min, dist_km, dist_cum_km, speed_avg, speed_max, ceiling_m, gain_m, vario_max, g_max, incomplete, source, syride_num`. Schéma : `src/web_export/schema.json`.
- Lien Syride d'un vol : `https://www.syride.com/fr/pilotes/<pilote>/<syride_num>` (voir comment le front le construit : `grep -rn syride.com web/src`).
- Tests Python : `make test-py` (pytest dans `src/web_export/tests`). Tests web : `cd web && npm run lint && npm run typecheck && npm test && npm run e2e` (e2e sur fixtures synthétiques `web/tests/fixtures/data`, jamais les vraies données).
- `.gitignore` racine en **liste blanche** (`/*` puis `!/...`). Hook `.githooks/pre-commit` anti-données.
- Interdits : committer ou copier ailleurs des données réelles ; publier une trace (D12) ; tout service payant ; déployer depuis la CI ; lancer un vrai `wrangler pages deploy` (Adrien n'est pas encore connecté, le déploiement réel sera fait par le maître d'œuvre avec lui).
- Style : messages et commentaires en français, sobres. Code lisible, pas de sur-ingénierie.

## Lot A : publication (7.1 côté code, 7.2, 7.3)

Fichiers : `src/publish.py` (nouveau), `src/main.py`, `Makefile`, `web/package.json` + `web/package-lock.json` (ajout de `wrangler` en devDependency, version exacte épinglée), `web/playwright.publish.config.ts` + `web/e2e-publish/smoke.spec.ts` (nouveaux), `src/web_export/tests/test_publish.py` (nouveau).

`src/publish.py` (exécutable `python src/publish.py`, fonctions testables, `main(argv=None) -> int`) :
1. **Fraîcheur** : compare la date de modification du pkl (`params_scrap_syride.pkl_path`) à celle de `web/public/data/meta.json`. Si le pkl est plus récent (ou pas de meta) → export ; sinon on saute l'export avec un message (option `--force-export` pour forcer).
2. **Export incrémental** : appelle `export_web.main([...])` (pas de sous-processus nécessaire), sans `--full`.
3. **Build** : `npm ci` (sautable avec `--skip-install`) puis `npm run build` dans `web/`. Arrêt net à la moindre erreur.
4. **Smoke test** Playwright sur `vite preview` du build **réel** (sans `VITE_DATA_DIR`, port dédié, par ex. 4174) via `web/playwright.publish.config.ts` (webServer = `npm run preview -- --port 4174 --strictPort`, sans rebuild ; service workers bloqués). 3 pages : `/`, `/vols`, `/pilotes` : la page se charge, un contenu chiffré non vide s'affiche, aucune erreur console. Les specs ne doivent pas dépendre de noms de pilotes précis. `--skip-smoke` pour sauter. Ne doit pas être ramassé par `npm run e2e` (dossier séparé).
5. **Contrôle D12** (fonction pure `check_d12(dist_dir) -> list[str]` des violations, bloquant) : aucun fichier `.gpx/.igc/.kml` (casse indifférente), aucun dossier `tracks`, et dans chaque `data/flights.*.json` aucune colonne de géométrie par vol (noms contenant `lat`, `lon`, `lng`, `coord`, `geom`, `polyline`, `track`, `trace`, `path`, `alt_profile`… choisir une liste explicite et la documenter). Mieux : liste blanche des colonnes attendues lue depuis `src/web_export/schema.json` si c'est simple et robuste, sinon liste noire.
6. **Liens Syride** : 3 vols tirés au hasard dans `flights.*.json` → requête `HEAD` (repli `GET` si 405), timeout 10 s, User-Agent générique (aucune info personnelle). Statuts 2xx/3xx = OK. 403/429/503 (protection anti-robots) = simple avertissement. Bloquant **seulement** si les 3 répondent 404. `--skip-links` pour sauter (hors ligne).
7. **Déploiement** : d'abord `npx wrangler whoami` ; s'il n'est pas connecté, message clair (« lance `cd web && npx wrangler login` ») et code retour non nul. Puis `npx wrangler pages deploy dist --project-name syride-analyse --branch main` depuis `web/`. Nom de projet en constante, surcharge `--project-name`.
8. **Bilan** : URL (`https://syride-analyse.pages.dev`), taille totale de `dist` et de `dist/data` (brut et gzip), nombre de fichiers, durée totale.
- Option `--dry-run` : tout sauf l'étape 7 (et sauf `whoami`).
- Chaque étape affiche une ligne d'en-tête numérotée ; erreurs sur stderr ; code retour 0/1.

`Makefile` : cibles `publish` (`$(PYTHON) src/publish.py`) et `publish-dry` (`--dry-run`), ajoutées à `.PHONY`. Ne pas toucher aux autres cibles.

`src/main.py` (7.3) : option `--publish` en entier 0/1 (comme les autres options), défaut 0. Après génération réussie du pkl, si `--publish 1` → `publish.main([])` et `sys.exit` sur son code. Ignorée en `--dry-run` et si `--pkl 0`... réfléchis : avec `--pkl 0`, publier quand même est légitime (le pkl existe déjà) ; garde ce comportement et documente-le dans la docstring du module.

Tests `test_publish.py` (pytest, sans réseau, sans npm) : `check_d12` (cas propre, `.GPX` imbriqué, dossier `tracks/`, colonne `lat`), décision de fraîcheur, tirage des liens (construction des URL), verdict des statuts HTTP (fonction pure), calcul des tailles.

Vérifier : `make test-py`, `python src/publish.py --dry-run --skip-install` sur les vraies données (doit aller jusqu'au bilan ; si le smoke échoue, corriger le test, pas l'appli, sauf vrai bug à signaler), `cd web && npm run lint && npm run typecheck`.

## Lot B : CI et archivage (7.4, 7.7)

Fichiers : `.github/workflows/ci.yml` (nouveau), `.gitignore` (ajouter `!/.github/` dans la liste blanche, rien d'autre), `src/legacy/` (nouveau : `git mv src/app.py src/app_functions.py src/legacy/`), `src/requirements*.txt`, `web/scripts/expected_stats.py` (chemin d'import d'`app_functions`), `src/web_export/fixtures.py` (commentaire seulement), tout autre fichier qui référence `app.py`/`app_functions.py` (hors `ROADMAP_WEBAPP.md`, `web/BRIEF_*`, `README.md` : ne pas toucher). **Ne pas toucher** `Makefile`, `src/main.py`, `web/package*.json`, `src/publish.py`.

7.7 :
- `src/legacy/` : `app.py`, `app_functions.py`, un court `README.md` (ancienne webapp Dash, remplacée par `web/`, conservée pour mémoire et pour `web/scripts/expected_stats.py` ; comment la relancer si besoin) et `requirements-legacy.txt` (dash, dash-mantine-components avec la remarque existante, dash-iconify, plotly, non épinglés ou épinglés si installés).
- Vérifier que `app.py` tourne encore depuis `src/legacy/` si c'est trivial (imports relatifs à `params_scrap_syride` etc.) ; sinon le documenter dans le README legacy, sans y passer du temps.
- Remplacer `src/requirements.txt` par `src/requirements-scraping.txt` (main.py, scraping, pkl, sites) et `src/requirements-export.txt` (export_web, web_export, src/rapport, pytest et ce qu'il faut pour `make test-py` et `web/scripts/expected_stats.py`). Déterminer les dépendances **en lisant les imports** (`grep -h "^import\|^from" ...`). Versions **épinglées** (`==`) d'après `python -m pip freeze` de l'interpréteur ci-dessus (Python 3.8). Les dépendances du PDF (fpdf2, matplotlib, seaborn, kaleido) : là où elles sont réellement importées (si seul le PDF cassé les utilise, les mettre dans un `src/requirements-pdf.txt` avec une ligne d'explication).
- Supprimer `src/requirements.txt` (mettre à jour les références éventuelles, sauf README racine).

7.4 `.github/workflows/ci.yml` :
- Déclenché sur `pull_request` et `push` sur `main`. `permissions: contents: read`. **Aucun secret, aucun déploiement.** `concurrency` pour annuler les runs obsolètes.
- Job `python` : Python 3.8 (si indisponible sur `ubuntu-latest`, utiliser `ubuntu-22.04`), cache pip, `pip install -r src/requirements-export.txt`, puis la même commande que `make test-py`.
- Job `web` : Node 22, cache npm (`web/package-lock.json`), `npm ci`, `lint`, `typecheck`, `test`, `npx playwright install --with-deps chromium`, `npm run e2e` (avec `CI=true`). Les e2e utilisent les fixtures (déjà le cas via `playwright.config.ts`). Upload du rapport Playwright en artefact seulement en cas d'échec.
- Vérifier localement ce qui est vérifiable : YAML valide (`python -c "import yaml..."` si dispo), `make test-py` passe après le déplacement, `cd web && npm test` passe (le test de régression des stats ne doit pas casser), `python web/scripts/expected_stats.py` fonctionne encore (il réécrit un fichier attendu : vérifier avec `git diff` qu'il ne change rien, sinon restaurer et signaler).

## Rendu attendu de chaque agent

Un rapport court : fichiers créés ou modifiés, commandes de vérification lancées et leur résultat, points d'attention ou décisions prises, ce qui reste à faire par Adrien.
