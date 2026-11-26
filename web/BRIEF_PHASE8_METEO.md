# Brief phase 8 : météo historique du jour du vol

Lis d’abord `docs/archive/web/BRIEF_PHASE7.md` (contexte technique, pipeline, interdits ; Python est désormais 3.14 via uv) et les briefs 2 à 6 (même dossier) (conventions du front, socle réutilisable). **Tout s'applique**, sauf ce qui suit.
Références : `ROADMAP_WEBAPP.md` §4 (contrat de données), §5.3 (fiche vol), §6 (direction artistique), §8 « Phase 8 », §9.1, D12.
Maître d'œuvre : Opus (relecture, intégration, commits). Les agents **ne committent pas**, ne poussent pas, ne changent pas de branche.

## Décisions d'Adrien (20/11/2026)

1. La météo est **calculée au build** (dans `export_web.py`), jamais dans le navigateur. Le site déployé n'appelle aucune API externe et la CSP ne change pas.
2. On prend le **jeu complet de variables** : vent, rafales, vent à 100 m, température, nébulosité, pluie, hauteur de couche limite et CAPE.
3. Affichage dans la fiche vol : un **instantané à l'heure du décollage, plus une bande horaire**.
4. Les statistiques agrégées par météo (vols par force de vent, etc.) feront l'objet d'un **lot ultérieur**. Elles ne font pas partie de ce brief, mais le format de données doit les rendre possibles sans nouvel appel à l'API.

## Branche et état

- Branche à créer par le maître d'œuvre : `web/phase-8-meteo`.
- Lots **séquentiels** : lot 0 (vérifications), lot A (Python), lot B (front), lot C (remplissage réel et recette). Le lot B consomme le format produit par le lot A.

## Données de départ (mesurées le 20/11/2026)

- 9 584 vols de 2014 à 2026, tous avec une heure de décollage. Les heures vont de 6 h à 21 h (sauf 2 vols à 1 h, sans doute des heures UTC aberrantes).
- **3 554 couples (site, date) distincts** : c'est l'unité d'appel et de stockage. Les vols d'un même jour au même site partagent la même météo.
- 435 sites, entre 28° N et 48,7° N et entre 16,8° W et 11,8° E. Une vingtaine sont hors de France (Canaries, Maroc, Espagne, Italie), d'où un **fuseau horaire par site**.
- `flights.<hash>.json` fait déjà 865 Ko brut, au-dessus de la cible de 700 Ko. **On n'y ajoute aucune colonne.**
- `sites.<hash>.json` donne `id`, `lat` et `lon` (coordonnées moyennes du site, déjà publiques).

## Règles communes

- **D12** : la météo est indexée par **site et date**, jamais par vol, et ne contient aucune coordonnée par vol. Les seules coordonnées envoyées à l'API sont celles des sites, déjà publiées.
- **Aucune nouvelle dépendance** : les appels HTTP passent par `urllib.request` (stdlib), sans `requests`. Côté front, aucune nouvelle dépendance npm.
- **Aucun appel réseau dans les tests** (pytest, vitest, e2e), ni dans la CI. On utilise des réponses Open-Meteo enregistrées en fixtures, **synthétiques ou anonymisées** : coordonnées de sites fictifs, pas de vraies données.
- Le cache local n'est **jamais commité** : il est hors de la liste blanche du `.gitignore` (à vérifier avec `git status`).
- User-Agent générique (`syride-analyse-export/1.0`), sans nom, e-mail ni information personnelle.
- Python 3.14 (uv) : aucune contrainte de syntaxe héritée ; lancement par `uv run python` ou `make`.

---

## Lot 0 : vérifications avant d'écrire le code (maître d'œuvre, environ 15 min)

À faire avec **un ou deux appels réels**, le reste hors ligne. Consigner les résultats en annexe de ce brief.

