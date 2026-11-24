# Recette de la migration du scraping (lot F)

Date : 21/11/2026. Branche `scraping/migration-fv`. Matrice : `src/MIGRATION_SCRAPING.md` §2.
Légende : **coché** = preuve donnée ; **expliqué** = non applicable ou raison donnée ; **ouvert** = reste à faire ;
**Architecte** = recette réseau (R1 à R4) à remplir par l'Architecte.

## 1. Résultats d'ensemble

| Contrôle | Résultat |
|---|---|
| `make test-py` (anaconda 3.8) | **265 tests verts** (255 au départ + 10 de `test_compare_pkl.py`) |
| `cd web && npm test` | **vert** : 62 fichiers, 914 tests (exécuté dans le checkout principal, dont `web/` et `src/web_export/` sont identiques à cette branche : `git diff main --stat -- web src/web_export src/export_web.py` vide) |
| Comparaison A/B, copie complète des données | **conforme** : 9585 vols identiques, aucun écart (section 2) |
| Export web A contre B | **identique** hors `generated_at` de `meta.json` (153 fichiers) |
| Validation des statistiques | 20/20 vols dans les tolérances, échantillon **partiel** (`VALIDATION_STATS.md`) |

## 2. Comparaison A/B (scène 11)

**Protocole.** Copie des données réelles (`rsync -a`, 2,9 Go, sans `src`, `web`, `html_reports`, `pdf_reports`,
`_chrome_profile`, `_migration_captures`) vers `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/recette_ab/`.
Copies intactes pour rejouer : `flights.db.orig`, `sites_coordinates.json.orig`, `pkl_reel_20_11.pkl`.

- **A (ancien code)** : `create_global_pkl.create_gobal_flight_data(<copie>, params.dict_pilotes)` importé depuis le
  checkout principal (`syride_traces/src`, branche `main`, `PYTHONDONTWRITEBYTECODE=1`), chemin de données = la copie,
  sans réseau. Sortie : `recette_ab/pkl_A.pkl`. La base `flights.db` obtenue est gardée en `flights.db.after_A`.
- Remise de `flights.db` et `sites_coordinates.json` à l'état d'origine, puis **B (nouveau code)** :
  `python main.py --path <copie> --reparse 1` (worktree, venv py39, 3 min 44 s). Sortie : `recette_ab/pkl_B.pkl`.
  La base de la copie est migrée par le nouveau code (colonnes ajoutées, 8,4 Mo -> 10,2 Mo) : voulu.
- `python src/migration/compare_pkl.py --a pkl_A.pkl --b pkl_B.pkl`.

**Résultats.**

| Mesure | Valeur |
|---|---|
| Vols A / B / appariés | 9585 / 9585 / 9585 (23 pilotes) |
| Ensembles `(pilote, num_activite)` | identiques, aucune clé en double |
| Colonnes | 36 en A ; B ajoute exactement `syride_status`, `vario_min`, `hauteur_sol_max`, `heure_plafond` |
| Écarts de valeurs (hors `date_update`) | **0** sur toutes les colonnes communes, y compris `mean_latitude`, `mean_longitude` |
| `source_stats` | identique : 8769 `gpx`, 762 `fiche`, 54 `aucune` (aucune fiche brute dans les dossiers réels) |
| Vols `incomplet` | 54, identiques |
| A contre le pkl réel du 20/11 ; B contre le pkl réel | 0 écart aussi |
| Nouvelles colonnes dans B | `syride_status` = `present` pour les 9585 ; `vario_min`, `hauteur_sol_max`, `heure_plafond` vides (aucune fiche brute) |
| Export web (`export_web.py --pkl ... --out <temp>`) | A et B : 153 fichiers, mêmes contenus ; seul `meta.json` diffère par `generated_at` ; 14 sites sans coordonnées dans les deux cas (le même `sites_coordinates.json` du worktree sert aux deux exports) |

**Écarts expliqués.**

- `mean_latitude` / `mean_longitude` (129 écarts à la porte IV) : ils venaient de la comparaison du pkl de
  `porte4_copie` (2 pilotes, 1564 vols) au pkl réel (23 pilotes). Le dictionnaire des sites est calculé sur les vols
  présents dans le pkl (`sites_coordinates.update_sites_coordinates`) ; il dépend donc des pilotes traités. Vérifié :
  le pkl de `porte4_copie` contre `pkl_B` restreint aux mêmes pilotes donne bien 129 écarts sur 38 sites ; sur la copie
  complète, A et B sont identiques. Ce n'est pas un défaut du nouveau code.
