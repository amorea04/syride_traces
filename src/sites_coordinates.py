"""
Dictionnaire unique des coordonnées des sites de vol.

Chaque site a UNE seule paire de coordonnées, calculée comme la moyenne des points de départ
d'au maximum MAX_FILES vols (tirés au hasard ; tous les vols s'il y en a moins). Les points de
départ viennent des GPX/KML, déjà lus une fois par vol et stockés dans flights.db : aucun
fichier n'est relu ici.

Le dictionnaire est enregistré dans un fichier JSON (lisible, modifiable à la main) :

    {"Fayards": {"longitude": 0.123, "latitude": 45.678, "n_files": 25, "n_available": 30}, ...}

``n_files`` = points retenus dans la moyenne ; ``n_available`` = points disponibles (avant
échantillonnage et écartement des aberrants). Champ facultatif : absent des anciens JSON,
on prend alors n_files.

Les décollages aberrants (rangés sous le mauvais site sur Syride) sont écartés : on prend le
point médian, on retire les points à plus de OUTLIER_KM de ce médian, puis on moyenne le reste.

Règles de mise à jour :
  - site connu                                   -> coordonnées reprises telles quelles ;
  - nouveau site                                 -> coordonnées calculées et ajoutées ;
  - site calculé avec moins de MAX_FILES fichiers disponibles
    et dont le nombre de fichiers disponibles a changé -> coordonnées recalculées ;
  - fichier absent ou illisible, ou regenerate=True -> dictionnaire entièrement recréé.
"""

import json
import os
import zlib

import numpy as np
import pandas as pd

SITES_COORDS_NAME = "sites_coordinates.json"
MAX_FILES = 25
OUTLIER_KM = 5.0  # un décollage à plus de OUTLIER_KM du point médian du site est écarté
EARTH_RADIUS_KM = 6371.0
NO_SITE = "None"  # valeur donnée aux vols sans site (cf. valeurs_manquantes)


def load_sites_coordinates(dict_path: str) -> dict:
    """Charge le dictionnaire. Fichier absent ou corrompu -> {} (il sera recréé)."""
    try:
        with open(dict_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_sites_coordinates(coords: dict, dict_path: str) -> None:
    """Écriture atomique : un plantage en cours d'écriture ne corrompt pas le fichier."""
    tmp_path = dict_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(coords, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp_path, dict_path)


def _valid_starts(df: pd.DataFrame) -> pd.DataFrame:
    """Points de départ exploitables : site renseigné, coordonnées présentes et non (0, 0)
    (get_first_coordinates renvoie [0.0, 0.0] quand le fichier est illisible)."""
    extra = [c for c in ("pilote", "date") if c in df.columns]
    points = df[["site", "longitude", "latitude"] + extra].dropna(
        subset=["site", "longitude", "latitude"])
    points = points[points["site"] != NO_SITE]
    return points[(points["longitude"] != 0) | (points["latitude"] != 0)]


def _haversine_km(lon, lat, lon0: float, lat0: float):
    """Distance (km) de points (lon, lat en degrés) à un point de référence."""
    lon, lat = np.radians(np.asarray(lon, dtype=float)), np.radians(np.asarray(lat, dtype=float))
    lon0, lat0 = np.radians(lon0), np.radians(lat0)
    a = np.sin((lat - lat0) / 2) ** 2 + np.cos(lat) * np.cos(lat0) * np.sin((lon - lon0) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def split_outliers(points: pd.DataFrame, max_km: float = OUTLIER_KM):
    """Sépare (retenus, écartés) : écartés = points à plus de max_km du point médian."""
    if points.empty:
        return points, points
    med_lon = float(points["longitude"].median())
    med_lat = float(points["latitude"].median())
    dist = _haversine_km(points["longitude"].values, points["latitude"].values, med_lon, med_lat)
    far = dist > max_km
    return points[~far], points[far]


def _sample(site: str, points: pd.DataFrame) -> pd.DataFrame:
    """Max MAX_FILES points tirés au hasard (graine fixe par site : un même site donne
    toujours le même échantillon, donc le même résultat)."""
    if len(points) > MAX_FILES:
        seed = zlib.crc32(site.encode("utf-8"))
        points = points.sample(n=MAX_FILES, random_state=seed)
    return points


def _compute_site(site: str, points: pd.DataFrame, outliers: list = None) -> dict:
    """Moyenne des points d'un échantillon de max MAX_FILES, aberrants écartés.
    Si `outliers` est une liste, les points écartés y sont ajoutés (dicts)."""
    kept, dropped = split_outliers(_sample(site, points))
    if kept.empty:
        # Points trop dispersés pour dégager un groupe (ex. 2 décollages à plus de 2 x OUTLIER_KM) :
        # on garde tout plutôt que de produire des coordonnées vides (NaN).
        kept, dropped = dropped, dropped.iloc[0:0]
    if outliers is not None and len(dropped):
        outliers.extend(dropped.to_dict("records"))
    return {
        "longitude": float(kept["longitude"].mean()),
        "latitude": float(kept["latitude"].mean()),
        "n_files": int(len(kept)),
        "n_available": int(len(points)),
    }


def _format_outliers(site: str, rows: list) -> str:
    lines = [f"  {site} : {len(rows)} décollage(s) écarté(s) (> {OUTLIER_KM:g} km du point médian)"]
    for r in rows:
        who = " ".join(str(r[k]) for k in ("pilote", "date") if r.get(k) is not None)
        lines.append(f"    - {who + ' ' if who else ''}(lon {r['longitude']:.3f}, lat {r['latitude']:.3f})")
    return "\n".join(lines)


def update_sites_coordinates(df: pd.DataFrame, dict_path: str, regenerate: bool = False) -> dict:
    """
    Met à jour le dictionnaire à partir du DataFrame de tous les vols (colonnes site,
    longitude, latitude), l'enregistre s'il a changé et le retourne.
    """
    coords = {} if regenerate else load_sites_coordinates(dict_path)
    existed = bool(coords)
    changed = regenerate or not os.path.exists(dict_path)
    stats = {"new": 0, "recomputed": 0}
    all_outliers = {}

    for site, points in _valid_starts(df).groupby("site"):
        known = coords.get(site)
        n_available = len(points)

        if known is None:
            stats["new"] += 1
        elif (known.get("n_available", known["n_files"]) < MAX_FILES
              and known.get("n_available", known["n_files"]) != n_available):
            stats["recomputed"] += 1
        else:
            continue  # site connu et à jour : rien à calculer

        found = []
        coords[site] = _compute_site(site, points, found)
        if found:
            all_outliers[site] = found
        changed = True

    if changed:
        save_sites_coordinates(coords, dict_path)

    if regenerate or not existed:
        print(f"Dictionnaire des sites (re)créé : {len(coords)} site(s).")
    elif stats["new"] or stats["recomputed"]:
        print(f"Dictionnaire des sites : {stats['new']} nouveau(x), "
              f"{stats['recomputed']} recalculé(s).")
    if all_outliers:
        print("Sites avec décollages aberrants écartés (à corriger sur Syride) :")
        for site, rows in sorted(all_outliers.items()):
            print(_format_outliers(site, rows))
    return coords


def apply_sites_coordinates(df: pd.DataFrame, coords: dict) -> pd.DataFrame:
    """Ajoute mean_longitude / mean_latitude (coordonnées du site) à chaque vol."""
    df["mean_longitude"] = df["site"].map(lambda s: coords.get(s, {}).get("longitude"))
    df["mean_latitude"] = df["site"].map(lambda s: coords.get(s, {}).get("latitude"))
    return df