1. **Conditions et quotas** : relire https://open-meteo.com/en/terms et https://open-meteo.com/en/pricing. Points à vérifier : usage non commercial gratuit, licence CC BY 4.0, quotas (de mémoire 600 appels par minute, 5 000 par heure et 10 000 par jour, un appel long ou très chargé en variables comptant pour plusieurs). Fixer en conséquence la cadence (`--weather-rate`) et le plafond par exécution (`--weather-max-calls`).
2. **Variables disponibles** sur `https://archive-api.open-meteo.com/v1/archive` : faire un appel sur un site connu et un jour d'été, avec `hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_100m,wind_direction_100m,temperature_2m,cloud_cover,boundary_layer_height,cape,precipitation`, `wind_speed_unit=kmh` et `timezone=auto`. Pour chaque variable absente ou entièrement à `null` (en particulier `boundary_layer_height` et `cape`), noter le repli : `models=era5` explicite, ou abandon de la variable avec une note.
3. **Altitude du modèle** : noter le champ `elevation` de la réponse. On en a besoin pour estimer le sommet de la couche limite au-dessus du niveau de la mer (voir lot B).
4. **Fuseau de l'heure de décollage** : sur 3 vols ayant un GPX local (un en France l'été, un en France l'hiver, un aux Canaries ou au Maroc), comparer la colonne `time` du pkl avec le premier horodatage du GPX, qui est en UTC. Conclusion attendue : `time` est l'heure **locale du site**. Si ce n'est pas le cas, le noter, car l'alignement de l'heure change.
5. **Délai de l'archive** : noter combien de jours manquent à la fin de l'archive (de mémoire, environ 5 jours).

---

## Lot A : récupération, cache et export (Python, Sonnet)

Fichiers : `src/web_export/weather.py` (nouveau), `src/export_web.py`, `src/web_export/meta.py`, `src/web_export/schema.json`, `src/publish.py` (contrôle de taille seulement), `src/web_export/tests/test_weather.py` (nouveau), `src/web_export/tests/fixtures/open_meteo_*.json` (nouveaux, synthétiques), `Makefile` (cible facultative `weather`).
**Ne pas toucher** au front, à `ROADMAP_WEBAPP.md` ni à `sites_coordinates.json`.

### A.1 Cache local `weather_cache.json` (racine du dépôt, ignoré par git)

