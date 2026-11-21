# Revue du lot E (L'Avocat du diable), commit da1e3da

Périmètre : `syride_scraper.py`, `browser_session.py`, `main.py`, `params_scrap_syride.py`, `debug_flight_page.py`,
`flights_db.py` (dry_run de `reconcile_pilot`), tests `test_phase1.py`, `test_session.py`, `test_cli.py`.
Comparaison avec `main`. Aucun fichier de code modifié.

## Vérifications faites

- `make test-py PYTHON=/Users/Adrien/opt/anaconda3/bin/python` : **243 passed**.
- Syntaxe Python 3.8 (`ast.parse(..., feature_version=(3, 8))`) sur les 5 modules : OK ; aucune annotation `list[...]`, `X | None`, `match`.
- Simulation réelle : `main.main(["--dry-run","1","--pilots","AdrienM,j2f","--db",<copie scratchpad>])` lancée via un
  petit lanceur qui installe des modules factices pour `selenium`, `undetected_chromedriver` et `fastkml` (absents de
  l'anaconda : **`python main.py --dry-run 1` tel que demandé dans le brief ne démarre pas ici**, `ModuleNotFoundError:
  undetected_chromedriver` à l'import de `browser_session`). Résultat :
  - `AdrienM : 504 vols sur Syride, 0 nouveaux, 20 modifiés, 2 absents, 0 réapparus` (absents : 2093221, 2844756, attendus) ;
  - `j2f : 1059 vols sur Syride, 0 nouveaux, 1059 modifiés, 0 absents` (voile « Non renseig » → « Non renseigné », accepté) ;
  - phase 2 : 1 565 vols en file (1 495 « fiche brute seule », 70 « fichiers manquants seulement ») ;
  - `find <données> -newer marker` (hors `.claude`) : **aucun fichier de données modifié**.
- Règle absolue : aucune chaîne `ficheVol` / `autoriser-affichage` dans le code exécuté, aucun POST ; `HttpTransport`
  n'envoie ni cookie ni identifiant (UA générique, `Referer` = page publique du pilote, `Accept-Language: fr`).
  Les jetons de la liste (`flight_token`) ne sont ni utilisés ni écrits dans les JSON (`_TOKEN_KEYS`) ; ils restent
  dans l'instantané `_raw/activites_*.html.gz` (local, prévu par le plan).
- Dépaquetage à 5 valeurs de `read_flight_sheet` : les deux appelants (`process_flight`, `_download_one`) sont à jour ;
  aucun autre appelant (`python_functions.py` a sa propre fonction homonyme, non concernée).
- `switch_to.frame` / `default_content` : `_parent_has_turnstile_gate` revient toujours au contexte parent avant de lire
  `page_source`, la boucle repart de l'attente de `#popupIframe` dans le contexte parent, et le `finally` remet le
  contexte par défaut. Pas d'erreur d'appariement trouvée.
- `complete` : faux dès qu'une page atteint la limite sans page plus courte ensuite (marqueur de fin seul, ou garde-fou
  de 50 pages) ; vrai seulement si la dernière page reçue est plus courte que la limite. Conforme.
- Phase 1 réelle : seules suppressions = élagage des instantanés `_raw` au-delà de 5 (prévu par le plan, scène 4).
  Écritures : JSON nouveaux / modifiés / absents / réapparus, `_rapport_doublons.txt`, instantané, base.

## Constats

### Important

**I1. `syride_scraper.py:111-134` (`wait_for_turnstile`) et `syride_parsing.py:735` : attente sans fin possible,
fondée sur un DOM jamais observé.**
La détection repose sur `is_turnstile_gate(page parente)` (marques `cf-turnstile` / `turnstile` / `flightTurnstileGate`
dans id, classe ou `data-*`, éléments cachés seulement par `hidden` ou `style="display:none"` en ligne). La structure
réelle de la page du vol pendant un défi n'a jamais été capturée (SYRIDE_API.md : aucun défi rencontré ; la fixture de
test `GATE` est inventée et disparaît après validation). Scénarios concrets :
- après validation, le conteneur du widget Cloudflare (`div.cf-turnstile`, coche verte « Succès ») reste normalement dans
  le DOM ; si Syride ne le retire pas ou le masque par une classe CSS, `while _parent_has_turnstile_gate(driver)` ne
  s'arrête jamais, alors même que la fiche est affichée dans l'iframe : le script reste bloqué en « toujours en attente » ;
- si la page contient en permanence un conteneur Turnstile caché par la feuille de style, n'importe quel dépassement de
  délai (réseau lent) déclenche un faux message « Valide-la dans la fenêtre Chrome » puis la même attente infinie ;
- à l'inverse, si le défi s'affiche **dans** l'iframe `#popupIframe` (page `ficheVol`), il n'est jamais détecté :
  `RuntimeError` « contenu de la fiche introuvable » à chaque vol, chaque lecture consommant une unité de `--max-sheets`,
  et la file se vide en échecs.
