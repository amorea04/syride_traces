"""
Construction de flights.json colonnaire (ROADMAP_WEBAPP.md §4.2) à partir du DataFrame du pkl.
Règle D12 : aucune coordonnée par vol n'est exportée.
"""

from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from rapport.report_data import MODE_ORDER, mode_of
from web_export.common import SCHEMA_VERSION, flight_key, pilot_slugs

MIN_DATE = pd.Timestamp("1980-01-01")      # en dessous : date sentinelle (1901), vol écarté
COLUMNS = ["pilot", "activity", "date", "time", "site", "wing", "instrument", "mode",
           "duration_min", "dist_km", "dist_cum_km", "speed_avg", "speed_max", "ceiling_m", "gain_m",
           "vario_max", "g_max", "incomplete", "source", "syride_num"]
ACTIVITIES = ["parapente", "paramoteur"]
SOURCES = ["gpx", "fiche", "aucune"]
TEXT_NULLS = ("nan", "none")               # voile ou instrument : valeurs textuelles exportées en null
# (colonne du DataFrame, décimales) ; 0 = entier
MEASURES = [("distance", 1), ("distance_cumulee", 1), ("vitesse_moyenne", 1), ("vitesse_max", 1),
            ("plafond", 0), ("gain", 0), ("vario_max", 1), ("g_max", 1)]


def clean_text(value: Any) -> Optional[str]:
    """Texte sans espaces de bord ; None si vide ou NaN."""
    if value is None or value != value:
        return None
    text = str(value).strip()
    return text or None


def clean_unknown(value: Any) -> Optional[str]:
    """clean_text, et None pour les restes de NaN textuels (« nan », « none »).
    « inconnue » reste une voile à part entière (décision d'Adrien du 15/11/2026)."""
    text = clean_text(value)
    return None if text is None or text.lower() in TEXT_NULLS else text


def select_exportable(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Écarte les vols à date manquante ou < 1980 ; retourne (vols conservés, nombre écartés)."""
    keep = df["date"].notna() & (df["date"] >= MIN_DATE)
    return df[keep], int((~keep).sum())


def _sorted_unique(values) -> List[str]:
    return sorted(set(values), key=lambda v: (v.lower(), v))


def _index(values: List[str]) -> Dict[str, int]:
    return {v: i for i, v in enumerate(values)}


def _measure(value: Any, decimals: int) -> Optional[float]:
    """Mesure arrondie ; None si NaN, ≤ 0 ou nulle après arrondi."""
    if value is None or value != value:
        return None
    rounded = round(float(value), decimals)
    if rounded <= 0:
        return None
    return int(rounded) if decimals == 0 else rounded


def _time(value: Any) -> Optional[str]:
    if value is None or value != value:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")
    return str(value)[:5]


def _duration(value: Any) -> Optional[float]:
    if value is None or value != value:
        return None
    return max(0.0, round(float(value), 1))


def _mode_dict(modes: List[str]) -> List[str]:
    known = [m for m in MODE_ORDER if m in modes]
    return known + sorted(set(modes) - set(known))


def build_flights(df: pd.DataFrame) -> Tuple[dict, dict]:
    """Retourne (FlightsFile, stats). Lève ValueError sur clé dupliquée, source ou discipline inconnue."""
    kept, excluded = select_exportable(df)
    pilots = _sorted_unique(kept["pilote"].map(str))
    slugs = pilot_slugs(pilots)
    dictionary = {
        "pilot": pilots,
        "activity": ACTIVITIES,
        "site": _sorted_unique(filter(None, kept["site"].map(clean_text))),
        "wing": _sorted_unique(filter(None, kept["voile"].map(clean_unknown))),
        "instrument": _sorted_unique(filter(None, kept["instrument"].map(clean_unknown))),
        "mode": _mode_dict([m for m in kept["types"].map(mode_of) if m]),
        "source": SOURCES,
    }
    idx = {name: _index(dictionary[name]) for name in ("pilot", "activity", "site", "wing", "instrument", "mode", "source")}

    rows = []
    for rec in kept.to_dict("records"):
        rows.append(_row(rec, idx))
    rows.sort(key=lambda r: (r[2], r[3] or "", dictionary["pilot"][r[0]], r[19]))
    # Clé d'un vol (non exportée : le front la recalcule depuis pilot_slugs et syride_num) : doit être unique
    keys = [flight_key(slugs[dictionary["pilot"][r[0]]], r[19]) for r in rows]
    if len(set(keys)) != len(keys):
        dup = sorted({k for k in keys if keys.count(k) > 1})[:5]
        raise ValueError("clés de vol dupliquées : {}".format(dup))

    obj = {"schema_version": SCHEMA_VERSION, "columns": COLUMNS, "dict": dictionary,
           "pilot_slugs": [slugs[p] for p in pilots], "rows": rows}
    stats = {"input": int(len(df)), "exported": len(rows), "excluded": excluded}
    return obj, stats


def _lookup(table: Dict[str, int], value: Optional[str]) -> Optional[int]:
    return None if value is None else table[value]


def _row(rec: dict, idx: Dict[str, Dict[str, int]]) -> list:
    pilot = str(rec["pilote"])
    num = rec["num_activite"]
    if num is None or num != num or int(num) < 1:
        raise ValueError("num_activite manquant pour le pilote {!r}".format(pilot))
    activity = rec["type_vol"]
    if activity not in idx["activity"]:
        raise ValueError("discipline inconnue {!r} (pilote {!r}, vol {})".format(activity, pilot, num))
    source = rec["source_stats"]
    if source not in idx["source"]:
        raise ValueError("source de stats inconnue {!r} (pilote {!r}, vol {})".format(source, pilot, num))
    mode = mode_of(rec["types"]) or None
    measures = [_measure(rec[col], dec) for col, dec in MEASURES]
    return ([idx["pilot"][pilot], idx["activity"][activity],
             rec["date"].strftime("%Y-%m-%d"), _time(rec["heure"]),
             _lookup(idx["site"], clean_text(rec["site"])), _lookup(idx["wing"], clean_unknown(rec["voile"])),
             _lookup(idx["instrument"], clean_unknown(rec["instrument"])), _lookup(idx["mode"], mode),
             _duration(rec["duree_vol_minutes"])]
            + measures
            + [bool(rec["incomplet"]), idx["source"][source], int(num)])
