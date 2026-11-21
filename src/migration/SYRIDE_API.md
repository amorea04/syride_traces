# Contrat des endpoints Syride (reconnaissance du 21/11/2026)

Rédigé par l'Éclaireur (lot A). Tout ce qui suit a été **observé** le 21/11/2026 ; Syride peut changer sans préavis
(d'où les tests sur fixtures, voir `src/scraping_tests/fixtures/`). Les exemples sont anonymisés : pseudos, sites,
coordonnées, jetons et clés sont fictifs.

Bilan de la reconnaissance : 4 requêtes `ficheVol.php` réussies (200) pour 3 vols distincts (budget : 5), aucune
connexion, aucun défi Turnstile/Cloudflare résolu ni contourné.

## 1. Vue d'ensemble

| Ressource | Méthode | Cookies requis | Remarque |
|---|---|---|---|
| `/fr/pilotes/<pseudo>` | GET | non | 200 sans cookie ; contient l'`idRider` |
| `/ajax/pilotes/activites.php` | GET | non | **403 sans en-tête `Referer`** ; 200 avec `Referer` seul |
| `/ajax/vols/autoriser-affichage.php` | POST | session (`instruments2`) | accorde l'accès à **une** fiche, pour la session |
| `/ficheVol.php` | GET | session (`instruments2`) | 403 tant que le vol n'est pas autorisé dans la session |
| `/scripts/downloadFlightFile.php` | GET | non vérifié | liens de la fiche, valables 300 s |

Aucune protection Cloudflare n'a été rencontrée sur ces requêtes (réponses `Server: Apache`, pas d'en-tête `cf-*`).
Le seul défi observé est le Turnstile annoncé par `autoriser-affichage.php` (section 4).

## 2. Liste : `GET /ajax/pilotes/activites.php`

```
/ajax/pilotes/activites.php?limit=<N>&l=fr&idRider=<id>&apli=0[&append=1&beforeId=<id_activite>]
```

- **Référent obligatoire** : sans `Referer`, Apache répond `403 Forbidden` (page HTML de 239 octets). Avec
  `Referer: https://www.syride.com/fr/pilotes/<pseudo>`, 200, **sans aucun cookie**. Le cookie seul et
  `X-Requested-With` seul ne suffisent pas.
- Réponse : fragment HTML (pas de JSON), même structure que la page du pilote : un bloc
  `<div id='activite<id_activite>' class="boxno">` par activité.
- **Plafond de `limit`** : aucun plafond constaté. Pilote de 1 477 activités (1 474 vols), `limit=1000` renvoie 1 000
  blocs, `limit=5000` et `limit=100000` renvoient les 1 477 (2,9 Mo, 7 à 13 s). `limit=0` renvoie 1 bloc.
  Un pilote de 504 vols : 1,35 Mo (87 Ko compressé), ~6 s.
- **Tri** : par `id_activite` **décroissant** (ordre de publication, vérifié strictement décroissant sur 3 listes).
  Les numéros de vol (`type<num>`) ne suivent pas cet ordre (vols importés en retard). Ce n'est donc pas un tri par date de vol.
- **Pagination** (`append=1&beforeId=<X>`) : `beforeId` est un **`id_activite`** (le nombre de `activite<n>`), pas un
  numéro de vol. Il renvoie les activités d'`id_activite` **strictement inférieur** à `X`. Le défilement de la page prend
  le dernier `activite<n>` affiché. Fin de liste : corps `<!-- syride-no-more-activity -->` (37 octets).
  `append=1` n'est pas nécessaire pour que `beforeId` filtre.
- Types de blocs rencontrés :
  - **vol Syride** : contient `.photoGps`, `type<num>`, `site<num>`, `nom<num>`, `voile<num>` et
    `onclick="showFlightInPopup(<num>, <expires>, '<token>', false)"`.
  - **vol non Syride** (saisi à la main, sans instrument) : image `.photoNoSys`, `type<num>`, `site<num>` en texte brut
    (`<font id="site<num>">`), **pas de `showFlightInPopup`, pas de jeton, pas de fiche, pas de fichiers**.
    Présents dans la liste (56 sur 531 pour un pilote qui en compte beaucoup).
  - **activités qui ne sont pas des vols** (photos publiées, messages) : pas de `type<num>` ; le parser actuel les ignore
    (`Ceci n'est pas un vol`). Ex. : 3 sur 1 477.
