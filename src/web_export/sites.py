"""
Construction de sites.json (ROADMAP_WEBAPP.md §4.3). Coordonnées = moyenne du site, jamais celles d'un vol.
"""

import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import pandas as pd

from web_export.common import SCHEMA_VERSION
from web_export.flights import ACTIVITIES, COLUMNS, clean_text

COORD_DECIMALS = 4
COL_PILOT, COL_ACTIVITY, COL_SITE = (COLUMNS.index(c) for c in ("pilot", "activity", "site"))   # positions dans une ligne


def _valid(lat, lon) -> bool:
    return (lat is not None and lon is not None and lat == lat and lon == lon
            and -90 <= lat <= 90 and -180 <= lon <= 180)


def _pkl_means(df_export: pd.DataFrame) -> Dict[str, Tuple[float, float]]:
    """Moyenne des mean_latitude / mean_longitude par site (valeurs manquantes ignorées)."""
    if "mean_latitude" not in df_export or "mean_longitude" not in df_export:
        return {}
    work = pd.DataFrame({"site": df_export["site"].map(clean_text),
                         "lat": df_export["mean_latitude"], "lon": df_export["mean_longitude"]})
    work = work.dropna()
    grouped = work.groupby("site")[["lat", "lon"]].mean()
    return {name: (float(r.lat), float(r.lon)) for name, r in grouped.iterrows() if _valid(r.lat, r.lon)}


def _json_coords(coords_path: Optional[Path]) -> Dict[str, Tuple[float, float]]:
    if coords_path is None or not Path(coords_path).exists():
        return {}
    raw = json.loads(Path(coords_path).read_text(encoding="utf-8"))
    out = {}
    for name, val in raw.items():
        if not name.strip():
            continue
        lat, lon = val.get("latitude"), val.get("longitude")
        if _valid(lat, lon):
            out[name.strip()] = (float(lat), float(lon))
    return out


def build_sites(df_export: pd.DataFrame, flights_obj: dict, coords_path: Optional[Path]) -> Tuple[dict, dict]:
    """
    Un objet par entrée de flights_obj["dict"]["site"] (id = index). `df_export` = vols exportés.
    Retourne (SitesFile, stats avec la liste des sites sans coordonnées).
    """
    names = flights_obj["dict"]["site"]
    pkl, fallback = _pkl_means(df_export), _json_coords(coords_path)
    pilots = [set() for _ in names]
    flights = [0] * len(names)
    acts = [dict.fromkeys(ACTIVITIES, 0) for _ in names]
    for row in flights_obj["rows"]:
        site = row[COL_SITE]
        if site is None:
            continue
        flights[site] += 1
        pilots[site].add(row[COL_PILOT])
        acts[site][ACTIVITIES[row[COL_ACTIVITY]]] += 1

    sites, missing, n_pkl, n_json = [], [], 0, 0
    for i, name in enumerate(names):
        if name in pkl:
            coords, n_pkl = pkl[name], n_pkl + 1
        elif name in fallback:
            coords, n_json = fallback[name], n_json + 1
        else:
            coords = None
            missing.append(name)
        lat, lon = (round(coords[0], COORD_DECIMALS), round(coords[1], COORD_DECIMALS)) if coords else (None, None)
        sites.append({"id": i, "name": name, "lat": lat, "lon": lon, "flights": flights[i],
                      "pilots": len(pilots[i]), "activities": acts[i]})
    stats = {"sites": len(sites), "from_pkl": n_pkl, "from_json": n_json, "without_coords": missing}
    return {"schema_version": SCHEMA_VERSION, "sites": sites}, stats