Correction : dans la boucle d'attente, sortir aussi dès que l'iframe contient `.fv-metrics` / `.volTexte` (revenir
au parent ensuite) ; tester la marque Turnstile dans les deux contextes (parent et iframe) ; capturer la vraie page
pendant un défi avec `debug_flight_page.py` lors de la recette R4 et en faire une fixture avant la bascule.

**I2. Première phase 1 réelle : réécriture de noms de sites corrigés à la main (à valider avec Adrien avant la porte IV).**
Sur AdrienM, la simulation montre 20 modifications : `site` 7 (ex. « Ténérife Taucho » → « Taucho - Tenerife » sur 6 vols
de 2023, `''` → « Secondigne-Sur-Belle 03 »), `voile` 11, `types` 2 (« Vol rando » → « Vol site »). j2f : 4 `site`,
5 `types` en plus des 1 059 `voile`. Si ces valeurs locales viennent de corrections manuelles (ou de
`fix_truncated_names.py`), la réconciliation les écrase par la valeur Syride (l'ancienne reste dans `historique_liste`,
donc réversible, rien n'est supprimé). Effet visible : regroupement par site et coordonnées de sites changent dans le pkl
et la webapp, donc la comparaison A/B de la scène 11 ne sera pas « identique ». Ce n'est pas un défaut du code (A2
voulu), mais la porte IV attend « les mêmes nouveaux vols que l'ancienne version » et ne prévoit pas ce cas.
Correction : montrer la liste à Adrien avant l'essai réel ; si des corrections locales doivent primer, prévoir une liste
de champs verrouillés par vol (ou ne pas réécrire `site` quand l'ancienne valeur figure dans `historique_liste`
comme valeur imposée). Sur l'ensemble des pilotes par défaut, la première phase 1 complète réécrirait environ
1 800 JSON et marquerait 27 vols absents (détail en fin de document), bien plus que les ~1 059 JSON de j2f acceptés.