- Champs lisibles dans un bloc de vol : date de publication (`dateActivite`), type de vol, site (lien `/fr/sites/<slug>`
  et région), **nom du vol**, date/heure du vol, temps de vol, voile (modèle, marque), distance, altitude max,
  instrument, compagnons de vol (`syc-companion`, noms d'autres pilotes), nombre de commentaires.

Exemple (anonymisé, voir `activites_sample.html`) :

```html
<div id='activite4048184' class="boxno" ...>
  <div id="photoGpsDiv" onclick="showFlightInPopup(3766574, 1795263521, 'xxxx…64 car.…xxxx', false);">
    <img id="flightThumb_3766574" class="photoGps" src="/flightThumbs/3766/3766574.jpg">
  </div>
  <div id="type3766574">Vol moteur</div>
  <div id='site3766574'> à <a href='/fr/sites/SiteTest1'>SiteTest1</a> …
  <ul>Nom du vol : <font id='nom3766574'>07-11-2026</font></ul> …
```

Écart liste/disque observé : sur un pilote, la liste compte 1 474 vols pour 1 473 dossiers ; 2 vols de la liste
sont absents du disque, 1 dossier du disque n'est plus dans la liste (vol supprimé ou réimporté sur Syride).

## 3. `idRider` : où le lire (Q2)

Testé sur 5 pilotes (dont un pseudo avec espaces : l'URL `/fr/pilotes/<pseudo%20avec%20espaces>` marche).
La page contient l'identifiant plusieurs fois (8 occurrences) :

```html
<input type=hidden name=idRider value=<id> />
var ajaxUrl = '/ajax/pilotes/activites.php?limit='+activityRequestLimit+'&l=fr&idRider=<id>&apli=0';
```

Expression robuste (testée sur les 5 pages) :

```python
re.search(r"name=[\"']?idRider[\"']?\s+value=[\"']?(\d+)", html) \
    or re.search(r"activites\.php[^\n]*?[?&]idRider=(\d+)", html)   # l'URL est coupée par des quotes JS
```

La page du pilote (`/fr/pilotes/<pseudo>`) répond 200 **sans cookie** (147 Ko), mais ne contient que les 10 premières
activités (`activitePageLimit = 10`).

## 4. Autorisation : `POST /ajax/vols/autoriser-affichage.php`

Formulaire `application/x-www-form-urlencoded` : `idSession=<num>`, `expires=<ts>`, `token=<64 hex>` (les deux derniers
viennent de `showFlightInPopup` dans la liste).

**Observé (4 vols essayés, session non connectée) : la réponse est toujours**

```
HTTP 403   X-Syride-Turnstile-Required: 1   Content-Type: application/json
{"success":false,"reason":"turnstile_required"}
```

Jamais `success:true`. **Mais l'accès à la fiche est quand même accordé** : voir section 5.

Une tentative de sondage avec jeton falsifié / `expires` périmé / méthode GET n'a **pas** été faite (refusée par le
contrôle de sécurité de la session) : le comportement avec un jeton invalide reste inconnu.

## 5. Fiche : `GET /ficheVol.php?l=fr&idSession=<num>&maxHeight=800`

- Sans accès accordé dans la session : `403`, corps `<!doctype html><html><body><p>Forbidden</p></body></html>`,
  en-têtes `X-Syride-Flight-Access: missing` et `X-Syride-Flight-Access-Required: 1`. **Un 403 ne consomme pas de fiche.**
- Avec accès : `200`, en-tête `X-Syride-Flight-Access: valid`, `Cache-Control: no-store`.
- L'accès est lié à la **session PHP** (cookie `instruments2`) : une requête `curl` sans cookie sur le vol 3766574
  (pourtant accordé dans le navigateur) répond 403 `missing`.

**Réponse aux questions 5 et « pourquoi 200 malgré `turnstile_required` »** (preuve, vol 1941511) :
`GET ficheVol` → 403 `missing` ; `POST autoriser-affichage` → 403 `turnstile_required` ; `GET ficheVol` → **200** `valid`.
Idem pour 3766574 et 3761544 (autorisation 403 puis fiche 200). Donc :

1. l'autorisation enregistre l'accès **même quand elle répond `turnstile_required`** (le Turnstile est annoncé mais
   n'a pas bloqué l'accès dans nos essais) ; c'est le POST, pas la liste, qui ouvre la fiche ;
2. l'accès est **par vol** : après autorisation de 3766574 et 3761544, le vol 1941511 restait en 403 jusqu'à sa propre
   autorisation ;
3. il persiste au moins plusieurs minutes dans la session (refetch de 3766574 : 200, ~4 min plus tard) ;
4. c'est probablement ce qui s'est passé le 21/11 pour 3766574 (200) et 3761544 (403 avant sa propre autorisation).

Ce comportement est **non documenté et peut cesser** (Syride peut rendre le Turnstile bloquant). Le code de production
ne doit pas en dépendre aveuglément : après un POST `turnstile_required`, tenter la fiche ; si 403 `missing`, passer au
repli « navigation vers la page du vol, l'humain valide le défi ».

### Contenu de la fiche (récente ou de 2022 : même structure)

- `<time datetime="2026-11-07T11:12">` : date et heure **locales** du décollage.
- `.fv-metrics` > `.fv-metric` : `Distance`, `Temps de vol` (« 1 h 6 min »), `Plafond`, `Vario max`, `Vario min.`
  (classe `fv-metric-vario-min`, présent aussi sur la fiche de 2022).
- `dl.fv-info` : `Décollage` (site + « (pays / région) »), `Voile`, `Instrument`, `Distance cumulée`, `Vitesse moyenne`,
  `Gain`, `Vitesse max`, `G max`. **« Gain » est affiché** et vaut plafond − altitude du premier point
  (570 m = 629 − 59 ; 483 m = 615 − 132). Le parser actuel (`gain` calculé = 41/44 sur les fixtures) est périmé.
- Liens de téléchargement (section « Télécharger ») : `/scripts/downloadFlightFile.php?idSession=<num>&type=igc|gpx|kml&expires=<ts>&key=<64 hex>`
  (préfixe `/scripts/`). **Présents sans connexion** (Q7 : oui, sur les 2 fiches).
- `<script type="application/json" id="fv-config">` (section 6).
- Pas de `.volTexte` (ancien format) sur les fiches de 2022 : le nouveau gabarit est servi pour tous les vols.

Tailles (Q8) : fiche de 2026 (66 min de vol) **346 970 octets**, gzip **60 051** (17 %) ; fiche de 2022 (22 min)
**169 332** octets, gzip **34 140** (20 %). Mesures par `CompressionStream` du navigateur (niveau par défaut, équivalent
à `gzip -6` ; `gzip -9` gagnerait 1 à 2 %). Le bloc `fv-config` fait 289 Ko des 347 Ko. Projection : ~35 à 60 Ko par fiche
compressée, soit **0,35 à 0,6 Go pour 10 000 vols**, sous le seuil de 1 Go.

## 6. `fv-config`

Clés (21) : `id`, `activity` (`id_activite`), `lang`, `token` (40 ou 64 hex selon l'ancienneté), `pilot`, `avatar`,
`flightUrl`, `explorer`, `siteExists`, `points`, `times`, `distance`, `terrain`, `text` (libellés), `extrema`, `sitesUrl`,
`noInfo`, `offset`, `units`, `url3d`, `start3d`. Les types varient (`id` chaîne sur une fiche, entier sur l'autre).

| Champ | Contenu |
|---|---|
| `points` | une ligne par seconde : `[lat, lon, alt_m, vitesse_kmh, vario_ms, g, vario_lissé_ms]` (7 colonnes) |
| `times` | horodatages Unix (UTC), 1 par point (pas de 1 s), même longueur que `points` |
| `terrain` | `[t_unix, altitude_du_sol_m]` ; pas de 1 s sur 1 323 points, **pas de 2 s sur 3 971 points** (≈1 900 entrées : le pas augmente pour plafonner le tableau à ~2 000 entrées) |
| `distance` | 5 points `[lat, lon]` : la distance retenue (polygone de la « Distance ») |
| `extrema` | liste de 4 objets `{icon, label, position:[lat,lon], time}` |
| `offset` | décalage de l'heure locale en secondes (3 600 observé en novembre et décembre ; `times[0]` + `offset` = `<time>`) |
| `units` | `["m","km/h"]` |
| `url3d` | `/ion/ion_vol.php?idSession=…&l=fr&unit=m&expires=<ts>&key=<hex>&beta3d=1` (jeton à `expires` +300 s) |

- **Colonne 4 (vitesse)** : en **km/h** (`units[1]`) ; max de la colonne = 61 = « Vitesse max : 61 km/h ».
- **Colonne 5 (vario)** : m/s, 1 décimale ; min/max = extrema « Vario min./max ».
- **Colonne 6** : facteur de charge g (0,9 à 1,4).
- **Colonne 7** : vario **lissé** (m/s, 2 décimales) ; corrélation 0,9993 avec la colonne 5, étendue proche (−3,46 / 2,54
  contre −3,5 / 2,5).
- **Altitude** : colonne 3, `plafond` = max de la colonne (629, 615 : égal à la métrique « Plafond »).
- **`extrema`, liste complète des `icon`** : `speed` (« Vitesse max : 61 km/h »), `up` (« Vario max : 2.5 m/s »),
  `down` (« Vario min. : -3.5 m/s »), `g` (« G max : 1.4 g »). Le libellé contient la valeur en texte ; `time` est Unix UTC ;
  `position` est le point correspondant.
- **Ancienne fiche (2022) : `fv-config` présent**, même schéma (1 323 points × 7, 1 Hz).
- **Vol non Syride** : aucune fiche, aucun jeton dans la liste, donc pas de `fv-config` ni de fichiers.

La trace de `fv-config` est à 1 Hz : 3 971 points pour 66 min, contre 2 331 dans le GPX du même vol.

## 7. Durées de vie (Q4)

| Élément | Durée | Preuve |
|---|---|---|
| `expires` dans `showFlightInPopup` (liste) | **~30 min** (1 794 s mesurés), identique pour tous les vols d'une même réponse | `expires` − heure de la requête |
| `expires` des liens `downloadFlightFile.php` et de `url3d` | **300 s** exactement | `expires` − heure de la requête de la fiche |
| Accès à la fiche accordé par le POST | au moins ~4 min, lié à la session PHP et au vol | refetch d'un vol autorisé |

## 8. Pour les lots suivants (décisions de la porte I)

- **Transport de la liste** : HTTP simple possible (aucun cookie), à condition d'envoyer `Referer`. `HttpTransport`
  est donc viable pour `activites.php` et pour la page du pilote (`idRider`) ; `--dry-run` peut inclure la phase 1 (A8).
- **Fiche** : le navigateur reste nécessaire (session PHP liée à l'accès ; un `curl` sans cookie est refusé).
  Sur 403 `turnstile_required`, ne rien contourner : tenter la fiche, puis repli humain.
- **Réconciliation** : un bloc sans `showFlightInPopup` (non Syride) n'a pas de jeton ; ne pas le traiter comme une erreur.
- `limit=5000` suffit pour tous les pilotes connus (le plus gros : 1 477 activités) ; garder la pagination `beforeId`
  (par `id_activite`) en secours.

## 9. Fixtures

`src/scraping_tests/fixtures/` (générées par `src/migration/anonymize_fixture.py`) :

- `activites_sample.html` : 5 vols (4 vols Syride + 1 non Syride), vraie structure de `activites.php`.
- `sheet_recent.html`, `sheet_old.html` : fiches 2026 et 2022. **Limite** : ces deux fiches ne sont pas des copies
  intégrales. Leur gabarit HTML (en-tête, métriques, `dl.fv-info`, liens, `fv-config` sans `text`) reprend la structure
  réelle mais est **abrégé** (CSS, scripts, panneaux Profil/Compagnons/Commentaires retirés), et la **trace est
  synthétique** (400 points aléatoires 1 Hz, 7 colonnes, terrain à 1 s ou 2 s), les métriques, extrema et `distance`
  sont les valeurs réelles. Raison : le navigateur intégré ne peut pas écrire sur disque et le transfert d'une fiche
  complète était trop lourd.


## Règle de l'Architecte (21/11/2026)

Le constat « l'accès est enregistré malgré `turnstile_required` » est un défaut du contrôle de Syride.
**Le code de production ne doit jamais s'en servir** : après une réponse `turnstile_required`, on ne tente pas
`ficheVol.php` ; on passe par la page du vol dans Chrome, où le widget Turnstile de Syride s'exécute normalement et où
l'humain le valide si besoin (voir `MIGRATION_SCRAPING.md`, scène 9).
