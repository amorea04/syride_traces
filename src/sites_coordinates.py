"""
Dictionnaire unique des coordonnées des sites de vol.

Chaque site a UNE seule paire de coordonnées, calculée comme la moyenne des points de départ
d'au maximum MAX_FILES vols (tirés au hasard ; tous les vols s'il y en a moins). Les points de
départ viennent des GPX/KML, déjà lus une fois par vol et stockés dans flights.db : aucun
fichier n'est relu ici.

Le dictionnaire est enregistré dans un fichier JSON (lisible, modifiable à la main) :

    {"Fayards": {"longitude": 0.123, "latitude": 45.678, "n_files": 25}, ...}

Règles de mise à jour :
  - site connu                                   -> coordonnées reprises telles quelles ;
  - nouveau site                                 -> coordonnées calculées et ajoutées ;
  - site calculé avec moins de MAX_FILES fichiers
    et dont le nombre de fichiers disponibles a changé -> coordonnées recalculées ;
  - fichier absent ou illisible, ou regenerate=True -> dictionnaire entièrement recréé.
"""

import json
import os
import zlib

import pandas as pd

SITES_COORDS_NAME = "sites_coordinates.json"
MAX_FILES = 25
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
    points = df[["site", "longitude", "latitude"]].dropna()
    points = points[points["site"] != NO_SITE]
    return points[(points["longitude"] != 0) | (points["latitude"] != 0)]


def _compute_site(site: str, points: pd.DataFrame) -> dict:
    """Moyenne de max MAX_FILES points tirés au hasard (graine fixe par site : un
    même site donne toujours le même échantillon, donc le même résultat)."""
    if len(points) > MAX_FILES:
        seed = zlib.crc32(site.encode("utf-8"))
        points = points.sample(n=MAX_FILES, random_state=seed)
    return {
        "longitude": float(points["longitude"].mean()),
        "latitude": float(points["latitude"].mean()),
        "n_files": int(len(points)),
    }


def update_sites_coordinates(df: pd.DataFrame, dict_path: str, regenerate: bool = False) -> dict:
    """
    Met à jour le dictionnaire à partir du DataFrame de tous les vols (colonnes site,
    longitude, latitude), l'enregistre s'il a changé et le retourne.
    """
    coords = {} if regenerate else load_sites_coordinates(dict_path)
    existed = bool(coords)
    changed = regenerate or not os.path.exists(dict_path)
    stats = {"new": 0, "recomputed": 0}

    for site, points in _valid_starts(df).groupby("site"):
        known = coords.get(site)
        n_available = len(points)

        if known is None:
            stats["new"] += 1
        elif known["n_files"] < MAX_FILES and known["n_files"] != n_available:
            stats["recomputed"] += 1
        else:
            continue  # site connu et à jour : rien à calculer

        coords[site] = _compute_site(site, points)
        changed = True

    if changed:
        save_sites_coordinates(coords, dict_path)

    if regenerate or not existed:
        print(f"Dictionnaire des sites (re)créé : {len(coords)} site(s).")
    elif stats["new"] or stats["recomputed"]:
        print(f"Dictionnaire des sites : {stats['new']} nouveau(x), "
              f"{stats['recomputed']} recalculé(s).")
    return coords


def apply_sites_coordinates(df: pd.DataFrame, coords: dict) -> pd.DataFrame:
    """Ajoute mean_longitude / mean_latitude (coordonnées du site) à chaque vol."""
    df["mean_longitude"] = df["site"].map(lambda s: coords.get(s, {}).get("longitude"))
    df["mean_latitude"] = df["site"].map(lambda s: coords.get(s, {}).get("latitude"))
    return df