**I3. `browser_session.py:408-411` / `main.py:248` : `--dry-run 1` sans `--db` migre et réécrit la vraie `flights.db`
depuis la branche.**
Le comportement est documenté, mais il est nouveau dans ses effets : sur cette branche, `connect` ajoute les colonnes
du lot D et `sync_all` recalcule et stocke les statistiques en `STATS_VERSION = 3` (506 + 953 recalculs observés sur
la copie). Un `python main.py --dry-run 1` lancé par réflexe (P3 dit « rien n'est ouvert ») depuis le worktree modifie
donc la base de `main` ; au lancement suivant depuis `main`, la version 2 recalcule tout (va-et-vient, pas de casse
trouvée, colonnes en plus ignorées par `main`). Correction : en `--dry-run` sans `--db`, travailler sur une copie
temporaire de la base (`sqlite3.backup` vers `:memory:` ou un fichier temporaire), ce qui rend P3 vraiment sans écriture.

### Mineur

**M1. `flights_db.py:449-459` (`flight_kind`) et `browser_session.py:541-545` : bilan trompeur.** Les 70 vols d'AdrienM
sans IGC sont comptés « avec fichiers manquants seulement (JSON complet) » alors qu'ils ne sont en file que pour la fiche
brute (`--fill-igc` absent) ; `need_igc` reste vrai, donc l'IGC sera bien téléchargé au passage (même comportement
qu'avant), mais le libellé suggère que `--fill-igc` est actif. Correction : `flight_kind` doit ignorer `need_igc`
sans `fill_igc`, comme `get_global_queue`.

**M2. `main.py:234-239` : avertissement `--fill-igc` seulement quand AUCUN pilote n'a l'IGC.** P5 demande un
avertissement pour un profil sans fichiers ; `--pilots AdrienM,j2f --fill-igc 1` ne dit rien pour j2f. Correction : lister
les pilotes de l'exécution exclus de `--fill-igc`.

**M3. `browser_session.py:169-176` : idRider en cache invalide non détecté.** Le repli ne se déclenche que sur
`PilotPageError`. Un idRider faux renvoie probablement le seul marqueur de fin (pas d'erreur) : le pilote affiche alors
« 0 vols sur Syride, garde-fou déclenché » à chaque lancement et ses nouveaux vols ne sont plus jamais vus. Correction :
si la liste est vide alors que la base connaît des vols Syride, relire l'idRider sur la page une fois.

**M4. `params_scrap_syride.py:59` : le commentaire annonce `("gpx", "igc", "kml")`**, mais `process_flight` ne télécharge
que `gpx`/`igc` et `--files` refuse `kml` : un profil avec `kml` serait ignoré en silence. Retirer `kml` du commentaire.

**M5. `syride_scraper.py:433-444` : `_debug_iframe_<num>.html` est toujours écrit dans le dossier courant** (une fois par
exécution) alors que la fiche brute est désormais enregistrée (P25 « remplacé par la fiche brute »). Sans gravité ;
peut être retiré.

**M6. P17 « dossiers vides nettoyés » : `initiate_search` n'est plus appelé.** Les dossiers vides ne sont plus retirés ;
sans conséquence fonctionnelle (la réconciliation teste l'existence du JSON, pas du dossier), mais la ligne de la matrice
doit être mise à jour.

**M7. `syride_scraper.py:300-320` : réponse tronquée jugée complète.** Une réponse coupée en cours de transfert (sans
`Content-Length` en gzip) donne moins d'activités que la limite, donc `complete=True` ; seul le garde-fou des 80 %
protège alors des faux « absents » (réversibles). Si la réponse complète de Syride se termine par une balise
reconnaissable, l'exiger pour `complete`.

**M8. Simulation : `--dry-run` ne montre pas en phase 2 les vols nouveaux de la phase 1** (JSON non écrits, donc absents
de la file). Le dire dans le message de simulation.

**M9. Brief, vérification : `python main.py --dry-run 1` ne démarre pas avec l'anaconda indiqué** (Selenium et
`undetected_chromedriver` absents, import en tête de `browser_session`). La simulation « réelle » du compte rendu du
lot E n'a donc pu être faite qu'avec des modules factices. Pour que `--dry-run` et `--reparse` tournent sans Chrome,
importer `undetected_chromedriver` paresseusement dans `create_driver` / `_installed_chrome_major`.

## Matrice de parité §2 (lot E)

| # | Verdict |
|---|---|
| P1 | OK (3 phases, phase 1 par HTTP) |
| P2 | OK (`--scrape 0` saute la phase 1, donc aussi la réconciliation) |
| P3 | OK avec réserve I3 (la base est écrite sans `--db`) et M8 |
| P4 | OK (`_Budget` inchangé ; la relecture sur lien expiré consomme aussi le budget, comme avant) |
| P5 | OK, avertissement partiel (M2) |
| P6 | OK (`--db` ajouté ; `--db` + pkl refusé) |
| P7 | OK (`--scroll N` accepté, message obsolète) |
| P8 | OK (`tasks`, `private` conservés ; `tasks=files` limité aux profils par `get_global_queue`) |
| P9 | OK (`syride_accounts` non utilisé, comme sur `main`) |
| P10 | OK (connexion non confirmée → aucune fiche) |
| P11 | Cloudflare OK ; Turnstile : voir I1 |
| P12, P13, P14, P15 | OK (logique inchangée, limitée aux profils à fichiers pour P14/P15) |
| P16 | OK (`nolink` si ni trace ni lien GPX, ou GPX voulu sans lien) |
| P17 | OK sauf dossiers vides (M6) |
| P23, P24, P26 | OK |
| P25 | OK, debug résiduel (M5) |
| P27 | OK (requêtes réseau listées, `token`/`key` masqués, noms de cookies seulement) |
| P30 | OK |

## Résultat de la simulation sur les autres pilotes par défaut

`reconcile_pilot(..., dry_run=True)` sur la copie de la base, listes lues par `HttpTransport` (lecture seule, aucun
fichier de données modifié). Toutes les listes sont `complete=True`, aucun garde-fou déclenché.

| Pilote | Vols listés | Modifiés (champs) | Absents |
|---|---|---|---|
| AdrienM | 504 | site 7, voile 11, types 2 | 2 |
| j2f | 1 059 | voile 1 059, site 4, types 5 | 0 |
| Thomas16 | 651 | site 6, voile 3 | **12** |
| DavidParatrucs79 | 129 | voile 8 | 2 |
| ToriVsUke | 286 | **voile 285** | 1 |
| Florent_Essar | 531 | types 2, voile 3 | 0 |
| LiLi06 | 599 | voile 39, site 7, types 2 | 1 |
| yanis | 1 684 | voile 7, site 7 | 2 |
| chami | 92 | voile 50, site 1 | **7** |
| Tof Torsac | 164 | **voile 164**, types 4, site 2 | 0 |
| JJvole | 274 | types 1, site 6, voile 2 | 0 |
| jeanlouisksu | 534 | voile 16 | 0 |

Conséquences pour I2 :
- la réécriture « Non renseig » → « Non renseigné » ne touche pas que j2f : ToriVsUke (286 JSON à « Non renseig »),
  Tof Torsac (164), chami (53) aussi. Total de la première phase 1 complète : environ **1 700 JSON de voile**, plus
  ~120 autres modifications (site, types, voiles réelles) — au-delà des ~1 059 annoncés comme acceptés ;
- **27 vols** seraient marqués `absent` (dont 12 pour Thomas16, 7 pour chami) : à montrer à Adrien, car ils apparaîtront
  comme tels dans le bilan et le pkl (`syride_status`). Rien n'est supprimé et le statut est réversible.
