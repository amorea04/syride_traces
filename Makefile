# Raccourcis de la refonte webapp (ROADMAP_WEBAPP.md)
PYTHON ?= python

.PHONY: export fixtures expected-stats test-py publish publish-dry

# Données réelles -> web/public/data/ (ignoré par Git)
export:
	$(PYTHON) src/export_web.py

# Régénère les données synthétiques commitables de web/tests/fixtures/data/
fixtures:
	$(PYTHON) src/web_export/fixtures.py

# Valeurs de référence des statistiques TS (appelle app_functions.py et report_data.py sur les fixtures)
expected-stats:
	$(PYTHON) web/scripts/expected_stats.py

test-py:
	cd src && $(PYTHON) -m pytest web_export/tests scraping_tests -q -p no:cacheprovider -p no:dash

# Export, build, contrôles puis déploiement Cloudflare Pages (src/publish.py)
publish:
	$(PYTHON) src/publish.py

# Idem sans déploiement
publish-dry:
	$(PYTHON) src/publish.py --dry-run
