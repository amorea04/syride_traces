# Brief lot A : reconnaissance (L'Éclaireur)

Plan de référence : `src/MIGRATION_SCRAPING.md` (§0 et acte I, scène 1). Lis-le d'abord.
Dépôt de travail : le worktree `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/.claude/worktrees/migration-fv`
(branche `scraping/migration-fv`). **Tu ne committes pas, tu ne changes pas de branche.**
Données réelles (lecture seule) : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/<pilote>/traces/<num>/`.

## Ce qu'on sait déjà (ne pas refaire)

- Liste : `GET https://www.syride.com/ajax/pilotes/activites.php?limit=N&l=fr&idRider=<id>&apli=0[&append=1&beforeId=<id_activite>]`.
  AdrienM = `idRider=20346`. `limit=1000` renvoie ses 504 vols.
- Chaque vol de la liste : `showFlightInPopup(<num>, <expires>, '<token>', false)`.
- Autorisation : `POST /ajax/vols/autoriser-affichage.php` (form : `idSession`, `expires`, `token`) → JSON `success`/`pilot`,
  ou 403 `{"success":false,"reason":"turnstile_required"}` + en-tête `X-Syride-Turnstile-Required: 1`.
- Fiche : `GET /ficheVol.php?l=fr&idSession=<num>&maxHeight=800` ; 403 sans autorisation. Contient `.fv-metric`, `dl.fv-info`,
  `<time datetime>`, `<script id="fv-config" type="application/json">` (clés : points, times, terrain, extrema, distance, offset,
  token, url3d…), liens `downloadFlightFile.php?idSession=…&type=igc|gpx|kml&expires=…&key=…`.
- Le vol 3766574 a été consulté le 21/11 (fiche servie en 200 malgré `turnstile_required`) ; 3761544 a reçu 403.

## Outils

Navigateur intégré (`mcp__Claude_Browser__*`) : `preview_start` avec une URL syride.com, puis `javascript_tool` pour exécuter
des `fetch` dans la page (même origine, cookies de la page). La session du navigateur intégré **n'est pas connectée** à Syride :
ne te connecte pas, ne saisis aucun identifiant. Pour les tests HTTP « sans navigateur », utilise `curl` (User-Agent générique,
aucune information personnelle).

## Règles strictes

- **Au plus 5 fiches** (`ficheVol.php` réussis) au total. Préfère les vols d'AdrienM.
- **Turnstile / Cloudflare : ne jamais tenter de le résoudre ni de le contourner.** S'il bloque, note-le et passe à la suite.
- Captures brutes (HTML réel) uniquement dans
  `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/_migration_captures/` (hors dépôt, ignoré par Git).
  Ne les recopie jamais telles quelles dans le dépôt.
- Aucun nom réel, coordonnée réelle, jeton ou clé dans les fichiers du dépôt.

## Questions à trancher (rapporte une réponse par question, avec la preuve : code HTTP, extrait court)

1. `activites.php` : plafond réel de `limit` (essaie 5000 sur le pilote qui a le plus de dossiers sur disque ; compte les
   dossiers avec `ls`) ; `beforeId` = `id_activite` (nombre de `activite<n>`) ou numéro de vol ? Vols non Syride présents ?
   (Rappel : sur disque, `is_syride=false` existe, 31 vols au total.)
2. Où lire `idRider` dans la page d'un pilote ? Teste 3 pilotes (AdrienM, j2f, yanis). Donne une regex robuste.
3. `curl` sans cookies sur `activites.php` et sur `/fr/pilotes/AdrienM` : code HTTP et contenu (liste lisible ou défi Cloudflare ?).
4. Durée de vie de `expires` dans la liste (écart avec l'heure actuelle) et dans les liens de téléchargement.
5. Autorisation : rejoue-la pour 2 vols. Réponse obtenue ? Si `success`, `ficheVol.php` passe-t-il en 200 ? L'autorisation
   d'un vol ouvre-t-elle un autre vol ? Le refetch de 3766574 marche-t-il toujours ?
6. `fv-config` : signification de la 7e colonne de `points` (compare à vario col. 5 : lissage ?), unité de la vitesse (col. 4),
   rôle de `offset`, format de `extrema` (liste complète des `icon`), `terrain` : `[t, altitude_sol]` ? Sur une **ancienne**
   fiche (2022, AdrienM) : `fv-config` présent ? Sur un vol non Syride ?
7. La fiche sans connexion contient-elle les liens de téléchargement ? (observé : oui pour 3766574.)
8. Taille d'une fiche : brute et `gzip -9` (sur chaque fiche capturée).

## Livrables (dans le worktree)

1. `src/migration/SYRIDE_API.md` : contrat des endpoints (URL, paramètres, réponses, codes d'erreur, durées de vie), réponses
   aux 8 questions, exemples **anonymisés et courts**.
2. `src/migration/anonymize_fixture.py` (Python 3.8, sans dépendance nouvelle ; bs4 autorisé) :
   `python src/migration/anonymize_fixture.py <entrée.html> <sortie.html> --kind list|sheet [--max-points 200] [--max-flights 5]`.
   Remplace : pseudo/noms de pilote → `PiloteTest`, noms de site → `SiteTest<n>`, coordonnées décalées d'un vecteur aléatoire non enregistré
   partout (points, distance, extrema, liens, cartes), jetons/clés/hash → `x` de même longueur,
   identifiants de rider → `99999`, avatars/photos → chemins neutres ; tronque `points`/`times`/`terrain` ; supprime scripts
   de suivi (Google, Facebook). Doit garder la structure HTML que les parsers lisent.
3. `src/scraping_tests/fixtures/` : `activites_sample.html` (5 vols, dont 1 non Syride si trouvable), `sheet_recent.html`,
   `sheet_old.html` (si une ancienne fiche a été obtenue), générés par le script. Vérifie à la main (grep) qu'aucun nom réel
   (AdrienM, Daytona est OK car c'est un modèle de voile, mais pas les noms de sites réels), aucune coordonnée réelle
   ni aucun jeton ne subsiste.

## Compte rendu final (ton dernier message)

Réponses courtes aux 8 questions, liste des fichiers créés, nombre de fiches consommées, et tout point bloquant.
