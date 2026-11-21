# Ancienne application Dash (archivée)

Application de statistiques en Dash, remplacée par la webapp statique de `web/` (voir `ROADMAP_WEBAPP.md`).
Conservée pour mémoire, et parce que `web/scripts/expected_stats.py` en importe `app_functions.py` pour produire
les valeurs de référence du test de non-régression des statistiques TypeScript. Ne pas la supprimer sans adapter ce script.

## La relancer

Elle lit le vrai `global_flights_data.pkl` (chemin dans `params_scrap_syride.py`). Depuis la racine du dépôt :

```bash
PYTHONPATH=src uv run --with-requirements src/legacy/requirements-legacy.txt python src/legacy/app.py
```

`--with-requirements` ajoute dash le temps de l'exécution, sans toucher à `.venv/`. Application archivée :
non vérifiée sous Python 3.14 (dash 2.0.0 et plotly 5.4.0 risquent de ne pas s'y installer).

`PYTHONPATH=src` permet à `app.py` de retrouver `params_scrap_syride`.
