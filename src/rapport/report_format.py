"""
Formatage « à la française » pour les rapports : nombres, durées, dates, pluriels.

Exemples :
    fmt_int(2450)        -> '2 450'        (espace insécable)
    fmt_num(34.5)        -> '34,5'         (virgule décimale)
    fmt_duration(2538)   -> '42 h 18 min'
    fmt_signed_pct(12.4) -> '+12 %'
    plural(61, 'vol')    -> '61 vols'
"""

import datetime as dt
from typing import Optional

NBSP = "\u00a0"

MONTHS_LONG = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]
MONTHS_SHORT = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
]
DAYS_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
DAYS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]


def fmt_int(value) -> str:
    """Entier avec espace insécable pour les milliers."""
    return f"{int(round(float(value))):,}".replace(",", NBSP)


def fmt_num(value, digits: int = 1) -> str:
    """Nombre décimal avec virgule ; les zéros inutiles ne sont pas supprimés (34,0)."""
    text = f"{float(value):,.{digits}f}"
    return text.replace(",", "\u0001").replace(".", ",").replace("\u0001", NBSP)


def fmt_readable(value) -> str:
    """Nombre « parlant » : une décimale sous 10 (sans « ,0 » inutile), entier au-dessus : 3,2 ; 4 ; 27."""
    v = float(value)
    if v >= 10 or abs(round(v, 1) - round(v)) < 1e-9:
        return fmt_int(v)
    return fmt_num(v, 1)


def fmt_duration(minutes) -> str:
    """Durée en minutes -> '42 h 18 min', '35 min', '3 h'."""
    total = int(round(float(minutes)))
    hours, mins = divmod(total, 60)
    if hours == 0:
        return f"{mins}{NBSP}min"
    if mins == 0:
        return f"{hours}{NBSP}h"
    return f"{hours}{NBSP}h{NBSP}{mins:02d}{NBSP}min"


def fmt_hours(minutes, digits: int = 1) -> str:
    """Durée en minutes -> heures décimales : '42,3 h'."""
    return f"{fmt_num(float(minutes) / 60, digits)}{NBSP}h"


def fmt_signed_pct(value: Optional[float]) -> str:
    """Variation en % avec signe : '+12 %', '−8 %', '=' si nulle, '–' si inconnue."""
    if value is None:
        return "–"
    rounded = int(round(value))
    if rounded == 0:
        return "="
    sign = "+" if rounded > 0 else "−"
    return f"{sign}{abs(rounded)}{NBSP}%"


def plural(count, singular: str, many: Optional[str] = None) -> str:
    """'1 vol', '61 vols' (0 et 1 au singulier, comme en français)."""
    many = many or singular + "s"
    word = singular if abs(count) < 2 else many
    return f"{fmt_int(count)}{NBSP}{word}"


def fmt_date(date: dt.date, with_year: bool = False, weekday: bool = False) -> str:
    """'12 juillet', '12 juillet 2026', 'dimanche 12 juillet 2026'."""
    text = f"{date.day}{NBSP}{MONTHS_LONG[date.month - 1]}"
    if with_year:
        text += f"{NBSP}{date.year}"
    if weekday:
        text = f"{DAYS_LONG[date.weekday()]} {text}"
    return text


def fmt_range(start: dt.date, end: dt.date) -> str:
    """'le 3 mars', 'du 3 au 7 mars', 'du 28 février au 3 mars' (sans année : celle du rapport)."""
    if start == end:
        return f"le {fmt_date(start)}"
    if (start.year, start.month) == (end.year, end.month):
        return f"du {start.day} au {fmt_date(end)}"
    return f"du {fmt_date(start)} au {fmt_date(end)}"


def fmt_date_short(date: dt.date) -> str:
    """'12 juil.'"""
    return f"{date.day}{NBSP}{MONTHS_SHORT[date.month - 1]}"
