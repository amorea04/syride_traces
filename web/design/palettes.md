# Palette de la webapp : direction B « Encre »

Livrable du lot 2.7. **Adrien a choisi la direction B « Encre »** (retouches du 15/11/2026 : parapente et paramoteur inversés, voir plus bas). Les jetons faisant foi sont dans `tokens-B.json` ; les maquettes (`maquette-*.html`) ne montrent plus que B, en clair et en sombre, avec un aperçu mobile. Les thèmes Mantine, ECharts et MapLibre en découlent.

## Règles de couleur (communes, §6 de la feuille de route)

Ce sont les règles du §6 de la feuille de route : **une couleur, un sens**, identique dans les graphiques, la carte, les pastilles et les calendriers.

| Rôle | Règle |
|---|---|
| Parapente, paramoteur, les deux | trois couleurs fixes (`p`, `m`, `b`). Une couleur « les deux » neutre. |
| Records et nouveautés | une seule couleur, l'or (`gold`), **jamais** utilisée ailleurs. Toujours accompagnée d'un losange ou d'un libellé (« Record », « Nouveauté »), jamais seule. Pas de médaille. |
| Années comparées | `y0` (année courante, trait plein), `y1` (tirets `7 4`, hachures 45°), `y2` (pointillés `2 4`, hachures 135°). Le motif est **obligatoire** : la couleur seule ne suffit pas en daltonisme. Sur les graphiques en haltère : disque plein, carré, anneau. |
| Volumes en hausse ou en baisse | vert et rouge (`up`, `down`) pour les vols, les heures et les jours volés uniquement. Pastille toujours avec ▲ ▼ et un signe. |
| Écarts neutres | `nup`, `ndown` pour tout le reste (sites, durée, distance, plafond, vitesses). Ces pastilles ne jugent jamais une valeur « bien » ou « mal ». |
| Modes de vol | `w-site`, `w-treuil`, `w-rando`, `w-mer`, `w-moteur`, `w-autre` (valeur inconnue : hachuré). |
| Calendrier | 4 niveaux d'intensité par discipline (`cal-p1..4`, `cal-m1..4`, `cal-b1..4`) sur un fond `cal-empty`. En clair le niveau 4 est le plus foncé, en sombre le plus clair. Seuils : 1 vol, 2, 3 à 4, 5 et plus. |
| Catégoriel | 8 couleurs (`c1..c8`), en ordre fixe, jamais cyclées. Elles servent aux pilotes, voiles et sites du top N. Un 9ᵉ élément est regroupé dans « Autres » (`w-autre`). |
| Typographie | pile système (D10) : `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` ; chiffres tabulaires ; échelle 12, 13, 15, 17, 20, 26, 34, 46 px. |
| Mouvement | 150 ms au plus, aucune animation décorative. |

## Direction A · Rapport : non retenue

Écartée par Adrien le 15/11/2026. Ses jetons restent dans `tokens-A.json` à titre d'archive (ils ne sont plus utilisés) et ses maquettes ont été retirées des pages `maquette-*.html`.

## Direction B · Encre (retenue)

