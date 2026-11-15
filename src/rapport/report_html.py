"""
Rapport HTML « Ton année de vol » : un seul fichier autonome (CSS, JavaScript et graphiques
intégrés, aucune requête externe), à ouvrir dans un navigateur. Compatible Python 3.9.

Utilisation :
    import report_html
    report_html.build_report(df, pilot="j2f", year=2026, output="rapport_j2f_2026.html")

Organisation :
    report_data.py     calcule les indicateurs (dictionnaires)
    report_charts.py   dessine les graphiques SVG
    report_textes.md   textes éditables (titres, phrases, aide, glossaire)
    report_format.py   formatage à la française (nombres, durées, dates, pluriels)
    report.css         feuille de style, copiée dans le fichier final
    report.js          interactions, copiées dans le fichier final
    map_data.geojson   fond de carte Natural Earth, lu par report_charts.py
  Ces fichiers se trouvent dans le même dossier que report_html.py (ASSETS_DIR).

Interactivité : la discipline (tout / parapente / paramoteur) et jusqu'à deux années de
comparaison se choisissent dans la barre du haut. Chaque combinaison est pré-calculée en HTML
(variantes `.v`), le JavaScript n'affiche que la bonne : la page reste lisible sans JavaScript
(état par défaut) et se pilote sans calcul côté navigateur.
"""

import calendar
import datetime as dt
import html
import itertools
import json
import math
import os
import re
import zlib
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

try:
    from . import report_charts as rc
    from . import report_data as rd
    from .report_format import (
        DAYS_LONG, DAYS_SHORT, MONTHS_LONG, MONTHS_SHORT, NBSP, fmt_date, fmt_date_short, fmt_duration,
        fmt_hours, fmt_int, fmt_num, fmt_range, fmt_readable, fmt_signed_pct, plural,
    )
except ImportError:  # Support running the module directly from rapport/.
    import report_charts as rc
    import report_data as rd
    from report_format import (
        DAYS_LONG, DAYS_SHORT, MONTHS_LONG, MONTHS_SHORT, NBSP, fmt_date, fmt_date_short, fmt_duration,
        fmt_hours, fmt_int, fmt_num, fmt_range, fmt_readable, fmt_signed_pct, plural,
    )

_HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = _HERE  # report.css et report.js sont dans le même dossier que report_html.py
DEFAULT_TEXTS = os.path.join(_HERE, "report_textes.md")

DISC_LABELS = {"all": "Tout", "parapente": "Parapente", "paramoteur": "Paramoteur"}
DISC_IN_SENTENCE = {"all": "", "parapente": "en parapente", "paramoteur": "en paramoteur"}
DISC_PILL = {"parapente": "pill-p", "paramoteur": "pill-m"}
WING_UNKNOWN = ("inconnue", "nan", "none", "")       # « voile non renseignée » : pas de page « voile » dans le récap
DISC_CODE = {"parapente": "p", "paramoteur": "m"}   # discipline dans le JSON des vols (report.js : DISC_OF_CODE)

# Équivalences du hero (F2)
PARIS_MARSEILLE_KM = 660.0
EIFFEL_M = 330.0
MONT_BLANC_M = 4806.0
EVEREST_M = 8849.0
MONT_BLANC_NEAR = 0.8        # le plafond « s'approche » du Mont-Blanc à partir de 80 % de son altitude
MIN_COVER = 0.8              # une mesure doit exister pour au moins 80 % des vols pour servir d'équivalence
PARTIAL_DATA_SHARE = 0.20    # pastille « données partielles » quand plus de 20 % des vols n'ont pas la mesure (F18)
EQ_MIN_TIMES = 1.0           # une équivalence en « fois » doit valoir au moins 1

# Faits marquants (F4)
FACT_MIN_FLIGHTS = 5         # « journée type » : au moins 5 vols
FACT_MAX_SITES = 3

# Matrice jour x heure (T53)
MATRIX_MIN_COLS = 8                    # fenêtre d'heures : au moins 8 colonnes (comme l'histogramme des heures)
MATRIX_LEVEL_SHARES = (0.25, 0.5, 0.75)   # niveaux 1 à 4 : part de la cellule maximale (jusqu'à 25 %, 50 %, 75 %, au-delà)
WING_NOW_DAYS = 30                     # « voile du moment » : fenêtre de jours avant le dernier vol de l'année (lue par report.js)
MATRIX_FAV_MIN = 3                     # phrase « créneau favori » et cellule en gras : au moins 3 vols dans la cellule max

# Façons de voler (F19)
MODE_MINORITY_PCT = 15.0     # une phrase est affichée si une façon minoritaire dépasse ce pourcentage des vols
MODE_CSS = {"Site": "site", "Treuil": "treuil", "Rando": "rando", "Bord de mer": "mer", "Moteur": "moteur"}
MODE_IN_SENTENCE = {"Site": "sur site", "Treuil": "au treuil", "Rando": "en rando",
                    "Bord de mer": "en bord de mer", "Moteur": "au moteur"}
# ---- Fond du hero (T19) : courbes de niveau dessinées une fois en Python (SVG inline, viewBox 1200 × 440) ----
# Deux massifs : (centre x, centre y, nombre de courbes, écart entre courbes, étirement horizontal, phase du relief).
# Les courbes d'un massif sont emboîtées (même forme, rayon croissant) : elles ne se croisent jamais.
TOPO_PEAKS = ((960, 150, 15, 21, 1.45, 0.4), (150, 470, 9, 24, 1.25, 2.1))
TOPO_INDEX_EVERY = 5         # une courbe sur cinq plus marquée (courbe maîtresse, comme sur une carte IGN)
TOPO_POINTS = 28             # points par courbe (lissage par courbes de Bézier quadratiques)

MAP_MAX_ZONE_VIEWS = 6       # carte par zones : au plus 6 vues zoomées (les zones les plus volées)
MAP_OVERVIEW_R = 15.0        # vue d'ensemble : rayon du plus gros site (petit : les sites ne sont pas écartés)
NEW_SITES_SHOWN = 8          # nouveaux sites : au plus 8 puces visibles, les autres sont repliées derrière « + N autres » (D26)
REACH_MIN_KM = 20.0          # rayon d'action : phrase affichée si le site le plus éloigné est à 20 km ou plus
FRACTION_MAX_GAP = 0.05   # écart maximal (en points de part) toléré entre la part réelle et « un vol sur n »
FRACTION_WORDS = {2: "deux", 3: "trois", 4: "quatre", 5: "cinq", 6: "six", 7: "sept"}

# Saisons (F21)
SEASON_LABELS = {"hiver": "Hiver", "printemps": "Printemps", "été": "Été", "automne": "Automne"}
SEASON_WITH_ARTICLE = {"hiver": "l'hiver", "printemps": "le printemps", "été": "l'été", "automne": "l'automne"}
_ICON_ATTRS = ('viewBox="0 0 24 24" width="{s}" height="{s}" fill="none" stroke="currentColor" stroke-width="1.8" '
               'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"')
ICONS = {   # pictogrammes SVG inline (24 x 24, traits)
    "hiver": '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6.5l2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
    "printemps": '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 16c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    "été": '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    "automne": '<path d="M5 19C5 10 10 5 20 4c0 10-4 15-13 15z"/><path d="M5 19l8-8"/>',
    "meilleure": '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    "typique": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "vol": '<path d="M3 11l18-8-8 18-2-8z"/>',
}

# Récit de l'année (F1, F3) : pictogrammes appelés par <use href="#ic-…"> (voir ReportBuilder.story_sprite)
_WING = '<path d="M3 10c3-4.5 15-4.5 18 0"/><path d="M3.5 10l8.5 9 8.5-9M12 8.6V19"/>'
_CLOCK = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
_CAL = '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
_PIN = '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'
_UP = '<path d="M4 4h16"/><path d="M12 20V8.5M7 13l5-5 5 5"/>'
_SUNRISE = '<path d="M3 19h18M6.5 19a5.5 5.5 0 0111 0M12 6v3M5.4 10.4l1.8 1.8M18.6 10.4l-1.8 1.8"/>'
_WINCH = '<circle cx="7" cy="17" r="3.2"/><path d="M9.4 14.8L19 5M14.5 5H19v4.5"/>'
_SWAP = '<path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5"/>'
_FLAG = '<path d="M5.5 21V4M5.5 4H17l-2.5 4 2.5 4H5.5"/>'
STORY_ICONS = {
    # portraits (F1)
    "p-polyvalent": _SWAP, "p-treuilleur": _WINCH, "p-plafond": _UP, "p-nomade": _PIN, "p-regulier": _CAL + '<path d="M9 15l2 2 4-4"/>',
    "p-marcheur": '<path d="M3 20l6.5-11 4 6 2.5-3.5L21 20z"/>',
    "p-explorateur": '<circle cx="12" cy="12" r="8.5"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
    "p-marathonien": '<path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9"/>',
    "p-leve_tot": _SUNRISE, "p-soir": '<path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z"/>',
    "p-fidele": '<path d="M12 20s-7.5-4.6-7.5-10.2A4 4 0 0112 7.3a4 4 0 017.5 2.5C19.5 15.4 12 20 12 20z"/>',
    "p-week_end": _CAL + '<path d="M13 13.5h4v3.5h-4z"/>', "p-libre": _WING,
    "p-debut": '<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15.5c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    "b-vols": _WING, "b-heures": _CLOCK, "b-sites": _PIN,
    # jalons (F3)
    "j-first": _FLAG, "j-star": '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    "j-sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    "j-back": '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    # cartes de chiffres (T16) et pictogrammes de section
    "b-jours": _CAL,
    "k-vit": '<path d="M4 17a8 8 0 1116 0"/><path d="M12 17l4-5"/>',
    "k-vario": '<path d="M3 17l5-5 4 3 8-8M15 7h5v5"/>',
    "k-g": '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    "s-grid": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    "s-list": '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    "s-help": '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.4 2.4 0 114 1.8c-.9.7-1.6 1.1-1.6 2.2M12 16.6h.01"/>',
}
# Pictogramme de chaque carte de chiffres, et mesure dont report.js trace la mini-courbe mensuelle
# (seulement les mesures qui ont un sens mois par mois : pas les maximums)
KPI_ICONS = {"days_flown": "b-jours", "duration_mean": "b-heures", "duration_max": "p-marathonien", "distance_max": "p-explorateur",
             "ceiling_max": "p-plafond", "speed_max_max": "k-vit", "vario_max": "k-vario", "g_max": "k-g"}
KPI_SPARK = {"days_flown": "days", "duration_mean": "mean"}
# Pictogramme de l'en-tête de chaque section (à la place du numéro)
SECTION_ICONS = {"apercu": "s-grid", "histoire": "j-first", "rythme": "b-jours", "quand": "b-heures", "ou": "b-sites", "matos": "b-vols",
                 "records": "j-star", "comparaison": "p-polyvalent", "carriere": "p-marcheur", "vols": "s-list", "glossaire": "s-help"}
JALON_ICONS = {"first": "j-first", "nth_flight": "b-vols", "nth_hour": "b-heures", "record": "j-star", "best_day": "j-sun",
               "new_site": "b-sites", "new_wing": "b-vols", "comeback": "j-back"}
JALON_RECORD_WORDS = {"duree": "long", "plafond": "haut", "distance": "loin"}
JALON_PERSO_NAMES = {"duree": "durée", "plafond": "plafond", "distance": "distance"}
JALON_RECORD_FMT = {"duree": ("dur", ""), "plafond": ("int", "m"), "distance": ("int", "km")}


def _icon(name: str, size: int = 22) -> str:
    return f'<svg class="ico" {_ICON_ATTRS.format(s=size)}>{ICONS[name]}</svg>'


# ============================================================================
# Moteur de textes : markdown simplifié + repères {{nom}}
# ============================================================================


class Raw(str):
    """Valeur déjà au format HTML : insérée telle quelle (les autres valeurs sont échappées)."""


