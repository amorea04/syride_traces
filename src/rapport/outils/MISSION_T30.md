# Mission T30 : « Rejouer l'année » (I1)

Lis d'abord `src/rapport/outils/BRIEF_COMMUN.md` (contraintes, vérifications, compte rendu), puis dans `src/rapport/ameliorations_rapport.md` : §5.1 **I1**, §6.2, et la checklist §11 (Lot G). Ne modifie pas `ameliorations_rapport.md`.

## Objectif
Un bouton « ▶ Rejouer ton année » lance une vue plein écran où l'année se rejoue jour après jour : les cases du calendrier se colorent, les compteurs (vols, heures, sites) s'incrémentent, les jalons s'allument, les sites apparaissent sur la carte. Curseur de temps, lecture / pause, vitesse.

## Conception décidée (ne pas la rediscuter)
1. **Vue plein écran** = panneau `role="dialog"` `aria-modal="true"`, créé en JS au premier lancement (rien dans le HTML hors le bouton). Réutilise les conventions de la fiche du jour (`buildSheet` / `openSheet` / `closeSheet` dans `report.js`, vers la ligne 1095) : Échap ferme, focus piégé dans le panneau, retour du focus au bouton d'origine, `body` non défilable pendant l'ouverture. Masqué à l'impression.
2. **Lancement** : bouton dans le hero (sous les chiffres clés, classe `js-only` : invisible sans JS) et un second dans la carte « Tes jalons » (section `histoire`). Libellés dans `report_textes.md`.
3. **Zéro donnée nouvelle si possible** : tout se calcule depuis ce qui est déjà dans la page, pour la discipline courante `state.disc` :
   - vols : `flightsData` / `flightsByDate` / `flightDatesFor(disc)` (en tête de `report.js`) ;
   - calendrier : **clone** (`cloneNode(true)`) du calendrier annuel visible de la variante courante (`.cal-year svg`, `data-date` déjà posé par report.js sur les jours de vol) ; au téléphone (< 640 px) clone de `.cal-months` (mini-mois). Les jours pas encore « joués » perdent leur couleur (classe CSS sur le clone, ex. `.rp-future` qui remet le remplissage de case vide) ; retire les `id`, `tabindex` et gestionnaires du clone (`aria-hidden="true"`) ;
   - carte : clone de la vue d'ensemble de la carte (T46, `data-site` sur les points `.map-dot`) ; un site apparaît (petite animation d'échelle) le jour de son premier vol de l'année dans la discipline ; masque les sites de l'autre discipline comme le fait déjà la carte ; si la carte est absente (aucun site placé), la vue s'en passe ;
   - jalons : lus dans le DOM de la frise de la variante courante (`.tl-item` : `<time datetime>`, `.tl-title`) ; le dernier jalon atteint s'affiche en bandeau (pictogramme + date + titre), les précédents restent listés en petit (au plus 3 visibles).
   - Compteurs : vols, heures (format `h min` comme ailleurs : regarde les fonctions de formatage existantes dans `report.js`, durées en `mn` décimales, arrondi à l'affichage seulement), sites distincts. À la fin de la lecture, les totaux doivent être **identiques** à ceux du hero pour la discipline (vérifie-le).
4. **Contrôles** : lecture / pause (bouton, barre d'espace), curseur `input type=range` sur les jours de l'année (du 1er janvier au dernier jour de données : `cutoff` si l'année est en cours), vitesse ×1 / ×2 / ×4 (boutons `aria-pressed`), ← → d'un jour de vol au précédent / suivant, date courante affichée en clair (« samedi 5 avril »). Durée de lecture en ×1 : environ 20 s pour l'année entière, avec un léger ralenti sur les jours de vol (ils doivent se voir). `requestAnimationFrame`, pas de `setInterval` serré. Annonce `aria-live="polite"` uniquement à la pause et à la fin (pas à chaque jour).
5. **Mouvement réduit** (`reducedMotion()` existe) : pas de lecture automatique ; le bouton lecture est remplacé par le seul curseur et les flèches ; aucune animation CSS.
6. **Discipline** : la vue rejoue `state.disc` ; si la discipline change pendant l'ouverture (raccourcis 1/2/3 désactivés tant que le panneau est ouvert, ou relance propre : à toi de choisir le plus simple et robuste).
7. **Style** : sobre, cohérent avec la fiche du jour et le hero (pas de décor ; pictogrammes au trait existants `STORY_ICONS` / `ICONS` via `<use>`). Couleur de la discipline `--p` / `--m`, chiffres en `tabular-nums`. Clair et sombre via variables existantes. Téléphone 375 px : calendrier mini-mois, carte sous les compteurs, contrôles collés en bas, cibles ≥ 44 px, pas de défilement horizontal.

## Budget
Cible ≤ 8 ko ajoutés au rapport le plus lourd (Au_Phil_du_vent, 961 ko aujourd'hui) : CSS et JS compacts, aucun pré-rendu par variante. Les lignes de commentaire entières sont retirées au build : commente librement.

## Fichiers
`report.js` (module « Rejeu », placé après la fiche du jour), `report.css`, `report_html.py` (boutons, attributs `data-t-*` pour les libellés lus par le JS, comme `#xf-tools` / `xf_*`), `report_textes.md` (section(s) `rejeu_*`).

## Vérifications
Celles du BRIEF_COMMUN (check_reports.py doit finir par `OK`, poids avant / après). Contrôle navigateur : ouvre le rejeu sur AdrienM_2026 en « Tout », puis en paramoteur ; laisse-le finir et compare les compteurs au hero ; clair, sombre, `phone.html` ; console sans erreur. Cas limites : j2f (vols sans statistiques), un pilote à une seule discipline, un pilote sans carte (si tu en trouves un via `all_reports.py`).

Compte rendu selon BRIEF_COMMUN, en précisant le poids ajouté et tout écart avec la conception ci-dessus.
