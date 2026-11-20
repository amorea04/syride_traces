# syride_traces

Récupère les vols des pilotes publiés sur [Syride](https://www.syride.com), calcule leurs statistiques et les publie
dans une webapp statique : **https://syride-analyse.pages.dev** (accès public, 0 €).

## Le pipeline

```
Mac (local)
  src/main.py            scraping Syride ► dossiers pilotes ► flights.db ► global_flights_data.pkl
  src/export_web.py      pkl ► web/public/data/  (meta, flights, sites, insights ; aucune trace, règle D12)
  web/  npm run build    ► web/dist/
  src/publish.py         contrôles puis wrangler pages deploy ► Cloudflare Pages
                                                                 │
GitHub (code seulement)  CI : tests sur données synthétiques     ▼
                                                  https://syride-analyse.pages.dev
```

Les données réelles (traces, pkl, base, `web/public/data/`) ne vont **jamais** sur GitHub : elles partent du Mac vers
Cloudflare au déploiement. La `.gitignore` est en liste blanche et un hook refuse les commits de données.

## Installation (une fois)

```bash
git config core.hooksPath .githooks                # garde-fou anti-données
pip install -r src/requirements-scraping.txt       # scraping et pkl
pip install -r src/requirements-export.txt         # export web, rapport HTML, tests
cd web && npm ci && npx playwright install chromium && npx wrangler login
```

Python 3.8 (environnement anaconda), Node 22. `wrangler login` ouvre le navigateur pour se connecter au compte
Cloudflare ; aucun moyen de paiement n'est nécessaire, n'en enregistrer aucun.

## Publier

```bash
make publish            # export incrémental, build, smoke test, contrôle D12, liens Syride, déploiement
make publish-dry        # tout sauf le déploiement
cd src && python main.py --publish 1   # scraping, pkl puis publication en une commande
```

Options de `python src/publish.py` : `--dry-run`, `--force-export` (l'export est sauté si `meta.json` est plus récent que
le pkl), `--skip-install` (sans `npm ci`), `--skip-smoke`, `--skip-links` (hors ligne), `--project-name`.

## Développer

| Commande | Rôle |
|---|---|
| `cd web && npm run dev` | Serveur de dev sur les vraies données (`VITE_DATA_DIR=tests/fixtures/data` pour les synthétiques) |
| `cd web && npm run lint && npm run typecheck && npm test && npm run e2e` | Contrôles du front (comme la CI) |
| `make test-py` | Tests de l'export Python |
| `make export` | Export seul des données |

Plus de détails : [`src/README.md`](src/README.md) (scraping), [`web/README.md`](web/README.md) (webapp),
[`src/rapport/`](src/rapport/) (rapport HTML annuel pilote × année), [`ROADMAP_WEBAPP.md`](ROADMAP_WEBAPP.md).
L'ancienne webapp Dash est archivée dans [`src/legacy/`](src/legacy/).

## Dépannage

| Symptôme | Cause et remède |
|---|---|
| « wrangler n'est pas connecté » | `cd web && npx wrangler login` |
| `Project not found` au déploiement | Créer le projet une fois : `cd web && npx wrangler pages project create syride-analyse --production-branch main` |
| « export sauté » alors que des vols ont été ajoutés | Le pkl n'a pas été régénéré (`main.py --pkl 0` ?) ; sinon `--force-export` |
| Le smoke test échoue | Regarder `web/test-results/` ; `npm run preview` pour reproduire sur le build réel |
| « violations de la règle D12 » | Une trace ou une colonne de coordonnées par vol est arrivée dans `dist/` : corriger l'export, ne jamais forcer |
| Liens Syride en 403 ou 429 | Protection anti-robots de Syride : simple avertissement, ou `--skip-links` |
| Le site affiche d'anciennes données | Le service worker sert le cache puis se met à jour : recharger la page une seconde fois |