- **Clé** : `"<lat arrondie à 3 décimales>,<lon à 3 décimales>|<AAAA-MM-JJ>"`. On indexe par coordonnées et non par id de site, car les id changent quand la liste des sites change. Si les coordonnées d'un site sont corrigées, l'ancienne entrée devient simplement orpheline.
- **Valeur** : la réponse utile déjà réduite. On garde `timezone`, `elevation`, et les tableaux horaires de 0 h à 23 h pour toutes les variables, **les 24 heures** (le découpage en fenêtre se fait à l'export). On ajoute `fetched_at` et `model` s'il est connu.
- **Ne jamais stocker** un jour incomplet : une réponse où toutes les heures de vent sont `null`, ou une date trop récente pour l'archive (voir lot 0, point 5). Ces jours sont simplement retentés à l'exécution suivante.
- Écriture **atomique** (fichier temporaire puis `os.replace`) **tous les 50 appels** et en fin d'exécution. Un Ctrl-C ne fait perdre au plus que 50 appels.
- Fichier versionné par une clé `cache_version: 1`. Si la version change, on repart de zéro, avec un message.

### A.2 Appels à l'API

- Un appel par couple (site, date) manquant, avec `start_date = end_date = date`. C'est l'appel le moins coûteux en quota. Si le lot 0 montre qu'un appel multi-dates par site reste bon marché, regrouper les dates **consécutives** d'un même site, et seulement celles-là.
- Cadence réglable par `--weather-rate` (appels par seconde, défaut prudent fixé au lot 0, par exemple 2). Plafond par exécution `--weather-max-calls` (défaut 3 000), pour ne jamais dépasser le quota journalier en une fois. Le premier remplissage peut donc demander deux exécutions, et c'est normal.
- Erreur 429 ou 5xx : on attend avec un délai croissant (backoff exponentiel), on fait au plus 3 essais, puis on **arrête proprement** l'étape météo (cache sauvegardé, avertissement). L'export continue sans les jours manquants.
- Pas de réseau (`URLError`) : avertissement, l'export continue avec le cache existant. **La météo ne fait jamais échouer un export.**
- Affichage de la progression : une ligne tous les 100 appels, puis un bilan (appels faits, jours en cache, jours manquants, jours ignorés car trop récents).

### A.3 Fichiers publiés `data/weather/<année>.<hash>.json`

Un fichier par année qui a au moins un vol avec météo. Format colonnaire et compact, dans l'esprit de `flights.json` :

```json
{
  "schema_version": 1,
  "year": 2025,
  "hours": [6, 22],
  "hourly_vars": ["wind10", "dir10", "gust10", "wind100", "dir100", "temp", "cloud", "blh"],
  "daily_vars": ["precip_mm", "cape_max"],
  "elevation": { "37": 412 },
  "days": {
    "37|2025-06-14": { "h": [[...17 valeurs...], ...8 tableaux...], "d": [0.4, 820] }
  }
}
```

- La fenêtre horaire va **de 6 h à 22 h inclus, soit 17 valeurs**, en heure locale du site. Elle couvre tous les décollages observés.
- La clé est `"<site_id>|<date>"`, où `site_id` est l'id de `sites.json` **du même export**.
- `elevation` est l'altitude du point de grille du modèle, par site, en mètres entiers.
- Arrondis : vents en km/h entiers, directions en degrés entiers, `temp` à 1 décimale, `cloud` en % entier, `blh` en mètres entiers (arrondis à 10 m), `precip_mm` à 1 décimale (cumul de 0 h à 24 h), `cape_max` en J/kg entier (maximum de 6 h à 22 h). Valeur inconnue : `null`.
- Une variable abandonnée au lot 0 disparaît de `hourly_vars` ou de `daily_vars` : le front lit ces listes et ne suppose aucun ordre fixe.
- **Budget** : au plus **300 Ko brut et 80 Ko gzip par fichier annuel**. Le bilan d'export affiche ces tailles. Si 2024 (l'année la plus chargée) dépasse ce budget, on réduit en priorité les heures publiées (de 7 h à 21 h), pas les variables.

### A.4 Intégration

- `export_web.py` :
  - option `--weather` en entier 0/1, comme les autres options, **avec 1 par défaut** ;
  - options `--weather-rate`, `--weather-max-calls` et `--weather-offline` (cache seul, aucun appel ; à utiliser en test et hors ligne) ;
  - l'étape météo se place **après** `build_sites`, car elle a besoin des id et des coordonnées.
- **Incrémental** : un fichier annuel n'est réécrit que si son contenu change (le hash le garantit déjà, comme pour les insights). Pour une publication ordinaire, ce sont seulement les quelques nouveaux couples (site, date) qui appellent l'API.
- `meta.json` : nouvelle clé `weather`, une liste `[{ "year": 2025, "file": "weather/2025.<hash>.json" }]`, triée par année. On ajoute `weather/*.json` à `PURGE_PATTERNS` et aux fichiers référencés.
- `schema.json` : `$defs/WeatherFile` et la propriété `weather` dans `MetaFile` (requise, éventuellement vide). Regénérer `web/src/data/schema.gen.ts` avec la commande habituelle. Ne pas monter `SchemaVersion` : l'ajout est rétrocompatible pour le front à condition qu'il tolère `weather` absent ; le noter dans le rapport.
- `publish.py` : le contrôle D12 ne change pas, car les fichiers météo ne contiennent aucune colonne par vol. On ajoute seulement les fichiers météo au bilan des tailles.
- `fixtures.py` : les fixtures synthétiques du front reçoivent un ou deux fichiers météo cohérents avec les vols fictifs, générés **sans réseau** (cache fictif).

### A.5 Tests (`test_weather.py`, sans réseau)

