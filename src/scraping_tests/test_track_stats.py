"""Tests de track_stats : GPX (non-régression) et trace fv-config (synthétiques, sans réseau)."""

import numpy as np
import pytest

import track_stats
from track_stats import (GPX_STAT_FIELDS, STATS_VERSION, TRACK_STAT_FIELDS, compute_gpx_stats,
                         compute_track_stats, stats_from_series, track_to_gpx)

T0 = 1700000000  # 14/11/2023 22:13:20 UTC
N = 600


def make_track(n=N, with_terrain=True, with_extrema=True):
    """Vol synthétique : 1 point/s, cap est à ~54 km/h, montée de 60 m à 560 m puis descente."""
    i = np.arange(n)
    lat = 45.0 + 0.0 * i
    lon = 6.0 + i * (54.0 / 3600) / (111.195 * np.cos(np.radians(45.0)))
    alt = 60 + 500 * np.sin(np.pi * i / (n - 1))
    vario = np.gradient(alt)
    points = [[float(lat[k]), float(lon[k]), float(alt[k]), 54.0, float(vario[k]), 1.0 + 0.001 * k, 0]
              for k in range(n)]
    track = {"points": points, "times": [T0 + k for k in range(n)], "offset": 3600}
    if with_terrain:
        track["terrain"] = [[T0 + k, 40.0] for k in range(0, n, 2)]
    if with_extrema:
        track["extrema"] = [
            {"icon": "speed", "time": T0 + 10, "position": [45.0, 6.0], "label": "Vitesse max : 61 km/h"},
            {"icon": "up", "time": T0 + 20, "position": [45.0, 6.0], "label": "Vario max : 2.5 m/s"},
            {"icon": "down", "time": T0 + 30, "position": [45.0, 6.0], "label": "Vario min. : -3.5 m/s"},
            {"icon": "g", "time": T0 + 40, "position": [45.0, 6.0], "label": "G max : 1.4 g"},
        ]
    return track


def test_stats_version():
    assert STATS_VERSION == 4


def test_gpx_non_regression(tmp_path):
    track = make_track()
    path = tmp_path / "vol.gpx"
    track_to_gpx(track, str(path))
    stats = compute_gpx_stats(str(path))
    assert set(stats) == set(GPX_STAT_FIELDS) | {"version"}
    assert stats["version"] == STATS_VERSION
    # valeurs attendues fixées : 600 points -> 599 s, plafond 560 m (milieu), gain 500 m
    assert stats["duree_vol"] == "00:09:59"
    assert stats["plafond"] == 560
    assert stats["gain"] == 500
    assert stats["vitesse_max"] == 54


def test_gpx_inexploitable(tmp_path):
    bad = tmp_path / "vide.gpx"
    bad.write_text("pas du xml", encoding="utf-8")
    assert compute_gpx_stats(str(bad)) is None
    assert compute_gpx_stats(str(tmp_path / "absent.gpx")) is None


def test_stats_from_series_trie_et_seuils():
    t = np.arange(20, dtype=float)
    alt = np.linspace(100, 200, 20)
    dist = np.linspace(0, 1, 20)
    assert stats_from_series(t[:5], alt[:5], dist[:5]) is None
    assert stats_from_series(np.zeros(20), alt, dist) is None
    out = stats_from_series(t[::-1].copy(), alt[::-1].copy(), dist[::-1].copy())
    assert out["plafond"] == 200 and out["gain"] == 100


def test_distance_haversine():
    d = track_stats.cumulative_distance_km([0.0, 1.0], [0.0, 0.0])
    assert d[0] == 0 and d[1] == pytest.approx(111.19, abs=0.1)
    assert list(track_stats.cumulative_distance_km([1.0], [1.0])) == [0.0]


def test_trace_nominale():
    stats = compute_track_stats(make_track())
    assert set(stats) == set(GPX_STAT_FIELDS) | set(TRACK_STAT_FIELDS) | {"version", "source"}
    assert stats["source"] == "fv-config" and stats["version"] == STATS_VERSION
    assert stats["duree_vol"] == "00:09:59"
    assert stats["plafond"] == 560 and stats["gain"] == 500
    assert stats["vitesse_max"] == 54
    assert stats["vitesse_max_fiche"] == 61
    assert stats["vario_max"] == 2.5 and stats["vario_min"] == -3.5 and stats["g_max"] == 1.4
    assert stats["hauteur_sol_max"] == pytest.approx(520.0, abs=0.5)
    assert stats["heure_plafond"] in (T0 + 299, T0 + 300)


def test_sans_terrain():
    assert compute_track_stats(make_track(with_terrain=False))["hauteur_sol_max"] is None
    assert compute_track_stats(dict(make_track(), terrain=[]))["hauteur_sol_max"] is None


def test_sans_extrema_repli_colonnes():
    track = make_track(with_extrema=False)
    stats = compute_track_stats(track)
    vario = [p[4] for p in track["points"]]
    assert stats["vario_max"] == pytest.approx(max(vario))
    assert stats["vario_min"] == pytest.approx(min(vario))
    assert stats["g_max"] == pytest.approx(1.0 + 0.001 * (N - 1))
    assert stats["vitesse_max_fiche"] is None


def test_extrema_signe_moins_unicode_et_virgule():
    track = make_track()
    track["extrema"][2]["label"] = "Vario min. : −3,5 m/s"
    assert compute_track_stats(track)["vario_min"] == -3.5


def test_trace_incoherente():
    track = make_track()
    for bad in (None, {}, "x",
                dict(track, points=track["points"][:5], times=track["times"][:5]),
                dict(track, times=track["times"][:-1]),
                dict(track, times=[T0] * N),
                dict(track, points=[["a", "b", "c"]] * N)):
        assert compute_track_stats(bad) is None


def test_aller_retour_gpx(tmp_path):
    track = make_track()
    path = tmp_path / "vol.gpx"
    track_to_gpx(track, str(path))
    from_gpx = compute_gpx_stats(str(path))
    from_track = compute_track_stats(track)
    assert from_gpx["duree_vol"] == from_track["duree_vol"]
    assert from_gpx["plafond"] == from_track["plafond"]
    assert from_gpx["gain"] == from_track["gain"]
    assert abs(from_gpx["vitesse_max"] - from_track["vitesse_max"]) <= 1


def test_positions_repetees_vitesse_max():
    """Position répétée un point sur deux (fix GPS toutes les 2 s) : vitesse max non doublée."""
    track = make_track(with_extrema=False)
    for k in range(1, N, 2):
        track["points"][k][0], track["points"][k][1] = track["points"][k - 1][0], track["points"][k - 1][1]
    assert compute_track_stats(track)["vitesse_max"] == 54
