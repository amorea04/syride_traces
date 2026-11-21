# Porte IV : premier essai réel (avec Adrien)

But : vérifier en conditions réelles, **sur une copie des données**, que la nouvelle chaîne fonctionne de bout en bout.

## Préparé

- Copie : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/` (AdrienM, j2f, `flights.db`,
  `uniformisation.json`, `sites_coordinates.json`, `name_corrections.json`, `_chrome_profile`). Les vraies données ne sont
  pas touchées. On peut supprimer la copie après la recette.
- Python : venv `syride_traces_py39` (Python 3.9, selenium réel).

## Commande (depuis le worktree)

```bash
cd /Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv/src && /Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces_py39/bin/python main.py --path /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/ --pilots AdrienM,j2f --max-sheets 6
```

Pendant l'exécution : si Chrome affiche une vérification Cloudflare ou Turnstile, la valider à la main ; le script attend
(15 min au plus) puis reprend. Ne rien faire d'autre dans la fenêtre.

## Attendus

| Étape | Attendu |
|---|---|
| Phase 1 (sans Chrome) | AdrienM : 504 vols sur Syride, 0 nouveau, ~20 modifiés, 2 absents ; j2f : 1059 vols, ~1059 modifiés (voile « Non renseig »), 0 absent |
| Phase 2 | Chrome s'ouvre, 6 fiches au plus, du numéro le plus récent au plus ancien ; chaque fiche lue crée `<num>.sheet.html.gz` |
| Fichiers | AdrienM : IGC téléchargé pour les vols concernés parmi les 6 (aucun GPX, ils l'ont tous) ; j2f : aucun téléchargement |
| Phase 3 + pkl | Pkl généré dans la copie, sans erreur |
| Diagnostic | Si un Turnstile est apparu : `_debug_turnstile_*.html` dans la copie (à garder pour en faire une fixture) |

## Contrôles après l'essai (je les lance)

```bash
find /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie -name "*.sheet.html.gz" -newer /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/uniformisation.json
```

```bash
cd /Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv/src && /Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces_py39/bin/python migration/compare_track_vs_gpx.py --pilot AdrienM --path /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/
```

Puis : comparaison du pkl de la copie avec le pkl réel (mêmes vols pour AdrienM et j2f, nouvelles colonnes remplies pour
les vols qui ont leur fiche brute), relance immédiate de la même commande (la phase 1 ne doit plus rien modifier).

## Après la porte IV

Lot F (recette A/B complète, validation des statistiques sur ~50 vols, documentation), puis fusion dans `main` avec
l'accord d'Adrien. Le lot H (affichage des nouveaux champs dans la webapp et le rapport) vient ensuite.
