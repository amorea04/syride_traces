# Raccourcis de la refonte webapp (ROADMAP_WEBAPP.md)
PYTHON ?= python

.PHONY: export fixtures test-py

# Données réelles -> web/public/data/ (ignoré par Git)
export:
	$(PYTHON) src/export_web.py

# Régénère les données synthétiques commitables de web/tests/fixtures/data/
fixtures:
	$(PYTHON) src/web_export/fixtures.py

test-py:
	cd src && $(PYTHON) -m pytest web_export/tests -q -p no:cacheprovider -p no:dash
