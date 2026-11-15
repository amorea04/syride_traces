"""Lot 1.2 : flights.json colonnaire."""

import copy
import math

import pytest

from web_export.flights import COLUMNS, build_flights
from web_export.schema import validate

MEASURE_COLS = ["dist_km", "dist_cum_km", "speed_avg", "speed_max", "ceiling_m", "gain_m", "vario_max", "g_max"]
COORD_WORDS = ("lat", "lon", "coord")


def decode(flights):
    """Lignes -> dicts avec les catégories résolues (pilot/site/wing/... en texte)."""
    d = flights["dict"]
    out = []
    for row in flights["rows"]:
        rec = dict(zip(flights["columns"], row))
        rec["key"] = "{}-{}".format(flights["pilot_slugs"][rec["pilot"]], rec["syride_num"])
        for col in ("pilot", "activity", "site", "wing", "instrument", "mode", "source"):
            rec[col] = None if rec[col] is None else d[col][rec[col]]
        out.append(rec)
    return out


def by_key(flights):
    return {r["key"]: r for r in decode(flights)}


def test_row_count_and_stats(df):
    obj, stats = build_flights(df)
    n_excluded = int((df["date"] < "1980").sum())
    assert n_excluded == 2
    assert stats == {"input": len(df), "exported": len(df) - n_excluded, "excluded": n_excluded}
    assert len(obj["rows"]) == len(df) - n_excluded
    validate(obj, "FlightsFile")


def test_columns_and_no_coordinates(files):
    f = files["flights"]
    assert f["columns"] == COLUMNS
    assert not [c for c in f["columns"] if any(w in c for w in COORD_WORDS)]
    assert all(len(r) == len(COLUMNS) for r in f["rows"])


def test_no_nan_sentinel_or_nonpositive(files):
    for rec in decode(files["flights"]):
        assert not rec["date"].startswith("1901")
        for col in MEASURE_COLS:
            v = rec[col]
            assert v is None or (not math.isnan(v) and v > 0), (rec["key"], col, v)
        assert rec["duration_min"] is None or rec["duration_min"] >= 0


def test_keys_unique_and_slugs(files):
    f = files["flights"]
    keys = [r["key"] for r in decode(f)]
    assert len(set(keys)) == len(keys)
    assert f["dict"]["pilot"] == ["Alpha_Test", "bravo test2", "Zoé Test"]
    assert f["pilot_slugs"] == ["alpha-test", "bravo-test2", "zoe-test"]
    assert "zoe-test-1000" in keys


def test_duplicate_key_is_an_error(df):
    dup = df.copy()
    dup["num_activite"] = 1
    dup["pilote"] = dup["pilote"].iloc[0]
    with pytest.raises(ValueError, match="dupliqu"):
        build_flights(dup)


def test_unknown_source_and_activity_are_errors(df):
    bad = df.copy()
    bad.loc[bad.index[0], "source_stats"] = "inconnue"
    with pytest.raises(ValueError, match="source"):
        build_flights(bad)
    bad = df.copy()
    bad.loc[bad.index[0], "type_vol"] = "parachute"
    with pytest.raises(ValueError, match="discipline"):
        build_flights(bad)


def test_round_trip(df, files):
    recs = by_key(files["flights"])
    slugs = dict(zip(files["flights"]["dict"]["pilot"], files["flights"]["pilot_slugs"]))
    checked = 0
    for _, row in df[df["date"] >= "1980"].iterrows():
        rec = recs["{}-{}".format(slugs[row["pilote"]], row["num_activite"])]
        assert rec["pilot"] == row["pilote"]
        assert rec["date"] == row["date"].strftime("%Y-%m-%d")
        assert rec["site"] == (row["site"].strip() if isinstance(row["site"], str) and row["site"].strip() else None)
        assert rec["activity"] == row["type_vol"]
        assert rec["syride_num"] == row["num_activite"]
        checked += 1
    assert checked == len(recs)


def test_edge_cases(files):
    recs = by_key(files["flights"])
    r = recs["zoe-test-1000"]
    assert r["speed_max"] is None and r["vario_max"] is None       # 0 et -1 -> null
    r = recs["alpha-test-1001"]
    assert r["gain_m"] is None and r["ceiling_m"] is None
    r = recs["bravo-test2-1002"]
    assert r["dist_km"] is None and r["g_max"] is None              # 0,04 arrondi à 0 -> null
    assert recs["bravo-test2-1005"]["wing"] is None                 # voile vide
    assert recs["zoe-test-1006"]["wing"] is None                    # voile NaN
    assert recs["alpha-test-1007"]["mode"] == "Site"                # « Vol site » avec espace final
    r = recs["bravo-test2-1011"]
    assert r["time"] is None and r["site"] is None
    r = recs["alpha-test-1010"]
    assert r["incomplete"] is True and r["duration_min"] is None
    assert recs["zoe-test-1009"]["source"] == "aucune"
    assert "zoe-test-1003" not in recs and "alpha-test-1004" not in recs


def test_types_and_rounding(files):
    for rec in decode(files["flights"]):
        for col in ("ceiling_m", "gain_m"):
            assert rec[col] is None or isinstance(rec[col], int)
        for col in ("dist_km", "speed_avg", "vario_max", "g_max", "duration_min"):
            v = rec[col]
            assert v is None or round(v, 1) == v
        assert rec["time"] is None or len(rec["time"]) == 5
        assert isinstance(rec["incomplete"], bool)


def test_dictionaries_sorted_and_mode_order(files):
    d = files["flights"]["dict"]
    for name in ("site", "wing", "instrument"):
        assert d[name] == sorted(d[name], key=lambda v: (v.lower(), v))
    assert d["mode"] == ["Site", "Treuil", "Rando", "Bord de mer", "Moteur"]
    assert d["wing"] == ["daytona test", "Voile Deux", "voile trois", "voile un"]


def test_row_order(files):
    f = files["flights"]
    pilots = f["dict"]["pilot"]
    keys = [(r[2], r[3] or "", pilots[r[0]], r[19]) for r in f["rows"]]
    assert keys == sorted(keys)


def test_deterministic(df):
    a, _ = build_flights(df)
    b, _ = build_flights(copy.deepcopy(df))
    assert a == b


@pytest.mark.real
def test_real_counts(real_df):
    obj, stats = build_flights(real_df)
    n_excluded = int((real_df["date"].dt.year < 1980).sum())     # vols à date sentinelle 1901
    assert len(real_df) > 9000      # garde-fou : pkl complet (ordre de grandeur au 15/11/2026)
    assert stats["excluded"] == n_excluded and stats["exported"] == len(real_df) - n_excluded
    assert len(obj["dict"]["pilot"]) == real_df["pilote"].nunique()
    validate(obj, "FlightsFile")


def test_textual_nan_is_null_but_inconnue_is_kept(df):
    bad = df.copy()
    bad.loc[bad.index[13], "voile"] = " inconnue "
    bad.loc[bad.index[14], "voile"] = "None"
    bad.loc[bad.index[15], "voile"] = "nan"
    bad.loc[bad.index[16], "instrument"] = "nan"
    obj, _ = build_flights(bad)
    assert not [w for w in obj["dict"]["wing"] if w.lower() in ("none", "nan", "")]
    assert "inconnue" in obj["dict"]["wing"]
    recs = by_key(obj)
    assert recs["alpha-test-1013"]["wing"] == "inconnue"
    for key in ("bravo-test2-1014", "zoe-test-1015"):
        assert recs[key]["wing"] is None
    assert recs["alpha-test-1016"]["instrument"] is None
