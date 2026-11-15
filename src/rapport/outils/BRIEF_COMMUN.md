# Consignes communes : amélioration du rapport HTML « Ton année de vol »

## Contexte
- Dossier : `/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/src/rapport/`
- Chaîne : `report_data.py` (calculs, dictionnaires) → `report_charts.py` (SVG en Python) → `report_html.py` (assemblage, classe `ReportBuilder`) ; `report.css` et `report.js` sont copiés dans le HTML ; textes éditables dans `report_textes.md` (sections `## nom`, repères `{{nom}}`, conditionnels `{{?nom}}…{{/nom}}`) ; formatage français dans `report_format.py`.
- Feuille de route complète : `ameliorations_rapport.md` (même dossier). Lis les sections citées dans ta mission. **Ne modifie pas ce fichier** : le coordinateur cochera les tâches.
- Variantes : chaque bloc est pré-rendu par discipline (`by_disc`) ou par discipline × années comparées (`by_disc_cmp`, 12 variantes). Règle : **aucun nouveau bloc en `by_disc_cmp`** ; préfère `by_disc` (3 variantes) ou un rendu JS depuis des données JSON.
- Le dossier `rapport/` n'est pas suivi par git. Ne fais aucune opération git.
- D'autres agents ont travaillé ou travailleront après toi sur les mêmes fichiers, l'un après l'autre : relis l'état actuel des fichiers avant de modifier, ne réécris pas ce qui ne relève pas de ta mission, et garde le code lisible pour le suivant.

## Goûts du pilote (retours récents)
- Il a fait **retirer les badges** (médailles, confettis) et la **scène de ciel** du hero (nuages, voile animée), jugés « trop artisanaux ». Ne les réintroduis pas, sous aucune forme.
- Style attendu : **professionnel, moderne, ludique et pédagogique**. Pas de décor inutiles ; pictogrammes au trait fin cohérents avec ceux qui existent (`STORY_ICONS`, `ICONS`).

## Contraintes non négociables
1. **Autonomie totale** : un seul fichier HTML, aucune requête réseau (pas de CDN, police web, image distante, `fetch`, `<link>`, `@import`). Les liens `href` vers syride.com sont permis. Icônes en SVG inline, données en `<script type="application/json">`.
2. **Zéro dépendance** : JavaScript natif, Python standard + numpy/pandas déjà utilisés.
3. **Python 3.8** (environnement `python3` = anaconda 3.8.16) : pas de `match`, pas de `list[str]`/`X | Y` évalués à l'exécution, pas de `str.removeprefix`.
4. **Thèmes clair et sombre** : toute nouvelle couleur passe par une variable CSS définie dans `:root` ET `html[data-theme="dark"]` (et le bloc `@media print` si pertinent). Respecter le code couleur : orange `--p` = parapente, cyan `--m` = paramoteur (échangés le 14 novembre à la demande du pilote), `--y0/--y1/--y2` = années, vert/rouge = volume en hausse/baisse, bleu `--accent` = interface. Une couleur « or » pour nouveautés/records/badges sera ajoutée (`--gold`) : réutilise-la si elle existe déjà, sinon crée-la (clair `#d97706`, sombre `#fbbf24`).
5. **Accessibilité** : contrastes AA (texte 4,5:1), information jamais portée par la seule couleur, navigation clavier, `prefers-reduced-motion` coupe toute animation, panneaux avec Échap et retour du focus.
6. **Sans JavaScript**, le contenu existant reste lisible (les nouveautés interactives peuvent disparaître).
7. **Téléphone (375 px)** : aucun défilement horizontal de la page, zones tactiles ≥ 44 px.
8. **Impression** : les nouveaux éléments ne se coupent pas (`break-inside: avoid`), les panneaux interactifs sont masqués.
9. **Textes** : en français, tutoiement, sans jargon ; nouvelles phrases dans `report_textes.md` ; seuils dans des constantes nommées en tête de module.
10. **Honnêteté des données** : une mesure absente pour une partie des vols est signalée ; pas d'équivalence ou de badge fondé sur une mesure trop lacunaire.

## Vérification obligatoire avant de rendre la main
1. `python3 src/rapport/outils/check_reports.py` : régénère AdrienM, j2f, LiLi06 dans `outils/out/`, affiche poids par section, contrôle l'autonomie et la syntaxe JS (doit finir par `OK`). Le contrôle inclut Au_Phil_du_vent, le rapport le plus lourd (980 ko au 14 novembre, après T30 et T36). Budget 1 Mo par rapport : marge d'environ 20 ko à partager entre toutes les tâches à venir : sois économe (by_disc plutôt que by_disc_cmp, symboles SVG réutilisés, rendu JS depuis #flights-data quand c'est possible). Le JS embarqué est désindenté au build : ni gabarit `...` ni chaîne multiligne dans report.js.
2. Contrôle visuel si les outils de navigateur sont disponibles : servir le dossier `outils/out/` avec `python3 -m http.server 8765 --bind 127.0.0.1` (en arrière-plan, à arrêter à la fin), ouvrir `http://127.0.0.1:8765/AdrienM_2026.html`, vérifier en clair, en sombre (bouton ◐) et en 375 px, et lire la console. L'émulation de taille du navigateur n'est pas fiable : pour la largeur téléphone, ouvre `http://127.0.0.1:8765/phone.html?f=AdrienM_2026.html` (iframe de 375 px, même origine, inspectable via `frames[0].document` ; `check_reports.py` ne l'efface pas) (aucune erreur). Si tu n'as pas de navigateur, vérifie au moins le HTML produit et dis-le.
3. Teste aussi un cas limite si ta mission en crée (pilote sans année précédente, une seule discipline, mesure absente) : les pilotes du pkl et leurs années se trouvent avec `pickle.load(open(params.pkl_path,'rb'))` (`import params_scrap_syride as params` depuis `src/`).

## Compte rendu attendu (ton dernier message)
- Ce qui est fait, tâche par tâche (identifiants T…), et ce qui ne l'est pas ou seulement en partie, avec la raison.
- Fichiers modifiés et principales fonctions ajoutées.
- Résultat de `check_reports.py` (poids des 3 rapports) et de la vérification visuelle.
- Points d'attention pour l'agent suivant.
Sois factuel : ne déclare pas fait ce que tu n'as pas vérifié.

## Outils (src/rapport/outils/)
- `check_reports.py [pilote ...]` : contrôle rapide (4 pilotes de référence par défaut).
- `all_reports.py [année ...]` : génère les rapports de tous les pilotes pour 2025 et 2026 (par défaut) dans `out/all/` ; doit finir sans erreur et sans rapport > 1 Mo. Les anciens fichiers de `out/all/` ne sont pas effacés : ne regarde que ceux des années demandées.
- `out/phone.html?f=<rapport>.html` : vue téléphone 375 px (iframe).
