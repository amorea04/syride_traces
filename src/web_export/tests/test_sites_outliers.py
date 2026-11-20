"""Robustesse de sites_coordinates aux décollages aberrants."""

import json

import numpy as np
import pandas as pd

import sites_coordinates as sc


def _df(site, n=14, extra=None):
    rng = np.random.RandomState(0)
    rows = [{"site": site, "longitude": -1.005 + rng.uniform(-0.003, 0.003),
             "latitude": 46.0 + rng.uniform(-0.003, 0.003),
             "pilote": "A", "date": "2026-01-%02d" % (i + 1)} for i in range(n)]
    rows += extra or []
    return pd.DataFrame(rows)


FAR = {"site": "Soubise", "longitude": 6.28, "latitude": 45.83, "pilote": "Au_Phil_du_vent",
       "date": "2026-10-15"}


def test_soubise_outlier_ignored():
    clean = sc._compute_site("Soubise", sc._valid_starts(_df("Soubise")))
    dirty = sc._compute_site("Soubise", sc._valid_starts(_df("Soubise", extra=[FAR])))
    assert dirty["longitude"] == clean["longitude"]
    assert dirty["latitude"] == clean["latitude"]
    assert dirty["n_files"] == 14 and dirty["n_available"] == 15


def test_outliers_reported():
    found = []
    sc._compute_site("Soubise", sc._valid_starts(_df("Soubise", extra=[FAR])), found)
    assert len(found) == 1 and found[0]["pilote"] == "Au_Phil_du_vent"


def test_no_loop_and_legacy_json(tmp_path, capsys):
    path = str(tmp_path / "s.json")
    df = _df("Soubise", extra=[FAR])
    sc.update_sites_coordinates(df, path)
    assert "Au_Phil_du_vent" in capsys.readouterr().out
    first = open(path).read()
    # 2e passage : rien à recalculer (n_available == nombre de points disponibles)
    sc.update_sites_coordinates(df, path)
    assert open(path).read() == first
    assert "recalcul" not in capsys.readouterr().out
    # ancien JSON sans n_available : n_files (14) != 15 disponibles -> recalcul une fois
    data = json.load(open(path))
    del data["Soubise"]["n_available"]
    json.dump(data, open(path, "w"))
    sc.update_sites_coordinates(df, path)
    assert json.load(open(path))["Soubise"]["n_available"] == 15


def test_all_points_far_apart_keeps_everything():
    df = pd.DataFrame([
        {"site": "X", "longitude": 0.0, "latitude": 46.0},
        {"site": "X", "longitude": 1.0, "latitude": 46.0},
    ])
    found = []
    res = sc._compute_site("X", sc._valid_starts(df), found)
    assert res["longitude"] == 0.5 and res["n_files"] == 2 and found == []