- Construction de la clé de cache (arrondis, format de date).
- Réduction d'une réponse Open-Meteo enregistrée vers l'entrée du cache, puis vers l'entrée publiée : fenêtre de 6 h à 22 h, arrondis, `null`, cumul de pluie, CAPE maximale.
- Jour incomplet ou trop récent : non stocké.
- Variable absente de la réponse : retirée de `hourly_vars` sans planter.
- Backoff sur 429 (client HTTP simulé), arrêt propre après 3 essais, cache sauvegardé.
- `--weather-offline` : aucun appel, export complet à partir du cache.
- Validation des fichiers produits contre `schema.json`.
- `meta.json` référence bien chaque fichier météo, et la purge supprime les orphelins.

Vérifier : `make test-py` au vert, et `uv run python src/export_web.py --weather-offline 1` sur les vraies données avec un cache vide (cela produit `weather: []` sans erreur).

---

## Lot B : affichage dans la fiche vol (front, Sonnet)

Fichiers : `web/src/data/load.ts` (+ tests), `web/src/lib/weather.ts` et `weather.test.ts` (nouveaux), `web/src/components/flight/FlightWeather.tsx` (nouveau), `web/src/components/flight/flight.css`, `web/src/pages/Flight.tsx`, `web/src/pages/About.tsx` et `web/src/components/about/Glossary.tsx`, les fixtures e2e `web/tests/fixtures/data/weather/`, `web/e2e/flight-weather.spec.ts` (nouveau).

### B.1 Chargement

- `loadWeather(year)` dans `load.ts`, sur le modèle de `loadInsights` : nom de fichier lu dans `meta.weather`, LRU de 3 années, `null` si l'année n'a pas de fichier ou en cas d'erreur réseau. **Ce n'est jamais bloquant pour la fiche** : la section affiche alors un état vide.
- Le fichier est chargé seulement à l'ouverture d'une fiche vol. Le tableau de bord et les autres pages ne chargent rien de plus.

### B.2 Logique pure (`lib/weather.ts`, testée)

