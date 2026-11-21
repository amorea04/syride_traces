# Analyse des traces de vol Syride

Récupère les vols de pilotes sur Syride, les range dans des dossiers, construit un fichier
`global_flights_data.pkl`, puis le publie sous forme de webapp statique (`web/`, publiée par `publish.py`).
Voir aussi le `README.md` à la racine du dépôt.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `params_scrap_syride.py` | Paramètres : chemins, liste des pilotes, profils à fichiers (`FICHIERS_PAR_PILOTE`), identifiants (via `.env`) |
| `main.py` | Point d'entrée : scraping puis génération du pkl |
| `browser_session.py` | Enchaîne les 3 phases (liste sans Chrome, puis une seule fenêtre Chrome pour les fiches) |
| `syride_scraper.py` | Accès à Syride : liste par HTTP, connexion, fiche de vol dans Chrome, téléchargements, Cloudflare / Turnstile, stockage de la fiche brute |
| `syride_parsing.py` | Lecture du HTML de Syride : liste, fiche, trace `fv-config` (fonctions pures, sans navigateur) |
| `track_stats.py` | Statistiques d'un vol calculées depuis sa trace (`fv-config` ou GPX) |
| `flights_db.py` | Index SQLite (`flights.db`) : réconciliation avec Syride, coordonnées en cache, vols à compléter, réanalyse |
| `analyze_functions.py` | Pipeline pandas appliqué aux vols avant le pkl |
| `create_global_pkl.py` | Génère `global_flights_data.pkl` |
| `export_web.py`, `web_export/` | Export des données de la webapp vers `web/public/data/` |
| `publish.py` | Export, build, contrôles et déploiement de la webapp sur Cloudflare Pages |
| `migration/` | Plan, contrat de l'API Syride (`SYRIDE_API.md`), recette et validation de la migration du scraping |
| `legacy/` | Ancienne application Dash (archivée, voir `legacy/README.md`) |
| `report_functions.py` | Rapport PDF annuel d'un pilote (à remettre en état, voir plus bas) |
| `fix_truncated_names.py` | Outil ponctuel : répare les anciens noms de voiles/instruments tronqués |
| `debug_flight_page.py` | Outil de diagnostic : lit une fiche et capture les requêtes réseau |

## Utilisation

Le scraping se lance depuis le dossier des scripts :

```bash
uv run python main.py                      # les 3 phases + génération du pkl
uv run python main.py --scrape 0           # saute la phase 1 : complète les vols déjà sur le disque
uv run python main.py --dry-run 1          # simulation : la liste est lue, rien n'est écrit, ni Chrome ni pkl
uv run python main.py --max-sheets 45      # s'arrête après 45 fiches (défaut 40 : Syride en limite le nombre par jour ; 0 = sans plafond)
uv run python main.py --files gpx,igc      # fichiers téléchargés pour tous les pilotes de l'exécution (défaut : auto)
uv run python main.py --fill-igc 1         # complète aussi l'IGC des vols qui ont déjà leur GPX (1 fiche par vol)
uv run python main.py --backfill-raw 0     # ne consacre pas de fiche au rattrapage des fiches brutes
uv run python main.py --reparse 1          # réanalyse hors ligne des fiches brutes (ni réseau ni Chrome), puis pkl
uv run python main.py --pilots AdrienM,j2f # pilotes précis (sinon : params.pilots)
uv run python main.py --pkl 0              # sans regénérer le pkl
uv run python main.py --publish 1          # scraping, pkl, puis publication de la webapp
```

