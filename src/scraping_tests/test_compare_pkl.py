"""Tests de migration/compare_pkl.py sur de petits DataFrame synthétiques (sans réseau)."""

import numpy as np
import pandas as pd
import pytest

from migration import compare_pkl


def make_df(n=4):
    return pd.DataFrame({
        "pilote": ["AdrienM"] * n,
        "num_activite": [100 + i for i in range(n)],
        "site": ["Fayards", "Fayards", "Nontron", "Nontron"][:n],
        "duree_vol": pd.to_timedelta([600, 1200, 1800, 2400][:n], unit="s"),
        "plafond": [500.0, 600.0, 700.0, np.nan][:n],
        "gain": [300.0, 400.0, 500.0, 0.0][:n],
        "vitesse_max": [50.0, 60.0, 70.0, 80.0][:n],
        "latitude": [45.1, 45.2, 45.3, 45.4][:n],
        "source_stats": ["gpx", "gpx", "gpx", "fiche"][:n],
        "date_update": pd.Timestamp("2026-11-20"),
    })


def test_identical_apart_from_new_columns_and_date_update():
    a = make_df()
    b = make_df()
    b["syride_status"] = "unknown"
    b["vario_min"] = np.nan
    b["hauteur_sol_max"] = np.nan
    b["heure_plafond"] = None
    b["date_update"] = pd.Timestamp("2026-11-21")
    res = compare_pkl.compare(a, b)
    assert res["n_unexpected"] == 0
    assert set(res["cols_new_allowed"]) == set(compare_pkl.NEW_COLUMNS)
    assert "CONFORME" in compare_pkl.format_report(res)


def test_flight_sets_differ():
    a = make_df()
    b = make_df().iloc[:3]
    b = pd.concat([b, make_df().iloc[[0]].assign(num_activite=999)])
    res = compare_pkl.compare(a, b)
    assert res["only_a"] == [("AdrienM", 103, 0)]
    assert res["only_b"] == [("AdrienM", 999, 0)]
    assert res["n_unexpected"] == 2


def test_unexpected_new_column_and_missing_column():
    a = make_df()
    b = make_df().drop(columns=["latitude"])
    b["colonne_x"] = 1
    res = compare_pkl.compare(a, b)
    assert res["cols_new_unexpected"] == ["colonne_x"]
    assert res["cols_missing_in_b"] == ["latitude"]
    assert res["n_unexpected"] == 2


def test_float_tolerance_and_nan_equality():
    a = make_df()
    b = make_df()
    b["latitude"] = b["latitude"] + 1e-8      # sous la tolérance
    res = compare_pkl.compare(a, b)
    assert res["columns"]["latitude"]["n_diff"] == 0
    assert res["columns"]["plafond"]["n_diff"] == 0   # NaN == NaN
    b.loc[0, "latitude"] += 1e-3
    res = compare_pkl.compare(a, b)
    assert res["columns"]["latitude"]["n_diff"] == 1
    assert res["columns"]["latitude"]["unexpected"] == 1
    assert res["columns"]["latitude"]["examples"][0][:2] == ("AdrienM", 100)


def test_stats_difference_allowed_only_when_source_differs_within_tolerance():
    a = make_df()
    b = make_df()
    b.loc[0, "source_stats"] = "trace"
    b.loc[0, "duree_vol"] = pd.Timedelta(seconds=601)
    b.loc[0, "plafond"] = 501.5
    b.loc[0, "gain"] = 302.0
    b.loc[0, "vitesse_max"] = 54.0                 # +8 %
    res = compare_pkl.compare(a, b)
    assert res["n_source_diff"] == 1
    assert res["source_transitions"] == {("gpx", "trace"): 1}
    for col in ("duree_vol", "plafond", "gain", "vitesse_max"):
        assert res["columns"][col]["n_diff"] == 1
        assert res["columns"][col]["allowed"] == 1
        assert res["columns"][col]["unexpected"] == 0
    assert res["n_unexpected"] == 0


def test_stats_difference_beyond_tolerance_is_unexpected():
    a = make_df()
    b = make_df()
    b.loc[0, "source_stats"] = "trace"
    b.loc[0, "duree_vol"] = pd.Timedelta(seconds=605)   # > 2 s
    b.loc[0, "vitesse_max"] = 60.0                       # +20 %
    res = compare_pkl.compare(a, b)
    assert res["columns"]["duree_vol"]["unexpected"] == 1
    assert res["columns"]["vitesse_max"]["unexpected"] == 1
    assert res["n_unexpected"] == 2


def test_stats_difference_with_same_source_is_unexpected():
    a = make_df()
    b = make_df()
    b.loc[1, "plafond"] = 601.0   # dans la tolérance, mais source identique
    res = compare_pkl.compare(a, b)
    assert res["columns"]["plafond"]["n_diff"] == 1
    assert res["columns"]["plafond"]["unexpected"] == 1


def test_missing_vs_present_value_differs():
    a = make_df()
    b = make_df()
    b.loc[2, "site"] = None
    res = compare_pkl.compare(a, b)
    assert res["columns"]["site"]["unexpected"] == 1


def test_pilot_filter():
    a = pd.concat([make_df(), make_df().assign(pilote="j2f")])
    b = a.copy()
    b.loc[b["pilote"] == "j2f", "site"] = "Ailleurs"
    assert compare_pkl.compare(a, b, pilot="AdrienM")["n_unexpected"] == 0
    assert compare_pkl.compare(a, b, pilot="j2f")["n_unexpected"] == 4
    assert compare_pkl.compare(a, b, pilot="j2f")["n_a"] == 4


def test_cli_exit_codes(tmp_path, capsys):
    a, b = make_df(), make_df()
    pa, pb = str(tmp_path / "a.pkl"), str(tmp_path / "b.pkl")
    a.to_pickle(pa)
    b.to_pickle(pb)
    assert compare_pkl.main(["--a", pa, "--b", pb]) == 0
    b.loc[0, "site"] = "Autre"
    b.to_pickle(pb)
    assert compare_pkl.main(["--a", pa, "--b", pb]) == 1
    assert "inattendu" in capsys.readouterr().out
    assert compare_pkl.main(["--a", pa, "--b", str(tmp_path / "absent.pkl")]) == 2
