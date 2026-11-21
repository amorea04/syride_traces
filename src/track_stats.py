"""
Statistiques d'un vol calculées à partir de sa trace (fonctions pures, sans réseau).

Deux sources, même calcul (stats_from_series) :
    - le fichier GPX du vol (compute_gpx_stats), source « gpx » ;
    - la trace `fv-config` de la fiche Syride (compute_track_stats), source « fv-config » :
      1 point par seconde, avec vario, g, altitude du sol et extrema horodatés.

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

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import numpy as np
import pandas as pd

SPEED_MEDIAN = 5    # points
STATS_VERSION = 3   # à incrémenter si le calcul change : les stats en cache sont recalculées
MIN_POINTS = 10

# Champs fournis par compute_gpx_stats
GPX_STAT_FIELDS = ["duree_vol", "plafond", "gain", "vitesse_max"]
# Champs supplémentaires fournis par compute_track_stats (trace fv-config)
TRACK_STAT_FIELDS = ["vario_min", "vario_max", "g_max", "vitesse_max_fiche",
                     "hauteur_sol_max", "heure_plafond"]


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
    return t, alt, cumulative_distance_km(lats, lons)


def cumulative_distance_km(lats, lons):
    """Distance haversine cumulée (km) le long de points lat/lon en degrés ; 0 au premier point."""
    lat = np.radians(np.asarray(lats, dtype=float))
    lon = np.radians(np.asarray(lons, dtype=float))
    if len(lat) > 1:
        dlat = np.diff(lat)
        dlon = np.diff(lon)
        a = np.sin(dlat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(dlon / 2) ** 2
        step = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        return np.concatenate([[0.0], np.cumsum(step)])
    return np.zeros(len(lat))


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


def stats_from_series(t, alt, dist):
    """Statistiques (dict de GPX_STAT_FIELDS + version) depuis des séries numpy, ou None.

    t : secondes, alt : mètres, dist : distance cumulée en km (même longueur).
    """
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


def compute_gpx_stats(path: str):
    """Statistiques du vol (dict de GPX_STAT_FIELDS) ou None si le GPX est inexploitable."""
    try:
        t, alt, dist = read_gpx_points(path)
    except Exception:
        return None
    return stats_from_series(t, alt, dist)


def _extremum_value(extrema, icon):
    """Premier nombre lu dans le libellé de l'extremum d'icône donnée, ou None."""
    for ext in extrema or []:
        if not isinstance(ext, dict) or ext.get("icon") != icon:
            continue
        m = re.search(r"-?\d+(?:[.,]\d+)?", str(ext.get("label", "")).replace("\u2212", "-"))
        if m:
            return float(m.group(0).replace(",", "."))
    return None


def _column(points, index):
    """Colonne `index` de `points` en float (NaN si absente), ou None si inutilisable."""
    try:
        col = np.array([p[index] if len(p) > index else np.nan for p in points], dtype=float)
    except (TypeError, ValueError):
        return None
    return col if np.isfinite(col).any() else None


def compute_track_stats(track):
    """Statistiques d'une trace `fv-config` (dict décodé) ou None si elle est inexploitable.

    Champs de GPX_STAT_FIELDS et de TRACK_STAT_FIELDS, `source` = « fv-config » et `version`.
    """
    if not isinstance(track, dict):
        return None
    points, times = track.get("points"), track.get("times")
    if not points or not times or len(points) != len(times) or len(points) < MIN_POINTS:
        return None
    try:
        arr = np.array([[float(p[0]), float(p[1]), float(p[2])] for p in points])
        t = np.array(times, dtype=float)
    except (TypeError, ValueError, IndexError):
        return None
    if not (np.isfinite(arr).all() and np.isfinite(t).all()):
        return None

    base = stats_from_series(t, arr[:, 2], cumulative_distance_km(arr[:, 0], arr[:, 1]))
    if base is None:
        return None

    extrema = track.get("extrema")
    vario_max = _extremum_value(extrema, "up")
    vario_min = _extremum_value(extrema, "down")
    g_max = _extremum_value(extrema, "g")
    if vario_max is None or vario_min is None:
        vario = _column(points, 4)
        if vario is not None:
            if vario_max is None:
                vario_max = float(np.nanmax(vario))
            if vario_min is None:
                vario_min = float(np.nanmin(vario))
    if g_max is None:
        g = _column(points, 5)
        if g is not None:
            g_max = float(np.nanmax(g))

    hauteur_sol_max = None
    terrain = track.get("terrain")
    if terrain:
        try:
            ter = np.array([[float(a), float(b)] for a, b in terrain])
            ter = ter[np.argsort(ter[:, 0], kind="stable")]
            if len(ter) and np.isfinite(ter).all():
                sol = np.interp(t, ter[:, 0], ter[:, 1])
                hauteur_sol_max = float((arr[:, 2] - sol).max())
        except (TypeError, ValueError, IndexError):
            hauteur_sol_max = None

    base.update({
        "vario_min": vario_min,
        "vario_max": vario_max,
        "g_max": g_max,
        "vitesse_max_fiche": _extremum_value(extrema, "speed"),
        "hauteur_sol_max": hauteur_sol_max,
        "heure_plafond": float(t[int(np.argmax(arr[:, 2]))]),
        "source": "fv-config",
    })
    return base


def track_to_gpx(track, path):
    """Écrit un GPX 1.1 minimal (lat, lon, ele, time UTC) depuis une trace `fv-config`."""
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<gpx version="1.1" creator="syride_traces" xmlns="http://www.topografix.com/GPX/1/1">',
             "<trk><trkseg>"]
    for p, t in zip(track["points"], track["times"]):
        iso = datetime.fromtimestamp(float(t), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        lines.append('<trkpt lat="{:.6f}" lon="{:.6f}"><ele>{:.1f}</ele><time>{}</time></trkpt>'
                     .format(float(p[0]), float(p[1]), float(p[2]), iso))
    lines += ["</trkseg></trk>", "</gpx>"]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
