# Analyse des traces de vol Syride

Récupère les vols de pilotes sur Syride, les range dans des dossiers, construit un fichier
`global_flights_data.pkl`, puis l'affiche dans une application Dash (et dans un rapport PDF).

## Les fichiers

| Fichier | Rôle |
|---|---|
| `params_scrap_syride.py` | Paramètres : chemins, liste des pilotes, identifiants (via `.env`) |
| `main.py` | Point d'entrée : scraping puis génération du pkl |
| `browser_session.py` | Enchaîne les 3 phases avec une seule fenêtre Chrome |
| `syride_scraper.py` | Accès à Syride avec Selenium : connexion, page d'un pilote, fiche, téléchargements, Cloudflare |
| `syride_parsing.py` | Lecture du HTML de Syride (fonctions pures, sans navigateur) |
| `flights_db.py` | Index SQLite (`flights.db`) : coordonnées en cache, liste des vols à compléter |
| `analyze_functions.py` | Pipeline pandas appliqué aux vols avant le pkl |
| `create_global_pkl.py` | Génère `global_flights_data.pkl` |
| `app.py`, `app_functions.py` | Application Dash |
| `report_functions.py` | Rapport PDF annuel d'un pilote (à remettre en état, voir plus bas) |
| `fix_truncated_names.py` | Outil ponctuel : répare les anciens noms de voiles/instruments tronqués |

## Utilisation

Le scraping se lance depuis le dossier des scripts :

```bash
python main.py                      # les 3 phases + génération du pkl
python main.py --scrape 0           # sans parcourir les pages pilotes : complète les vols déjà sur le disque
python main.py --dry-run 1          # simulation : liste ce qui serait fait, sans Chrome ni pkl
python main.py --max-sheets 45      # s'arrête après 45 fiches (Syride limite le nombre par jour)
python main.py --fill-igc 1         # complète aussi l'IGC des vols qui ont déjà leur GPX (1 fiche par vol)
python main.py --pilots AdrienM,j2f # pilotes précis (sinon : params.pilots)
python main.py --pkl 0              # sans regénérer le pkl
```

### Les 3 phases

1. **Identification** : nouvelles traces de tous les pilotes ; les informations de la page liste
   (date, temps de vol, voile, distance, altitude max, instrument) sont enregistrées dans
   `<pilote>/traces/<numéro>/<numéro>.json`. Aucune fiche n'est consultée.
2. **Complétion** : pour chaque vol Syride auquel il manque des informations ou le GPX, le script
   consulte la fiche (statistiques propres à la fiche), complète le JSON et télécharge **tout de
   suite** le GPX et l'IGC (les liens sont signés et expirent en quelques minutes).
3. **Index** : mise à jour de `flights.db`, puis génération du pkl.

### Limites de Syride

- « Trop de fiches consultées » : le script attend (2, 5, puis 10 minutes) et reprend.
- Limite quotidienne (50 fiches) : la phase 2 s'arrête, rien n'est supprimé, les vols restants
  sont complétés au lancement suivant (`--scrape 0` suffit).

## Données

```
<main_path>/
  <pilote>/traces/<numéro>/<numéro>.json   informations du vol
                          /<numéro>.gpx    trace GPS
                          /<numéro>.igc    trace IGC
  flights.db                               index (reconstructible : le supprimer est sans risque)
  global_flights_data.pkl                  données de l'application
```

Les dossiers sont la source de vérité. Un vol Syride sans informations de fiche n'apparaît pas
dans le pkl tant que sa fiche n'a pas été lue. `altitude_max` (page liste) reste dans le JSON
mais n'ajoute pas de colonne au pkl.

## Fichiers générés, à ne pas versionner

`.env` (identifiants), `flights.db`, `_chrome_profile/`, `_tmp_downloads/`, `_backup_json_noms/`,
`name_corrections.json`, `__pycache__/`.

## Réparer les noms tronqués (ponctuel)

L'ancienne extraction coupait la dernière lettre des voiles/instruments sans parenthèse
(`Evolutio`). Pour réparer les anciens JSON :

```bash
python fix_truncated_names.py --scan     # liste les valeurs, écrit name_corrections.json
# renseigner "remplacer_par" dans name_corrections.json
python fix_truncated_names.py --apply    # applique, avec sauvegarde dans _backup_json_noms/
```

## Rapport PDF

`report_functions.generate_pdf_report` lit les colonnes `flight_url` et `heure_decolage`, que le
pipeline ne produit pas : il ne fonctionne pas avec le pkl actuel. Aucun script ne l'appelle dans ce
dossier.
