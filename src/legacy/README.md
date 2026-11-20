# Ancienne application Dash (archivée)

Application de statistiques en Dash, remplacée par la webapp statique de `web/` (voir `ROADMAP_WEBAPP.md`).
Conservée pour mémoire, et parce que `web/scripts/expected_stats.py` en importe `app_functions.py` pour produire
les valeurs de référence du test de non-régression des statistiques TypeScript. Ne pas la supprimer sans adapter ce script.

## La relancer

Elle lit le vrai `global_flights_data.pkl` (chemin dans `params_scrap_syride.py`). Depuis la racine du dépôt :

```bash
pip install -r src/legacy/requirements-legacy.txt
PYTHONPATH=src python src/legacy/app.py
```

`PYTHONPATH=src` permet à `app.py` de retrouver `params_scrap_syride`. `app_functions.py` annote `list[str]`
(Python 3.9+) : sous Python 3.8, `app.py` ne s'importe pas tel quel.
