# Brief lot C : statistiques de trace (Le Métrologue)

Plan de référence : `src/MIGRATION_SCRAPING.md` (acte II, scène 3). Lis-le d'abord.
Dépôt de travail : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Tu ne committes pas, tu ne changes pas de branche.**
Python : `/Users/Adrien/opt/anaconda3/bin/python` (3.8.16 : pas de `list[str]`, `X | None`, `match`). numpy 1.22, pandas 1.5.3.
Aucune dépendance nouvelle. Commentaires et docstrings en français, sobres.

## Fichiers autorisés

- `src/track_stats.py` (modification)
- `src/scraping_tests/__init__.py`, `src/scraping_tests/conftest.py` (ajoute `src/` au `sys.path`, comme
  `src/web_export/tests/conftest.py`), `src/scraping_tests/test_track_stats.py` (nouveaux)
- `src/migration/compare_track_vs_gpx.py` (nouveau)

Ne touche à rien d'autre (`flights_db.py`, `syride_parsing.py`, etc. sont à d'autres lots).

## Structure de la trace `fv-config` (dict Python, déjà décodé du JSON de la fiche)

```
{
  "points":  [[lat, lon, alt_m, vitesse_kmh, vario_ms, g, col7], ...],   # 1 point par seconde
  "times":   [t_unix, ...],                    # même longueur que points, croissant
  "terrain": [[t_unix, altitude_sol_m], ...],  # ~1 point toutes les 2 s, peut être absent ou vide
  "extrema": [{"icon": "speed"|"up"|"down"|"g"…, "time": t_unix, "position": [lat, lon],
               "label": "Vitesse max : 61 km/h" | "Vario max : 2.5 m/s" | "Vario min. : -3.5 m/s" | "G max : 1.4 g"}],
  "offset":  3600
}
```
Exemple réel (vol de 1 h 06) : 3 971 points, plafond 629 m, premier point à 59 m, gain affiché 570 m, vitesse max 61 km/h,
vario max 2.5, vario min −3.5, g max 1.4.

## Travail

1. Séparer lecture et calcul dans `track_stats.py` :
   - `stats_from_series(t, alt, dist)` : le calcul actuel de `compute_gpx_stats` (durée, plafond, gain, vitesse max robuste),
     sans changer **aucun** résultat pour un GPX ;
   - `compute_gpx_stats(path)` = `read_gpx_points` + `stats_from_series` (signature et sortie inchangées, `version` comprise).
   - extraire le calcul de distance haversine dans une fonction réutilisable.
2. `compute_track_stats(track: dict)` → dict ou `None` (trace absente, < `MIN_POINTS`, tailles incohérentes, durée ≤ 0) :
   - mêmes champs que `GPX_STAT_FIELDS`, calculés par `stats_from_series` à partir de `times`, `points[:,2]`, distance des lat/lon ;
   - `vario_min`, `vario_max`, `g_max` : depuis `extrema` (nombre lu dans `label`, par `icon`) ; à défaut min/max des colonnes
     vario (index 4) et g (index 5) ;
   - `vitesse_max_fiche` : depuis `extrema` (icône `speed`) si présent ;
   - `hauteur_sol_max` : max de (alt − altitude du sol interpolée sur `times` avec `np.interp`) ; `None` sans `terrain` ;
   - `heure_plafond` : horodatage Unix du point le plus haut ;
   - `source` : `"fv-config"` ; `version` : `STATS_VERSION`.
   - Nouvelle constante `TRACK_STAT_FIELDS` listant les champs en plus de `GPX_STAT_FIELDS`.
3. `STATS_VERSION = 3` (le commentaire en tête du module est mis à jour : sources GPX et fv-config).
4. `track_to_gpx(track, path)` : écrit un GPX 1.1 minimal (trkpt lat/lon, ele, time ISO UTC) depuis une trace `fv-config`
   (utile pour les outils externes) ; test : `compute_gpx_stats` sur ce GPX ≈ `compute_track_stats` sur la trace
   (durée et plafond identiques, gain identique, vitesse max à ±1 km/h).
5. Tests `src/scraping_tests/test_track_stats.py` (pytest, **sans réseau ni données réelles**, traces synthétiques générées
   dans le test, GPX écrits dans `tmp_path`) : non-régression GPX (un GPX synthétique, valeurs attendues fixées), trace
   fv-config nominale, sans terrain, sans extrema, trace incohérente → `None`, aller-retour `track_to_gpx`.
6. `src/migration/compare_track_vs_gpx.py` : `python src/migration/compare_track_vs_gpx.py --pilot AdrienM [--limit 50]
   [--path <main_path>]` ; pour chaque vol ayant **à la fois** `<num>.sheet.html.gz` (ou `<num>.sheet.html`) et `<num>.gpx`,
   extrait `fv-config` (bs4 : `script#fv-config`, `json.loads`), compare `compute_track_stats` et `compute_gpx_stats`,
   affiche un tableau et un bilan des écarts (durée ±2 s, plafond ±2 m, gain ±3 m, vitesse max ±10 %). S'il ne trouve aucun
   vol (cas actuel : aucune fiche brute encore), il le dit et sort avec le code 0. Lecture seule.

## Vérification

```
cd src && /Users/Adrien/opt/anaconda3/bin/python -m pytest scraping_tests web_export/tests -q -p no:cacheprovider -p no:dash
```
Tout doit passer. Vérifie aussi, sur 5 vrais GPX (lecture seule, ex.
`/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/AdrienM/traces/3766574/3766574.gpx`), que
`compute_gpx_stats` donne exactement le même résultat avant/après ta modification (hors `version`) : compare avec
`git stash`-free, en important l'ancienne version via `git show HEAD:src/track_stats.py > /tmp/...` dans un dossier temporaire.

## Compte rendu final

Fonctions ajoutées (signatures), résultats des tests, preuve de non-régression sur les 5 GPX, points d'attention.
