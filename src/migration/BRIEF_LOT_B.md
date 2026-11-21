# Brief lot B : parsing (Le Philologue)

Plan de référence : `src/MIGRATION_SCRAPING.md` (acte II, scène 2) et **contrat des endpoints `src/migration/SYRIDE_API.md`**
(lot A). Lis-les d'abord.
Worktree : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Pas de commit, pas de changement de branche, pas de `git stash`.**
Python `/Users/Adrien/opt/anaconda3/bin/python` (3.8.16). Aucune dépendance nouvelle. Français sobre.

## Fichiers autorisés

- `src/syride_parsing.py` (le lot D y a ajouté un `parse_fv_config` minimal : enrichis-le, garde sa signature)
- `src/scraping_tests/test_parsing.py` (nouveau)
- `Makefile` : cible `test-py` → `cd src && $(PYTHON) -m pytest web_export/tests scraping_tests -q -p no:cacheprovider -p no:dash`
- `.github/workflows/ci.yml` : même extension de la commande pytest
- `src/requirements-export.txt` : ajoute `beautifulsoup4==4.11.2` (même version que `requirements-scraping.txt`) avec un
  commentaire court

Fixtures disponibles (anonymisées, **ne pas les régénérer**) : `src/scraping_tests/fixtures/activites_sample.html`
(5 vols : 4 Syride + 1 non Syride), `sheet_recent.html`, `sheet_old.html`. Attention : dans les fiches, `points`, `times`
et `terrain` sont **synthétiques** ; le reste (métriques, `dl.fv-info`, `<time>`, liens, extrema) vient de vraies fiches.

## Travail (fonctions pures : ni réseau, ni Selenium, ni disque)

1. `parse_id_rider(html) -> str | None` : regex du contrat (input caché `idRider`, repli sur l'URL `activites.php`).
2. `parse_activities_response(html, pilote) -> dict` :
   `{"flights": [dict, ...], "end_of_list": bool, "activity_ids": [...]}`.
   - chaque vol = sortie de `get_nav_infos_bs` (réutilisée, **pas réécrite**) + `nom_vol` (élément `nom<num>`),
     `date_publication` (`.dateActivite`), `flight_token` = `{"expires": int, "token": str}` lu dans
     `showFlightInPopup(<num>, <expires>, '<token>', …)` (`None` pour un vol non Syride) ;
   - les activités qui ne sont pas des vols (sans `type<num>`) sont ignorées sans message d'erreur ;
   - `end_of_list` : marqueur `<!-- syride-no-more-activity -->` ;
   - `activity_ids` : les `id_activite` dans l'ordre (pour la pagination `beforeId`) ;
   - aucune activité lisible **et** pas de marqueur de fin → `ValueError` explicite (le lot E la traduit en `PilotPageError`).
3. `parse_flight_sheet_full(html) -> (sheet, links, track)` :
   - `sheet` = champs de `FLIGHT_SHEET_FIELDS` comme aujourd'hui **+ `vario_min`** (`Vario min.` du bandeau) ;
   - `gain` : **valeur affichée** (« Gain » de `dl.fv-info`) en priorité, calcul depuis `fv-config` seulement en repli
     (le calcul actuel donne 41 et 44 sur les fixtures parce que leurs points sont synthétiques : c'est attendu, la valeur
     affichée doit gagner) ;
   - `links` : `{"gpx", "igc", "kml"}` (ajoute `kml`) ;
   - `track` = `parse_fv_config(html)` ;
   - `parse_flight_sheet(html) -> (sheet, links)` garde sa signature (adaptateur), pour le code existant. `vario_min` peut
     y apparaître : vérifie que `FLIGHT_SHEET_FIELDS` / `flights_db` / le pkl le supportent ou ajoute-le à la liste avec
     prudence (lis `flights_db.load_pilot_frames` et `_upsert_json` : `has_sheet` repose sur `plafond`).
4. `parse_fv_config(html) -> dict | None` : validation ajoutée — `points` et `times` de même longueur, `times` croissants
   (sinon `None` et un message court), coordonnées dans [-90, 90] / [-180, 180] ; garde `points`, `times`, `terrain`,
   `extrema`, `offset`, `distance`, `units` ; **retire** `token`, `url3d` et toute clé contenant une URL signée.
5. `is_turnstile_gate(html_or_text) -> bool` : présence de `flightTurnstileGate`, `cf-turnstile` ou `turnstile` dans un
   conteneur visible de la page parente (heuristique simple, documentée), pour que le lot E sache qu'il faut attendre l'humain.
6. `normalize_missing(value)` : `None`, `"None"`, `""`, `"nan"` → `None` ; le reste inchangé (chaîne nettoyée).
7. Mets à jour le commentaire « fiche fv- » (le Gain et le Vario min sont de nouveau affichés).

## Tests `src/scraping_tests/test_parsing.py`

Sur les fixtures : idRider absent des fixtures (anonymisé en 99999 : vérifie ce que tu trouves) et sur de petits HTML écrits
dans le test ; liste (5 vols, 1 non Syride sans jeton, jetons lus, fin de liste, activité non-vol ignorée, `ValueError`) ;
fiches récente et ancienne (valeurs attendues lues à la main dans la fixture : plafond, gain affiché, vario min/max, vitesse,
distance, durée HH:MM:SS, site `SiteTest1`, 3 liens) ; `parse_fv_config` (nominal, tailles différentes, temps décroissants,
`token`/`url3d` retirés) ; `is_turnstile_gate` ; `normalize_missing`. Non-régression : l'ancienne fiche `.volTexte`
(fabrique un petit HTML) reste lue par `parse_flight_sheet`.

## Vérification

```
make test-py        # depuis la racine du worktree, PYTHON=/Users/Adrien/opt/anaconda3/bin/python
```
Tout vert (web_export + scraping_tests).

## Compte rendu final

Signatures, tests, modifications de `FLIGHT_SHEET_FIELDS` éventuelles et leur impact, écarts au brief.