_SECTION_RE = re.compile(r"^## (\w+)[ \t]*$", re.M)
_COND_RE = re.compile(r"\{\{\?(\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
_NOT_RE = re.compile(r"\{\{\^(\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
_VAR_RE = re.compile(r"\{\{(\w+)\}\}")
_TOKEN = "\ue000{}\ue001"


def load_texts(path: str = DEFAULT_TEXTS) -> Dict[str, str]:
    """Lit report_textes.md : {nom: texte}. Les commentaires <!-- --> sont ignorés."""
    with open(path, encoding="utf-8") as fp:
        content = re.sub(r"<!--.*?-->", "", fp.read(), flags=re.S)
    parts = _SECTION_RE.split(content)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


def _inline(text: str) -> str:
    """Gras, italique, code et liens sur un texte déjà échappé."""
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+|#[\w-]+)\)",
                  r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<em>\1</em>", text)
    return text


def md_to_html(text: str) -> str:
    """Convertit le markdown simplifié (paragraphes, listes « - », titres ###, inline) en HTML."""
    blocks = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
        if not lines:
            continue
        if all(line.startswith("- ") for line in lines):
            items = "".join(f"<li>{_inline(html.escape(l[2:], quote=False))}</li>" for l in lines)
            blocks.append(f"<ul>{items}</ul>")
        elif lines[0].startswith("### "):
            blocks.append(f"<h3>{_inline(html.escape(lines[0][4:], quote=False))}</h3>")
        else:
            blocks.append(f"<p>{_inline(html.escape(' '.join(lines), quote=False))}</p>")
    return "".join(blocks)


def render_md(template: str, ctx: Dict[str, object], block: bool = True) -> str:
    """
    Remplit les repères puis convertit en HTML.
    {{nom}} : valeur échappée (ou HTML brut si `Raw`) ; {{?nom}}...{{/nom}} : affiché si la valeur est non vide ;
    {{^nom}}...{{/nom}} : « sinon », affiché si la valeur est vide ou fausse. Les blocs peuvent s'imbriquer.
    block=False : sans balise <p> (pour insérer la phrase dans un paragraphe existant).
    """
    def conditional(match):
        return match.group(2) if ctx.get(match.group(1)) else ""

    def otherwise(match):
        return "" if ctx.get(match.group(1)) else match.group(2)

    for _ in range(4):   # plusieurs passes : les blocs imbriqués se résolvent de l'extérieur vers l'intérieur
        new = _NOT_RE.sub(otherwise, _COND_RE.sub(conditional, template))
        if new == template:
            break
        template = new
    values: List[str] = []

    def variable(match):
        value = ctx.get(match.group(1), "")
        values.append(str(value) if isinstance(value, Raw) else html.escape(str(value)))
        return _TOKEN.format(len(values) - 1)

    out = md_to_html(_VAR_RE.sub(variable, template))
    for i, value in enumerate(values):
        out = out.replace(_TOKEN.format(i), value)
    if not block:
        out = re.sub(r"^<p>|</p>$", "", out)
    return out


# ============================================================================
# Tables de présentation
# ============================================================================

# (clé dans les chiffres clés, libellé, format, unité)
CARD_KPIS = [
    ("days_flown", "Jours de vol", "int", ""),
    ("duration_mean", "Durée moyenne", "dur", ""),
    ("duration_max", "Plus long vol", "dur", ""),
    ("distance_max", "Plus longue distance", "int", "km"),
    ("ceiling_max", "Plafond max", "int", "m"),
    ("speed_max_max", "Vitesse max", "int", "km/h"),
    ("vario_max", "Vario max", "num", "m/s"),
    ("g_max", "Facteur g max", "num", "g"),
]
COMPARE_ROWS = [
    ("n_flights", "Vols", "int", ""),
    ("minutes", "Temps de vol", "dur", ""),
    ("days_flown", "Jours de vol", "int", ""),
    ("n_sites", "Sites différents", "int", ""),
    ("duration_mean", "Durée moyenne d'un vol", "dur", ""),
    ("distance_total", "Distance totale", "int", "km"),
    ("ceiling_max", "Plafond max", "int", "m"),
    ("speed_max_max", "Vitesse max", "int", "km/h"),
    ("vario_max", "Vario max", "num", "m/s"),
    ("g_max", "Facteur g max", "num", "g"),
]
# Indicateurs de « volume » : plus = mieux, moins = moins. Seuls ceux-là reçoivent les pastilles
# vertes / rouges. Pour les autres (plafond, vitesse, facteur g…), plus haut n'est pas « mieux » :
# les pastilles sont neutres (bleu pour une hausse, ambre pour une baisse).
VOLUME_KPIS = {"n_flights", "minutes", "days_flown"}

# Chiffre clé -> mesure dont dépend sa couverture (clés de rd.MEASURE_COLUMNS) ; absent = toujours connu (durée, jours…)
KPI_MEASURE = {"distance_max": "distance", "distance_total": "distance", "ceiling_max": "plafond",
               "speed_max_max": "vitesse_max", "vario_max": "vario", "g_max": "g"}
# Nom de chaque mesure dans le tableau de couverture et dans l'info-bulle de la pastille
MEASURE_NAMES = {"plafond": "Plafond", "distance": "Distance", "gain": "Gain", "vitesse_max": "Vitesse max",
                 "vario": "Vario max", "g": "Facteur g"}

# clé du record : (titre, unité, format)
RECORD_LABELS = {
    "duree": ("Vol le plus long", "", "dur"),
    "distance": ("Plus longue distance", "km", "int"),
    "plafond": ("Plus haut", "m", "int"),
    "vitesse_max": ("Vitesse maximale", "km/h", "int"),
    "vario": ("Meilleur vario", "m/s", "num"),
    "g": ("Facteur g maximal", "g", "num"),
}


# Records repérés dans « Tous tes vols » (colonnes du tableau, même clé que dans RECORD_LABELS) : libellé accessible
RECORD_TITLES = {"duree": "Plus long vol de l'année", "distance": "Plus longue distance de l'année",
                 "plafond": "Plus haut plafond de l'année", "vitesse_max": "Vitesse maximale de l'année"}


def _fmt_value(kind: str, value: Optional[float], unit: str = "") -> str:
    """Valeur formatée avec son unité ('–' si absente)."""
    if value is None:
        return "–"
    text = {"int": fmt_int, "dur": fmt_duration, "num": lambda v: fmt_num(v, 1)}[kind](value)
    return f"{text}{NBSP}{unit}" if unit else text


def _e(text) -> str:
    return html.escape(str(text), quote=True)


def hours_window(used: List[int]) -> Tuple[int, int]:
    """Fenêtre d'heures affichée (première à dernière heure avec un vol, au moins MATRIX_MIN_COLS colonnes ; 8 h - 18 h sans vol).
    Commune à l'histogramme des heures et à la matrice jour x heure."""
    lo, hi = (min(used), max(used)) if used else (8, 18)
    while hi - lo < MATRIX_MIN_COLS - 1:
        lo, hi = max(lo - 1, 0), min(hi + 1, 23)
    return lo, hi


# ============================================================================
# Constructeur de rapport
# ============================================================================


def hero_topo() -> str:
    """Décor du hero : courbes de niveau de deux massifs imaginaires (TOPO_PEAKS), traits fins semi-transparents."""
    lines, index = [], []
    for cx, cy, count, step, stretch, phase in TOPO_PEAKS:
        for k in range(1, count + 1):
            r = k * step
            pts = []
            for i in range(TOPO_POINTS):
                t = 2 * math.pi * i / TOPO_POINTS
                # relief irrégulier mais identique pour toutes les courbes du massif (léger décalage vers le haut)
                f = 1 + 0.17 * math.sin(2 * t + phase) + 0.09 * math.sin(3 * t + 2 * phase) + 0.05 * math.sin(5 * t + 1.3)
                pts.append((cx + r * f * stretch * math.cos(t), cy - 1.2 * k + r * f * math.sin(t)))
            mids = [((pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2) for i in range(len(pts))]
            d = f"M{mids[0][0]:.0f} {mids[0][1]:.0f}" + "".join(
                f"Q{pts[i][0]:.0f} {pts[i][1]:.0f} {mids[(i + 1) % len(pts)][0]:.0f} {mids[(i + 1) % len(pts)][1]:.0f}"
                for i in range(len(pts))) + "z"
            (index if k % TOPO_INDEX_EVERY == 0 else lines).append(d)
    return ('<svg class="hero-topo" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            f'<path class="tp" d="{"".join(lines)}"/><path class="tp tp-i" d="{"".join(index)}"/></svg>')


# Icône d'onglet : voile en arc cyan sur fond bleu nuit, en data: URI (aucune requête /favicon.ico)
FAVICON = ('<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E'
           '%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230b1d3a\'/%3E'
           '%3Cpath d=\'M5 19Q16 4 27 19\' fill=\'none\' stroke=\'%2322d3ee\' stroke-width=\'4\' stroke-linecap=\'round\'/%3E'
           '%3Cpath d=\'M9 20L16 27L23 20\' fill=\'none\' stroke=\'%2322d3ee\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E">')


class ReportBuilder:
    def __init__(self, report: dict, texts: Dict[str, str], date_update: Optional[dt.date] = None):
        self.r = report
        self.texts = texts
        self.date_update = date_update
        self.tip_details: List[str] = []    # « Sites : … · Voiles : … » des barres de mois, dédupliqués (JSON #tip-details)
        self.year = report["year"]
        self.today = report["today"]
        self.cutoff = report["cutoff"]
        self.compare = list(report["compare_years"])
        self.subsets = [c for n in range(len(self.compare) + 1) for c in itertools.combinations(self.compare, n)]
        self.default_cmp = tuple(self.compare[:1])        # par défaut : comparaison avec l'année précédente
        self.date_equiv = fmt_date(self.today) if self.cutoff else ""
        self.section_no = 0

    # ---------- Accès aux données ----------

    def data(self, year: int, disc: str) -> dict:
        return self.r["data"][year][disc]

    def main(self, disc: str) -> dict:
        return self.data(self.year, disc)

    def style_of(self, year: int) -> int:
        """0 = année du rapport, 1 et 2 = années de comparaison (couleur stable)."""
        return 0 if year == self.year else 1 + self.compare.index(year)

    def has_disc(self, disc: str) -> bool:
        return not self.main(disc)["empty"]

    # ---------- Textes ----------

    def text(self, key: str, ctx: Optional[dict] = None, block: bool = True) -> str:
        return render_md(self.texts.get(key, ""), ctx or {}, block=block) if self.texts.get(key) else ""

    def base_ctx(self) -> dict:
        k = self.main("all")["kpis"]
        return {
            "pilot": self.r["pilot"], "year": self.year,
            "premier_vol": fmt_date(k["first_date"]), "dernier_vol": fmt_date(k["last_date"], True),
            "date_generation": fmt_date(self.today, True),
            "date_donnees": fmt_date(self.date_update, True) if self.date_update else "",
            "date_equivalente": self.date_equiv,
        }

    def variant(self, prefix: str) -> str:
        """Nom du texte « prefix_N » choisi de façon stable (pilote, année, préfixe) ; « » si aucun.
        zlib.crc32 et non hash() : ce dernier varie d'une exécution à l'autre."""
        keys = sorted((k for k in self.texts if re.fullmatch(re.escape(prefix) + r"_\d+", k)),
                      key=lambda k: int(k.rsplit("_", 1)[1]))
        if not keys:
            return ""
        seed = f'{self.r["pilot"]}|{self.year}|{prefix}'.encode("utf-8")
        return keys[zlib.crc32(seed) % len(keys)]

    # ---------- Avance ou retard sur la première année de comparaison (F20) ----------

    def gap(self, disc: str) -> Optional[dict]:
        return rd.year_gap(self.r, disc)

    @staticmethod
    def _gap_amount(minutes: float) -> str:
        """Écart en heures rondes à partir de 10 h, sinon « 3 h 20 min »."""
        return fmt_duration(round(minutes / 60) * 60 if minutes >= 600 else minutes)

    def gap_phrase(self, disc: str) -> Tuple[str, str, str]:
        """(statut, phrase HTML, note HTML) de l'écart avec l'année précédente ; trois chaînes vides s'il n'y en a pas.
        Source unique du hero et du récap : « Tu as déjà dépassé ton total de 2025 : 10 h de plus » (variantes dans report_textes.md)."""
        g = self.gap(disc)
        if not g:
            return "", "", ""
        key = self.variant("phrase_" + g["status"])
        if not key:
            return "", "", ""
        n_diff = abs(g["flights"])
        vols_ecart = ""
        if g["status"] != "egal" and n_diff:
            vols_ecart = f'{plural(n_diff, "vol")} {"de plus" if g["flights"] > 0 else "de moins"}'
        reste = ""
        if g["ongoing"] and g["status"] == "retard":
            weeks = int(round((dt.date(self.year, 12, 31) - self.today).days / 7))
            if weeks >= 1:
                reste = f'il reste {plural(weeks, "semaine")}'
        ctx = dict(self.base_ctx(), annee_ref=g["ref_year"], en_cours=g["ongoing"], date=fmt_date(self.today),
                   ecart=self._gap_amount(g["minutes"]), vols_ecart=vols_ecart, reste=reste)
        return g["status"], self.text(key, ctx, block=False), self.text("phrase_ecart_note", ctx, block=False)

    def gap_sentence(self, disc: str) -> str:
        """Phrase du hero (paragraphe .hero-gap) ; « » sans année de comparaison."""
        status, phrase, note = self.gap_phrase(disc)
        if not phrase:
            return ""
        return f'<p class="hero-gap gap-{status}">{phrase}<span class="hero-gap-note">{note}</span></p>'

    def gap_chart_info(self, disc: str) -> Optional[dict]:
        """Annotation de la courbe de cumul (année en cours seulement) : {"year", "label", "status"}."""
        g = self.gap(disc)
        if not g or not g["ongoing"] or g["status"] == "egal":
            return None
        hours = g["minutes"] / 60
        sign = "+" if g["status"] == "avance" else "−"
        return {"year": g["ref_year"], "status": g["status"], "label": f"{sign}{fmt_readable(hours)}{NBSP}h sur {g['ref_year']}{NBSP}entière"}

    # ---------- Équivalences du hero (F2) ----------

    def equivalences(self, disc: str) -> List[str]:
        """Phrases d'équivalence (HTML) pour une discipline, dans l'ordre d'affichage. Seules celles dont la
        valeur est parlante et dont la mesure est assez complète sont proposées."""
        d = self.main(disc)
        if d["empty"]:
            return []
        k, cov = d["kpis"], d["coverage"]
        t = lambda key, **ctx: self.text(key, ctx, block=False)
        out = []
        days = k["minutes"] / 60 / 24
        if days >= EQ_MIN_TIMES:
            out.append(t("equiv_jours", valeur=fmt_readable(days), jours="jour complet" if days < 2 else "jours complets"))
        dist = k.get("distance_total")
        if dist and cov["distance"] >= MIN_COVER and dist / PARIS_MARSEILLE_KM >= EQ_MIN_TIMES:
            out.append(t("equiv_distance", valeur=fmt_readable(dist / PARIS_MARSEILLE_KM)))
        ceiling = k.get("ceiling_max")
        if ceiling:
            if ceiling >= MONT_BLANC_M:
                out.append(t("equiv_mont_blanc_depasse"))
            elif ceiling >= MONT_BLANC_NEAR * MONT_BLANC_M:
                out.append(t("equiv_mont_blanc", ecart=f"{fmt_int(MONT_BLANC_M - ceiling)}{NBSP}m"))
            elif ceiling / EIFFEL_M >= EQ_MIN_TIMES:
                out.append(t("equiv_tour_eiffel", valeur=fmt_readable(ceiling / EIFFEL_M)))
        n = k["n_flights"]
        elapsed = ((self.today - dt.date(self.year, 1, 1)).days + 1 if self.cutoff
                   else (366 if calendar.isleap(self.year) else 365))
        if n and elapsed / n >= 1.5:
            out.append(t("equiv_rythme", jours=fmt_readable(round(elapsed / n, 1) if elapsed / n < 10 else round(elapsed / n))))
        elif n and elapsed / n <= 0.7:
            out.append(t("equiv_rythme_dense", valeur=fmt_readable(n / elapsed)))
        if cov["gain"] >= MIN_COVER and cov["gain_total"] / EVEREST_M >= EQ_MIN_TIMES:
            out.append(t("equiv_everest", valeur=fmt_readable(cov["gain_total"] / EVEREST_M)))
        return out

    def equivalence_html(self, disc: str) -> str:
        items = self.equivalences(disc)
        if not items:
            return ""
        spans = "".join(f'<span class="eq-item"{"" if i == 0 else " hidden"}>{item}</span>' for i, item in enumerate(items))
        return (f'<p class="hero-eq" data-eq><span class="eq-list">{spans}</span>'
                '<button type="button" class="eq-next" data-eq-next hidden aria-label="Autre équivalence" '
                'title="Autre équivalence"><span aria-hidden="true">↻</span></button></p>')

    # ---------- Variantes (discipline / années comparées) ----------

    def _v(self, disc: str, cmp: Optional[Tuple[int, ...]], inner: str, default: bool) -> str:
        cmp_attr = "*" if cmp is None else ",".join(str(y) for y in cmp)
        hidden = "" if default else " hidden"
        return f'<div class="v" data-v-disc="{disc}" data-v-cmp="{cmp_attr}"{hidden}>{inner}</div>'

    def by_disc(self, render: Callable[[str], str]) -> str:
        """Une variante par discipline (indépendante des années comparées)."""
        return "".join(self._v(d, None, render(d), d == "all") for d in rd.DISCIPLINES)

    def by_disc_cmp(self, render: Callable[[str, Tuple[int, ...]], str]) -> str:
        """Une variante par discipline et par combinaison d'années comparées."""
        return "".join(
            self._v(d, c, render(d, c), d == "all" and c == self.default_cmp)
            for d in rd.DISCIPLINES for c in self.subsets
        )

    def empty_msg(self, disc: str) -> str:
        label = DISC_LABELS[disc].lower()
        return f'<p class="empty">Aucun vol de {label} en {self.year}.</p>'

    # ---------- Briques HTML ----------

    def section(self, anchor: str, title: str, lead: str, body: str) -> str:
        self.section_no += 1
        return (
            f'<section class="sec" id="{anchor}"><div class="wrap">'
            f'<header class="sec-head">{self._use(SECTION_ICONS.get(anchor, "s-grid"), 22, "sec-ico")}<h2>{_e(title)}</h2>'
            f'{"<div class=lead>" + lead + "</div>" if lead else ""}</header>{body}</div></section>'
        )

    def card(self, title: str, inner: str, help_key: Optional[str] = None, sub: str = "", anchor: str = "") -> str:
        help_html = ""
        if help_key and self.texts.get(help_key):
            help_html = (f'<details class="help q"><summary>Comment lire ce graphique</summary>'
                         f'{self.text(help_key)}</details>')
        sub_html = f'<p class="sub">{sub}</p>' if sub else ""
        ident = f' id="{anchor}"' if anchor else ""
        return f'<div class="card"{ident}><h3>{_e(title)}</h3>{help_html}{sub_html}{inner}</div>'

    def scroll(self, svg: str) -> str:
        return f'<div class="chart-scroll">{svg}</div>'

    def table(self, headers: List[Tuple[str, str]], rows: List[List[Tuple[str, object]]],
              table_id: str = "", extra_row_attrs: Optional[List[str]] = None, sortable: bool = True,
              bars: bool = False) -> str:
        """headers : [(libellé, "num"|"txt")] ; rows : [[(html affiché, valeur de tri), ...], ...]
        bars : classe « bars » ; report.js dessine une barre sous les colonnes « Vols » et « Temps de vol » (T47)."""
        ths = "".join(
            f'<th data-sort="{kind}">{_e(label)}</th>' if sortable else f"<th>{_e(label)}</th>"
            for label, kind in headers
        )
        body = []
        for i, row in enumerate(rows):
            attrs = extra_row_attrs[i] if extra_row_attrs else ""
            tds = "".join(f'<td{f" data-v={chr(34)}{_e(v)}{chr(34)}" if sortable else ""}{" class=txt" if headers[j][1] == "txt" and j else ""}>{cell}</td>'
                          for j, (cell, v) in enumerate(row))
            body.append(f"<tr{attrs}>{tds}</tr>")
        ident = f' id="{table_id}"' if table_id else ""
        return (f'<div class="tbl-wrap"><table class="tbl{" sortable" if sortable else ""}{" bars" if bars else ""}"{ident}>'
                f'<thead><tr>{ths}</tr></thead><tbody>{"".join(body)}</tbody></table></div>')

    # ---------- Transparence chiffrée : « sur N vols mesurés » et pastille « données partielles » (F18) ----------

    def measured(self, disc: str, measure: str) -> Tuple[int, int]:
        """(vols où la mesure existe, vols) pour la discipline, sur l'année du rapport."""
        cov = self.main(disc)["coverage"]
        return cov["measured"][measure], cov["n"]

    def not_measured(self, disc: str, key: str) -> bool:
        """Vrai si le chiffre clé dépend d'une mesure absente de tous les vols (afficher « non mesuré », pas 0 ni « – »)."""
        measure = KPI_MEASURE.get(key)
        if not measure:
            return False
        ok, n = self.measured(disc, measure)
        return n > 0 and ok == 0

    def partial_pill(self, measure: str, ok: int, n: int) -> str:
        """Pastille texte « Données partielles » (info-bulle : « Plafond : connu pour 72 vols sur 100 ») ; vide si la
        mesure manque à au plus PARTIAL_DATA_SHARE des vols."""
        if not n or (n - ok) / n <= PARTIAL_DATA_SHARE:
            return ""
        title = self.text("donnees_partielles_titre", {"mesure": MEASURE_NAMES[measure], "n": ok, "total": n}, block=False)
        return f'<span class="partial" title="{_e(title)}">{self.text("donnees_partielles", block=False)}</span>'

    def measure_note(self, disc: str, key: str, pill: bool = True) -> str:
        """« sur 72 vols mesurés » (+ pastille si > 20 % de vols sans la mesure), seulement si la mesure manque à
        certains vols mais pas à tous ; vide sinon."""
        measure = KPI_MEASURE.get(key)
        if not measure or self.not_measured(disc, key):
            return ""
        ok, n = self.measured(disc, measure)
        if ok >= n:
            return ""
        note = self.text("mesure_note", {"n": ok, "pluriel": ok > 1}, block=False)
        return f'<span class="meas-note">{note}{self.partial_pill(measure, ok, n) if pill else ""}</span>'

    def delta_pills(self, disc: str, key: str, cmp: Tuple[int, ...]) -> str:
        cur = self.r["kpi_equiv"][self.year][disc].get(key)
        pills = []
        for cy in cmp:
            ref = self.r["kpi_equiv"][cy][disc].get(key)
            pct = rd.delta_pct(cur, ref)
            kind = "flat" if pct is None or abs(pct) < 0.5 else ("up" if pct > 0 else "down")
            if kind != "flat" and key not in VOLUME_KPIS:
                kind = "n" + kind  # « nup » / « ndown » : hausse / baisse sans jugement de valeur
            arrow = "" if kind == "flat" else ("▲ " if kind.endswith("up") else "▼ ")
            title = f"Par rapport à {cy}" + (" entière" if self.cutoff else "")
            pills.append(f'<span class="delta {kind}" title="{_e(title)}"><i>{cy}</i>{arrow}{fmt_signed_pct(pct)}</span>')
        return "".join(pills)

    # ---------- Phrases d'interprétation (modèles dans report_textes.md) ----------

    def sentences(self, disc: str) -> Dict[str, str]:
        d = self.main(disc)
        out = {k: "" for k in ("synthese", "rythme", "quand", "ou", "matos", "records")}
        if d["empty"]:
            return out
        k, hl = d["kpis"], d["highlights"]
        where = DISC_IN_SENTENCE[disc]
        period = f"En {self.year}" + (f", {where}" if where else "")
        ctx = dict(self.base_ctx(), libelle_periode=period, duree=fmt_duration(k["minutes"]),
                   vols=plural(k["n_flights"], "vol"), sites=plural(k["n_sites"], "site"))
        parts = [self.text("phrase_synthese", ctx, block=False)]
        if hl["busiest_month"]:
            m = hl["busiest_month"]
            parts.append(self.text("phrase_mois_actif", dict(ctx, mois=MONTHS_LONG[m["index"]],
                                                              vols_mois=plural(m["flights"], "vol")), block=False))
        rec = d["records"]["plafond"]
        if rec:
            parts.append(self.text("phrase_record_plafond", dict(
                ctx, plafond=f"{fmt_int(rec[0]['value'])}{NBSP}m", date_plafond=fmt_date(rec[0]["date"]),
                site_plafond=rec[0]["site"]), block=False))
        out["synthese"] = " ".join(p for p in parts if p)

        rythme = []
        if hl["busiest_month"]:
            m = hl["busiest_month"]
            rythme.append(self.text("phrase_mois_actif", dict(mois=MONTHS_LONG[m["index"]],
                                                               vols_mois=plural(m["flights"], "vol")), block=False))
        if hl["longest_gap_days"] > 0:
            rythme.append(self.text("phrase_pause", {"jours_pause": plural(hl["longest_gap_days"], "jour")}, block=False))
        top_season = self._top_season(d["seasons"])
        if top_season:
            rythme.append(self.text("phrase_saison", {
                "saison": SEASON_WITH_ARTICLE[top_season],
                "duree_saison": fmt_hours(d["seasons"][top_season]["minutes"])}, block=False))
        out["rythme"] = " ".join(rythme)

        quand = []
        if hl["busiest_weekday"]:
            w = hl["busiest_weekday"]
            quand.append(self.text("phrase_jour", {"jour": DAYS_LONG[w["index"]], "vols_jour": plural(w["flights"], "vol")}, block=False))
        hours = [h for h in range(24) for _ in range(d["hours"]["flights"][h])]
        if len(hours) >= 4:
            quand.append(self.text("phrase_heures", {
                "heure_debut": f"{int(np.percentile(hours, 25))}{NBSP}h",
                "heure_fin": f"{int(np.percentile(hours, 75)) + 1}{NBSP}h"}, block=False))
        out["quand"] = " ".join(quand)

        ou = []
        if hl["top_site"]:
            s = hl["top_site"]
            ou.append(self.text("phrase_site", {"site": s["site"], "vols_site": plural(s["n"], "vol"),
                                                "duree_site": fmt_duration(s["minutes"])}, block=False))
        if disc == "all" and self.r["new_sites"]:
            n = len(self.r["new_sites"])   # les noms sont en puces sous la phrase (_new_sites_list)
            ou.append(self.text("phrase_nouveaux_sites", {
                "nouveaux": f"{n} nouveau site" if n == 1 else f"{n} nouveaux sites"}, block=False))
        # rayon d'action (F12) autour du site principal, le même que dans phrase_site (le plus de temps de vol)
        reach = rd.compute_reach(d["sites"], hl["top_site"]["site"]) if hl["top_site"] else None
        if reach and len(d["sites"]) > 1:
            if reach["km"] is not None and reach["km"] >= REACH_MIN_KM:
                ou.append(self.text("phrase_rayon", {"site_loin": reach["far"], "site_principal": reach["main"],
                                                     "distance_loin": f"{fmt_int(reach['km'])}{NBSP}km"}, block=False))
            ou.append(self.text("phrase_fidelite", {"part_site": f"{fmt_int(round(100 * reach['share']))}{NBSP}%",
                                                    "site_principal": reach["main"]}, block=False))
        out["ou"] = " ".join(ou)

        if hl["top_wing"]:
            w = hl["top_wing"]
            out["matos"] = self.text("phrase_voile", {"voile": w["voile"], "vols_voile": plural(w["n"], "vol"),
                                                       "duree_voile": fmt_duration(w["minutes"])}, block=False)
        return out

    def insight(self, disc: str, key: str) -> str:
        sentence = self.sentences(disc)[key]
        return f'<p class="insight">{sentence}</p>' if sentence else ""

    # ====================================================================
    # Sections
    # ====================================================================

    def head(self) -> str:
        title = html.unescape(re.sub(r"<[^>]+>", "", self.text("titre", self.base_ctx(), block=False)))
        return (
            '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="color-scheme" content="light dark">'
            + FAVICON +
            f"<title>{_e(title)} · {_e(self.r['pilot'])}</title>"
            "<script>(function(){var t;try{t=localStorage.getItem('rapport-theme')}catch(e){}"
            "if(!t){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}"
            "document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.add('js')})();</script>"
            # Classe « anim » posée dès le <head> : les animations des graphiques sont mises en attente
            # avant même leur premier affichage (sinon elles démarrent pendant le chargement de la page
            # et restent figées à mi-course). Filet de sécurité : si report.js n'a pas démarré après 4 s,
            # la classe est retirée et les animations reprennent normalement.
            "<script>(function(){try{if('IntersectionObserver' in window&&!(window.matchMedia&&"
            "matchMedia('(prefers-reduced-motion: reduce)').matches)){var d=document.documentElement;"
            "d.classList.add('anim');setTimeout(function(){if(!window.__rapportOk)d.classList.remove('anim')},4000)}}"
            "catch(e){}})();</script>"
        )

    def hero(self) -> str:
        ctx = self.base_ctx()

        def kpis(disc: str) -> str:
            d = self.main(disc)
            if d["empty"]:
                return '<p class="hero-base">Aucun vol pour cette discipline.</p>'
            k = d["kpis"]
            hours, mins = divmod(int(round(k["minutes"])), 60)
            dist = k.get("distance_total")
            cells = [
                (f'<span class="count" data-to="{k["n_flights"]}" data-final="{fmt_int(k["n_flights"])}">{fmt_int(k["n_flights"])}</span>',
                 "vol" if k["n_flights"] < 2 else "vols"),
                (f'<span class="count" data-to="{hours}" data-final="{fmt_int(hours)}">{fmt_int(hours)}</span><small>h</small>{mins:02d}',
                 "de vol"),
                (f'<span class="count" data-to="{k["n_sites"]}" data-final="{fmt_int(k["n_sites"])}">{fmt_int(k["n_sites"])}</span>',
                 "site" if k["n_sites"] < 2 else "sites"),
                ((f'<span class="count" data-to="{int(round(dist))}" data-final="{fmt_int(dist)}">{fmt_int(dist)}</span><small>km</small>'
                  if dist else "–"),
                 ("distance non mesurée" if self.not_measured(disc, "distance_total") else "parcourus")
                 + self.measure_note(disc, "distance_total", pill=False)),
            ]
            grid = '<div class="hero-kpis">' + "".join(
                f'<div class="hk"><span class="hk-v">{v}</span><span class="hk-l">{l}</span></div>' for v, l in cells) + "</div>"
            return grid + self.persona_html(disc) + self.gap_sentence(disc) + self.equivalence_html(disc)

        return (
            f'<header class="hero" id="top"{self.hero_attrs()}>{hero_topo()}<div class="wrap hero-inner">'
            f'<p class="eyebrow">Rapport de vol · {self.year}</p>'
            f'<h1>{self.text("titre", ctx, block=False)}</h1>'
            f'<p class="hero-sub"><a href="{_e(self.r["pilot_url"])}" target="_blank" rel="noopener">{_e(self.r["pilot"])}</a>'
            f' · {self.text("hero_periode", ctx, block=False)}</p>'
            f'<p class="hero-base">{self.text("hero_baseline", ctx, block=False)}</p>'
            f'{self.by_disc(kpis)}<p class="hero-replay js-only">{self.replay_button(True)}{self.recap_button()}</p></div></header>'
        )

    # ---------- Rejouer l'année (T30) ----------
    # Un bouton dans le hero et un dans la carte « Tes jalons » ; les libellés du panneau (construit par report.js) sont lus
    # dans data-t-* du premier bouton, comme pour #xf-tools. {{date}} et {{resume}} y sont remplacés par report.js.

    def replay_button(self, carrier: bool = False) -> str:
        phrases = ""
        if carrier:
            keep = {k: "{" + k + "}" for k in ("date", "resume")}
            keys = ("titre", "lecture", "pause", "fermer", "curseur", "prec", "suiv", "vitesse", "vol", "site", "heures",
                    "jalons", "annonce_pause", "annonce_fin", "aide")
            phrases = "".join(f' data-t-{k}="{_e(self.text("rejeu_" + k, keep, block=False))}"' for k in keys)
        return f'<button type="button" class="rp-btn" data-rejeu{phrases}>{self.text("rejeu_bouton", block=False)}</button>'

    # ---------- Mode récap (T36) : pages plein écran et image de partage, construits par report.js ----------
    # Un bouton dans le hero. Les libellés fixes sont lus dans data-t-* de ce bouton ; les chiffres et phrases propres à
    # chaque discipline sont dans le JSON #recap-data, déjà formatés ici (aucun calcul en JavaScript) : seules les valeurs
    # mensuelles, pour les mini-barres, sont des nombres bruts. Une page sans donnée est absente du JSON de la discipline.

    RECAP_LABELS = ("dialogue", "fermer", "prec", "suiv", "heures", "telecharger", "partager", "apercu", "img_record",
                    "k_couv", "k_phare", "k_mois", "k_jour", "k_site", "k_voile", "k_record", "k_portrait", "k_partage")

    def recap_button(self) -> str:
        phrases = "".join(f' data-t-{k}="{_e(self.text("recap_" + k, block=False))}"' for k in self.RECAP_LABELS)
        return f'<button type="button" class="rp-btn" data-recap{phrases}>{self.text("recap_bouton", block=False)}</button>'

    @staticmethod
    def _plain(html_text: str) -> str:
        return html.unescape(re.sub(r"<[^>]+>", "", html_text))

    def recap_disc(self, disc: str) -> Optional[dict]:
        """Entrée du récap pour une discipline : chaînes formatées en français, clés courtes (voir report.js, rcPages)."""
        d = self.main(disc)
        if d["empty"]:
            return None
        k, hl, cov = d["kpis"], d["highlights"], d["coverage"]
        t = lambda key, **ctx: self._plain(self.text(key, ctx, block=False))
        total = int(round(k["minutes"]))
        out = {"d": t("recap_disc_" + disc), "v": plural(k["n_flights"], "vol"), "ns": plural(k["n_sites"], "site"),
               "j": f'{plural(k["days_flown"], "jour")} de vol'}
        if total:
            h, m = divmod(total, 60)
            out["h"] = f"{h}{NBSP}h{NBSP}{m:02d}" if h else f"{m}{NBSP}min"
        status, phrase, _ = self.gap_phrase(disc)
        if phrase:
            out["e"] = [status, self._plain(phrase)]
        mo = hl["busiest_month"]
        if mo:
            out["m"] = [MONTHS_LONG[mo["index"]].capitalize(),
                        t("recap_mois", vols=plural(mo["flights"], "vol"), duree=fmt_duration(d["monthly"]["minutes"][mo["index"]])),
                        d["monthly"]["flights"]]
        best = hl.get("best_day")
        if best:
            out["b"] = [fmt_date(best["date"], weekday=True), self._plain(self.best_day_sentence(best))]
        top = hl["top_site"]
        if top:
            st = self.story(disc)
            news = ((st or {}).get("persona", {}).get("metrics") or {}).get("n_new_sites") or 0
            out["s"] = [top["site"],
                        t("recap_site_part", vols=plural(top["n"], "vol"), part=f"{round(100 * top['n'] / k['n_flights'])}{NBSP}%"),
                        t("recap_site_total", sites=plural(k["n_sites"], "site")),
                        t("recap_site_nouveaux", nouveaux=fmt_int(news), pluriel=news > 1) if news else ""]
        wing = next((w for w in d["wings"] if w["voile"].strip().lower() not in WING_UNKNOWN), None)
        if wing:
            out["w"] = [wing["voile"], t("recap_voile", vols=plural(wing["n"], "vol"), duree=fmt_duration(wing["minutes"]))]
        longest = d["records"]["duree"][:1]
        if longest:
            r = longest[0]
            ceiling = d["records"]["plafond"][:1]
            ok = ceiling and cov["measured"]["plafond"] >= MIN_COVER * cov["n"]      # seuil des équivalences (MIN_COVER)
            out["r"] = [fmt_duration(r["value"]), t("recap_record", date=fmt_date(r["date"], True), site=r["site"]),
                        t("recap_plafond", plafond=f"{fmt_int(ceiling[0]['value'])}{NBSP}m") if ok else ""]
        st = self.story(disc)
        if st:
            main = st["persona"]["main"]
            name, why = self._two_lines("portrait_" + main["key"], self._persona_ctx(main, st["persona"]["n"]))
            if name:
                out["p"] = [self._plain(name), self._plain(why), "p-" + main["key"]]
        return out

    def recap_json(self) -> str:
        """JSON #recap-data : {"y": année, "n": pilote, "au": « au 14 novembre » ou « », "it": titre de l'image, "if": pied de l'image,
        "t": titre de la couverture, "disc": {discipline: recap_disc}} ; seules les disciplines avec des vols sont présentes."""
        ctx = self.base_ctx()
        t = lambda key, **more: self._plain(self.text(key, dict(ctx, **more), block=False))
        data = {"y": self.year, "n": self.r["pilot"], "t": t("titre"), "it": t("recap_img_titre"), "if": t("recap_img_pied"),
                "au": t("recap_au", date=fmt_date(self.today)) if self.cutoff else "",
                "disc": {disc: e for disc in DISC_LABELS for e in [self.recap_disc(disc)] if e}}
        return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    def hero_attrs(self) -> str:
        """Teinte du halo du hero (data-main : p = parapente, m = paramoteur) : discipline qui pèse le plus en temps
        de vol pour « Tout » ; report.js la remplace par la discipline choisie."""
        sh = self.r.get("share", {})
        main_m = sh.get("paramoteur", {}).get("pct_minutes", 0) > sh.get("parapente", {}).get("pct_minutes", 0)
        return f' data-main="{"m" if main_m else "p"}"'

    def filters_summary(self) -> str:
        """Texte du bouton « Filtres » (téléphone) : discipline puis années comparées, ex. « Tout · 2025 ».
        report.js le met à jour ; cette valeur initiale correspond à l'état par défaut."""
        return " · ".join([DISC_LABELS["all"]] + [str(y) for y in self.compare if y in self.default_cmp])

    def toc_links(self) -> List[Tuple[str, str]]:
        """Sections du rapport (ancre, libellé court), dans l'ordre de la page : une seule liste pour le sommaire."""
        links = [("apercu", "Aperçu"), ("histoire", "Moments"), ("rythme", "Rythme"), ("quand", "Quand"), ("ou", "Où"),
                 ("matos", "Matériel"), ("records", "Records")]
        if self.compare:
            links.append(("comparaison", "Comparaison"))
        if self.r.get("career"):
            links.append(("carriere", "Débuts"))
        return links + [("vols", "Vols"), ("glossaire", "Aide")]

    def toc(self) -> str:
        """Sommaire : colonne collante dans la marge gauche (grand écran) ; report.js en clone la liste dans le menu
        du bouton « sommaire » de la barre. Sans JavaScript : colonne sur grand écran, bloc de liens au-dessus du
        contenu sur écran étroit."""
        items = "".join(f'<li><a href="#{a}">{_e(t)}</a></li>'
                        for a, t in self.toc_links())
        return f'<nav class="toc" aria-label="Sommaire"><p class="toc-t">Sommaire</p><ul class="toc-list">{items}</ul></nav>'

    def bar(self) -> str:
        """Barre collante en trois zones : à gauche le bouton sommaire (écran < 1280 px ; au-delà, le sommaire latéral
        le remplace), au centre les réglages (discipline, années comparées), à droite le menu « ⋯ » (thème, impression,
        raccourcis). Écran ≤ 1180 px, avec JavaScript : les réglages (#bar-ctl) deviennent un volet ouvert par le
        bouton « Filtres » ; sans JavaScript ils sont masqués sur écran étroit (ils ne servent qu'avec le script)."""
        disabled_attr = ' disabled title="Aucun vol"'
        segs = "".join(
            f'<button type="button" data-set-disc="{d}" aria-pressed="{"true" if d == "all" else "false"}"'
            f'{"" if self.has_disc(d) else disabled_attr}>{DISC_LABELS[d]}</button>'
            for d in rd.DISCIPLINES
        )
        chips = ""
        if self.compare:
            chips = '<div class="cmp" role="group" aria-label="Comparer avec"><span class="cmp-l">Comparer avec</span><span class="cmp-chips">' + "".join(
                f'<button type="button" class="chip" data-sk="{self.style_of(y)}" data-toggle-cmp="{y}" '
                f'aria-pressed="{"true" if y in self.default_cmp else "false"}" title="Comparer avec {y}">{y}</button>' for y in self.compare) + "</span></div>"
        svg = '<svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'      # taille et trait : report.css (.bar svg)
        filters_icon = svg.format(d='<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2.2"/>'
                                  '<circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>')
        toc_icon = svg.format(d='<path d="M4 7h16M4 12h16M4 17h10"/>')
        more_icon = svg.format(d='<path d="M5 12h.01M12 12h.01M19 12h.01"/>')
        return (
            '<nav class="bar" aria-label="Barre du rapport"><div class="bar-in">'
            f'<div class="bar-l"><button type="button" class="bar-btn toc-btn" id="toc-btn" aria-expanded="false">'
            f'{toc_icon}<span class="toc-cur" id="toc-cur">{_e(self.toc_links()[0][1])}</span><span class="caret" aria-hidden="true"></span></button>'
            '<div class="pop toc-menu" id="toc-menu" hidden></div></div>'
            '<button type="button" class="bar-btn filters-btn" id="filters-btn" aria-expanded="false" aria-controls="bar-ctl">'
            f'{filters_icon}<span class="sr-only">Filtres : </span><span class="filters-sum" id="filters-sum">'
            f'{_e(self.filters_summary())}</span></button>'
            '<div class="bar-ctl" id="bar-ctl">'
            '<div class="ctl-disc"><span class="cmp-l panel-only" aria-hidden="true">Discipline</span>'
            f'<div class="seg" role="group" aria-label="Discipline">{segs}</div></div>{chips}'
            '</div>'
            f'<div class="bar-r"><button type="button" class="bar-btn more-btn" id="more-btn" aria-haspopup="menu" aria-expanded="false" '
            f'aria-label="Plus d\'options">{more_icon}</button>'
            '<div class="pop more-menu" id="more-menu" role="menu" aria-labelledby="more-btn" hidden>'
            '<button type="button" role="menuitem" id="theme">Passer en thème sombre</button>'
            '<button type="button" role="menuitem" id="print">Imprimer ou enregistrer en PDF</button>'
            '<button type="button" role="menuitem" id="help-btn">Raccourcis clavier</button></div></div>'
            '<div class="read-progress" role="progressbar" aria-label="Progression dans le rapport" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="reading-progress"></span></div></div></nav>'
        )

    @staticmethod
    def top_button() -> str:
        """Bouton rond flottant « Revenir en haut » (masqué tant que report.js ne l'a pas révélé)."""
        return ('<button type="button" class="fab-top" id="back-top" aria-label="Revenir en haut du rapport" title="Revenir en haut" hidden>'
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6"/></svg></button>')

    # ---- 1. Aperçu ----

    def apercu(self) -> str:
        def kpi_cards(disc: str, cmp: Tuple[int, ...]) -> str:
            if not self.has_disc(disc):
                return self.empty_msg(disc)
            k = self.r["kpi_equiv"][self.year][disc]
            cards = []
            for key, label, kind, unit in CARD_KPIS:
                v = k.get(key)
                value = _fmt_value(kind, v)
                small = f"<small>{unit}</small>" if (unit and v is not None) else ""
                if self.not_measured(disc, key):
                    value, small = f'<span class="kpi-na">{self.text("non_mesure", block=False)}</span>', ""
                spark = f'<svg class="spark" data-spark="{KPI_SPARK[key]}" aria-hidden="true"></svg>' if key in KPI_SPARK and not self.not_measured(disc, key) else ""
                cards.append(f'<div class="kpi"><div class="kpi-l"><svg class="ki" aria-hidden="true"><use href="#ic-{KPI_ICONS[key]}"/></svg>{_e(label)}</div>'
                             f'<div class="kpi-v">{value}{small}</div>{spark}{self.measure_note(disc, key)}<div class="kpi-d">{self.delta_pills(disc, key, cmp)}</div></div>')
            return f'<div class="grid">{"".join(cards)}</div>'

        def share(disc: str) -> str:
            if not self.has_disc(disc):
                return ""
            sh = self.r["share"]
            both = disc == "all" and sh["parapente"]["n"] > 0 and sh["paramoteur"]["n"] > 0
            modes = self.modes_block(disc)
            if not both and not modes:
                return ""

            def row(label, key):
                p, m = sh["parapente"][key], sh["paramoteur"][key]
                return (f'<div class="share-row"><span>{label}</span><div class="share-bar" role="img" '
                        f'aria-label="Parapente {p:.0f} %, paramoteur {m:.0f} %">'
                        f'<span class="sp" style="width:{p:.1f}%">{p:.0f}{NBSP}%</span>'
                        f'<span class="sm" style="width:{m:.1f}%">{m:.0f}{NBSP}%</span></div></div>')
            inner = ""
            if both:
                inner = ('<div class="share">' + row("Nombre de vols", "pct_flights") + row("Temps de vol", "pct_minutes")
                         + '<div class="legend"><span class="lp"><i></i>Parapente</span><span class="lm"><i></i>Paramoteur</span></div></div>')
            if modes:
                inner += ('<h4 class="share-sub">Façons de voler</h4>' if both else "") + modes
            title = "Parapente ou paramoteur ?" if both else "Tes façons de voler"
            return f'<div class="card share-card"><h3>{title}</h3>{inner}</div>'

        lead = self.text("apercu_intro", self.base_ctx())
        body = (self.by_disc(lambda d: self.insight(d, "synthese"))
                + self.by_disc_cmp(kpi_cards) + self.by_disc(self.facts) + self.by_disc(share))
        return self.section("apercu", "L'année en un coup d'œil", lead, body)

    # ---- Faits marquants (F4) ----

    def _fact(self, icon: str, title: str, big: str, body: str) -> str:
        return (f'<div class="fact"><div class="fact-head"><span class="fact-ico">{_icon(icon)}</span>'
                f'<h3>{_e(title)}</h3></div><p class="fact-big">{big}</p>{body}</div>')

    def best_day_sentence(self, best: dict) -> str:
        """« 3 vols pour 2 h 10 min de vol, à A, B… » (cartes de faits et récap)."""
        names = best["sites"][:FACT_MAX_SITES]
        sites = ", ".join(names) + ("…" if len(best["sites"]) > FACT_MAX_SITES else "")
        return self.text("phrase_meilleure_journee", {
            "vols": plural(best["n"], "vol"), "duree": fmt_duration(best["minutes"]), "sites": sites}, block=False)

    def facts(self, disc: str) -> str:
        """Trois cartes : meilleure journée, journée type, vol de l'année (par discipline)."""
        if not self.has_disc(disc):
            return ""
        d = self.main(disc)
        k, hl = d["kpis"], d["highlights"]
        cards = []

        best = hl.get("best_day")
        if best:
            sentence = self.best_day_sentence(best)
            cards.append(self._fact("meilleure", "Ta meilleure journée",
                                    _e(fmt_date(best["date"], weekday=True)), f'<p class="fact-txt">{sentence}</p>'))

        if k["n_flights"] >= FACT_MIN_FLIGHTS and hl["busiest_weekday"] and d["sites"] and d["wings"]:
            hours = [h for h in range(24) for _ in range(d["hours"]["flights"][h])]
            site = max(d["sites"], key=lambda r: (r["n"], r["minutes"]))["site"]
            wing = max(d["wings"], key=lambda r: (r["n"], r["minutes"]))["voile"]
            sentence = self.text("phrase_journee_type", {
                "jour": DAYS_LONG[hl["busiest_weekday"]["index"]],
                "heure": f"{int(round(float(np.median(hours))))}{NBSP}h" if hours else "",
                "site": site, "voile": wing}, block=False)
            cards.append(self._fact("typique", "Ta journée type", "Le plus souvent", f'<p class="fact-txt">{sentence}</p>'))

        longest = d["records"]["duree"][:1]
        if longest:
            r = longest[0]
            flight = next((f for f in d["flights"] if f["url"] == r["url"]), {})
            extras = []
            if _num(flight.get("ceiling")):
                extras.append(f'plafond {_fmt_value("int", _num(flight["ceiling"]), "m")}')
            if _num(flight.get("distance")):
                extras.append(f'distance {_fmt_value("int", _num(flight["distance"]), "km")}')
            body = (f'<p class="fact-txt">{_e(fmt_date(r["date"], True))} · {_e(r["site"])} · {_e(r["voile"])}'
                    f'{"<br>" + _e(" · ".join(extras)) if extras else ""}'
                    f' · <a href="{_e(r["url"])}" target="_blank" rel="noopener">fiche ↗</a></p>')
            cards.append(self._fact("vol", "Ton vol de l'année", _e(fmt_duration(r["value"])), body))
        return f'<div class="facts">{"".join(cards)}</div>' if cards else ""

    # ---- Façons de voler (F19) ----

    def modes_block(self, disc: str) -> str:
        """Barres segmentées vols / temps par façon de voler, légende et phrase ; « » s'il n'y a qu'une façon."""
        modes = self.main(disc)["flight_modes"]
        if len(modes) < 2:
            return ""
        tot_n = sum(m["n"] for m in modes) or 1
        tot_min = sum(m["minutes"] for m in modes) or 1.0

        def bar(label: str, field: str, total: float) -> str:
            segs, alt = [], []
            for m in modes:
                pct = 100 * m[field] / total
                if pct <= 0:
                    continue
                text = f'{_e(m["mode"])} {pct:.0f}{NBSP}%' if pct >= 30 else (f"{pct:.0f}{NBSP}%" if pct >= 7 else "")
                segs.append(f'<span class="wc-{MODE_CSS.get(m["mode"], "autre")}" style="width:{pct:.1f}%" '
                            f'title="{_e(m["mode"])} : {pct:.0f} %">{text}</span>')
                alt.append(f'{m["mode"]} {pct:.0f} %')
            return (f'<div class="share-row"><span>{label}</span><div class="share-bar" role="img" '
                    f'aria-label="{_e(label)} : {_e(", ".join(alt))}">{"".join(segs)}</div></div>')

        legend = "".join(
            f'<li><i class="wc-{MODE_CSS.get(m["mode"], "autre")}"></i><strong>{_e(m["mode"])}</strong> '
            f'<span>{plural(m["n"], "vol")} · {fmt_hours(m["minutes"])}</span></li>' for m in modes)
        sentence = ""
        top = max(modes, key=lambda m: (m["n"], m["minutes"]))
        minor = [m for m in modes if m is not top and 100 * m["n"] / tot_n > MODE_MINORITY_PCT]
        if minor:
            m = max(minor, key=lambda x: x["n"])
            share = m["n"] / tot_n
            n_near = min(FRACTION_WORDS, key=lambda n: abs(1 / n - share))   # le « un sur n » le plus proche de la part
            fraction = FRACTION_WORDS[n_near] if abs(1 / n_near - share) <= FRACTION_MAX_GAP else None
            if fraction:
                sentence = self.text("phrase_facons", {
                    "fraction": fraction, "facon": MODE_IN_SENTENCE.get(m["mode"], "en " + m["mode"].lower()),
                    "pourcent": f"{100 * share:.0f}{NBSP}%"}, block=False)
        return ('<div class="share modes">' + (f'<p class="insight modes-sentence">{sentence}</p>' if sentence else "")
                + bar("Nombre de vols", "n", tot_n) + bar("Temps de vol", "minutes", tot_min)
                + f'<ul class="mode-legend">{legend}</ul></div>')

    # ====================================================================
    # Récit de l'année : portrait (F1), frise des jalons (F3)
    # Données : report["story"][discipline] (report_data.compute_story) ; textes : report_textes.md
    # (sections portrait_*, jalon_*) ; pictogrammes : STORY_ICONS, regroupés dans un seul
    # <svg> de symboles (story_sprite) et appelés par <use href="#ic-…"> pour limiter le poids.
    # ====================================================================

    def story(self, disc: str) -> Optional[dict]:
        return self.r.get("story", {}).get(disc)

    def story_sprite(self) -> str:
        # Les attributs de trait sont posés sur chaque <symbol> : un <use> hérite de son propre parent, pas du sprite
        attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
        symbols = "".join(f'<symbol id="ic-{k}" {attrs}>{v}</symbol>' for k, v in STORY_ICONS.items())
        return f'<svg class="sprite" width="0" height="0" aria-hidden="true">{symbols}</svg>'

    @staticmethod
    def _use(icon: str, size: int = 22, cls: str = "ico") -> str:
        return f'<svg class="{cls}" width="{size}" height="{size}" aria-hidden="true"><use href="#ic-{icon}"/></svg>'

    def _two_lines(self, key: str, ctx: dict) -> Tuple[str, str]:
        """Texte « titre (1re ligne) + phrase (suite) » de report_textes.md, rendu sans <p>."""
        raw = self.texts.get(key, "")
        head, _, rest = raw.partition("\n")
        return (render_md(head.strip(), ctx, block=False) if head.strip() else "",
                render_md(rest.strip(), ctx, block=False) if rest.strip() else "")

    # ---------- Portrait (F1) ----------

    def _persona_ctx(self, hit: dict, n: int) -> dict:
        v, key = hit.get("value"), hit["key"]
        pct = lambda x: f"{100 * x:.0f}{NBSP}%"
        hhmm = lambda h: f"{int(h)}{NBSP}h{NBSP}{int(round((h % 1) * 60)) % 60:02d}"
        ctx = {"vols": plural(n, "vol")}
        if key in ("week_end", "fidele", "treuilleur", "marcheur", "regulier"):
            ctx["valeur"] = pct(v)
        elif key in ("leve_tot", "soir"):
            ctx["valeur"] = hhmm(v)
        elif key == "marathonien":
            ctx["valeur"] = fmt_duration(v)
        elif key == "plafond":
            ctx["valeur"] = f"{fmt_int(v)}{NBSP}m"
        elif key == "polyvalent":
            ctx.update(parapente=pct(v), paramoteur=pct(1 - v))
        elif key in ("explorateur", "nomade", "libre"):
            ctx["sites"] = plural(v, "site")
        ctx["site"] = hit.get("site") or ""
        ctx["nouveaux"] = fmt_int(hit["new_sites"]) if hit.get("new_sites") else ""
        return ctx

    def persona_html(self, disc: str) -> str:
        """Bloc autonome du hero (classe .persona) : pictogramme, étiquette principale, justification, secondaires."""
        st = self.story(disc)
        if not st:
            return ""
        p = st["persona"]
        main = p["main"]
        name, why = self._two_lines("portrait_" + main["key"], self._persona_ctx(main, p["n"]))
        if not name:
            return ""
        chips = []
        for hit in p["secondary"]:
            n2, w2 = self._two_lines("portrait_" + hit["key"], self._persona_ctx(hit, p["n"]))
            if n2:
                chips.append(f'<li>{self._use("p-" + hit["key"], 16)}<strong>{n2}</strong>'
                             f'{"<span> · " + w2 + "</span>" if w2 else ""}</li>')
        more = f'<ul class="persona-more" aria-label="Autres traits">{"".join(chips)}</ul>' if chips else ""
        return (f'<div class="persona"><span class="persona-ico">{self._use("p-" + main["key"], 30)}</span>'
                f'<div class="persona-txt"><p class="persona-kicker">{self.text("portrait_titre", block=False)}</p>'
                f'<p class="persona-name">{name}</p>{"<p class=persona-why>" + why + "</p>" if why else ""}{more}</div></div>')

    # ---------- Frise des jalons (F3) ----------

    def _milestone_text(self, m: dict) -> Tuple[str, str]:
        """(titre, détail) d'un jalon."""
        f = m.get("flight")
        where = []
        if f:
            where = [f'à {f["site"]}'] + ([fmt_duration(f["minutes"])] if f["minutes"] else [])
        kind, ctx = m["type"], {}
        detail = list(where)
        if kind in ("nth_flight", "nth_hour"):
            ctx["n"] = m["n"]
        elif kind in ("record", "first") and m.get("metrics"):
            words = [JALON_RECORD_WORDS[k] for k, _ in m["metrics"]]
            ctx["records"] = words[0] if len(words) == 1 else ", le plus ".join(words[:-1]) + " et le plus " + words[-1]
            values = [_fmt_value(JALON_RECORD_FMT[k][0], v, JALON_RECORD_FMT[k][1]) for k, v in m["metrics"]]
            detail = where[:1] + values
            personal = m.get("personal") or []
            if personal:
                label = self.text("jalon_record_perso", block=False)
                if len(personal) < len(m["metrics"]):   # préciser lequel, quand le vol ne bat pas tous ses records
                    label += " (" + " et ".join(JALON_PERSO_NAMES[k] for k in personal) + ")"
                detail.append(label)
        elif kind == "best_day":
            names = m["sites"][:FACT_MAX_SITES]
            detail = [plural(m["n_flights"], "vol"), fmt_duration(m["minutes"]),
                      "à " + ", ".join(names) + ("…" if len(m["sites"]) > FACT_MAX_SITES else "")]
        elif kind == "new_site":
            ctx["site"] = f["site"]
            detail = where[1:]
            if m["others"]:
                n = len(m["others"])
                detail.append(f'puis {n} autre{"s" if n > 1 else ""} nouveau{"x" if n > 1 else ""} site{"s" if n > 1 else ""}')
        elif kind == "new_wing":
            ctx["voile"] = m["wing"]
            if m.get("others"):
                n = len(m["others"])
                detail.append(f'puis {n} autre{"s" if n > 1 else ""} nouvelle{"s" if n > 1 else ""} voile{"s" if n > 1 else ""}')
        elif kind == "comeback":
            detail = [f'après {plural(m["gap"], "jour")} sans voler'] + where[:1]
        if kind == "first" and m.get("new_site"):
            detail.append(self.text("jalon_first_new_site", block=False))
        title = self.text("jalon_" + kind, ctx, block=False)
        if kind == "first" and m.get("metrics"):
            title += " " + self.text("jalon_first_record", ctx, block=False)
        return title, " · ".join(detail)

    def _timeline(self, disc: str) -> str:
        st = self.story(disc)
        if not st or not st["milestones"]:
            return self.empty_msg(disc)
        items, dots = [], []
        days_in_year = 366 if calendar.isleap(self.year) else 365
        for i, m in enumerate(st["milestones"]):
            ident = f"jl-{disc}-{i}"
            title, detail = self._milestone_text(m)
            date = m["date"]
            gold = " gold" if m["gold"] else ""
            f = m.get("flight")
            actions = (f'<button type="button" class="tl-btn js-only" data-open-day="{date.isoformat()}">Voir la journée</button>')
            if f and f["url"]:
                actions += f'<a href="{_e(f["url"])}" target="_blank" rel="noopener">Fiche Syride ↗</a>'
            items.append(
                f'<li class="tl-item{gold}" id="{ident}" style="--i:{i}"><span class="tl-ico">{self._use(JALON_ICONS[m["type"]], 18)}</span>'
                f'<time class="tl-date" datetime="{date.isoformat()}">{_e(fmt_date(date))}</time>'
                f'<h4 class="tl-title">{title}</h4>{"<p class=tl-detail>" + _e(detail) + "</p>" if detail else ""}'
                f'<p class="tl-actions">{actions}</p></li>')
            x = 100 * (date.timetuple().tm_yday - 0.5) / days_in_year
            dots.append(f'<a class="tl-dot{gold}" href="#{ident}" tabindex="-1" style="left:{x:.1f}%" '
                        f'title="{_e(fmt_date(date))} : {_e(re.sub(r"<[^>]+>", "", title))}"></a>')
        axis = ""
        if len(items) >= 3:   # avec un ou deux jalons, un axe de l'année serait presque vide : simple liste
            months = "".join(f"<span>{_e(name)}</span>" for name in MONTHS_SHORT)
            future = ""
            if self.cutoff:
                fx = 100 * self.today.timetuple().tm_yday / days_in_year
                future = f'<span class="tl-future" style="left:{fx:.1f}%"></span>'
            axis = f'<div class="tl-axis" aria-hidden="true"><div class="tl-months">{months}</div>{future}{"".join(dots)}</div>'
        few = " tl-few" if len(items) < 3 else ""
        return (f'<div class="tl{few}">{axis}<ol class="tl-list" aria-label="Jalons de l\'année, du plus ancien au plus récent">'
                f'{"".join(items)}</ol></div>')

    def histoire(self) -> str:
        body = self.card("Tes jalons", f'<p class="rp-row js-only">{self.replay_button()}</p>' + self.by_disc(self._timeline),
                         sub=self.text("frise_intro", block=False))
        return self.section("histoire", "Ton année en moments forts", self.text("histoire_intro", self.base_ctx()), body)

    # ---- 2. Rythme ----

    def _series_cumulative(self, disc: str) -> str:
        """Une seule courbe par discipline avec TOUTES les années (rapport + comparaisons).
        L'année du rapport et la 1re comparaison sont visibles par défaut ; report.js masque ou montre
        les autres selon les boutons d'années (classes cy-<année>)."""
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        series = []
        for y in [self.year] + self.compare:
            d = self.data(y, disc)
            if d["empty"]:
                continue
            end_x = rd.x_of_date(self.today) if (y == self.year and self.cutoff) else 1.0
            series.append({"year": y, "style": self.style_of(y), "steps": d["steps"], "end_x": end_x})
        cutoff_x = rd.x_of_date(self.today) if self.cutoff else None
        visible = [self.year] + list(self.default_cmp)
        return (rc.cumulative_key(series, visible)
                + self.scroll(rc.chart_cumulative(series, cutoff_x, fmt_date_short(self.today) if self.cutoff else "",
                                                  visible_years=visible, gap=self.gap_chart_info(disc))))

    def tip_detail_id(self, text: str) -> Optional[int]:
        """Rang du texte dans #tip-details (le même texte sert aux 12 variantes d'années comparées et aux 2 mesures) ;
        report.js le recolle à l'infobulle (data-det) : bien plus léger que de le répéter dans chaque <title>."""
        if not text:
            return None
        if text not in self.tip_details:
            self.tip_details.append(text)
        return self.tip_details.index(text)

    def _bars(self, disc: str, cmp: Tuple[int, ...], kind: str, metric: str = "flights") -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        years = [self.year] + list(cmp)
        field, size = {"month": ("monthly", 12), "weekday": ("weekday", 7), "hours": ("hours", 24)}[kind]
        raw = []
        for y in years:
            d = self.data(y, disc)
            fl = [0] * size if d["empty"] else d[field]["flights"]
            mi = [0.0] * size if d["empty"] else d[field]["minutes"]
            details = ([""] * size if d["empty"] or kind != "month"
                       else d.get("monthly_details", [""] * size))
            raw.append({"year": y, "style": self.style_of(y), "flights": fl,
                        "minutes": mi, "details": [self.tip_detail_id(t) for t in details]})
        if kind == "hours":
            lo, hi = hours_window([h for s in raw for h in range(24) if s["flights"][h]])
            cats = [f"{h}{NBSP}h" for h in range(lo, hi + 1)]
            series = [dict(s, flights=s["flights"][lo:hi + 1], minutes=s["minutes"][lo:hi + 1],
                           details=s["details"][lo:hi + 1]) for s in raw]
        else:
            cats = MONTHS_SHORT if kind == "month" else DAYS_SHORT
            series = raw
        stack = self._bars_stack(disc, cmp, size, raw[0]) if kind == "month" else None
        return self.scroll(rc.chart_bars(
            cats, series, "Nombre de vols" if metric == "flights" else "Heures de vol",
            label_values=(kind != "hours" or len(cats) <= 14), metric=metric,
            month_filter=(kind == "month"),
            stack=stack, max_note=self.texts.get("barres_max_month" if metric == "flights" else "barres_max_month_hours", "") if kind == "month" else "",
        ))

    def _bars_stack(self, disc: str, cmp: Tuple[int, ...], size: int, total: dict) -> Optional[dict]:
        """Données des deux segments du graphique par mois (parapente en bas, paramoteur au-dessus) ; None si le graphique reste
        en barres simples : autre variante que « Tout » sans année comparée, une seule discipline volée cette année-là, ou vols
        d'une troisième discipline (la somme des deux segments ne retomberait pas sur le total « Tout »).
        Jour et heure n'ont plus d'empilement : sans comparaison, ils sont remplacés par la matrice (quand / T53)."""
        if disc != "all" or cmp or not (self.has_disc("parapente") and self.has_disc("paramoteur")):
            return None
        stack = {"total_label": self.texts.get("barres_total_month", "Total")}
        for key, name in (("p", "parapente"), ("m", "paramoteur")):
            d = self.data(self.year, name)
            stack[key] = {"flights": d["monthly"]["flights"], "minutes": d["monthly"]["minutes"]}
        if not all(abs(stack["p"][k][i] + stack["m"][k][i] - total[k][i]) < 1e-6
                   for k in ("flights", "minutes") for i in range(size)):
            return None
        for key, name in (("p", "parapente"), ("m", "paramoteur")):    # textes « Sites : … » de chaque discipline
            details = self.data(self.year, name).get("monthly_details", [""] * size)
            stack[key]["details"] = [self.tip_detail_id(t) for t in details]
        return stack

    def _monthly_charts(self, disc: str, cmp: Tuple[int, ...]) -> str:
        flights = self._bars(disc, cmp, "month", "flights")
        hours = self._bars(disc, cmp, "month", "hours")
        return (f'<div class="month-chart" data-month-measure="flights">{flights}</div>'
                f'<div class="month-chart" data-month-measure="hours" hidden>{hours}</div>')

    def _seasons(self, disc: str) -> str:
        """Quatre tuiles (une par saison) : heures et vols ; la saison dominante est mise en avant."""
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        seasons = self.main(disc)["seasons"]
        top = self._top_season(seasons)
        tiles = []
        for name in rd.SEASONS:
            v = seasons[name]
            hours = "0" + f"{NBSP}h" if v["minutes"] <= 0 else fmt_hours(v["minutes"])
            flag = '<span class="season-flag">Saison dominante</span>' if name == top else ""
            tiles.append(f'<div class="season{" season-top" if name == top else ""}">'
                         f'<span class="season-ico">{_icon(name, 26)}</span>'
                         f'<div class="season-name">{SEASON_LABELS[name]}</div>'
                         f'<div class="season-h">{hours}</div><div class="season-n">{plural(v["n"], "vol")}</div>{flag}</div>')
        return f'<div class="seasons">{"".join(tiles)}</div>'

    @staticmethod
    def _top_season(seasons: dict) -> Optional[str]:
        best = max(rd.SEASONS, key=lambda n: seasons[n]["minutes"])
        return best if seasons[best]["minutes"] > 0 else None

    def rythme(self) -> str:
        body = (
            self.by_disc(lambda d: self.insight(d, "rythme"))
            + self.card("Heures de vol cumulées", self.by_disc(self._series_cumulative), "rythme_aide_cumul",
                        "Le total d'heures de vol accumulées depuis le 1er janvier.")
            # Sous-titre « clique… » : visible seulement avec JavaScript (.js-only), la fiche du jour en dépend
            + self.card(f"Calendrier {self.year}", self.by_disc(self._calendar), "rythme_aide_calendrier",
                        f'<span class="js-only">{self.text("rythme_calendrier_sous_titre", block=False)}</span>')
            + self.card("Les saisons", self.by_disc(self._seasons), sub=self.text("saisons_intro", block=False))
            + self.card("Durée de tes vols", self.by_disc(self._durations))
            + self.card("Activité par mois", '<div class="metric-toggle" role="group" aria-label="Mesure affichée par mois">'
                        '<button type="button" data-month-toggle="flights" aria-pressed="true">Vols</button>'
                        '<button type="button" data-month-toggle="hours" aria-pressed="false">Heures</button></div>'
                        + self.by_disc_cmp(self._monthly_charts),
                        sub="Choisis le nombre de vols ou le temps de vol ; survole une barre pour voir les sites et voiles les plus utilisés. "
                        "Clique sur une barre de l'année pour afficher les vols de ce mois dans le tableau en bas de page.",
                        anchor="rythme-mois")
        )
        return self.section("rythme", "Le rythme de l'année", self.text("rythme_intro", self.base_ctx()), body)

    # Médiane -> (libellé, unité, mesure de couverture dans KPI_MEASURE) ; la durée est toujours connue
    MEDIAN_ITEMS = (("duree", "vol médian", "", None), ("plafond", "plafond médian", "m", "ceiling_max"),
                    ("vitesse_max", "vitesse max médiane", "km/h", "speed_max_max"), ("distance", "distance médiane", "km", "distance_max"))

    def _durations(self, disc: str) -> str:
        """Carte « Durée de tes vols » (F7) : histogramme par tranche, vol médian repéré, ligne de médianes."""
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        stats = self.main(disc)["durations"]
        medians = stats["medians"]
        median_text = fmt_duration(medians["duree"][0])
        chart = rc.chart_duration_hist(list(rd.DURATION_BIN_LABELS), stats["bins"], stats["median_bin"],
                                       f"vol médian : {median_text}", {"all": "fl0", "parapente": "seg-p", "paramoteur": "seg-m"}[disc])
        items = []
        for key, label, unit, kpi in self.MEDIAN_ITEMS:
            value = medians[key][0]
            if value is None:      # aucun vol mesuré : on n'affiche pas de médiane
                continue
            shown = fmt_duration(value) if key == "duree" else (fmt_num(value, 1) if key == "distance" and value < 10 else fmt_int(value))
            note = self.measure_note(disc, kpi, pill=False) if kpi else ""
            items.append(f'<li>{label} <strong>{shown}{NBSP + unit if unit else ""}</strong>{note}</li>')
        return (f'<p class="sub">{self.text("duree_mediane_aide", {"mediane": median_text}, block=False)}</p>'
                f'<div class="hist-wrap">{chart}</div><ul class="medians">{"".join(items)}</ul>')

    def _calendar(self, disc: str) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        daily = self.main(disc)["daily"]
        # Les deux vues sont pré-rendues ; le CSS montre l'année entière sur grand écran (et à l'impression),
        # les 12 mini-mois sur téléphone (.cal-year / .cal-months).
        return (self._rhythm_tiles(disc)
                + f'<div class="cal-year">{self.scroll(rc.chart_calendar(daily, self.year, self.cutoff))}</div>'
                f'<div class="cal-months">{rc.chart_calendar_months(daily, self.year, self.cutoff)}</div>')

    def _rhythm_tiles(self, disc: str) -> str:
        """Rangée de 4 tuiles au-dessus du calendrier (F5). Les trois premières sont des boutons : report.js
        allume dans le calendrier les jours de data-from à data-to (aria-pressed). Une tuile sans objet
        (pas de série ni de pause) est omise."""
        r = self.r["rhythm"][disc]
        if not r:
            return ""
        tiles = []

        def button(label: str, value: str, note: str, start: dt.date, end: dt.date) -> None:
            tiles.append(f'<button type="button" class="rt rt-btn" aria-pressed="false" data-from="{start.isoformat()}" '
                         f'data-to="{end.isoformat()}"><span class="rt-l">{label}</span>'
                         f'<span class="rt-v">{value}</span><span class="rt-n">{note}</span></button>')

        if r["streak"]:
            s = r["streak"]
            button("Plus longue série", plural(s["days"], "jour"), f'de vol d\'affilée, {fmt_range(s["start"], s["end"])}',
                   s["start"], s["end"])
        if r["gap"]:
            g = r["gap"]
            button("Plus longue pause", plural(g["days"], "jour"), f'sans voler, {fmt_range(g["start"], g["end"])}',
                   g["start"], g["end"])
        w = r["week"]
        button("Meilleure semaine", fmt_hours(w["minutes"]), f'en {plural(w["n"], "vol")}, semaine du lundi {fmt_date(w["start"])}',
               w["start"], w["end"])
        ctx = {"serie": plural(r["weeks_streak"], "semaine"), "weekend": f'{round(100 * r["weekend_share"])}{NBSP}%'}
        tiles.append(f'<div class="rt"><span class="rt-l">Régularité</span>'
                     f'<span class="rt-v">{r["weeks_active"]}<small> / {r["weeks_total"]} semaines</small></span>'
                     f'<span class="rt-n">{self.text("rythme_regularite_note", ctx, block=False)}</span></div>')
        return f'<div class="rt-row">{"".join(tiles)}</div>'

    # ---- 3. Quand ----

    def _week_hour_matrix(self, disc: str) -> str:
        """Matrice jour x heure de décollage (T53), pré-rendue pour la variante sans année comparée : un vrai <table>
        (lisible sans CSS ni JavaScript) dont chaque cellule écrit le nombre de vols ; la teinte (4 niveaux relatifs au maximum,
        classes l1 à l4) est un renfort, pas l'information. Balisage compact (balises de fin facultatives de <td>, <th> omises).
        Lignes = lundi à dimanche (+ colonne des totaux), colonnes = fenêtre d'heures (+ ligne des totaux) : rien n'est perdu
        par rapport aux deux histogrammes. report.js ajoute l'infobulle et la navigation aux flèches (index de ligne = jour,
        première colonne d'heure lue dans le premier <th scope=col>)."""
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        m = self.main(disc)["week_hour"]
        counts, missing = m["counts"], m["missing"]
        note = ""
        if missing:
            note = (f'<p class="mx-note">' + self.text("matrice_manquants", {"vols": plural(missing, "vol"), "pluriel": missing > 1},
                                                      block=False) + "</p>")
        used = [h for h in range(24) if any(counts[day][h] for day in range(7))]
        if not used:
            return f'<p class="empty">{self.text("matrice_vide", block=False)}</p>' + note
        lo, hi = hours_window(used)
        cols = range(lo, hi + 1)
        peak = max(max(row) for row in counts)
        top = None
        if peak >= MATRIX_FAV_MIN:     # cellule la plus chargée (à égalité : la plus longue, puis la première)
            top = max(((day, h) for day in range(7) for h in cols if counts[day][h] == peak),
                      key=lambda k: (m["minutes"][k[0]][k[1]], -k[0] * 24 - k[1]))
        both = self.has_disc("parapente") and self.has_disc("paramoteur")
        kind = {"parapente": "p", "paramoteur": "m"}.get(disc) or ("b" if both else ("m" if self.has_disc("paramoteur") else "p"))

        def level(n: int) -> int:
            return 1 + sum(n / peak > share for share in MATRIX_LEVEL_SHARES)

        head = ("<thead><tr><td></td>" + "".join(f"<th scope=col>{h}" for h in cols) + "<th scope=col>Total</tr></thead>")
        rows = []
        for day in range(7):
            cells = "".join(
                (f'<td class="l{level(counts[day][h])} top">' if top == (day, h) else f"<td class=l{level(counts[day][h])}>") + str(counts[day][h])
                if counts[day][h] else "<td>"
                for h in cols)
            rows.append(f"<tr><th scope=row>{DAYS_SHORT[day]}{cells}<td class=t>{sum(counts[day][h] for h in cols)}</tr>")
        foot = ("<tfoot><tr><th scope=row>Total" + "".join(f"<td class=t>{sum(counts[day][h] for day in range(7))}" for h in cols)
                + f"<td class=t>{sum(sum(counts[day][h] for h in cols) for day in range(7))}</tr></tfoot>")
        fav = ""
        if top:
            fav = '<p class="mx-fav">' + self.text("matrice_favori", {
                "jour": DAYS_LONG[top[0]], "heure_debut": f"{top[1]}{NBSP}h", "heure_fin": f"{top[1] + 1}{NBSP}h",
                "vols": plural(peak, "vol")}, block=False) + "</p>"
        key = ('<p class="mx-key" aria-hidden="true">Moins <i class=l1></i><i class=l2></i><i class=l3></i><i class=l4></i> Plus</p>')
        return (f'{fav}<div class="mx-box mx-{kind}"><div class="mx-scroll"><table class="mx" style="--n:{len(cols)}">'
                f'<caption class="sr-only">Nombre de vols par jour de la semaine et heure de décollage</caption>'
                f'{head}<tbody>{"".join(rows)}</tbody>{foot}</table></div>{key}{note}</div>')

    def quand(self) -> str:
        """Sans année comparée : une matrice jour x heure (3 variantes, une par discipline) ; avec au moins une année
        comparée : les deux histogrammes (jour, heure), qui superposent les années."""
        def render(d: str, c: Tuple[int, ...]) -> str:
            if not c:
                return self.card("Tes créneaux de vol", self._week_hour_matrix(d), "quand_aide_matrice",
                                 sub=self.text("matrice_sous_titre", block=False))
            return ('<div class="grid-2">'
                    + self.card("Vols par jour de la semaine", self._bars(d, c, "weekday"), "quand_aide")
                    + self.card("Vols par heure de décollage", self._bars(d, c, "hours")) + "</div>")

        body = self.by_disc(lambda d: self.insight(d, "quand")) + self.by_disc_cmp(render)
        return self.section("quand", "Quand vole-t-on ?", self.text("quand_intro", self.base_ctx()), body)

    # ---- 4. Où ----

    def new_site_dates(self) -> Dict[str, dt.date]:
        """Sites découverts cette année (jamais volés les années précédentes) -> date du premier vol."""
        return {s["site"]: s["first_date"] for s in self.r["new_sites"]}

    def _new_sites_list(self) -> str:
        """Nouveaux sites de l'année (D26) : une puce par site (nom + date de découverte), triés par date ; au-delà de
        NEW_SITES_SHOWN, le reste est replié dans un <details>. report.js fait de chaque nom un bouton vers la fiche du site."""
        sites = sorted(self.r["new_sites"], key=lambda s: (s["first_date"], s["site"]))
        if not sites:
            return ""
        item = lambda s: (f'<li><span class="ns-n">{_e(s["site"])}</span> <span class="ns-d">{fmt_date_short(s["first_date"])}</span></li>')
        head, rest = sites[:NEW_SITES_SHOWN], sites[NEW_SITES_SHOWN:]
        more = ""
        if rest:
            more = (f'<details class="ns-more"><summary>+{NBSP}{len(rest)} autre{"s" if len(rest) > 1 else ""}</summary>'
                    f'<ul class="ns-list">{"".join(item(s) for s in rest)}</ul></details>')
        return (f'<div class="ns" role="group" aria-label="Sites découverts cette année, avec la date du premier vol">'
                f'<ul class="ns-list">{"".join(item(s) for s in head)}</ul>{more}</div>')

    def _sites_table(self, disc: str) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        new = self.new_site_dates()
        chip = '<span class="new-chip" title="Site découvert cette année">nouveau</span>'
        rows = [[(_e(s["site"]) + (" " + chip if s["site"] in new else ""), s["site"]), (str(s["n"]), s["n"]),
                 (fmt_duration(s["minutes"]), s["minutes"]),
                 (fmt_duration(s["duration_mean"]), s["duration_mean"]),
                 (_fmt_value("num", s["speed_avg_mean"], "km/h"), s["speed_avg_mean"] or 0)]
                for s in self.main(disc)["sites"]]
        # .sites-tbl : report.js transforme chaque nom de site en bouton qui ouvre la fiche du site (F22)
        return '<div class="sites-tbl">' + self.table(
            [("Site", "txt"), ("Vols", "num"), ("Temps de vol", "num"), ("Durée moyenne", "num"), ("Vitesse moy.", "num")],
            rows, bars=True) + "</div>"

    def map_data_json(self) -> str:
        """Données de la carte et de la fiche de site, lues par report.js :
        {"z": [[site le plus volé, [sites de la zone]], ...] (ordre des zones = data-zone),
         "new": {site: date ISO du premier vol} pour les sites découverts cette année}."""
        zones = rd.compute_map_zones(self.main("all")["sites"])
        data = {"z": [[z["top"], z["sites"]] for z in zones],
                "new": {k: v.isoformat() for k, v in self.new_site_dates().items()}}
        return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    def _map_block(self) -> str:
        """Carte des sites par zones (T46) : une vue d'ensemble (tous les sites, un halo par zone) et une vue zoomée par zone ;
        une seule vue si tous les sites forment une seule zone. Rendue une fois (toutes disciplines) : report.js
        masque les sites de l'autre discipline, recalcule les tailles (vols / heures) et n'affiche qu'une vue.
        Sans JavaScript, toutes les vues sont visibles l'une sous l'autre."""
        sites = self.main("all")["sites"]
        placed = [s for s in sites if s.get("coords")]
        if not placed:
            return rc.empty_chart("Positions des sites indisponibles (pas de trace GPX pour ces vols).", 760, 140)
        zones = rd.compute_map_zones(sites)
        by_name = {s["site"]: s for s in placed}
        new = self.new_site_dates()
        disc_sites = {d: {s["site"] for s in self.main(d).get("sites", [])} for d in ("parapente", "paramoteur")}

        def site_item(s: dict) -> dict:
            in_p, in_m = s["site"] in disc_sites["parapente"], s["site"] in disc_sites["paramoteur"]
            code = "b" if in_p and in_m else ("m" if in_m else "p")
            tip = f'{s["site"]} : {plural(s["n"], "vol")} · {fmt_duration(s["minutes"])}'
            if s["site"] in new:
                tip += f' · nouveau site, découvert le {fmt_date(new[s["site"]])}'
            return {"coords": s["coords"], "n": s["n"], "minutes": s["minutes"], "label": s["site"], "sub": "",
                    "cls": f"map-dot k-{code}", "ring": s["site"] in new, "attrs": f'data-site="{_e(s["site"])}"', "tip": tip}

        views = []   # (titre, légende de la vue, svg)
        zone_view = {}
        if len(zones) > 1:
            for zi, z in enumerate(zones):
                if len(z["sites"]) > 1 and len(zone_view) < MAP_MAX_ZONE_VIEWS:
                    zone_view[zi] = len(zone_view) + 1
            # Vue d'ensemble : tous les sites à leur position exacte ; chaque zone zoomable est entourée d'un halo
            # (étiqueté à la place de ses sites) qui ouvre sa vue
            items, groups = [], []
            for zi, z in enumerate(zones):
                first = len(items)
                for n in z["sites"]:
                    it = site_item(by_name[n])
                    if zi in zone_view:
                        it["label"] = None
                        it["attrs"] += f' data-in-zone="{zi}"'
                    items.append(it)
                if zi not in zone_view:
                    continue
                count = f'{plural(len(z["sites"]), "site")} · {plural(z["n"], "vol")}'
                groups.append({"members": list(range(first, len(items))), "n": z["n"], "label": z["top"], "sub": count,
                               "attrs": f'data-halo="{zi}" data-go="{zone_view[zi]}"',
                               "tip": f'{z["name"]} : {count} · {fmt_duration(z["minutes"])}. Clique pour zoomer sur la zone.'})
            # Seules les zones affichées (avec bouton et halo) sont comptées ; les autres sites sont dits « isolés »
            n_alone = sum(len(z["sites"]) for zi, z in enumerate(zones) if zi not in zone_view)
            zones_txt = plural(len(zone_view), "zone") + (f" et {plural(n_alone, 'site')} isolé{'s' if n_alone > 1 else ''}" if n_alone else "")
            views.append(("Vue d'ensemble", f"{zones_txt} · {plural(len(placed), 'site')}",
                          rc.chart_map_view(items, f"Vue d'ensemble : {plural(len(placed), 'site')} de vol, "
                                            f"{zones_txt}", max_labels=10, r_top=MAP_OVERVIEW_R,
                                            groups=groups, relax=False)))
            for zi, vi in sorted(zone_view.items(), key=lambda kv: kv[1]):
                z = zones[zi]
                members = [site_item(by_name[n]) for n in z["sites"]]
                views.append((z["name"], f'{plural(len(members), "site")}, {plural(z["n"], "vol")}',
                              rc.chart_map_view(members, f'Carte de la zone {z["name"]} : {plural(len(members), "site")}',
                                                max_labels=12)))
        else:
            views.append(("", f"{plural(len(placed), 'site')}", rc.chart_map_view(
                [site_item(s) for s in placed], f"Carte des {plural(len(placed), 'site')} de vol", max_labels=12)))

        tools = ""
        if len(views) > 1:
            buttons = ['<button type="button" data-map-view="0" aria-pressed="true">Vue d’ensemble</button>']
            for zi, vi in sorted(zone_view.items(), key=lambda kv: kv[1]):
                z = zones[zi]
                buttons.append(f'<button type="button" data-map-view="{vi}" data-zone="{zi}" aria-pressed="false">'
                               f'{_e(z["top"])} <span class="mz-n">{plural(z["n"], "vol")}</span></button>')
            tools += f'<div class="map-tabs" role="group" aria-label="Zone affichée sur la carte">{"".join(buttons)}</div>'
        tools += ('<div class="metric-toggle" role="group" aria-label="Taille des cercles">'
                  '<button type="button" data-map-measure="n" aria-pressed="true">Vols</button>'
                  '<button type="button" data-map-measure="h" aria-pressed="false">Heures</button></div>')
        figs = "".join(
            f'<figure class="map-view" data-map-view="{i}">'
            + (f'<figcaption class="map-cap"><b>{_e(title)}</b> · {_e(cap)}</figcaption>' if title else "")
            + self.scroll(svg) + "</figure>"
            for i, (title, cap, svg) in enumerate(views))

        key = ['<span class="mk-item"><i class="mk-size" aria-hidden="true"></i>'
               '<span data-map-size-label>taille du cercle : nombre de vols</span></span>']
        if any(s["site"] in new for s in placed):
            key.append('<span class="mk-item"><i class="mk-new" aria-hidden="true"></i>anneau or en tirets : site découvert cette année</span>')
        if disc_sites["parapente"] and disc_sites["paramoteur"]:
            key.append('<span class="mk-item mk-disc"><i class="mk-p" aria-hidden="true"></i>parapente</span>'
                       '<span class="mk-item mk-disc"><i class="mk-m" aria-hidden="true"></i>paramoteur</span>'
                       '<span class="mk-item mk-disc"><i class="mk-b" aria-hidden="true"></i>les deux</span>')
        if len(views) > 1:
            key.append('<span class="mk-item"><i class="mk-zone" aria-hidden="true"></i>zone : clique pour zoomer</span>')
        note = ""
        missing = [s["site"] for s in sites if not s.get("coords")]
        if missing:
            note = (f'<p class="map-note">{plural(len(missing), "site")} sans position connue, absent{"s" if len(missing) > 1 else ""} '
                    f'de la carte : {_e(", ".join(missing))}.</p>')
        hint = '<p class="map-hint js-only">Touche ou clique un cercle pour ouvrir la fiche du site.</p>'
        return (f'<div class="map-box" data-map data-disc="all"><div class="map-tools js-only">{tools}</div>{figs}'
                f'<div class="map-key">{"".join(key)}</div>{hint}{note}</div>')

    def ou(self) -> str:
        body = (
            self.by_disc(lambda d: self.insight(d, "ou") + (self._new_sites_list() if d == "all" and self.sentences(d)["ou"] else ""))
            + self.card("Carte des sites", self._map_block(), "ou_aide_carte", anchor="carte-sites")
            + self.card("Sites pratiqués", self.by_disc(self._sites_table),
                        sub="Clique sur un titre de colonne pour trier<span class=js-only>, sur un site pour ouvrir sa fiche</span>.")
        )
        return self.section("ou", "Où as-tu volé ?", self.text("ou_intro", self.base_ctx()), body)

    # ---- 5. Matériel ----

    def _wings_table(self, disc: str) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        rows = [[(_e(w["voile"]), w["voile"]), (str(w["n"]), w["n"]), (fmt_duration(w["minutes"]), w["minutes"]),
                 (fmt_duration(w["duration_mean"]), w["duration_mean"]),
                 (_fmt_value("num", w["speed_avg_mean"], "km/h"), w["speed_avg_mean"] or 0),
                 (_fmt_value("int", w["gain_max"], "m"), w["gain_max"] or 0),
                 (_fmt_value("num", w["vario_max"], "m/s"), w["vario_max"] or 0),
                 (_fmt_value("num", w["g_max"], "g"), w["g_max"] or 0)]
                for w in self.main(disc)["wings"]]
        return self.table([("Voile", "txt"), ("Vols", "num"), ("Temps de vol", "num"), ("Durée moy.", "num"),
                           ("Vitesse moy.", "num"), ("Gain max", "num"), ("Vario max", "num"), ("g max", "num")], rows, bars=True)

    def _instruments_table(self, disc: str) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        items = self.main(disc)["instruments"]
        if not items:
            return '<p class="empty">Aucun instrument renseigné.</p>'
        rows = [[(_e(i["instrument"]), i["instrument"]), (str(i["n"]), i["n"]), (fmt_duration(i["minutes"]), i["minutes"])]
                for i in items]
        return self.table([("Instrument", "txt"), ("Vols", "num"), ("Temps de vol", "num")], rows, bars=True)

    def _wing_ribbon(self) -> str:
        """Carte vide « voile × mois » : report.js la remplit depuis #flights-data (tableau .mx, voir renderRibbon).
        Les phrases à trous (voile du moment, une seule voile) sont dans data-t-* ; {{...}} y est remplacé par report.js."""
        def tpl(key: str, **ctx) -> str:
            keep = {k: "{" + k + "}" for k in ("voile", "vols", "duree")}
            keep.update(ctx)
            return _e(self.text(key, keep, block=False))
        return ('<div class="card rb-card js-only" data-days="%d" data-t-now="%s" data-t-one="%s"><h3>Tes voiles au fil des mois</h3>'
                '<p class="sub">%s</p><p class="rb-now" hidden></p><div class="rb-body"></div></div>'
                % (WING_NOW_DAYS, tpl("voile_du_moment", jours=WING_NOW_DAYS), tpl("ruban_une_voile"),
                   self.text("ruban_sous_titre", block=False)))

    def matos(self) -> str:
        body = (
            self.by_disc(lambda d: self.insight(d, "matos"))
            + self.card("Voiles utilisées", self.by_disc(self._wings_table))
            + self._wing_ribbon()
            + self.card("Instruments", self.by_disc(self._instruments_table))
        )
        return self.section("matos", "Avec quel matériel ?", self.text("matos_intro", self.base_ctx()), body)

    # ---- 6. Records ----

    # Libellés des critères dans la phrase « Tu as battu 2 records personnels… »
    RECORD_NAMES = {"plafond": "plafond", "vitesse_max": "vitesse max", "distance": "distance", "vario": "vario",
                    "g": "facteur G", "duree": "durée de vol"}

    def _record_delta(self, kind: str, unit: str, delta: float) -> str:
        """Écart d'un record battu : « +180 m », « +12 min » (une décimale si l'entier arrondi serait nul)."""
        if kind == "int" and delta < 0.95:
            kind = "num"
        return "+" + _fmt_value(kind, delta, unit)

    def _records_sentence(self, disc: str) -> str:
        """« Tu as battu 2 records personnels cette année : plafond et distance. » ; vide si aucun."""
        beaten = self.r["records_beaten"].get(disc, {})
        names = [self.RECORD_NAMES[k] for k in RECORD_LABELS if k in beaten]
        if not names:
            return ""
        liste = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " et " + names[-1]
        sentence = self.text("records_battus", {"n": len(names), "pluriel": len(names) > 1, "liste": liste}, block=False)
        return f'<p class="insight">{sentence}</p>'

    def _records(self, disc: str) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        hist = self.r["records_history"][disc]
        cards = []
        for key, (title, unit, kind) in RECORD_LABELS.items():
            rows = self.main(disc)["records"].get(key, [])
            if not rows:
                continue
            top = rows[0]["value"]
            items = []
            for i, r in enumerate(rows, 1):
                pill = f' <span class="pill {DISC_PILL[r["discipline"]]}">{_e(r["discipline"])}</span>' if disc == "all" and r["discipline"] in DISC_PILL else ""
                width = max(6.0, 100 * r["value"] / top) if top else 0
                first = ' class="top1"' if i == 1 else ""
                items.append(
                    f'<li{first}><span class="rank">{i}</span><div><div class="rec-meta"><strong>{_e(fmt_date(r["date"]))}</strong>{pill}<br>'
                    f'{_e(r["site"])} · {_e(r["voile"])} · <a href="{_e(r["url"])}" target="_blank" rel="noopener">fiche ↗</a></div></div>'
                    f'<span class="rec-val">{_fmt_value(kind, r["value"], unit)}</span>'
                    f'<div class="bar-rec"><span style="width:{width:.0f}%"></span></div></li>')
            beaten, best = self.r["records_beaten"][disc].get(key), hist["best"].get(key)
            head, gain, foot = "", "", []
            if beaten:
                head = f'<span class="rec-new">{self._use("j-star", 16)}{self.text("record_nouveau", block=False)}</span>'
                gain = (f'<p class="rec-gain">' + self.text("record_ecart", {
                    "ecart": self._record_delta(kind, unit, beaten["delta"]), "annee": beaten["previous_year"]}, block=False) + '</p>')
            elif best:   # record des années précédentes, pour situer l'année
                foot.append(self.text("record_ton", {"valeur": _fmt_value(kind, best["value"], unit),
                                                     "annee": best["year"]}, block=False))
            n_ok, total = hist["measured"].get(key, (0, 0))
            pill = ""
            if 0 < n_ok < total:
                foot.append(self.text("record_mesures", {"n": n_ok, "total": total}, block=False))
                pill = self.partial_pill(key, n_ok, total) if key in MEASURE_NAMES else ""
            foot_html = f'<p class="rec-foot">{" · ".join(foot)}</p>' if foot else ""
            new = " is-new" if beaten else ""
            cards.append(f'<div class="record{new}"><h3><span>{_e(title)}{pill}</span>{head}</h3>{gain}<ol>{"".join(items)}</ol>{foot_html}</div>')
        if not cards:
            return '<p class="empty">Pas de mesure disponible.</p>'
        return f'{self._records_sentence(disc)}<div class="records">{"".join(cards)}</div>'

    def records(self) -> str:
        scatter = ('<div class="card sc-card js-only"><h3>Tous tes vols d\'un coup d\'œil</h3>'
                   f'<p class="sub">{self.text("scatter_sous_titre", block=False)}</p>'
                   '<div class="metric-toggle" role="group" aria-label="Axes du graphique">'
                   '<button type="button" data-sc-axes="c" aria-pressed="true">Durée × plafond</button>'
                   '<button type="button" data-sc-axes="km" aria-pressed="false">Durée × distance</button></div>'
                   '<p class="sc-key" hidden></p><div class="chart-scroll"></div><p class="mx-note"></p></div>')
        body = self.by_disc(self._records) + scatter + f'<details class="help card"><summary>À propos des records</summary>{self.text("records_aide")}</details>'
        return self.section("records", "Tes records", self.text("records_intro", self.base_ctx()), body)

    # ---- 7. Comparaison ----

    def _compare_table(self, disc: str, cmp: Tuple[int, ...]) -> str:
        if not self.has_disc(disc):
            return self.empty_msg(disc)
        if not cmp:
            return f'<p class="empty">{self.text("comparaison_aucune", block=False)}</p>'
        headers = [("Indicateur", "txt"), (str(self.year), "num")]
        for cy in cmp:
            headers += [(str(cy), "num"), (f"Écart / {cy}", "num")]
        rows = []
        for key, label, kind, unit in COMPARE_ROWS:
            cur = self.r["kpi_equiv"][self.year][disc].get(key)
            shown = self.text("non_mesure", block=False) if self.not_measured(disc, key) else _fmt_value(kind, cur, unit)
            row = [(_e(label), label), (f"<strong>{shown}</strong>{self.measure_note(disc, key)}", cur or 0)]
            for cy in cmp:
                ref = self.r["kpi_equiv"][cy][disc].get(key)
                row += [(_fmt_value(kind, ref, unit), ref or 0), (self.delta_pills(disc, key, (cy,)).replace(f"<i>{cy}</i>", ""), rd.delta_pct(cur, ref) or 0)]
            rows.append(row)
        return self.table(headers, rows, sortable=False)

    def comparaison(self) -> str:
        if not self.compare:
            return ""
        note = self.text("comparaison_date", self.base_ctx()) if self.cutoff else ""
        body = (f'<div class="card">{self.by_disc_cmp(self._compare_table)}'
                f'{"<p class=sub>" + note + "</p>" if note else ""}</div>')
        return self.section("comparaison", "Par rapport aux années précédentes", self.text("comparaison_intro", self.base_ctx()), body)

    # ---- 7 bis. Depuis tes débuts (F16) ----

    def carriere(self) -> str:
        c = self.r.get("career")
        if not c:
            return ""
        ongoing = self.cutoff is not None
        cards = []
        n_dist = c["distance_n"]
        dist_note = (f'<span class="kpi-note">{self.text("record_mesures", {"n": n_dist, "total": c["flights"]}, block=False)}</span>'
                     if 0 < n_dist < c["flights"] else "")
        for label, value, unit, note in (
                ("Heures de vol", fmt_int(c["minutes"] / 60), "h", ""), ("Vols", fmt_int(c["flights"]), "", ""),
                ("Sites différents", fmt_int(c["sites"]), "", ""),
                ("Distance totale", fmt_int(c["distance"]) if n_dist else "–", "km" if n_dist else "", dist_note)):
            small = f"<small>{unit}</small>" if unit else ""
            cards.append(f'<div class="kpi"><div class="kpi-l">{label}</div><div class="kpi-v">{value}{small}</div>'
                         f'<div class="kpi-d">{note}</div></div>')
        by_year = {y["year"]: y for y in c["years"]}
        best = by_year[c["best_year"]]
        if c["best_year"] == self.year:
            sentence = self.text("carriere_record" if ongoing else "carriere_record_fini", {"annee": self.year}, block=False)
        else:
            sentence = self.text("carriere_meilleure", {"annee": c["best_year"],
                                                         "valeur": fmt_hours(best["p_min"] + best["m_min"], 0)}, block=False)
        charts = "".join(
            f'<div data-career-measure="{m}"{"" if m == "hours" else " hidden"}>'
            + rc.chart_career(c["years"], m, self.year, c["best_year"] if m == "hours" else c["best_flights_year"], ongoing)
            + "</div>" for m in ("hours", "flights"))
        toggle = ('<div class="metric-toggle js-only" role="group" aria-label="Mesure affichée par année">'
                  '<button type="button" data-career-toggle="hours" aria-pressed="true">Heures</button>'
                  '<button type="button" data-career-toggle="flights" aria-pressed="false">Vols</button></div>')
        body = (f'<p class="insight">{sentence}</p><div class="grid career-kpis">{"".join(cards)}</div>'
                + self.card("Tes années de vol", toggle + charts, sub=self.text("carriere_graphique", block=False)))
        lead = self.text("carriere_intro", {"premier_vol_carriere": fmt_date(c["first_date"], True)})
        return self.section("carriere", "Depuis tes débuts", lead, body)

    # ---- 8. Liste des vols ----

    def vols(self) -> str:
        flights = self.main("all")["flights"]
        # Records de l'année (n° 1 toutes disciplines, mêmes que la section Records) : url du vol -> colonnes concernées
        top = {}
        for key in RECORD_TITLES:
            best = self.main("all")["records"].get(key)
            if best:
                top.setdefault(best[0]["url"], set()).add(key)
        rows, attrs = [], []
        for f in flights:
            rec = top.get(f["url"], ())

            def val(col: str, kind: str, unit: str, value) -> Tuple[str, object]:
                text = _fmt_value(kind, value, unit)
                if col in rec:   # record de l'année : gras + or + libellé (jamais la couleur seule)
                    title = _e(RECORD_TITLES[col])
                    text = f'<b class="rec-cell" title="{title}">{text}<span class="sr-only"> ({title})</span></b>'
                return text, value or 0

            pill = f'<span class="pill {DISC_PILL.get(f["discipline"], "pill-p")}">{_e(f["discipline"])}</span>'
            rows.append([
                (_e(fmt_date(f["date"], True)), f["date"].toordinal()),
                (pill, f["discipline"]),
                (_e(f["mode"] or "–"), f["mode"]),
                (_e(f["site"]), f["site"]), (_e(f["voile"]), f["voile"]),
                val("duree", "dur", "", f["minutes"]),
                val("distance", "int", "km", _num(f["distance"])),
                val("plafond", "int", "m", _num(f["ceiling"])),
                val("vitesse_max", "int", "km/h", _num(f["speed_max"])),
                (f'<a href="{_e(f["url"])}" target="_blank" rel="noopener">fiche ↗</a>', ""),
            ])
            text = f'{f["site"]} {f["voile"]} {f["discipline"]} {f["mode"]}'.lower()
            attrs.append(f' data-disc="{_e(f["discipline"])}" data-month="{f["date"].month}" data-text="{_e(text)}"')
        headers = [("Date", "num"), ("Type", "txt"), ("Façon", "txt"), ("Site", "txt"), ("Voile", "txt"), ("Durée", "num"),
                   ("Distance", "num"), ("Plafond", "num"), ("Vit. max", "num"), ("Syride", "txt")]
        table = self.table(headers, rows, "flights", attrs)
        month_options = ''.join(f'<option value="{i}">{name}</option>' for i, name in enumerate(MONTHS_LONG, 1))
        keep = {k: "{" + k + "}" for k in ("filtre", "valeur", "vols", "total")}
        phrases = "".join(f' data-t-{k}="{_e(self.text("xf_" + k, keep, block=False))}"'
                          for k in ("sr", "puce", "voir", "annonce", "retires", "site"))
        tools = (f'<div class="tools" id="xf-tools"{phrases}><input id="q" type="search" placeholder="Filtrer par site, voile, façon…" aria-label="Filtrer les vols">'
                 f'<label class="month-filter" for="flight-month">Mois <select id="flight-month"><option value="">Toute l’année</option>{month_options}</select></label>'
                 '<button type="button" class="reset-filter" id="reset-flight-filters">Effacer les filtres</button>'
                 '<span class="xf-chips" id="xf-chips"></span>'
                 '<a class="back-chart" id="back-to-months" href="#rythme-mois" hidden>↑ Revenir au graphique</a>'
                 '<span class="count-info" id="flights-info"></span></div>')
        return self.section("vols", "Tous tes vols", self.text("vols_intro", self.base_ctx()), f'<div class="card">{tools}{table}</div>')

    # ---- 9. Aide et pied de page ----

    def _coverage_table(self, disc: str) -> str:
        """Tableau « Données et limites » (F18) : origine des statistiques et mesures disponibles, pour l'année du rapport
        et sur tous les vols du pilote ; barres fines = part des vols. Une mesure absente de tous les vols : « non mesuré »."""
        year_cov = self.main(disc)["coverage"] if self.has_disc(disc) else None
        all_cov = self.r["coverage_all"].get(disc)
        if not year_cov and not all_cov:
            return ""

        def cell(count: Optional[int], n: int, measure: Optional[str] = None) -> Tuple[str, object]:
            if count is None or not n:
                return "–", -1
            if measure and count == 0:
                return f'<span class="cov-na">{self.text("non_mesure", block=False)}</span>', 0
            text = self.text("couverture_cellule", {"n": count, "total": n}, block=False)
            pill = self.partial_pill(measure, count, n) if measure else ""
            bar = f'<span class="cov-bar" aria-hidden="true"><i style="width:{100 * count / n:.0f}%"></i></span>'
            return f'<span class="cov-n">{text}{pill}</span>{bar}', count / n

        def rows(spec: List[Tuple[str, Callable[[dict], Optional[int]], Optional[str]]]) -> List[list]:
            out = []
            for label, getter, measure in spec:
                row = [(_e(label), label)]
                for cov in (year_cov, all_cov):
                    row.append(cell(getter(cov) if cov else None, cov["n"] if cov else 0, measure))
                out.append(row)
            return out

        headers = [("", "txt"), (f"En {self.year}", "txt"), ("Toutes années", "txt")]
        src = lambda key: (lambda c: c["sources"][key] if c["sources"] else None)
        origin = rows([("Avec trace GPX", src("gpx"), None), ("Fiche Syride seule", src("fiche"), None),
                       ("Sans statistiques", src("aucune"), None),
                       ("Placés sur la carte", lambda c: None if c["no_position"] is None else c["n"] - c["no_position"], None)])
        measures = rows([(MEASURE_NAMES[key], (lambda k: lambda c: c["measured"][k])(key), key) for key, _ in rd.MEASURE_COLUMNS])
        intro = self.text("couverture_intro", dict(self.base_ctx(), debut=bool(all_cov)), block=False)
        return (f'<div class="cov"><p class="cov-intro">{intro}</p>'
                f'{self.table(headers, origin, sortable=False)}'
                f'<h4 class="cov-sub">{self.text("couverture_mesures", block=False)}</h4>'
                f'{self.table(headers, measures, sortable=False)}</div>')

    def glossaire(self) -> str:
        glossary = md_to_html(self.texts.get("glossaire", "")).replace("<ul>", '<ul class="glossary">', 1)
        limits = md_to_html(self.texts.get("limites", ""))
        hint = '<p class="kbd-hint js-only">' + md_to_html(self.texts.get("aide_raccourcis", "")).replace("<p>", "").replace("</p>", "") + "</p>"
        body = (f'<div class="card"><h3>Glossaire</h3>{glossary}</div>'
                f'<div class="card notes" id="donnees-limites"><h3>Données et limites</h3>{self.by_disc(self._coverage_table)}{limits}{hint}</div>')
        return self.section("glossaire", "Comprendre les chiffres", "", body)

    def footer(self) -> str:
        return f'<footer>{self.text("pied_de_page", self.base_ctx(), block=False)}</footer>'

    # ---- Socle de données JSON (6.2) ----

    def flights_json(self) -> str:
        """
        Liste compacte des vols de l'année du rapport (toutes disciplines, jusqu'à la date de coupure),
        lue une fois par report.js (index par date : fiche du jour, puis fiche de site, filtres).

        Format : {"u": préfixe des URL Syride, "f": [vol, ...]}, vols triés par date puis heure.
        Clés d'un vol (valeur absente = null ; une mesure à 0 est considérée comme absente) :
            d   date ISO « AAAA-MM-JJ »            t   heure de décollage « HH:MM »
            s   site                               w   voile
            k   discipline : "p" parapente, "m" paramoteur
            f   façon de voler (« Site », « Treuil », « Rando », « Bord de mer », « Moteur »)
            mn  durée (minutes, 2 décimales)            km  distance (km, 1 décimale)
            c   plafond (m, entier)                v   vitesse max (km/h, entier)
            z   vario max (m/s, 1 décimale)        n   num_activite : fiche = u + n
            url URL complète, seulement si elle ne suit pas le schéma u + n
        Poids : environ 150 octets par vol (20 à 30 ko pour 150 vols).
        """
        prefix = f'{rd.SYRIDE_PILOT_URL}{self.r["pilot"]}/'

        def rounded(value, digits: int):
            v = _num(value)
            if v is None:
                return None
            v = round(v, digits)
            return int(v) if digits == 0 or v == int(v) else v

        rows = []
        for f in sorted(self.main("all")["flights"], key=lambda f: (f["date"], f["time"] or "")):
            row = {
                "d": f["date"].isoformat(), "t": f["time"], "s": f["site"], "w": f["voile"],
                "k": DISC_CODE.get(f["discipline"], f["discipline"]), "f": f["mode"] or None,
                "mn": rounded(f["minutes"], 2) if f["minutes"] else None,   # 2 décimales : les sommes JS restent exactes à la minute
                "km": rounded(f["distance"], 1), "c": rounded(f["ceiling"], 0),
                "v": rounded(f["speed_max"], 0), "z": rounded(f["vario"], 1), "n": f["num"],
            }
            if f["num"] is None or f["url"] != f"{prefix}{f['num']}":
                row["url"] = f["url"]
            rows.append(row)
        data = {"u": prefix, "f": rows}
        return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    # ---- Document complet ----

    # Commentaire /* ... */ qui occupe des lignes entières (le code, lui, n'est pas touché) : retiré du CSS et du JS embarqués
    _WHOLE_LINE_COMMENT = re.compile(r"^[ \t]*/\*(?:(?!\*/).)*\*/[ \t]*\n", re.S | re.M)

    def build(self) -> str:
        with open(os.path.join(ASSETS_DIR, "report.css"), encoding="utf-8") as fp:
            css = self._WHOLE_LINE_COMMENT.sub("", fp.read())
        with open(os.path.join(ASSETS_DIR, "report.js"), encoding="utf-8") as fp:
            js = self._WHOLE_LINE_COMMENT.sub("", fp.read())
        # Indentation du JS retirée (report.js n'a ni gabarit de chaîne ni chaîne sur plusieurs lignes : sans effet sur le code)
        js = re.sub(r"^[ \t]+", "", js, flags=re.M)
        cfg = json.dumps({"year": self.year, "compare": self.compare, "default_cmp": list(self.default_cmp)}).replace("</", "<\\/")
        sections = [self.apercu(), self.histoire(), self.rythme(), self.quand(), self.ou(), self.matos(), self.records(),
                    self.comparaison(), self.carriere(), self.vols(), self.glossaire()]
        sections = [x for x in sections if x]
        main = "<main>" + self.toc() + "".join(sections) + "</main>"
        tip_details = json.dumps(self.tip_details, ensure_ascii=False).replace("</", "<\\/")   # après les sections : le pool est rempli
        return (
            f'<!doctype html><html lang="fr"><head>{self.head()}<style>{css}</style></head><body>'
            f"{rc.PATTERN_DEFS}{self.story_sprite()}{self.hero()}{self.bar()}{main}{self.footer()}{self.top_button()}"
            f'<script type="application/json" id="cfg">{cfg}</script>'
            f'<script type="application/json" id="flights-data">{self.flights_json()}</script>'
            f'<script type="application/json" id="tip-details">{tip_details}</script>'
            f'<script type="application/json" id="map-data">{self.map_data_json()}</script>'
            f'<script type="application/json" id="recap-data">{self.recap_json()}</script>'
            f'<script>{js}</script></body></html>'
        )


def _num(value) -> Optional[float]:
    """Nombre positif ou None (valeurs manquantes, 0 et NaN)."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if v == v and v > 0 else None


# ============================================================================
# Point d'entrée
# ============================================================================


def build_report(
    df: pd.DataFrame,
    pilot: str,
    year: int,
    output: Optional[str] = None,
    compare_years="auto",
    max_compare: int = 2,
    today: Optional[dt.date] = None,
    texts_path: str = DEFAULT_TEXTS,
) -> str:
    """
    Génère le rapport HTML d'un pilote pour une année et retourne le code HTML.
    Si `output` est fourni, le fichier est aussi écrit à cet emplacement.

    compare_years : "auto" (jusqu'à `max_compare` années précédentes) ou liste d'années.
    today         : date de génération (par défaut aujourd'hui) ; pour l'année en cours, elle
                    est arrêtée à cette date et comparée aux années précédentes entières.
    Lève ValueError si le pilote n'a aucun vol cette année-là.
    """
    report = rd.compute_report(df, pilot, year, compare_years=compare_years, max_compare=max_compare, today=today)
    date_update = None
    if "date_update" in df.columns:
        value = pd.to_datetime(df["date_update"], errors="coerce").max()
        date_update = value.date() if value == value else None
    page = ReportBuilder(report, load_texts(texts_path), date_update).build()
    if output:
        folder = os.path.dirname(os.path.abspath(output))
        os.makedirs(folder, exist_ok=True)
        with open(output, "w", encoding="utf-8") as fp:
            fp.write(page)
    return page
