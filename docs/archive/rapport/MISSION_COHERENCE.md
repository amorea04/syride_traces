# Mission : cohérence des chiffres du rapport (relecture du 14 novembre, AdrienM 2026)

Lis d'abord `src/rapport/outils/BRIEF_COMMUN.md` (contraintes, vérifications, compte rendu). Ne touche pas à `ameliorations_rapport.md` ni à `uniformisation.json`.

Une relecture a trouvé des contradictions entre chiffres. Corrige-les dans le code (`report_data.py`, `report_html.py`, `report_charts.py`, `report.js`, `report_textes.md`), pas dans le HTML généré.

## A. Décision du pilote : comparer l'année en cours aux années précédentes ENTIÈRES

Aujourd'hui, quand l'année du rapport est en cours, les années comparées sont coupées « à la même date » (14 novembre) pour les chiffres clés et le tableau de comparaison, mais restent entières dans les graphiques (mois, jours, heures, cumul) et dans les records. Résultat : 2025 vaut 110 vols / 65 h 44 dans le tableau et 120 vols / 73 h 20 dans les graphiques ; en paramoteur, le record annonce « 3,2 g en 2024 » alors que le tableau donne 2,2 g pour 2024.

À faire :
1. `compute_report` (report_data.py, vers la ligne 680) : `kpi_equiv` des années comparées calculé sur l'année entière (`cutoff` seulement pour l'année du rapport). L'année du rapport reste arrêtée à aujourd'hui.
2. Phrase d'avance / retard (F20, `compute_gap` ou équivalent vers la ligne 831, et textes associés) : elle compare désormais au **total de l'année précédente entière**. Formulations à prévoir dans `report_textes.md`, par exemple « Tu as déjà dépassé ton total de 2025 : 10 h de plus, avec 19 vols de plus. » / « Il te manque 24 h pour atteindre ton total de 2025 ; il reste 7 semaines. » (garde le ton et le système de variantes existants, et la mention « il reste N semaines » seulement si l'année est en cours).
3. Courbe de cumul : l'annotation d'écart (« +18 h » au trait « aujourd'hui ») doit devenir l'écart avec le total de l'année de référence, c'est-à-dire la différence exacte entre les étiquettes de fin de courbe affichées (83,5 − 73,3 = +10,2 → « +10 h »). Formule-la sans ambiguïté (ex. « +10 h sur 2025 entière »). Le réticule interactif (T27, valeurs à la date survolée) peut rester tel quel.
4. Supprime ou réécris **tous** les textes qui annoncent une comparaison « à la même date » : intro de l'Aperçu (« à la même date : 14 novembre »), `title` des pastilles (« Par rapport à 2025 à la même date »), note sous le tableau de comparaison (« toutes les années sont comparées à la même date »), « Données et limites » (« pour l'année en cours, elles sont arrêtées à la même date »). Cherche `même date` dans tous les fichiers. Nouveau sens à dire clairement : « 2026 n'est pas terminée : elle est comparée aux années précédentes entières. »
5. Vérifie qu'après correction, pour AdrienM 2026 avec 2025 comparé : tableau = 110 → 120 vols, 73 h 20 min ; les records (« Ton record : … en 2024 ») ne contredisent plus le tableau ; les pastilles des chiffres clés sont recalculées.

## B. Corrections sans arbitrage

6. **Régularité** : le portrait dit « un vol dans 72 % des semaines » mais la tuile « Régularité » affiche 34 / 46 semaines (74 %). `_persona_metrics` (report_data.py ≈ l. 925) compte des tranches de 7 jours depuis le 1er janvier ; `compute_rhythm` (≈ l. 455-465) compte des semaines lundi-dimanche. Une seule définition : celle de `compute_rhythm` (idéalement réutiliser son résultat ou une fonction commune). Seuil `REGULAR_WEEKS` inchangé.
7. **Carte, « 4 zones »** (report_html.py ≈ l. 1477) : le titre de la vue d'ensemble compte une zone d'un seul site (Monedieres-Fournaise) qui n'a ni bouton ni halo. Ne compter que les zones affichées ; les sites isolés peuvent être mentionnés à part (« 3 zones et 1 site isolé · 31 sites »). Même correction dans l'`aria-label` de la carte.
8. **Coquille** : « Facteur G maximal » (records) → « Facteur g maximal », comme partout ailleurs.
9. **« Un vol sur trois au treuil (29 %) »** (`modes_block`, report_html.py ≈ l. 961) : la fraction est choisie en arrondissant 1/part. Choisir le n dont 1/n est le plus proche de la part (29 % → « un sur quatre »), ou préfixer « près d'un » quand l'écart dépasse quelques points. Reste simple.
10. **« Mois le plus actif »** : la phrase dit septembre (en vols) ; en mode « Heures », l'infobulle du graphique « Activité par mois » marque avril « Mois le plus actif ». En mode heures, libellé distinct (ex. « Mois le plus long en heures »).
11. **Arrondis du JSON des vols** (`#flights-data`, champ `mn` entier, report_html.py ≈ l. 1856) : les parties dessinées en JS affichent 83 h 29 au lieu de 83 h 28, daytona 16 h 16 au lieu de 16 h 15. Stocke la durée avec une décimale (ou en secondes) et vérifie que les consommateurs JS (fiche du jour, fiche de site, ruban des voiles, filtres, mini-courbes, nuage) formatent correctement. Surcoût de poids minime.

## Vérifications

- `python3 src/rapport/outils/check_reports.py` doit finir par `OK` ; puis `python3 src/rapport/outils/all_reports.py 2025 2026` sans erreur ni rapport > 1 Mo.
- Contrôle des textes sans navigateur : `python3 src/rapport/outils/dump_text.py src/rapport/outils/out/all/AdrienM_2026.html <fichier de sortie>` extrait le texte de chaque variante (marqueurs `[V disc=… cmp=…]`). Vérifie chaque point ci-dessus sur AdrienM 2026, et un rapport d'année terminée (AdrienM 2025) pour t'assurer que rien n'a régressé.
- Contrôle navigateur facultatif (économie) : si tu le fais, uniquement la console sur AdrienM_2026.
- Cas limite : un pilote sans année précédente (le bloc d'avance/retard et la comparaison doivent disparaître proprement).

Compte rendu : comme demandé dans BRIEF_COMMUN, point par point (numéros 1 à 11 ci-dessus), avec avant / après chiffrés pour AdrienM 2026.