- `syride_status` : le brief attendait `unknown` pour les vols non réconciliés. La correction de la porte IV pose
  `present` pour tout JSON sans clé `syride_status` (`flights_db._upsert_json`, ligne 248). Ici les 9585 vols sont donc
  `present`. Conséquence : tant qu'une réconciliation réelle n'a pas eu lieu, aucun vol n'est `absent` dans le pkl, y
  compris les 2 vols connus d'AdrienM et les ~27 annoncés par le plan (points ouverts, point 3).

## 3. Matrice de parité

| N° | Exigence | État | Preuve ou explication |
|---|---|---|---|
| P1 | 3 phases | coché (tests) ; R1 : Architecte | `test_process_pilots_phase1_sans_chrome`, `test_process_pilots_file_raw_et_bilan` ; porte IV : phases 1 à 3 enchaînées sur copie, pkl de 1564 vols |
| P2 | `--scrape 0` | coché | `test_valeurs_par_defaut`, `test_main_transmet_les_options` ; R2 conforme (phase 1 « Ignorée (--scrape 0) », aucune fiche) |
| P3 | `--dry-run 1` | coché (tests + R3) | `test_dry_run_n_ecrit_rien`, `test_dry_run_dossier_pilote_inexistant`, `test_process_pilots_dry_run_ne_cree_rien`, `test_dry_run_sans_db_ne_touche_pas_a_la_vraie_base`, `test_dry_run_sans_base_existante_n_en_cree_pas` |
| P4 | `--max-sheets N` (défaut 40 par lancement, 0 = sans plafond) | coché | `test_main_plafond_de_fiches`, `test_budget_unitaire`, `test_max_sheets_deux_fiches_sur_cinq`, `test_max_sheets_ne_montre_pas_la_ligne_suivante_ni_ne_pause` (`test_limits.py`) ; porte IV : 6 fiches lues. Défaut d'affichage `[7/…]` corrigé |
| P5 | `--fill-igc 1` limité aux profils à fichiers | coché | `test_main_fill_igc_avec_profil_igc`, `test_main_fill_igc_sans_pilote_igc` (avertissement), `test_file_fill_igc_et_groupes`, `test_flight_kind_ignore_l_igc_sans_fill_igc` |
| P6 | `--pilots`, `--path`, `--pkl`, `--publish`, `--regen-sites` | coché (partiel) ; R1 : Architecte | `test_main_transmet_les_options`, `test_db_personnalisee_exige_pas_de_pkl` ; `--path` et `--pkl` exercés par la recette A/B et la porte IV. `--publish` et `--regen-sites` non exécutés (réseau / écriture) |
| P7 | `--scroll` sans effet | coché | `test_scroll_obsolete_accepte` |
| P8 | Modes `tasks` et `private` | coché | `test_file_modes_et_no_link`, `get_global_queue` avec `tasks="info"/"files"/"autre"` (`test_flights_db.py`), `test_process_pilots_phase1_sans_chrome` ; `private` : `test_private_profil_temporaire_supprime`, `test_non_private_profil_persistant` |
| P9 | Comptes multiples `syride_accounts` | coché (relecture) | `git diff main -- src/params_scrap_syride.py` : seul `FICHIERS_PAR_PILOTE` est ajouté ; `syride_accounts` (lignes 91-98) inchangé |
| P10 | Connexion (session du profil, sinon `.env`) | R1 : Architecte | Porte IV : phase 2 exécutée avec 6 fiches lues, donc connexion établie. Non testable sans réseau |
| P11 | Pause Cloudflare, étendue au Turnstile | coché (tests) ; R4 : Architecte | `test_turnstile_declenche_l_attente_puis_reprise`, `test_wait_for_turnstile_*` (rappel 60 s, délai maximal, défi dans l'iframe, sortie dès fiche affichée), `test_phase_2_s_arrete_proprement_sur_delai_turnstile`, `test_capture_de_diagnostic_une_seule_fois_par_execution`. Porte IV : aucun Turnstile n'est apparu, donc pas de validation à la main constatée |
| P12 | Limite « trop de fiches » : attentes 2/2/5 min, ralentissement | coché | `test_detect_limit`, `test_read_flight_sheet_attentes_puis_reprise`, `test_read_flight_sheet_limite_persistante_leve_ratelimit`, `test_limite_par_minute_ralentissement_plafonne` (×1,5 plafonné à ×4), `test_limite_par_minute_persistante_arret_propre` |
| P13 | Limite quotidienne : arrêt propre | coché | `test_limite_quotidienne_arret_propre` ; constaté en réel le 21/11 (arrêt propre après 8 fiches, 492 vols restants annoncés) |
| P14 | Limite de téléchargement : « informations seules » | coché | `test_limite_de_telechargement`, `test_mode_informations_seules`, `test_informations_seules_sans_fichiers_voulus_est_ok` ; porte IV : « DOWNLOAD LIMIT REACHED » traité dès la 1re fiche |
| P15 | Lien expiré : relecture de la fiche | coché | `test_lien_expire_relit_la_fiche_puis_telecharge` |
| P16 | Vol sans lien GPX / fiche sans trace : plus retenté | coché | `test_trace_absente_sans_lien_gpx_est_nolink`, `test_gpx_voulu_mais_sans_lien_est_nolink`, `test_fiche_sans_fv_config_pas_relue_a_chaque_passage`, `test_file_modes_et_no_link` |
| P17 | Écritures atomiques, rien supprimé | coché ; nettoyage des dossiers vides : expliqué | `test_sheet_raw_ecriture_atomique`, `test_snapshot_rotation` (élagage des instantanés `_raw` au-delà de 5), `test_sync_ne_modifie_pas_les_dossiers`, `test_json_illisible_jamais_ecrase`, `test_aucun_json_reecrit_quand_rien_ne_change`. Le nettoyage des dossiers vides a disparu (plan §2, P17) |
| P18 | Index reconstructible ; ne relit que les JSON modifiés | coché | `test_migration_ancienne_base_idempotente`, `test_table_pilots`, `test_sync_ne_modifie_pas_les_dossiers` ; A/B : `flights.db` réelle migrée par le nouveau code (9793 lignes) puis pkl de 9585 vols identique à l'ancien |
| P19 | Coordonnées de départ : fv-config, puis GPX, puis KML | coché | `test_coordonnees_depuis_fiche_brute_sans_gpx`, `test_fiche_brute_sans_trace_exploitable_retombe_sur_gpx` ; A/B : `longitude` et `latitude` identiques sur 9585 vols |
| P20 | Statistiques depuis la trace, prioritaires (sauf `vitesse_max`), `source_stats`, `STATS_VERSION` | coché | `test_priorite_fv_config_sur_gpx`, `test_gpx_non_regression`, `test_positions_repetees_vitesse_max`, `test_stats_version` (4), `test_recalcul_si_version_change`, `test_stats_gpx_d_ancienne_version_recalculees` ; A/B : 0 écart ; `VALIDATION_STATS.md` : 20/20, et `vitesse_max` du pkl = valeur de la fiche |
| P21 | Vols incomplets inclus, `incomplet=True` | coché | A/B : 54 vols `incomplet`, identiques ; `test_donnees_de_fiche_intactes_et_pkl` |
| P22 | Vols non Syride conservés | coché (identique à l'ancien) | A/B identiques. Le pkl réel contient 0 vol `is_syride = False` (les vols non Syride sans statistiques restent écartés comme avant, docstring `load_pilot_frames`) : le comportement est donc préservé, pas amélioré |
| P23 | Signalement des dossiers orphelins | coché (test) ; R1 : Architecte | `test_summary_no_raw_et_absent` ; affichage réel en R1 |
| P24 | `PilotPageError` sur page sans activité | coché | `test_reponse_vide_ou_illisible` (3 cas, HTML de diagnostic écrit), `test_liste_vide_leve_value_error`, `test_reponse_vide_ou_illisible` |
| P25 | HTML de diagnostic sans lien | coché (remplacé) | Fiche brute toujours enregistrée : `test_fiche_brute_toujours_enregistree_sans_fichiers`, `test_fiche_brute_non_reecrite_si_deja_presente` |
| P26 | Bilans affichés | coché (tests) ; R1 : Architecte | `test_vol_absent_et_garde_fou_dans_le_bilan`, `test_nouveaux_vols_bilan_et_cache_id_rider`, `test_process_pilots_file_raw_et_bilan` ; porte IV : bilans conformes aux attendus |
| P27 | `debug_flight_page.py` | coché (relecture) | `git diff main` : +29 lignes, capture des requêtes réseau (`performance.getEntriesByType('resource')`, ligne 81-84). Non exécuté (réseau) |
| P28 | `fix_truncated_names.py` inchangé | coché | `git diff main -- src/fix_truncated_names.py` : vide |
| P29 | Format du pkl et export web identiques | coché | A/B : 0 écart sur 9585 vols (+ 4 colonnes optionnelles validées) ; export A = export B ; `make test-py` 265 verts. `npm test` vert (914 tests) |
| P30 | Profil Chrome persistant, une fenêtre | R1 : Architecte | Porte IV : une seule fenêtre, session conservée. Non testable sans Chrome |

### Recette réseau (à remplir par l'Architecte)

| Réf. | Contenu | Déjà établi (porte IV, `PORTE_IV.md`) | À remplir |
|---|---|---|---|
| R1 | Lancement réel complet (`python src/main.py`) : bilans, connexion, profil Chrome, orphelins | Phase 1 conforme (AdrienM 504 / 0 nouveau / 20 modifiés / 2 absents ; j2f 1059 / 1059 modifiés / 0 absent ; 0 doublon), phase 2 : 6 fiches brutes, une fenêtre, pkl de 1564 vols, relance immédiate idempotente | **coché en partie** (21/11/2026, `main` à 4752e89 + complément par la liste, venv py39, sauvegardes `*.avant_R1_20261121-2055`). Phase 1 (HTTP, 12 pilotes à scraper) : 1 687 vols modifiés, **727 nouveaux** (dont 633 anciens vols 2016-2022 de yanis jamais atteints par le défilement), **27 absents** (Thomas16 12, chami 7, AdrienM 2, DavidParatrucs79 2, yanis 2, ToriVsUke 1, LiLi06 1), 0 réapparu, 6 doublons probables (yanis, `_rapport_doublons.txt`). **2 441 JSON écrits** = 1 687 + 727 + 27, conforme. Phase 2 : connexion confirmée (P10), une fenêtre Chrome (P30), aucun Turnstile, **limite quotidienne atteinte dès la 1re fiche** (quota consommé par les essais du jour) : 1 fiche consultée, 0 fiche brute, arrêt propre (P13), 6 430 vols annoncés à compléter. Phase 3 : index à jour, aucun orphelin signalé (P23), bilans affichés (P26). pkl : **10 229 vols, 23 pilotes** (9 585 avant, 0 perdu, 644 gagnés), 40 colonnes (+4 optionnelles) ; `syride_status` : 6 364 `present`, 26 `absent` (le 27e, AdrienM 2844756, a un plafond de 0 et est écarté par le filtre des vols trop bas, comme avant), 3 839 `unknown` = exactement les 11 pilotes non scrapés. 698 vols `incomplet`, **tous complétés par la liste** (plafond, distance, durée). Téléchargement GPX + IGC d'AdrienM non vérifié ce jour-là (quota épuisé), **fait le 23/11/2026** (point ouvert 5). **Relance complète le 24/11/2026** (`main` à d4c71ef, Python 3.14, sauvegardes `*.avant_R1_20261124-2121`) : phase 1 conforme (13 pilotes, Au_Phil_du_vent 30 nouveaux dont 27 vols saisis sans instrument, 0 absent, 6 doublons probables) ; phase 2 : connexion confirmée, 17 IGC d'AdrienM, limite de téléchargement, puis 23 fiches AdrienM en informations seules et plafond de 40 atteint **avant la fenêtre sans connexion** : 631 vols aux informations manquantes non traités (point ouvert 10, corrigé) ; phase 3 sans orphelin ; pkl 10 237 vols, 0 perdu, 3 gagnés. Fenêtre sans connexion non exercée en lancement complet |
| R2 | `--scrape 0` | Copie porte IV, AdrienM + j2f, `--scrape 0 --backfill-raw 0 --pkl 0` : phase 1 ignorée, « Rien à compléter », 0 fiche consultée | coché |
| R3 | `--dry-run 1` (liste lue, rien écrit) | Copie porte IV : listes lues par HTTP (504 / 1059, 0 changement), « rapport non écrit », 1545 vols listés comme à compléter, 0 fiche consultée, aucun fichier modifié | coché |
| R4 | Turnstile validé à la main | Aucun Turnstile apparu pendant l'essai | À faire quand un défi apparaît (diagnostic `_debug_turnstile_*.html`) |

## 4. Points ouverts

1. ~~`npm test` non exécuté~~ : exécuté par l'Architecte, vert (914 tests).
2. ~~Tests unitaires manquants (P4, P8 `private`, P12, P13, P15)~~ : ajoutés dans `scraping_tests/test_limits.py` (13 tests, 278 au total).
3. **`syride_status` et vols absents** : le pkl ne marque `absent` qu'après une réconciliation réelle. Les vols
   disparus de Syride (2 pour AdrienM, ~27 au total) apparaîtront `absent` au premier lancement complet (R1). Une
   valeur `present` ne signifie pas « confirmé par Syride » mais « pas marqué absent » ; `unknown` n'est jamais
   produit dans le pkl depuis la correction de la porte IV (`flights_db.py:248`) sauf lignes de base antérieures sans
   JSON relu (`flights_db.py:637`).
4. **Validation des statistiques partielle** : 20 vols (14 AdrienM, 6 j2f) au lieu de ~50, car la limite quotidienne
   de fiches a été atteinte. À compléter pendant le rattrapage (lot G).
5. **Téléchargement des fichiers d'AdrienM** : vérifié le 23/11/2026 sur les données réelles (Python 3.14, uv),
   `uv run python src/main.py --pilots AdrienM --max-sheets 2 --fill-igc 1`. Vols 3761463 et 3761259 : IGC valides
   (en-tête `HFPLTPILOTINCHARGE`, 57 et 31 Ko) et fiches brutes (39 et 30 Ko) enregistrés dans la même visite ;
   arrêt propre à 2 fiches, 2 complétés, 0 échec ; IGC d'AdrienM 436 → 440 (2 autres lors d'un lancement
   précédent), pkl 10 234 vols, 23 pilotes. **Limite** : le téléchargement du **GPX** n'a pas été exercé, car tous les
   vols d'AdrienM ont déjà leur GPX ; il passera par le même chemin (`download_trace_via_browser`) au prochain
   nouveau vol.
6. **Affichage** : avec `--max-sheets`, la ligne `[7/…]` est affichée (et la pause faite) avant l'arrêt
   (`browser_session.py`, boucle de la phase 2). Cosmétique.
7. **Vitesse max** : la valeur calculée depuis la trace diffère de celle de Syride de 7,9 % en médiane (jusqu'à
   17,8 %, 6 vols sur 20 au-delà de 10 %). Sans effet sur le pkl tant que la fiche donne une valeur (P20), mais la
   vitesse max calculée n'est pas fiable comme valeur de remplacement.
8. ~~Copie de recette~~ : `recette_ab/` et `porte4_copie/` supprimées le 21/11/2026 avec le worktree et la branche
   `scraping/migration-fv` (fusionnés).
9. **Complément par la page liste** (21/11/2026, après la recette A/B) : un vol sans fiche lue ni trace prend
   `plafond`, `distance_activite` et `duree_vol` dans les champs de liste `altitude_max`, `distance`, `flight_time`
   (`flights_db.fill_from_list`), identiques à la fiche sur les vols qui ont les deux (335/336, 9 706/9 707,
   9 258/9 259). La fiche reste prioritaire ; `incomplet` et `source_stats` gardent leur sens (vitesses, gain, vario
   et g restent inconnus). 4 tests dans `test_reconcile.py` (285 verts). Effet en R1 : 698 vols incomplets, tous
   avec plafond, distance et durée ; ils passent désormais le filtre des vols trop bas comme les autres.
10. **Priorité de la phase 2** (R1 du 24/11/2026) : la fenêtre connectée passait en premier et consommait le plafond sur du rattrapage (fiche brute + IGC d'AdrienM) avant les vols aux informations manquantes, et continuait en informations seules après la limite de téléchargement. Corrigé sur `scraping/priorite-phase2` : réserve de plafond pour les vols mieux classés de la fenêtre sans connexion (fenêtre connectée arrêtée ou non ouverte), fin de la fenêtre connectée à la limite de téléchargement (vols restants lus sans connexion selon leur rang). 5 tests dans `test_session.py` (310 verts). À confirmer au prochain lancement réel.
