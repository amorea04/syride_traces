# Mission T36 : mode récap en pages + image de partage (L2, I8)

Lis d'abord `src/rapport/outils/BRIEF_COMMUN.md` (contraintes, vérifications, compte rendu), puis dans `src/rapport/ameliorations_rapport.md` : §5.2 **L2**, §5.1 **I8** (seulement la partie « image de partage » ; CSV et « Copier mon résumé » relèvent de T24, hors mission), §10 décision 7. Ne modifie pas `ameliorations_rapport.md`.

T30 (« Rejouer l'année ») vient d'être fait par un autre agent : relis son module dans `report.js` (panneau plein écran, bouton dans le hero) et **réutilise ses conventions et ses fonctions** (ouverture / fermeture du panneau, piège du focus, styles de base) plutôt que d'en écrire de nouvelles. Si un utilitaire commun à factoriser apparaît, fais-le proprement sans changer le comportement du rejeu.

## Décision 7 tranchée : vrai mode plein écran
Lancé depuis le hero (bouton « Ton récap », à côté de « Rejouer », `js-only`). Sans JS : rien (le rapport détaillé suffit). Masqué à l'impression.

## Pages (une par écran, à faire défiler)
Pour la discipline courante `state.disc`. Une page dont la donnée manque est **omise** (pas de page vide) :
1. **Couverture** : « Ton année de vol 2026 », pilote, discipline ; si l'année est en cours, « au 14 novembre ».
2. **Chiffre phare** : heures de vol (très gros), vols, jours de vol ; écart avec l'année précédente entière s'il existe (même sens et même texte que la phrase du hero, `year_gap` dans report_data.py : réutilise le résultat, n'en recalcule pas un autre).
3. **Mois star** : mois le plus actif (en vols, avec ses heures) + mini-barres des 12 mois (barres CSS ou petit SVG généré en JS, pas de pré-rendu).
4. **Meilleure journée** : date, vols, durée cumulée, sites.
5. **Site préféré** : nom, vols, part de l'année ; nombre de sites, nombre de nouveaux sites.
6. **Voile** : voile la plus utilisée, heures (si au moins une voile renseignée).
7. **Record** : vol le plus long (durée, date, site) ; plafond max seulement si la mesure couvre assez de vols (respecte le seuil de couverture existant utilisé par les équivalences T09 / la pastille « données partielles » T11).
8. **Portrait** : titre et phrase du portrait principal (F1, `compute_persona`).
9. **Carte de partage** : aperçu de l'image + bouton « Télécharger l'image » (+ « Partager » seulement si `navigator.canShare({files})` est vrai).

Pas de badges, médailles, confettis ni scène de ciel (goûts du pilote).

## Données
Les valeurs existent déjà en Python (`_highlights` : `busiest_month`, `best_day`, `top_site`, `top_wing` ; records ; `compute_persona` ; `year_gap` ; couverture `_coverage`). **Ne les recalcule pas en JS** : ajoute un petit JSON `<script type="application/json" id="recap-data">` construit dans `report_html.py` (méthode `recap_json`), une entrée par discipline (`all`, `parapente`, `paramoteur` présentes seulement si la discipline a des vols), avec des **chaînes déjà formatées en français** (`report_format.py`) et des phrases tirées de `report_textes.md` (sections `recap_*`, conditionnels `{{?…}}` pour les cas absents). Les 12 valeurs mensuelles (vols, minutes) peuvent être des nombres bruts pour les mini-barres. Cible : ≤ 1,5 ko de JSON par discipline. Aucun bloc `by_disc_cmp`, aucun pré-rendu HTML des pages.

## Navigation et accessibilité
- Pages en défilement horizontal avec `scroll-snap` (balayage au doigt), boutons « précédent / suivant » (≥ 44 px), ← → au clavier, points de progression cliquables (`aria-current`), « n / N » annoncé en `aria-live="polite"`. Échap ferme, retour du focus au bouton.
- `prefers-reduced-motion` : défilement instantané, aucune animation d'apparition.
- Téléphone 375 px : une page = l'écran, texte lisible sans zoom, pas de défilement horizontal **de la page** (le défilement des cartes est interne au panneau). Bureau : cartes centrées (format portrait ~ 420 × 640 px), fond assombri.
- Style : sobre, professionnel, fond bleu nuit du hero (variables existantes du hero) ou carte claire selon le thème ; couleur de discipline `--p` / `--m`, or `--gold` pour le record et les nouveautés. Pictogrammes au trait existants (`STORY_ICONS`, `ICONS`, `<use>`).

## Image de partage (I8)
- `<canvas>` 1080 × 1350 (format 4:5), dessinée en JS à partir de `#recap-data` : titre « Mon année de vol 2026 », pilote, discipline, heures (très gros), vols, sites, site préféré, record, titre du portrait, mention discrète « Rapport Syride · généré le … ». Polices système (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), aucune image externe. Couleurs fixes de la palette du hero (lues via `getComputedStyle` sur les variables, avec valeurs de secours), lisibles quel que soit le thème.
- Téléchargement : `canvas.toBlob` → `URL.createObjectURL` → lien `download` « annee-de-vol-<année>-<pilote>.png » (fonctionne en `file://`, aucune requête réseau). Révoque l'URL après usage.
- Texte long (nom de site ou de pilote) : réduit ou tronqué avec « … », jamais coupé hors du cadre.
- Teste le rendu PNG (taille, lisibilité) : enregistre une image d'AdrienM et d'un pilote à une seule discipline, et regarde-les (outil Read sur le PNG).

## Budget
Cible ≤ 12 ko ajoutés au rapport le plus lourd (JSON compris). Marge restante après T30 : regarde le poids d'Au_Phil_du_vent dans `check_reports.py` avant de commencer ; si tu approches 1 Mo, simplifie (pages moins décorées, pas de mini-barres) plutôt que de dépasser.

## Fichiers
`report_html.py` (bouton, `recap_json`, attributs `data-t-*` si besoin), `report_textes.md` (`recap_*`), `report.js` (module « Récap » après le rejeu), `report.css`.

## Vérifications
Celles du BRIEF_COMMUN (`check_reports.py` → `OK`, poids avant / après ; puis `all_reports.py 2025 2026` sans erreur ni rapport > 1 Mo). Contrôle navigateur : récap d'AdrienM_2026 en « Tout » et en parapente, clair, sombre, `phone.html` (balayage, boutons), console sans erreur ; chiffres du récap identiques à ceux du hero et des sections. Cas limites : j2f (vols sans statistiques : pages record / voile omises ou honnêtes), pilote à une seule discipline, pilote sans année précédente (pas d'écart), année terminée (AdrienM 2025 : pas de « au 14 novembre »).

Compte rendu selon BRIEF_COMMUN, avec le poids ajouté et tout écart avec la conception ci-dessus.
