# Migration de la récupération Syride : scénario et plan d'exécution

Statut : **en cours d'exécution** sur la branche `scraping/migration-fv`. Rédigé le 21/11/2026 après la revue critique et l'enquête
réseau du même jour.
Branche de travail prévue : `scraping/migration-fv` (une seule branche, un commit par lot validé).

---

## 0. Pourquoi cette migration

### Ce que l'enquête réseau a établi (21/11/2026)

| Constat | Preuve | Conséquence |
|---|---|---|
| La liste des vols d'un pilote vient de `GET /ajax/pilotes/activites.php?limit=N&l=fr&idRider=<id>&apli=0[&append=1&beforeId=<id_activite>]` | XHR observées au défilement de `/fr/pilotes/AdrienM` | Plus besoin de faire défiler la page |
| `limit=1000` renvoie **tout l'historique** d'AdrienM (504 vols, 1,35 Mo, 6 s), dans le même HTML que la page | Test direct | Une requête par pilote ; le parser actuel `get_nav_infos_bs` lit ce HTML tel quel |
| La liste est triée par `id_activite` décroissant (date de publication), pas par numéro de vol (lot A) | Ordre des `activite<n>` | Un vol ancien importé tard apparaît en tête : l'ancienne règle le trouve, mais elle ne voit ni les modifications ni les suppressions |
| 2 vols présents sur le disque n'existent plus sur Syride : `2093221` (Fayard, 26/11/2022), `2844756` (Ifonche, 05/04/2024), voisins de `2093218` / `2844752` / `2844759` | Comparaison liste/disque | Suppressions et réimports jamais détectés ; doublons probables dans les stats |
| Chaque vol de la liste porte `showFlightInPopup(<num>, <expires>, '<token>')` ; jeton valable ~30 min | HTML de la liste | Le jeton d'affichage de la fiche s'obtient avec la liste |
| La fiche s'ouvre via `POST /ajax/vols/autoriser-affichage.php` (`idSession`, `expires`, `token`), puis `GET /ficheVol.php?l=fr&idSession=<num>` ; sans autorisation : **403** ; l'autorisation peut répondre `403 {"reason":"turnstile_required"}` (en-tête `X-Syride-Turnstile-Required: 1`) | Tests directs | **Le navigateur reste indispensable pour la fiche.** Le défi Turnstile est résolu **par l'humain** dans la fenêtre, jamais contourné |
| `<script id="fv-config">` contient `points` (3 971 points à **1 Hz** : lat, lon, alt, vitesse, vario, g, 7e colonne à identifier), `times` (horodatages Unix), `terrain` (altitude du sol, 1 point / 2 s), `extrema` (vitesse max, vario max/min, g max, horodatés), `distance` (points de la distance retenue), `offset` (fuseau) | Fiche du vol 3766574 | La trace complète est dans la fiche, **plus dense que le GPX** (2 331 points sur la même plage) |
| La fiche affiche de nouveau « Gain » et aussi « Vario min. » (non récupéré aujourd'hui) | `.fv-metric`, `dl.fv-info` | Le parser doit suivre ; le commentaire de `syride_parsing.py` est périmé |
| Liens de téléchargement `downloadFlightFile.php?idSession=…&type=igc|gpx|kml&expires=…&key=…`, valables ~5 min | Fiche | Téléchargement possible **dans la même visite** de fiche, comme aujourd'hui |
| Les IGC (9 238 fichiers) ne sont lus par **aucun** module (`analyze_functions`, `track_stats`, `web_export`) | `grep` | Les télécharger pour tout le monde n'apporte rien |

### Objectif

1. **Phase 1** : une requête de liste par pilote au lieu du défilement, avec **réconciliation complète**
   (nouveaux vols, vols modifiés, vols disparus de Syride) à chaque lancement.
2. **Phase 2** : une visite de fiche par vol, qui enregistre la **fiche brute** (HTML compressé, avec `fv-config`).
   La trace, les statistiques et les coordonnées en sont tirées. **GPX/IGC seulement pour les profils
   qui le demandent** (AdrienM par défaut).
3. **Analyse hors ligne** : tout ce qui est dérivé (JSON du vol, index, statistiques, pkl) se reconstruit depuis
   les fichiers bruts, **sans rien re-télécharger**.
4. **Parité fonctionnelle stricte** (§2), plus des améliorations mesurées (§3).

### Ce que la migration NE fait PAS

- Contourner ou automatiser un défi Cloudflare / Turnstile : la fenêtre s'arrête, l'humain valide, le script reprend
  (comportement actuel de `wait_for_cloudflare`, étendu à Turnstile).
- Changer le format du pkl consommé par `export_web.py` : seules des **colonnes nouvelles optionnelles** peuvent s'ajouter.
- Supprimer un fichier ou un dossier de vol existant (règle actuelle conservée : rien n'est jamais supprimé).
- Publier une trace (règle D12 de `ROADMAP_WEBAPP.md` : aucune géométrie de vol dans la webapp).

---

## 1. La distribution : les experts et leurs rôles

Chaque expert est un agent. Le **maître d'œuvre** écrit un brief par lot (`src/migration/BRIEF_LOT_<X>.md`),
lance les agents, relit, intègre et committe. **Les agents ne committent pas, ne poussent pas et ne changent
pas de branche.**

| Rôle | Nom de scène | Modèle | Responsabilités | Ne touche pas à |
|---|---|---|---|---|
| Maître d'œuvre / architecte | **L'Architecte** | Opus | Briefs, arbitrages, revue de chaque lot, intégration, commits, portes de validation, dialogue avec Adrien | — |
| Analyste réseau Syride | **L'Éclaireur** | Sonnet + navigateur intégré | Contrat des endpoints, durées de vie des jetons, comportement Turnstile, captures **anonymisées** pour les tests | Code de production |
| Ingénieur parsing | **Le Philologue** | Sonnet | Fonctions **pures** : liste, fiche, `fv-config` ; tests sur fixtures | Selenium, réseau, disque |
| Ingénieur session navigateur | **Le Pilote d'essai** | Sonnet | Transport (`fetch` dans la page), autorisation de fiche, attente Turnstile, téléchargements optionnels, gestion des limites | Parsing, statistiques |
| Ingénieur données et stockage | **L'Archiviste** | Sonnet | Disposition des fichiers bruts, migrations `flights.db`, réconciliation, commande de réanalyse | Réseau |
| Ingénieur statistiques de trace | **Le Métrologue** | Sonnet | `track_stats` depuis les points `fv-config`, validation contre les GPX, nouveaux champs | Réseau, stockage |
| Testeur / recette | **Le Contrôleur** | Sonnet (Haiku pour les vérifications mécaniques) | Matrice de parité, comparaison A/B ancien/nouveau pkl, recette en conditions réelles avec Adrien | Code de production (il signale, il ne corrige pas) |
| Relecteur critique | **L'Avocat du diable** | Opus | Revue adverse de chaque lot : régressions, cas limites, conformité au brief | Code (il rédige des constats) |
| Rédacteur | **Le Scribe** | Haiku | README, docstrings, aide de `main.py`, notes de version | Logique |

Contraintes communes à tous les briefs :

- Python local `/Users/Adrien/opt/anaconda3/bin/python` (**3.8.16**) : pas de `list[str]`, `X | None`, `match`.
  Dépendances épinglées dans `src/requirements-scraping.txt` ; **aucune dépendance nouvelle** sans accord de l'Architecte.
- Messages, commentaires et docstrings en français, sobres.
- **Aucune donnée réelle commitée** : dossiers pilotes, fiches, traces, `flights.db`, pkl. Le hook `.githooks/pre-commit`
  et le `.gitignore` en liste blanche restent la barrière. Les fixtures de test sont **synthétiques ou anonymisées**
  (coordonnées décalées, noms remplacés, jetons et clés remplacés par `x`).
- Les tests tournent sans réseau ni Chrome : `make test-py`, étendu au nouveau dossier `src/scraping_tests/`.
- Les essais réels se font sur une **copie** du dossier de données (`--path /chemin/copie`), jamais sur l'original,
  jusqu'à la bascule (acte V).

---

## 2. Matrice de parité (le contrat)

Toute ligne doit être cochée par le Contrôleur avant la bascule. « Test » = test automatique ou étape de recette nommée.

| # | Fonctionnalité actuelle | Où aujourd'hui | Dans la nouvelle version | Test |
|---|---|---|---|---|
| P1 | 3 phases : identification, complétion, index + pkl | `browser_session.process_pilots` | Identiques (la phase 1 change de technique) | Recette R1 |
| P2 | `--scrape 0` : compléter sans relire les listes | `main.py` | Identique | R2 |
| P3 | `--dry-run 1` : rien n'est ouvert, liste de ce qui serait fait | `main.py` | Identique ; **en plus**, la phase 1 peut tourner en simulation si la liste est accessible sans Chrome (décision acte I) | test unitaire + R3 |
| P4 | `--max-sheets N` | `_Budget` | Identique | test unitaire |
| P5 | `--fill-igc 1` | `get_global_queue` | Identique, **limité aux profils à fichiers** (§3, A5) ; un avertissement si demandé pour un profil sans fichiers | test unitaire |
| P6 | `--pilots`, `--path`, `--pkl`, `--publish`, `--regen-sites` | `main.py` | Identiques | R1 |
| P7 | `--scroll` | `main.py` | **Accepté mais sans effet**, avec un message « obsolète » (aucun script existant ne casse) | test CLI |
| P8 | Modes `tasks` (`all` / `info` / `files`) et `private` de `process_pilots` | `browser_session` | Conservés ; `tasks=files` ne concerne que les profils à fichiers | test unitaire |
| P9 | Comptes multiples (`syride_accounts`) | `params_scrap_syride` | Conservés tels quels | relecture |
| P10 | Connexion : session du profil Chrome, sinon identifiants `.env` ; arrêt de la phase 2 si non confirmée | `login_to_syride` | Identique | R1 |
| P11 | Pause sur défi Cloudflare, reprise automatique | `wait_for_cloudflare` | Identique **et** étendue au Turnstile de l'autorisation de fiche | R4 |
| P12 | Limite « trop de fiches » : attentes 2/2/5 min, ralentissement ×1,5 jusqu'à ×4 | `read_flight_sheet`, `delay_scale` | Identique | test unitaire (détection) |
| P13 | Limite quotidienne de fiches : arrêt propre de la phase 2 | `DailyLimitError` | Identique | test unitaire |
| P14 | Limite de téléchargement : on continue en « informations seules » | `DownloadLimitError` | Identique (ne concerne plus que les profils à fichiers) | test unitaire |
| P15 | Lien expiré : relecture de la fiche pour un lien neuf (GPX) | `_download_one` | Identique | test unitaire (simulé) |
| P16 | Vol sans lien GPX → `no_link`, plus retenté | `mark_no_link` | Devient « fiche sans trace » (`fv-config` absent ou vide) ; même effet | test unitaire |
| P17 | Écriture atomique des JSON ; rien n'est supprimé ; dossiers vides nettoyés | `save_flight_data`, `initiate_search` | Identique, étendu aux fichiers bruts | test unitaire |
| P18 | Index `flights.db` reconstructible ; ne relit que les JSON modifiés | `flights_db.sync_pilot` | Identique ; nouvelles colonnes par migration `ALTER TABLE` comme aujourd'hui | test unitaire |
| P19 | Coordonnées de départ calculées une fois (GPX, sinon KML) | `_update_derived` | Ordre : `fv-config`, puis GPX, puis KML | test unitaire |
| P20 | Statistiques depuis la trace, prioritaires sur la fiche (sauf `vitesse_max`) ; `source_stats` | `apply_gpx_stats` | Même règle, source `trace` (fv-config) ou `gpx` ; **STATS_VERSION** incrémentée | A/B (acte IV) |
| P21 | Vols incomplets inclus, `incomplet=True` | `load_pilot_frames` | Identique | A/B |
| P22 | Vols non Syride (31) conservés | `get_nav_infos_bs` | Identique | A/B |
| P23 | Signalement des dossiers orphelins | `flights_db.summary` | Identique | R1 |
| P24 | `PilotPageError` si la page ne contient aucune activité (HTML enregistré) | `get_all_navs` | Identique sur la réponse de `activites.php` | test unitaire |
| P25 | HTML de diagnostic enregistré quand une fiche n'a pas de lien | `read_flight_sheet` | Remplacé par la fiche brute, toujours enregistrée | — |
| P26 | Bilans affichés (par pilote, par phase, restant à faire) | `process_pilots` | Identiques, plus le bilan de réconciliation (§3) | R1 |
| P27 | `debug_flight_page.py` | outil | Conservé ; ajoute la capture des requêtes réseau | relecture |
| P28 | `fix_truncated_names.py` | outil ponctuel | Inchangé ; rendu inutile pour l'avenir par la réanalyse (A3) | — |
| P29 | Format du pkl et sortie de `export_web.py` | `create_global_pkl` | **Identiques** colonne pour colonne ; colonnes nouvelles seulement si l'Architecte les valide avec la webapp | A/B + `make test-py` |
| P30 | Profil Chrome persistant `_chrome_profile`, une seule fenêtre | `create_driver` | Identique | R1 |

---

## 3. Améliorations visées

| # | Amélioration | Bénéfice |
|---|---|---|
| A1 | Liste par `activites.php` (une requête par pilote, pagination `beforeId` en secours) | Phase 1 en secondes au lieu de minutes ; plus de défilement fragile |
| A2 | **Réconciliation complète** à chaque phase 1 : vols nouveaux, vols modifiés (voile, site, nom, date), vols **absents de Syride** | Corrige les vols importés en retard et les corrections faites sur Syride ; signale les suppressions |
| A3 | **Couche brute** : `<num>.sheet.html.gz` (fiche complète) et instantané de liste par pilote | Corriger un parser = relancer `--reparse`, sans re-scraper |
| A4 | Trace tirée de `fv-config` (1 Hz, avec vario, g, altitude du sol) | Une ressource par vol au lieu de 3 ; plus de liens qui expirent pour les profils sans fichiers |
| A5 | **Profils à fichiers** : GPX/IGC téléchargés seulement pour les pilotes configurés (AdrienM par défaut) | Fonctionnalité demandée ; moins de téléchargements pour les autres |
| A6 | Nouveaux champs : `vario_min`, `gain` lu sur la fiche, horodatage des extrema, hauteur max au-dessus du sol | Statistiques plus riches (en option pour la webapp) |
| A7 | Détection des **doublons probables** (même pilote, même date, heures et durées proches, numéros différents) | Stats fiables ; liste à valider par Adrien, jamais de suppression automatique |
| A8 | `--dry-run` qui inclut la phase 1 si la liste est lisible sans Chrome | Simulation complète |
| A9 | Contrat des endpoints documenté (`src/migration/SYRIDE_API.md`) et tests de parsing sur fixtures | Un changement de Syride se voit dans un test, pas dans des « 0 nouvelle trace » |

---

## 4. Le scénario

### Acte I : la reconnaissance (L'Éclaireur)

**Scène 1. Contrat des endpoints.** Avec le navigateur intégré, sur la session d'Adrien, en consommant **au plus
5 fiches** au total :

1. `activites.php` : paramètres, plafond réel de `limit` (essayer 1 000 puis 5 000 sur le pilote qui a le plus de vols),
   pagination `beforeId` (est-ce `id_activite` ?), présence des vols non Syride, champs disponibles (nom du vol, date de
   publication, voile, instrument, altitude max).
2. Où lire l'`idRider` : page du pilote (`idRider=` dans le HTML ou un script) ; tester 3 pilotes.
3. La liste est-elle lisible **sans cookies** (requête HTTP simple) et **sans session Chrome** ? Résultat attendu : oui ou non,
   avec le code HTTP. Cela décide de A8 et du transport (scène 3).
4. Autorisation de fiche : durée de vie de `expires`, réponse normale (`success`, `pilot`), réponse Turnstile, l'autorisation
   est-elle valable pour un seul vol ou pour la session ? Combien de temps ?
5. Comprendre pourquoi `ficheVol.php` du vol 3766574 a répondu 200 alors que l'autorisation venait de répondre
   `turnstile_required` (autorisation antérieure gardée par la session ?).
6. `fv-config` : signification de la 7e colonne de `points`, unité de la vitesse, sens de `offset`, structure de `extrema`,
   présence de `fv-config` sur une **vieille** fiche (2022) et sur un vol non Syride.
7. Une fiche consultée **sans connexion** contient-elle les liens de téléchargement ? (observé : oui pour 3766574 ; à confirmer.)

**Livrables** : `src/migration/SYRIDE_API.md` (contrat, exemples **anonymisés**, durées de vie) et
`src/scraping_tests/fixtures/` : une réponse `activites.php` réduite à 5 vols et 2 fiches (récente et ancienne)
**anonymisées** (noms → `PiloteTest`, coordonnées décalées d'un vecteur fixe, jetons et clés → `x…`, `points` tronqués à
~200 points). Un script `src/migration/anonymize_fixture.py` produit ces fixtures de manière reproductible.

**Porte I (Architecte)** : contrat relu ; décision écrite dans le brief du lot B :
- **transport de la liste** : HTTP simple si la scène 1.3 le permet, sinon `fetch` exécuté dans la page Chrome ;
- **autorisation** : appel `fetch` dans la page (même origine), avec repli sur la navigation vers `/fr/pilotes/<p>/<num>`
  (la page de Syride affiche alors elle-même le Turnstile, que l'humain valide).

### Acte II : les fondations pures (Le Philologue et Le Métrologue, en parallèle)

**Scène 2. Parsing (Le Philologue).** On étend `src/syride_parsing.py` (pas de nouveau module) :

- `parse_activities_response(html, pilote) -> list[dict]` : réutilise `get_nav_infos_bs` ; ajoute pour chaque vol
  `flight_token` (`expires`, `token`) **non enregistré sur disque** (jeton éphémère), le nom du vol, la date de publication.
- `parse_flight_sheet_full(html) -> (sheet, links, track)` : nouvelle fonction ; ajoute `vario_min`, lit « Gain » s'il est
  affiché (sinon calcul actuel) et renvoie la trace (`parse_fv_config`). `parse_flight_sheet(html) -> (sheet, links)`
  garde sa signature et devient un mince adaptateur (compatibilité).
- `parse_fv_config(html) -> dict | None` : `points`, `times`, `terrain`, `extrema`, `offset` ; validation (tailles égales,
  temps croissants, coordonnées plausibles) ; `None` si absent.
- Unification des valeurs manquantes : **`None` partout** dans le nouveau code ; un utilitaire `normalize_missing` traite
  les anciens `"None"` / `""` à la lecture (jamais de réécriture massive des JSON).
- Tests : `src/scraping_tests/test_parsing.py` sur les fixtures de l'acte I, plus des cas limites (champ absent, fiche ancienne
  `.volTexte`, liste vide → erreur explicite).

**Scène 3. Statistiques (Le Métrologue).** `src/track_stats.py` :

- Séparer la lecture de la trace du calcul : `stats_from_points(times, alts, lats, lons)` ; `compute_gpx_stats` devient
  « lire le GPX puis `stats_from_points` » (comportement actuel inchangé, tests de non-régression).
- `compute_track_stats(track)` depuis `fv-config` : mêmes champs `GPX_STAT_FIELDS`, plus `vario_min` (depuis les extrema),
  `hauteur_sol_max` (alt − terrain interpolé), horodatage des extrema.
- `STATS_VERSION = 3`.
- **Validation** (script `src/migration/compare_track_vs_gpx.py`) : pour 50 vols d'AdrienM qui ont un GPX, une fois leurs
  fiches brutes disponibles (acte IV), comparer `stats_from_points` GPX et fv-config. Tolérances acceptées :
  durée ±2 s, plafond ±2 m, gain ±3 m, vitesse max ±10 %. Rapport chiffré dans `src/migration/VALIDATION_STATS.md`.

**Porte II (Avocat du diable)** : relecture des deux modules ; `make test-py` vert ; aucun appel réseau dans les tests.

### Acte III : le stockage et l'index (L'Archiviste)

**Scène 4. Disposition des fichiers** (rien d'existant n'est déplacé) :

```
<pilote>/traces/<num>/<num>.json            inchangé (source de vérité des informations)
                     /<num>.sheet.html.gz   NOUVEAU : fiche brute complète (contient fv-config)
                     /<num>.gpx, .igc, .kml anciens fichiers conservés ; nouveaux seulement pour les profils à fichiers
<pilote>/_raw/activites_<AAAAMMJJ-HHMM>.html.gz   NOUVEAU : instantané de la liste (on garde les 5 derniers)
```

- Taille à mesurer sur 20 fiches réelles avant de figer le format (estimation : ~40 Ko compressé par fiche, soit ~400 Mo
  pour 10 000 vols). **Si plus de 1 Go projeté**, l'Architecte tranche : garder seulement `fv-config` + les blocs
  `.fv-metrics` / `dl.fv-info`.
- Écriture atomique (`.tmp` puis `os.replace`) comme `save_flight_data`.

**Scène 5. Index `flights.db`** (migrations `ALTER TABLE` dans `connect`, comme aujourd'hui) :

| Colonne | Rôle |
|---|---|
| `has_sheet_raw` | fiche brute présente |
| `track_source` | `fv-config`, `gpx`, `kml` ou `NULL` |
| `track_stats` (remplace progressivement `gpx_stats`) | statistiques de la meilleure trace disponible, avec `version` |
| `syride_status` | `present`, `absent` (non vu à la dernière liste complète), `unknown` |
| `last_seen_list` | date de la dernière liste où le vol figurait |
| `list_hash` | empreinte des champs de liste, pour détecter une modification sur Syride |
| `duplicate_of` | numéro du vol jumeau probable (A7), rempli par la détection, jamais utilisé pour supprimer |

`get_global_queue` : un vol est « à compléter » s'il lui manque la fiche brute **ou** les informations de fiche,
**ou** (profil à fichiers seulement) le GPX, **ou** (profil à fichiers et `--fill-igc`) l'IGC.
Un vol qui a déjà GPX et informations mais pas de fiche brute **n'est pas** prioritaire : il passe en dernier, après les
vols vraiment incomplets (rattrapage progressif, voir acte V).

**Scène 6. Réconciliation** (`flights_db.reconcile_pilot(conn, pilot, list_items)`, pure côté réseau) :

- nouveau vol → JSON créé avec les champs de liste (comme `identify_new_traces`) ;
- vol connu dont `list_hash` a changé → **mise à jour des seuls champs de liste** dans le JSON, ancienne valeur tracée
  dans `<num>.json` sous `historique_liste` (date, champ, avant, après) ;
- vol connu absent de la liste complète → `syride_status = absent`, **rien n'est supprimé**, signalé dans le bilan ;
  la colonne `syride_status` est exposée dans le pkl à titre d'information (le vol reste inclus, décision 1) ;
- détection des doublons probables (A7) → liste affichée et écrite dans `<main_path>/_rapport_doublons.txt`.
- Garde-fou : si la liste renvoie **moins de 80 %** des vols connus du pilote, aucune marque `absent` n'est posée
  (réponse tronquée probable) et un avertissement s'affiche.

**Scène 7. Réanalyse hors ligne** : `python main.py --reparse 1 [--pilots …]` relit toutes les fiches brutes et les
instantanés, réécrit les champs de fiche des JSON (seulement s'ils changent), puis met l'index à jour. Ni Chrome ni réseau.

**Porte III (Avocat du diable)** : migration de base testée sur une copie de `flights.db` réelle (ancienne base →
nouvelle, puis relance : idempotence) ; aucun JSON réécrit sans changement réel (comparaison du contenu, pas de la date).

### Acte IV : la session navigateur (Le Pilote d'essai)

**Scène 8. Transport et liste.** Dans `src/syride_scraper.py` :

- `fetch_activities(transport, pilote) -> str` : récupère l'`idRider` (mis en cache dans `flights.db`, table `pilots`), puis
  `activites.php?limit=5000` ; repli automatique sur la pagination `beforeId` si la réponse est tronquée (moins de vols que le
  nombre affiché sur le profil, ou plafond de `limit` constaté à l'acte I).
- `transport` : objet avec `get_text(url)` / `post_form(url, data)`, deux implémentations : `HttpTransport` (si la porte I l'a
  validé) et `PageTransport` (`driver.execute_async_script` + `fetch` dans la page Syride). Les tests utilisent un
  `FakeTransport` qui sert les fixtures.
- `get_all_navs` est remplacé par `list_pilot_flights` ; `scroll_until_known` est supprimé ; l'option `--scroll` reste
  acceptée (P7).

**Scène 9. Fiche.** `read_flight_sheet(session, pilote, num, flight_token)` :

1. jeton absent ou expiré (moins de 2 min de validité) → relecture de la liste du pilote (une requête) ;
2. `POST autoriser-affichage.php` via `PageTransport` ;
3. réponse `turnstile_required` → navigation vers `/fr/pilotes/<p>/<num>` (Syride affiche son propre défi),
   **message et attente** comme `wait_for_cloudflare` (« Valide la vérification dans la fenêtre Chrome »), puis reprise ;
4. `GET ficheVol.php` → détection des limites (`detect_limit`, inchangé) → enregistrement **immédiat** de la fiche brute ;
5. parsing (`parse_flight_sheet_full`) → mise à jour du JSON (P17) ;
6. **profil à fichiers seulement** : téléchargements immédiats GPX puis IGC avec `download_trace_via_browser` (inchangé :
   gestion du lien expiré, de la limite de téléchargement, de la réponse HTML déguisée).

`process_flight` et la boucle de `process_pilots` gardent **la même structure, les mêmes statuts et les mêmes bilans** ;
seuls changent la source de la fiche et la condition des téléchargements.

**Scène 10. Profils à fichiers** (`params_scrap_syride.py`) :

```python
# Pilotes dont on télécharge aussi les fichiers Syride (sinon : trace lue dans la fiche).
# Valeurs possibles par pilote : ("gpx",), ("gpx", "igc"), ("gpx", "igc", "kml").
FICHIERS_PAR_PILOTE = {
    "AdrienM": ("gpx", "igc"),
}
```

- Option CLI `--files auto|none|gpx|gpx,igc` (défaut `auto` = la table ci-dessus ; les autres valeurs s'appliquent à tous
  les pilotes de l'exécution, pour un rattrapage ponctuel).
- `PILOTES` n'est **pas** modifié (sa forme est lue par `create_global_pkl.py` et `fix_truncated_names.py`).
- `--fill-igc 1` ne s'applique qu'aux pilotes dont le profil contient `igc` ; message clair sinon.

**Porte IV (Avocat du diable + Contrôleur)** : tests unitaires avec `FakeTransport` (jeton expiré, Turnstile, limite par
minute, limite quotidienne, limite de téléchargement, fiche sans `fv-config`) ; puis **essai réel encadré par Adrien**
sur une copie des données : `python src/main.py --path <copie> --pilots AdrienM,j2f --max-sheets 6`.
Attendus : la phase 1 trouve exactement les mêmes nouveaux vols que l'ancienne version, les 6 fiches sont enregistrées
brutes, AdrienM reçoit GPX + IGC, j2f n'en reçoit pas, le pkl se génère.

### Acte V : la recette, la bascule et le rattrapage (Le Contrôleur, l'Architecte, Adrien)

**Scène 11. Comparaison A/B** (`src/migration/compare_pkl.py`) : ancien pkl (avant migration) contre nouveau pkl sur la
même copie de données, **sans nouvelle fiche** (`--scrape 0 --max-sheets 0`) puis avec la réanalyse :
- mêmes vols (ensemble des `(pilote, num_activite)`), vols `absent` compris ;
- mêmes colonnes ; valeurs identiques, sauf les statistiques des vols dont la source est passée de `gpx` à `fv-config`
  (écarts dans les tolérances de la scène 3) ;
- `make export` puis `cd web && npm test` sur les fixtures : vert.
Rapport : `src/migration/RECETTE.md`, chaque ligne de la matrice §2 cochée ou expliquée.

**Scène 12. Bascule** : fusion de `scraping/migration-fv` dans `main` après accord d'Adrien ; premier lancement réel
complet `python src/main.py` ; sauvegarde préalable de `flights.db` (copie datée) — les dossiers de vols ne sont jamais
modifiés de manière destructive, donc pas de sauvegarde complète nécessaire, mais une copie reste recommandée.

**Scène 13. Rattrapage progressif** des fiches brutes des ~9 800 vols existants :
- ordre : vols incomplets, puis vols sans GPX, puis le reste du plus récent au plus ancien ;
- par lots (`--max-sheets`), au fil des lancements normaux ; aucune urgence : tant qu'un vol n'a pas sa fiche brute,
  ses statistiques viennent du GPX existant (P20) ;
- option `--backfill-raw 0` pour ne pas consacrer de fiches au rattrapage lors d'un lancement donné.

**Scène 14. Documentation (Le Scribe)** : `src/README.md` (phases, profils à fichiers, `--reparse`, `--files`,
réconciliation, doublons), docstring de `main.py`, en-têtes de `browser_session.py` et `syride_scraper.py`.

---

## 5. Lots, dépendances et ordre d'exécution

```
Lot A  Reconnaissance (Éclaireur)                     ── porte I
  │
  ├── Lot B  Parsing (Philologue)          ┐ en parallèle, fichiers disjoints
  └── Lot C  Statistiques (Métrologue)     ┘ ── porte II
        │
      Lot D  Stockage, index, réconciliation, réanalyse (Archiviste) ── porte III
        │
      Lot E  Session navigateur, profils à fichiers, CLI (Pilote d'essai) ── porte IV (essai réel)
        │
      Lot F  Recette A/B, validation des stats (Contrôleur) + doc (Scribe) ── bascule
        │
      Lot G  Rattrapage progressif (lancements normaux)
        │
      Lot H  Plan d'affichage des nouveaux champs (webapp + rapport)
```

| Lot | Fichiers modifiés ou créés | Critère de fin |
|---|---|---|
| A | `src/migration/SYRIDE_API.md`, `src/migration/anonymize_fixture.py`, `src/scraping_tests/fixtures/*` | Contrat complet, fixtures anonymisées relues par l'Architecte (aucune donnée personnelle) |
| B | `src/syride_parsing.py`, `src/scraping_tests/test_parsing.py`, `Makefile` (cible `test-py`), `src/requirements-export.txt` (ajout de `beautifulsoup4==4.11.2` pour la CI) | Tests verts ; anciens tests et ancien format de fiche toujours lus |
| C | `src/track_stats.py`, `src/scraping_tests/test_track_stats.py`, `src/migration/compare_track_vs_gpx.py` | Non-régression GPX prouvée ; calcul fv-config testé sur fixture |
| D | `src/flights_db.py`, `src/syride_scraper.py` (`save_*` seulement), `src/scraping_tests/test_flights_db.py`, `src/scraping_tests/test_reconcile.py` | Migration idempotente ; réconciliation testée (nouveau, modifié, absent, liste tronquée, doublons) |
| E | `src/syride_scraper.py`, `src/browser_session.py`, `src/params_scrap_syride.py`, `src/main.py`, `src/debug_flight_page.py`, `src/scraping_tests/test_session.py` | Porte IV passée avec Adrien |
| F | `src/migration/compare_pkl.py`, `src/migration/RECETTE.md`, `src/migration/VALIDATION_STATS.md`, `src/README.md` | Matrice §2 entièrement cochée |
| G | aucun code | Suivi du nombre de vols sans fiche brute dans le bilan de chaque lancement |

`Makefile` : la cible `test-py` est étendue à `src/scraping_tests` (lot B). La CI (`.github/workflows/ci.yml`) l'exécute
via `pytest` dans `src` : étendre aussi la commande de la CI au nouveau dossier (lot B, accord de l'Architecte) ; `bs4` n'est pas
dans `requirements-export.txt` aujourd'hui, il faut l'ajouter (version épinglée identique à `requirements-scraping.txt`).

---

## 6. Risques et parades

| Risque | Parade |
|---|---|
| Syride change `activites.php` ou `fv-config` | Tests sur fixtures + `PilotPageError` ; la fiche brute est gardée : on corrige le parser puis `--reparse` |
| Le Turnstile apparaît à chaque fiche | Le script attend l'humain (comme Cloudflare aujourd'hui) ; pas de contournement. Si c'est trop fréquent, réduire le rythme (`SHEET_DELAY`) et traiter par petits lots |
| Liste tronquée → faux vols « absents » | Garde-fou 80 % (scène 6), aucune suppression, statut réversible au lancement suivant |
| Stats fv-config ≠ stats GPX | Validation chiffrée (scène 3) ; en cas d'écart hors tolérance, le GPX reste prioritaire quand il existe |
| Volume des fiches brutes | Mesure à la scène 4 et repli sur un format réduit |
| Jetons d'affichage expirés pendant une longue phase 2 | Relecture de la liste du pilote (1 requête) quand le jeton a moins de 2 min de validité |
| Fuite de données dans le dépôt | Fixtures anonymisées par script, `.gitignore` en liste blanche, hook pre-commit, revue de l'Architecte |
| Régression du pkl / de la webapp | Comparaison A/B (scène 11), `make test-py`, tests web |

---

## 7. Conduite des agents (mode opératoire de l'Architecte)

1. Un brief par lot (`src/migration/BRIEF_LOT_<X>.md`) : contexte, fichiers autorisés, fichiers interdits, critères de fin,
   commandes de vérification. Les agents lisent ce plan et leur brief, rien d'autre n'est supposé connu.
2. Exécution avec le modèle indiqué au §1 ; lots B et C en parallèle (fichiers disjoints), les autres en séquence.
3. Revue de l'Avocat du diable sur le diff du lot ; corrections par l'agent du lot ; commit par l'Architecte :
   `Migration scraping, lot <X> : <résumé>`.
4. Après chaque porte : point avec Adrien (une ligne : ce qui est fait, ce qui reste, décision attendue).
5. Contexte : nouvelle session conseillée après la porte II et après la porte IV (le plan et les briefs suffisent à reprendre).

### Décisions d'Adrien (21/11/2026)

1. **Vols disparus de Syride : jamais supprimés**, ni du disque ni du pkl. Ils restent inclus, marqués `syride_status = absent`
   et signalés dans le bilan. Aucune option d'exclusion n'est développée.
2. **Fiche brute complète conservée** si la taille mesurée (scène 4) est raisonnable (seuil : 1 Go projeté pour l'ensemble).
   Au-delà, l'Architecte revient vers Adrien avant de réduire le format.
3. **Nouveaux champs voulus** (`vario_min`, `hauteur_sol_max`, extrema horodatés…) dans la webapp **et** le rapport :
   ils sont ajoutés au pkl en colonnes optionnelles pendant la migration (lot C/D), puis un **plan dédié** (lot H)
   prévoit leur affichage. L'affichage lui-même est hors de cette migration.
4. **Profils à fichiers : AdrienM seul** (GPX + IGC), car l'IGC sert dans d'autres applications.
5. **Branche distincte** `scraping/migration-fv` (worktree `.claude/worktrees/migration-fv`) : `main` reste toujours
   fonctionnel ; fusion dans `main` seulement après la recette complète (lot F) et l'accord explicite d'Adrien.

### Lot H : plan d'affichage des nouveaux champs (après la bascule)

Rédigé par l'Architecte dans `src/migration/PLAN_NOUVEAUX_CHAMPS.md` : pour chaque champ, sa colonne dans le pkl,
dans `flights.<hash>.json` (`src/web_export/schema.json`, nouvelle `schema_version`), les écrans de la webapp
(`web/`) et les sections du rapport (`src/rapport/`) concernés, les tests à ajouter, et le traitement des vols
qui n'ont pas encore leur fiche brute (valeur absente, jamais 0).