`--scroll` est accepté mais n'a plus d'effet (la liste n'est plus lue par défilement).

### Les 3 phases

1. **Liste et réconciliation** (sans Chrome, sans connexion) : une requête HTTP par pilote
   (`/ajax/pilotes/activites.php`) renvoie tout l'historique. Elle est comparée au disque :
   - vols **nouveaux** : JSON créé dans `<pilote>/traces/<numéro>/<numéro>.json` ;
   - vols **modifiés** (site, voile, type, instrument... : Syride fait foi) : le champ est mis à jour et
     l'ancienne valeur est gardée dans `historique_liste` du JSON ;
   - vols **absents** de Syride (supprimés ou réimportés) : jamais supprimés, ni du disque ni du pkl ;
     marqués `syride_status = absent` (colonne `syride_status` du pkl) et signalés dans le bilan ;
     ils repassent `present` s'ils réapparaissent. Garde-fou : si la liste reçue est incomplète ou
     anormalement courte, aucun vol n'est marqué absent ;
   - **doublons probables** (même pilote, même date et même durée, numéros différents) : listés dans
     `<données>/_rapport_doublons.txt`, jamais supprimés.
   Un instantané de la liste est gardé dans `<pilote>/_raw/activites_*.html.gz` (les 5 derniers).
2. **Complétion** : pour chaque vol à compléter, le script ouvre la fiche dans Chrome (une seule fenêtre,
   profil `_chrome_profile`) et enregistre la **fiche brute** `<numéro>.sheet.html.gz`, qui contient la
   trace complète (`fv-config`, 1 point par seconde). Les informations propres à la fiche, la trace, les
   statistiques et les coordonnées de départ en sont tirées. Ordre : vols incomplets, vols sans trace, puis
   le reste du plus récent au plus ancien. Chrome n'est ouvert que s'il y a une fiche à lire.
3. **Index** : mise à jour de `flights.db`, puis génération du pkl.

**Profils à fichiers.** GPX et IGC ne sont téléchargés que pour les pilotes de
`params_scrap_syride.FICHIERS_PAR_PILOTE` (AdrienM : `gpx` et `igc`), dans la même visite de fiche
(les liens expirent en quelques minutes). Pour les autres, la trace vient de la fiche brute et aucun
fichier n'est téléchargé. `--files` remplace ce réglage pour l'exécution ; `--fill-igc 1` complète les
IGC manquants des profils qui en demandent.

**Rattrapage des fiches brutes.** Les vols déjà présents sur le disque n'ont pas de fiche brute : elles
sont rattrapées au fil des lancements, après les vols nouveaux ou incomplets, dans la limite de
`--max-sheets` (40 fiches par lancement par défaut, `MAX_SHEETS_PAR_LANCEMENT`). Tant qu'un vol n'a
pas sa fiche, ses statistiques viennent de son GPX (puis du JSON). `--backfill-raw 0` désactive ce
rattrapage pour un lancement.

**Réanalyse (`--reparse 1`).** Relit les fiches brutes déjà enregistrées, sans réseau ni Chrome, et
recalcule JSON, statistiques et index : à utiliser quand le parser ou le calcul des statistiques change.

**Statistiques.** Durée, plafond, gain viennent de la trace (`source_stats` = `trace`, sinon `gpx`,
sinon `fiche`). `vitesse_max` reste celle affichée par Syride quand elle existe. Colonnes ajoutées au pkl :
`syride_status`, `vario_min`, `hauteur_sol_max`, `heure_plafond` (vides sans fiche brute, jamais 0).

**Cloudflare et Turnstile.** Si Chrome affiche une vérification Cloudflare ou le défi Turnstile de
l'ouverture d'une fiche, le script se met en pause (15 minutes au plus) : la valider **à la main** dans
la fenêtre, il reprend seul. Elle n'est jamais contournée.

### Limites de Syride

- « Trop de fiches consultées » : le script attend (2, 2, puis 5 minutes), reprend et ralentit son rythme (jusqu'à ×4).
- Limite quotidienne de fiches : la phase 2 s'arrête, rien n'est supprimé, les vols restants
  sont complétés au lancement suivant (`--scrape 0` suffit).
- Limite de téléchargements : le script continue en « informations seules » (fiche brute enregistrée, fichiers
  repris plus tard).

## Données

```
<main_path>/
  <pilote>/traces/<numéro>/<numéro>.json        informations du vol (source de vérité)
                          /<numéro>.sheet.html.gz  fiche brute (trace `fv-config` incluse)
                          /<numéro>.gpx, .igc      fichiers Syride (profils à fichiers, et anciens vols)
  <pilote>/_raw/activites_<date>.html.gz        instantanés de la liste (5 derniers)
  flights.db                                    index (reconstructible : le supprimer est sans risque)
  global_flights_data.pkl                       données de l'application
  _rapport_doublons.txt                         doublons probables à vérifier
```

Les dossiers sont la source de vérité. Un vol Syride sans informations de fiche est inclus dans le pkl
avec `incomplet = True` tant que sa fiche n'a pas été lue. `altitude_max`, `nom_vol` et `historique_liste`
restent dans le JSON sans ajouter de colonne au pkl.

## Fichiers générés, à ne pas versionner

`.env` (identifiants), `flights.db`, `_chrome_profile/`, `_tmp_downloads/`, `_backup_json_noms/`,
`name_corrections.json`, `__pycache__/`.

## Réparer les noms tronqués (ponctuel)

L'ancienne extraction coupait la dernière lettre des voiles/instruments sans parenthèse
(`Evolutio`). Pour réparer les anciens JSON :

```bash
uv run python fix_truncated_names.py --scan     # liste les valeurs, écrit name_corrections.json
# renseigner "remplacer_par" dans name_corrections.json
uv run python fix_truncated_names.py --apply    # applique, avec sauvegarde dans _backup_json_noms/
```

## Rapport PDF

`report_functions.generate_pdf_report` lit les colonnes `flight_url` et `heure_decolage`, que le
pipeline ne produit pas : il ne fonctionne pas avec le pkl actuel. Aucun script ne l'appelle dans ce
dossier.