**Inversion du 15/11/2026.** À la demande d'Adrien, parapente et paramoteur ont été inversés : le parapente est désormais **vermillon** (`#e4572e` en clair, `#ff7a50` en sombre) et le paramoteur **azur** (`#2f6fe0` en clair, `#6aa0ff` en sombre). L'inversion porte sur `p`, `m`, `p-strong`, `m-strong`, `p-text`, `m-text`, `cal-p1..4`, `cal-m1..4`, en clair et en sombre. Les maquettes, le nuancier et les légendes suivent les variables (aucune couleur de discipline n'est écrite en dur).

Identité propre : encre indigo comme seul accent, parapente vermillon, paramoteur azur, aplats et filets plutôt que cartes ombrées.

**Caractère.** Une identité propre, plus éditoriale : fond gris froid, texte quasi noir, accent **encre indigo** (`#1f2358`) qui est le seul accent d'interface, ce qui libère toutes les teintes vives pour le sens des données. Parapente vermillon, paramoteur azur. Pas de cartes ombrées : filets noirs de 2 px au-dessus des sections, rayons de 3 à 8 px, chiffres en graisse 650. L'année courante est en encre foncée, les années comparées en violet et gris. Plus sobre, plus dense, ton « rapport d'analyste ».

| Rôle | Variable | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--bg` | `#f4f4f8` | `#0e0f14` |
| Surface (cartes, panneaux) | `--surface` | `#ffffff` | `#17181f` |
| Surface 2 (champs, segments) | `--surface-2` | `#ebebf2` | `#20212b` |
| Bordure | `--line` | `#dcdce6` | `#2b2d3a` |
| Texte | `--text` | `#14151c` | `#ececf4` |
| Texte discret | `--muted` | `#5b5e70` | `#a0a3b6` |
| Accent (boutons, sélection) | `--accent` | `#1f2358` | `#c7ccff` |
| Texte sur accent | `--accent-ink` | `#ffffff` | `#0e0f14` |
| Accent en texte (liens) | `--accent-text` | `#1f2358` | `#c7ccff` |
| Parapente | `--p` | `#e4572e` | `#ff7a50` |
| Paramoteur | `--m` | `#2f6fe0` | `#6aa0ff` |
| Les deux | `--b` | `#3f4352` | `#c4c8d6` |
| Parapente en texte | `--p-text` | `#d24619` | `#ff7a50` |
| Paramoteur en texte | `--m-text` | `#2f6fe0` | `#6aa0ff` |
| Record, nouveauté (réservé) | `--gold` | `#b58900` | `#e8b923` |
| Or, fond | `--gold-bg` | `#fbf0cf` | `#33280a` |
| Or, texte | `--gold-text` | `#6b5000` | `#e8b923` |
| Année courante (trait plein) | `--y0` | `#1f2358` | `#c7ccff` |
| Année comparée 1 (tirets) | `--y1` | `#8b5cf6` | `#a78bfa` |
| Année comparée 2 (pointillés) | `--y2` | `#7a7f92` | `#9a9fb2` |
| Volume en hausse | `--up` | `#0f8a7e` | `#2dd4bf` |
| Volume en baisse | `--down` | `#c2255c` | `#fb7185` |
| Écart neutre positif | `--nup` | `#6f4fd0` | `#a78bfa` |
| Écart neutre négatif | `--ndown` | `#a0651a` | `#e0a458` |
| Écart nul | `--flat` | `#5b5e70` | `#a0a3b6` |
| Mode : site | `--w-site` | `#764800` | `#c49d68` |
| Mode : treuil | `--w-treuil` | `#930646` | `#fe85af` |
| Mode : rando | `--w-rando` | `#2f7c20` | `#9bd75b` |
| Mode : bord de mer | `--w-mer` | `#373ba7` | `#16bdb5` |
| Mode : moteur | `--w-moteur` | `#7b5b86` | `#c38eff` |
| Mode : autre / inconnu | `--w-autre` | `#6b7280` | `#94a3b8` |
| Catégoriel 1 | `--c1` | `#db5ab5` | `#db5dbb` |
| Catégoriel 2 | `--c2` | `#a45159` | `#a6535a` |
| Catégoriel 3 | `--c3` | `#9d35ad` | `#9d50d5` |
| Catégoriel 4 | `--c4` | `#346304` | `#4dae0b` |
| Catégoriel 5 | `--c5` | `#9c0760` | `#b52a91` |
| Catégoriel 6 | `--c6` | `#02a339` | `#4c781b` |
| Catégoriel 7 | `--c7` | `#55489f` | `#625fa5` |
| Catégoriel 8 | `--c8` | `#2d895c` | `#009b7e` |
| Calendrier vide | `--cal-empty` | `#e2e2e7` | `#202126` |
| Calendrier parapente niveau 1 | `--cal-p1` | `#dbb3ac` | `#75615d` |
| Calendrier parapente niveau 2 | `--cal-p2` | `#d29181` | `#a7867c` |
| Calendrier parapente niveau 3 | `--cal-p3` | `#c76b52` | `#d7a99a` |
| Calendrier parapente niveau 4 | `--cal-p4` | `#b8401c` | `#ffc6b2` |
| Calendrier paramoteur niveau 1 | `--cal-m1` | `#a7bae0` | `#5c6679` |
| Calendrier paramoteur niveau 2 | `--cal-m2` | `#7c9dd9` | `#7f8eaa` |
| Calendrier paramoteur niveau 3 | `--cal-m3` | `#4f7bcf` | `#a0b5d8` |
| Calendrier paramoteur niveau 4 | `--cal-m4` | `#1f58c4` | `#bbd5ff` |
| Calendrier les deux niveau 1 | `--cal-b1` | `#a0a1a9` | `#6b6c72` |
| Calendrier les deux niveau 2 | `--cal-b2` | `#72747d` | `#97989e` |
| Calendrier les deux niveau 3 | `--cal-b3` | `#444651` | `#c1c3c9` |
| Calendrier les deux niveau 4 | `--cal-b4` | `#1b1d28` | `#e4e6ec` |
| Carte : eau | `--map-water` | `#dfe6ef` | `#11141c` |
| Carte : terre | `--map-land` | `#eceee9` | `#1c2030` |
| Carte : frontière | `--map-border` | `#c8ccd6` | `#343a50` |
| Bilan : bandeau (début) | `--hero-1` | `#1f2358` | `#0a0b1e` |
| Bilan : bandeau (fin) | `--hero-2` | `#2a2f75` | `#14173a` |

## Validation

Chaque jeu catégoriel de 8 couleurs a été passé dans `scripts/validate_palette.js` du skill `dataviz` (liste adjacente, bandes de luminosité claire 0,43 à 0,77 et sombre 0,48 à 0,67, plancher de chroma 0,10, séparation en daltonisme protanopie et deutéranopie avec cible 8, plancher en vision normale 15, contraste 3:1 sur la surface). Les couleurs ont été trouvées par une recherche automatique sous contraintes (script du lot, hors dépôt) puis recalées à la main (ex. mode sombre, luminosité plafonnée à 0,67).

### Validation après l'inversion (15/11/2026)

Relancée avec `validate_palette.js` du skill `dataviz` sur les jetons modifiés. Les 8 couleurs catégorielles n'ont pas changé : mêmes résultats, aucun FAIL.

- **Parapente et paramoteur seuls** (`--pairs all`) : clair, tous les contrôles passent (ΔE vision normale 34,9, daltonisme 27,0, contraste 3:1 respecté) ; sombre, ΔE 30,1 en vision normale, 24,1 en daltonisme, mais les deux teintes dépassent la bande de luminosité catégorielle (L 0,73 et 0,71 pour un plafond de 0,67), comme avant l'inversion : ce sont des couleurs sémantiques, pas des couleurs catégorielles de graphique. La **distance entre les deux est inchangée** (la paire est symétrique) et chaque couleur garde exactement les contrastes qu'elle avait, seul le rôle change (tableau ci-dessous, lignes parapente et paramoteur échangées).
- **Ce qui bouge de façon utile** : le parapente (vermillon) devient la couleur proche de l'or (ΔE 14 en clair, 2 en daltonisme) et le paramoteur (azur) s'en éloigne (ΔE 33). Règle inchangée : l'or est toujours accompagné d'un losange ou d'un libellé.
- **Texte parapente** en clair : 4,54:1 (marge presque nulle, ne pas éclaircir `#d24619`). **Marque parapente** en clair : 3,68:1 (sous 4,5:1, au-dessus de 3:1, donc OK pour une marque, pas pour du texte : le texte utilise `--p-text`).
- **Calendriers** : rampes validées en mode ordinal, clair et sombre : monotonie, écarts de luminosité et teinte unique passent ; le premier niveau clair (1,47:1 et 1,51:1 contre le fond vide, 1,90 et 1,95 contre la surface) reste sous le plancher ordinal de 2:1 contre la surface, comme avant, et reste au-dessus du seuil de 1,3:1 retenu contre le fond vide (valeur donnée par infobulle et table).
- Les rôles neutres (`b`, `y0`, `y2`) ne sont pas des teintes catégorielles : les contrôles de bande et de chroma n'ont pas de sens pour eux et ne sont pas retenus.

### Direction B

**Catégoriel de 8, clair** (surface #ffffff) :
- `[PASS] Lightness band     all 8 inside L 0.43–0.77`
- `[PASS] Chroma floor      all 8 >= 0.1`
- `[PASS] CVD separation     worst adjacent #9c0760↔#346304 ΔE 9.3 (deutan) · tritan 5.0`
- `[PASS] Normal-vision floor  worst adjacent #9d35ad↔#a45159 ΔE 15.9 (normal)`
- `[PASS] Contrast vs surface  all 8 >= 3:1`

**Catégoriel de 8, sombre** (surface #17181f) :
- `[PASS] Lightness band     all 8 inside L 0.48–0.67`
- `[PASS] Chroma floor      all 8 >= 0.1`
- `[PASS] CVD separation     worst adjacent #4c781b↔#b52a91 ΔE 14.2 (deutan) · tritan 4.1`
- `[PASS] Normal-vision floor  worst adjacent #a6535a↔#db5dbb ΔE 17.3 (normal)`
- `[PASS] Contrast vs surface  all 8 >= 3:1`

- Distance OKLab (ΔE ×100) entre chaque couleur catégorielle et la couleur sémantique la plus proche (parapente, paramoteur, les deux, or, années 0 à 2) : **clair 13.2**, **sombre 13.8** (seuil retenu : 12, la quasi-identité est sous 5).
- Paires sémantiques (ΔE vision normale / ΔE minimal protanopie-deutéranopie), clair : p/m 35/27, p/gold 14/2, m/gold 33/30, y0/y1 34/33, y1/y2 19/18, y0/y2 32/32. Sombre : p/m 30/24, p/gold 16/8, m/gold 32/30, y0/y1 18/17, y1/y2 13/12, y0/y2 16/16.
- Modes de vol (6), ΔE minimal entre deux modes : clair 7.2 (daltonisme 4.0), sombre 11.4 (daltonisme 1.1).

Contrastes (WCAG, ratio mesuré) :

| Paire | Seuil | Clair | Sombre |
|---|---|---|---|
| texte/fond | ≥ 4.5 | 16.59 | 16.29 |
| texte/surface | ≥ 4.5 | 18.20 | 15.06 |
| discret/fond | ≥ 4.5 | 5.84 | 7.66 |
| discret/surface | ≥ 4.5 | 6.40 | 7.09 |
| accent (lien)/fond | ≥ 4.5 | 13.30 | 12.31 |
| texte sur accent | ≥ 4.5 | 14.59 | 12.31 |
| parapente texte/surface | ≥ 4.5 | 4.54 | 6.87 |
| paramoteur texte/surface | ≥ 4.5 | 4.70 | 6.81 |
| or texte/or fond | ≥ 4.5 | 6.66 | 7.87 |
| hausse | ≥ 4.5 | 4.63 | 6.56 |
| baisse | ≥ 4.5 | 4.64 | 4.91 |
| neutre + | ≥ 4.5 | 4.66 | 4.86 |
| neutre − | ≥ 4.5 | 4.55 | 5.81 |
| parapente (marque)/surface | ≥ 3 | 3.68 | 6.87 |
| paramoteur (marque)/surface | ≥ 3 | 4.70 | 6.81 |
| or (marque)/surface | ≥ 3 | 3.21 | 9.60 |
| année 0/surface | ≥ 3 | 14.59 | 11.38 |
| année 1/surface | ≥ 3 | 4.23 | 6.50 |
| année 2/surface | ≥ 3 | 3.98 | 6.72 |
| calendrier p niveau 3/surface | ≥ 3 | 3.71 | 8.45 |
| calendrier m niveau 3/surface | ≥ 3 | 4.14 | 8.51 |
| calendrier b niveau 3/surface | ≥ 3 | 9.37 | 10.04 |
| calendrier p niveau 1/vide | ≥ 1.3 | 1.47 | 2.77 |
| calendrier m niveau 1/vide | ≥ 1.3 | 1.51 | 2.78 |
| calendrier b niveau 1/vide | ≥ 1.3 | 1.99 | 3.07 |

Résultat : **les 2 jeux catégoriels (clair et sombre) passent tous les contrôles bloquants** (aucun FAIL) ; les 50 paires de contraste testées (clair et sombre) atteignent leur seuil (4,5:1 pour du texte, 3:1 pour des marques, 1,3:1 pour le premier niveau de calendrier contre le fond vide).

## Limites connues, à garder en tête

1. **Pas de collision catégoriel / sémantique, sauf pastilles.** Les couleurs catégorielles sont à au moins 12 de distance des couleurs parapente, paramoteur, les deux, or et années, et à au moins 20° de teinte du parapente, du paramoteur et de l'or. Elles peuvent en revanche ressembler au vert et au rouge des pastilles de volume (ΔE entre 5 et 13) : ces pastilles portent toujours ▲ ▼ et un signe, et ne cohabitent jamais avec une légende catégorielle dans un même graphique.
2. **Années : le motif est indispensable.** Les années sont bien séparées par la couleur (ΔE 13 à 35), mais le motif (plein, tirets, pointillés) reste obligatoire par règle.
3. **Or et vermillon.** Le parapente vermillon et l'or sont proches en daltonisme (ΔE 14 en clair, 2 en daltonisme) : l'or est toujours accompagné d'un losange ou d'un libellé.
4. **Marques sous 3:1 avec relief.** Aucune marque catégorielle ne passe sous 3:1. Le premier niveau du calendrier est volontairement léger (1,45:1 à 1,5:1 contre le fond vide en clair) : la vue mobile et les infobulles donnent la valeur, et une table alternative est prévue.
5. **Modes de vol.** En B sombre, la teinte « autre » est proche d'un autre mode en daltonisme (ΔE 1,1) ; les segments sont étiquetés directement et l'inconnu est hachuré.
6. **Texte parapente en clair** : 4,54:1, marge presque nulle. Ne pas éclaircir `#d24619`.

## Choix

Adrien a retenu B le 15/11/2026 : identité propre (§6), couleurs de données qui ressortent sur une interface neutre, Bilan distinct du rapport de fin d'année (D9). L'inversion parapente vermillon, paramoteur azur est faite dans `tokens-B.json` et dans toutes les maquettes.
