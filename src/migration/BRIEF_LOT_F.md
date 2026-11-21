# Brief lot F : recette A/B, validation des statistiques, documentation (Le Contrôleur + Le Scribe)

Plan : `src/MIGRATION_SCRAPING.md` (matrice §2, acte V scènes 11 et 14, décisions §7). Résultats de la porte IV :
`src/migration/PORTE_IV.md` (section « Résultats »). Lis-les d'abord, ainsi que le code des lots A à E.

Worktree : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Pas de commit, pas de changement de branche, pas de `git stash`.** Français sobre.

## Règles absolues

- **Aucun accès réseau, aucun Chrome.** Ne lance jamais `main.py` sans `--reparse 1`, ni rien qui ouvre Chrome ou contacte
  Syride. Les recettes réseau (R1 à R4) sont faites par l'Architecte, pas par toi.
- **Les données réelles ne sont jamais modifiées** : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/`
  (dossiers des pilotes, `flights.db`, `global_flights_data.pkl`, `*.json`) est en lecture seule pour toi. Tout calcul se fait
  sur une copie. Ne touche pas non plus au checkout principal (`.../syride_traces/src`, branche `main`) sauf pour **lire et
  exécuter** son code sur une copie.
- Ne touche pas à `porte4_copie/` sauf en lecture (une collecte de fiches y tourne peut-être).

## Pythons

- Exécution des chaînes (pkl, réanalyse) : venv `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces_py39/bin/python`
  (3.9, pandas 2.0.3) pour l'ancien code **et** le nouveau.
- Tests : `make test-py` depuis la racine du worktree (anaconda 3.8 du PATH ; 255 tests verts au départ).

## Travail

### 1. Copie de recette

`rsync -a` des données réelles vers `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/recette_ab/` en excluant `src`,
`web`, `html_reports`, `pdf_reports`, `_chrome_profile`, `_migration_captures`, `.claude`, `.git`, `node_modules`
(~3 Go). Garde aussi une copie intacte de `flights.db` d'origine (`flights.db.orig`) pour pouvoir rejouer.

### 2. Comparaison A/B (`src/migration/compare_pkl.py`, scène 11)

- **A (ancien code)** : pkl généré par le code de `main` (checkout principal, `src/create_global_pkl.py`, lis comment il
  prend son chemin de données) sur la copie, **sans réseau**. Si l'ancien code ne permet pas de lui passer le chemin,
  importe-le avec un `sys.path` pointant sur le checkout principal et appelle sa fonction avec le chemin de la copie.
  Sauvegarde-le en `recette_ab/pkl_A.pkl`. Le pkl réel du 20/11 sert de témoin supplémentaire, pas de référence.
- **B (nouveau code)** : `main.py --path <copie> --reparse 1` (worktree), pkl sauvegardé en `recette_ab/pkl_B.pkl`.
  Note : la base `flights.db` de la copie est migrée par le nouveau code (colonnes ajoutées) ; c'est voulu.
- `compare_pkl.py --a <pkl> --b <pkl> [--pilot X]` : script réutilisable, sortie texte lisible :
  - ensembles `(pilote, num_activite)` : identiques attendus (vols `absent` compris) ; lister les écarts ;
  - colonnes : seules nouveautés permises `syride_status`, `vario_min`, `hauteur_sol_max`, `heure_plafond` ;
  - par colonne commune : nombre d'écarts et 5 exemples ; tolérances flottantes raisonnables (1e-6) ;
  - colonnes de statistiques (`duree_vol`, `plafond`, `gain`, `vitesse_max`…) : écarts permis seulement pour les vols
    dont `source_stats` diffère, dans les tolérances de la scène 3 (durée ±2 s, plafond ±2 m, gain ±3 m, vitesse ±10 %) ;
  - `date_update` ignorée.
  Teste-le (`src/scraping_tests/test_compare_pkl.py`, petits DataFrame synthétiques).
- Sur les données réelles, les dossiers n'ont pas de fiche brute : A et B doivent être **identiques** hors nouvelles
  colonnes et `date_update`. Chaque écart restant doit être expliqué (cause dans le code, ligne) ou signalé comme bug.
  Points connus à vérifier : `mean_latitude`/`mean_longitude` (129 écarts vus à la porte IV, peut-être le dictionnaire
  des sites recalculé ; montre si A et B diffèrent ou non sur la même copie), `syride_status` à `unknown` pour les vols
  non réconciliés (attendu : la réanalyse ne relit pas les listes).
- Vérifie la sortie web : `export_web.py` sur `pkl_B` vers un dossier temporaire (lis `Makefile` cible `export` et
  `src/web_export/` pour trouver comment changer la sortie **sans écrire dans `web/public/data/` du worktree s'il est
  suivi par Git**), puis compare au même export fait depuis `pkl_A` : mêmes fichiers, même contenu hors champs datés.
  Puis `cd web && npm test` dans le worktree (fixtures) : vert. Si `node_modules` manque, `npm ci` est permis.

### 3. Validation des statistiques (`src/migration/VALIDATION_STATS.md`)

Sur `porte4_copie` (lecture seule ; ~50 vols AdrienM et 6 j2f ont une fiche brute **et** un GPX) :
`src/migration/compare_track_vs_gpx.py --pilot AdrienM` puis `--pilot j2f` (venv py39). Rapporte le bilan, le tableau,
et l'analyse de chaque vol hors tolérance (cause : positions répétées, saut GPS, autre). Compare aussi `vitesse_max`
calculée à `vitesse_max_fiche` (valeur affichée par Syride) et dis laquelle le pkl utilise (règle P20). Si la collecte
n'a pas fini quand tu arrives à cette étape, fais le reste et reviens-y à la fin ; s'il y a moins de 40 vols, dis-le.

### 4. Recette (`src/migration/RECETTE.md`)

La matrice §2 (P1 à P30) recopiée en tableau : pour chaque ligne, **coché** avec la preuve (nom du test, étape de recette,
commande et résultat) ou **expliqué** (pourquoi non applicable / reste ouvert). Laisse les cases R1 à R4 en « à remplir
par l'Architecte » avec ce que la porte IV a déjà établi (voir `PORTE_IV.md`). Ajoute une section A/B (résumé chiffré)
et une section « points ouverts ».

### 5. Documentation (scène 14)

`src/README.md` : section scraping à jour (phases, liste par HTTP, fiche brute, profils à fichiers `--files`,
`--reparse`, `--backfill-raw`, réconciliation et vols `absent`, doublons, Turnstile validé à la main) ; docstring de
`main.py` ; en-têtes de `browser_session.py` et `syride_scraper.py` s'ils ne décrivent plus le fonctionnement réel.
Pas de changement de comportement dans ces fichiers (docstrings et commentaires seulement).

## Fichiers autorisés

`src/migration/compare_pkl.py`, `src/migration/RECETTE.md`, `src/migration/VALIDATION_STATS.md`,
`src/scraping_tests/test_compare_pkl.py`, `src/README.md`, docstrings/commentaires de `src/main.py`,
`src/browser_session.py`, `src/syride_scraper.py`. Si tu trouves un bug ailleurs : **ne le corrige pas**, décris-le
(fichier, ligne, scénario) dans `RECETTE.md` « points ouverts » et dans ton rapport.

## Critères de fin

- `make test-py` vert ; `npm test` vert.
- `compare_pkl.py` testé ; A/B sur la copie complète faite, chaque écart expliqué.
- `VALIDATION_STATS.md` et `RECETTE.md` écrits.
- Rapport final court : chiffres A/B, validation des stats, lignes de la matrice non cochées, bugs trouvés, fichiers modifiés.
