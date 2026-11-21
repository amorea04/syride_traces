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

## Résultats (21/11/2026, essai avec Adrien)

| Contrôle | Résultat |
|---|---|
| Phase 1 | Conforme : AdrienM 504 / 0 nouveau / 20 modifiés / 2 absents ; j2f 1059 / 1059 modifiés / 0 absent ; 0 doublon |
| Phase 2 | 6 fiches brutes enregistrées (`.sheet.html.gz`), du numéro le plus récent au plus ancien ; aucun Turnstile, aucune limite de fiches |
| Fichiers | **Non vérifié** : Syride a répondu « DOWNLOAD LIMIT REACHED » dès la 1ʳᵉ fiche (quota du compte épuisé ce jour-là). Le script l'a bien traité (fiches parcourues en « infos seules », 6 vols signalés en attente de fichiers). j2f : aucun téléchargement (conforme) |
| Phase 3 + pkl | pkl généré, 1564 vols (AdrienM 505, j2f 1059), mêmes `(pilote, num_activite)` que le pkl réel |
| `compare_track_vs_gpx` | 5/6 dans les tolérances au 1er passage ; 3766574 : vitesse max 122 km/h (fiche) contre 68 (GPX). **Corrigé** (voir ci-dessous) : 6/6 |
| Relance immédiate | Phase 1 : 0 nouveau, 0 modifié, 0 absent pour les deux pilotes (idempotente) ; 6 fiches j2f suivantes, sans téléchargement ni JSON réécrit |
| Comparaison des pkl | Mêmes vols et colonnes (+ `syride_status`, `vario_min`, `hauteur_sol_max`, `heure_plafond`, remplies pour les 12 vols à fiche brute). Écarts attendus (Syride fait foi) : `types` 7, `site` 2, `voile` 11, `type_vol` 6. Statistiques identiques pour les 12 vols passés de `gpx` à `trace`. `mean_latitude/longitude` : 129 écarts (dictionnaire des sites recalculé, 38 sites), à expliquer au lot F par la comparaison A/B ancien code / nouveau code |

### Corrections faites pendant la porte

1. `track_stats.compute_track_stats` : la trace `fv-config` est rééchantillonnée à 1 point/s et répète la position
   quand l'instrument n'en donne qu'une toutes les ~2 s (42 % des points sur 3766574). La vitesse max est désormais
   calculée sur les seules positions nouvelles ; `STATS_VERSION` passe à 4 (recalcul unique des stats en cache).
2. `flights_db._reconcile` : les lignes indexées avant l'ajout de la colonne `syride_status` gardaient le défaut
   `unknown` (484 vols d'AdrienM). Un vol vu dans la liste est maintenant marqué `present` dans l'index, sans réécrire
   son JSON.

### Reste ouvert

- Téléchargement GPX + IGC d'AdrienM à vérifier un autre jour (quota rétabli) : par exemple
  `--pilots AdrienM --max-sheets 2 --fill-igc 1` sur la copie.
- Détail d'affichage : quand `--max-sheets` est atteint, la ligne `[7/…]` est affichée (et la pause faite) avant l'arrêt.
