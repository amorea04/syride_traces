# Brief commun, phase 1 : export des données web

Lis d'abord `ROADMAP_WEBAPP.md` §4 (contrat de données), §8 « Phase 1 » et §11 (décisions, surtout **D12**).
Le contrat fait foi : `src/web_export/schema.json` (JSON Schema 2020-12).

## Contexte technique
- Racine du dépôt : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/` ; branche `web/phase-1-export`.
- Python : `python` = anaconda **3.8.16** (`/Users/Adrien/opt/anaconda3/bin/python`). pandas, numpy, jsonschema 4.17, pytest 7.2 disponibles. **Pas de `list[str]`/`X | Y` évalués à l'exécution, pas de `match`, pas de `removeprefix`** (ou `from __future__ import annotations`). N'installe aucun paquet.
- Données réelles : `global_flights_data.pkl` (chemin : `params_scrap_syride.pkl_path`, `import params_scrap_syride as params` depuis `src/`). 9 635 vols, 36 colonnes, 23 pilotes, 436 sites. Colonnes utiles : `pilote, num_activite, types, site, date, heure (datetime.time), voile, instrument, distance, distance_cumulee, vitesse_moyenne, vitesse_max, plafond, gain, vario_max, g_max, duree_vol_minutes, type_vol (parapente|paramoteur), source_stats (gpx|fiche|aucune), incomplet, mean_latitude, mean_longitude, date_update`. 12 vols ont une date < 1980 (sentinelle 1901).
- Rapport HTML existant : `src/rapport/` (`report_data.py` calculs, `report_html.py` assemblage et moteur de textes, `report_textes.md`). `prepare_report_df` et `mode_of` sont dans `report_data.py`. **Le rendu du rapport HTML ne doit pas changer.**
- Interface commune **déjà écrite**, à utiliser telle quelle : `src/web_export/common.py` (`slugify`, `pilot_slugs`, `flight_key`, `dumps_compact`, `write_hashed_json`, `SCHEMA_VERSION`). N'en change pas les signatures ; si un ajout est indispensable, ajoute une fonction sans casser l'existant et signale-le.
- Sortie : `web/public/data/` (ignoré par Git). Imports : les scripts ajoutent `src/` au `sys.path` comme `rapport/generate_reports.py`, puis `from web_export.common import …`, `from rapport.report_data import …`.

## Interdits
- **D12** : aucune trace, aucune géométrie de vol, **aucune coordonnée par vol** (pas de `latitude/longitude/mean_*` par vol dans `flights.json`). Les coordonnées n'existent qu'au niveau du site (moyenne).
- Ne commite rien, aucune opération git (le maître d'œuvre s'en charge). Ne crée aucun fichier de données réelles hors de `web/public/data/` et du scratch ; les fixtures commitables sont **synthétiques** (pilotes fictifs).
- Ne modifie pas `ROADMAP_WEBAPP.md` (le maître d'œuvre coche).
- Ne touche qu'aux fichiers de ton lot (liste dans ta mission) : d'autres agents travaillent en parallèle dans le même dossier.
- Pas de gadget refusé par Adrien (badges, médailles, radar, percentile de groupe) même sous forme de données.

## Conventions
- Code et commentaires en français, sobres ; constantes nommées en tête de module ; fonctions courtes, docstrings d'une ligne ou deux.
- JSON : compact, déterministe, `null` pour l'inconnu (jamais NaN, 0 ou −1 en remplacement), arrondis du §4.2 (1 décimale vitesses/distances/durée/vario/g, entier altitudes).
- Tests pytest dans `src/web_export/tests/` (un fichier par module, préfixe par lot). Ils doivent tourner **sans le pkl réel** sur les fixtures synthétiques ; les tests sur données réelles sont marqués `@pytest.mark.real` et sautés si le pkl est absent. Lancer : `cd src && python -m pytest web_export/tests -q`.

## Compte rendu attendu (ton dernier message, factuel)
Ce qui est fait et vérifié, ce qui ne l'est pas (et pourquoi), fichiers créés ou modifiés, résultats des tests (sortie résumée), chiffres mesurés, points d'attention pour le relecteur.