- `weatherForFlight(file, siteId, date, time)` renvoie l'objet `{ hourly: Record<var, (number|null)[]>, daily, takeoffIndex, elevation }` ou `null`. `takeoffIndex` est l'heure **arrondie à l'heure la plus proche** (10 h 32 donne 11 h) et bornée à la fenêtre ; si l'heure est hors fenêtre, l'instantané l'indique.
- Libellé de direction sur 8 secteurs (N, NE, E…), à partir des degrés (direction **d'où vient** le vent, convention météo).
- `boundaryLayerTop = elevation + blh`, l'altitude du sommet de la couche limite estimée au-dessus du niveau de la mer, à l'heure du décollage **et** au maximum de l'après-midi. On la compare à `ceiling_m` du vol par l'écart en mètres. Ne rien comparer si l'une des valeurs manque.
- Niveaux de CAPE en texte, sobres : moins de 300 « faible », de 300 à 1 000 « modérée », plus de 1 000 « forte ».
- Tests unitaires : arrondi de l'heure, bornes, `null`, directions (0°, 359°, 22,5°), calcul du sommet de couche limite, variable absente.

### B.3 Composant `FlightWeather` (section « Météo du jour »)

Placé dans la colonne de gauche de `Flight.tsx`, **juste après `FlightFigures`**.

- **Instantané à l'heure du décollage** : une flèche orientée dans le sens du vent (SVG simple, avec `aria-label` « vent de sud-ouest »), « 18 km/h, rafales 31 km/h », le vent à 100 m, la température, la nébulosité en %. Puis une ligne pour la journée : cumul de pluie, CAPE maximale avec son niveau en texte.
- **Couche limite** : « Sommet de couche limite estimé : 1 600 m (plafond du vol : 1 450 m) ». Le libellé doit dire qu'il s'agit d'une estimation de modèle.
- **Bande horaire de 6 h à 22 h** : un graphique ECharts déjà présent dans le projet, avec les modules déjà importés (`bar` et `line`, à vérifier dans `theme/echarts.ts` ; n'importer **aucun** module ECharts non encore chargé, sinon le justifier avec la taille ajoutée). Il montre des barres de vent moyen à 10 m, une ligne ou des marqueurs de rafales, et l'heure du décollage repérée par une `markLine`. Directions en infobulle. Hauteur compacte (environ 140 px). Couleurs prises dans les tokens du thème, lisibles en clair et en sombre.
- **Mention sous la section**, en petit et en gris : « Valeurs de modèle (réanalyse, maille de 9 à 25 km), indicatives : le vent au décollage peut être très différent, surtout en relief ou en bord de mer. Données : Open-Meteo.com, CC BY 4.0. »
- **États** : pendant le chargement, un squelette de la hauteur finale (sans saut de mise en page). Sans données (vol trop récent, site sans coordonnées, année absente), une phrase seule : « Météo non disponible pour ce vol. » Pas de section vide.
- Style sobre, sans pictogramme météo illustré : flèche et chiffres. Pas de badge (§6).
- Mobile à 360 px : l'instantané passe sur deux lignes, la bande reste lisible et la page n'a pas de défilement horizontal.

### B.4 À propos et glossaire

- Page À propos, section « Sources » : Open-Meteo (archive, réanalyse ERA5 / Copernicus), licence CC BY 4.0 avec lien, et l'avertissement « indicatif ».
- Glossaire : « Couche limite (hauteur) » et « CAPE », une ou deux phrases chacun, sans jargon.

### B.5 Tests

- vitest : `lib/weather.ts` (B.2), `loadWeather` (année absente, erreur réseau, LRU), rendu de `FlightWeather` avec des données, sans données et avec une variable absente.
- e2e `flight-weather.spec.ts` sur les fixtures : la section s'affiche avec une valeur de vent, la bande contient l'heure du décollage, un vol sans météo affiche le message, aucune requête vers un domaine externe (on vérifie qu'aucune n'a lieu vers `open-meteo.com`). Le test e2e D12 existant doit rester vert.
- Vérifier : `cd web && npm run lint && npm run typecheck && npm test && npm run e2e`, le mode sombre, le mobile à 360 px, et la taille du chunk de la fiche vol avant et après (à indiquer dans le rapport).

---

## Lot C : remplissage réel et recette (maître d'œuvre, avec Adrien)

1. Premier remplissage du cache sur les vraies données, **en arrière-plan** : environ 3 554 appels, en une ou deux exécutions selon le plafond fixé au lot 0. On contrôle le bilan : nombre de jours en cache, jours manquants et raisons.
2. Contrôles par sondage sur 5 vols connus d'Adrien, dont un vol de paramoteur tôt le matin, un vol thermique d'été et un vol à l'étranger. Les valeurs doivent être plausibles, l'heure bien alignée et le sommet de couche limite comparé au plafond avoir du sens.
3. Tailles des fichiers annuels par rapport au budget (A.3), puis `make publish-dry` complet.
4. Mise à jour de `ROADMAP_WEBAPP.md` : case « Météo historique » de la phase 8 et une ligne sur le lot de statistiques météo à venir.

## Hors périmètre (lot ultérieur « statistiques météo »)

Il s'agit des répartitions des vols par force et direction du vent, par CAPE ou par écart entre plafond et couche limite, et des filtres météo dans la liste des vols. Ces analyses s'appuieront sur les fichiers `weather/<année>.json` produits ici, sans nouvel appel à l'API. On n'ajoute pour l'instant **aucune** colonne météo à `flights.json`.

## Rendu attendu de chaque agent

Un rapport court : fichiers créés ou modifiés, commandes de vérification et leur résultat, tailles mesurées, points d'attention ou décisions prises, et ce qui reste à faire par Adrien.

## Annexe : résultats du lot 0

_À remplir par le maître d'œuvre avant le lancement du lot A._
