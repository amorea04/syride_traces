"""
Statistiques d'un vol calculées à partir de son fichier GPX (fonctions pures, sans réseau).

Un GPX Syride contient, pour chaque point : latitude, longitude, altitude (<ele>) et heure
(<time>), environ un point par seconde. On en déduit :

    duree_vol          durée entre le premier et le dernier point
    plafond            altitude maximale (m)
    gain               altitude maximale - altitude au premier point (m), comme sur la fiche
    vitesse_max        vitesse maximale (km/h) : médiane glissante sur SPEED_MEDIAN points
                       des vitesses point à point (élimine les sauts GPS isolés).
                       Moins fiable que la valeur de la fiche : utilisée seulement quand la
                       fiche n'en donne pas (voir flights_db.apply_gpx_stats).

Comparaison avec les fiches Syride (échantillon de ~380 vols) : plafond, gain et durée
identiques, distance cumulée à quelques km près (écart médian 1 km, max 18 km sur
~8 700 vols). La vitesse max diffère davantage (sauts GPS) : ~75 % à moins de 10 %.

NON calculés ici, car le GPX ne permet pas de retrouver les valeurs de Syride :
    vitesse_moyenne    Syride la calcule comme distance_activite (= distance de la page
                       liste) / durée : elle est donc recalculée à partir du JSON + durée GPX
                       (voir flights_db) ;
    distance_cumulee   gardée telle que la fiche l'indique (JSON). La distance de référence
                       est d'ailleurs `distance`, affichée sur la page liste de Syride ;
    vario_max, g_max   mesurés par les capteurs de l'instrument (vario issu du baromètre) :
                       ils restent ceux de la fiche (JSON).
Retourne None si le fichier est illisible ou contient trop peu de points.
"""

import math
import xml.etree.ElementTree as ET
from datetime import datetime

import numpy as np
import pandas as pd

SPEED_MEDIAN = 5    # points
STATS_VERSION = 2   # à incrémenter si le calcul change : les stats en cache sont recalculées
MIN_POINTS = 10

# Champs fournis par compute_gpx_stats
GPX_STAT_FIELDS = ["duree_vol", "plafond", "gain", "vitesse_max"]


def _parse_time(text):
    text = text.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def read_gpx_points(path: str):
    """Retourne trois tableaux numpy (t en secondes, altitude, distance cumulée en km)."""
    root = ET.parse(path).getroot()
    lats, lons, eles, times = [], [], [], []
    for elem in root.iter():
        if not elem.tag.endswith("trkpt"):
            continue
        ele = t = None
        for child in elem:
            if child.tag.endswith("ele") and child.text:
                ele = float(child.text)
            elif child.tag.endswith("time") and child.text:
                t = _parse_time(child.text)
        if ele is None or t is None:
            continue
        lats.append(float(elem.attrib["lat"]))
        lons.append(float(elem.attrib["lon"]))
        eles.append(ele)
        times.append(t)

    t = np.array(times)
    alt = np.array(eles)
    lat = np.radians(lats)
    lon = np.radians(lons)
    # Distance haversine entre points successifs (km)
    if len(t) > 1:
        dlat = np.diff(lat)
        dlon = np.diff(lon)
        a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
        step = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        dist = np.concatenate([[0.0], np.cumsum(step)])
    else:
        dist = np.zeros(len(t))
    return t, alt, dist


def _robust_max_speed(t, dist):
    """Vitesse max (km/h) : max de la médiane glissante des vitesses point à point."""
    dt = np.diff(t)
    dd = np.diff(dist)
    ok = dt > 0
    if ok.sum() < SPEED_MEDIAN:
        return None
    speed = pd.Series(dd[ok] / dt[ok] * 3600)
    value = speed.rolling(SPEED_MEDIAN, center=True).median().max()
    return None if pd.isna(value) else float(value)


def _hms(seconds: float) -> str:
    seconds = int(round(seconds))
    return f"{seconds // 3600:02d}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def compute_gpx_stats(path: str):
    """Statistiques du vol (dict de GPX_STAT_FIELDS) ou None si le GPX est inexploitable."""
    try:
        t, alt, dist = read_gpx_points(path)
    except Exception:
        return None
    if len(t) < MIN_POINTS:
        return None

    order = np.argsort(t, kind="stable")
    t, alt, dist = t[order], alt[order], dist[order]
    duration = float(t[-1] - t[0])
    if duration <= 0:
        return None

    vmax = _robust_max_speed(t, dist)

    return {
        "duree_vol": _hms(duration),
        "plafond": int(round(alt.max())),
        "gain": int(round(alt.max() - alt[0])),
        "vitesse_max": int(round(vmax)) if vmax is not None else None,
        "version": STATS_VERSION,
    }
