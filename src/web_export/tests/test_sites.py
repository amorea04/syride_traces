"""Lot 1.3 : sites.json."""

import json

import pytest

from web_export.flights import build_flights, select_exportable
from web_export.schema import validate
from web_export.sites import build_sites


def make(df, coords_path=None):
    flights, _ = build_flights(df)
    kept, _ = select_exportable(df)
    return flights, build_sites(kept, flights, coords_path)


def test_one_site_per_dict_entry(files):
    names = files["flights"]["dict"]["site"]
    sites = files["sites"]["sites"]
    assert [s["name"] for s in sites] == names
    assert [s["id"] for s in sites] == list(range(len(names)))


def test_counts_consistent(files):
    sites = files["sites"]["sites"]
    rows = files["flights"]["rows"]
    assert sum(s["flights"] for s in sites) == sum(1 for r in rows if r[4] is not None)
    for s in sites:
        assert s["flights"] == s["activities"]["parapente"] + s["activities"]["paramoteur"]
        assert s["pilots"] == len({r[0] for r in rows if r[4] == s["id"]})
        assert 1 <= s["pilots"] <= 3


def test_coordinates_from_pkl_means(df):
    flights, (sites, stats) = make(df)
    validate(sites, "SitesFile")
    by_name = {s["name"]: s for s in sites["sites"]}
    kept, _ = select_exportable(df)
    sub = kept[kept["site"] == "Site Alpha"]
    assert by_name["Site Alpha"]["lat"] == round(sub["mean_latitude"].mean(), 4)
    assert by_name["Site Alpha"]["lon"] == round(sub["mean_longitude"].mean(), 4)
    assert by_name["Sans Coordonnées"]["lat"] is None
    assert stats["without_coords"] == ["Sans Coordonnées"]
    assert stats["from_pkl"] == 5


def test_coordinates_never_per_flight(files):
    assert set(files["sites"]["sites"][0]) == {"id", "name", "lat", "lon", "flights", "pilots", "activities"}


def test_fallback_json_and_empty_key(df, tmp_path):
    path = tmp_path / "coords.json"
    path.write_text(json.dumps({
        "": {"latitude": 1.0, "longitude": 2.0, "n_files": 1},
        "Sans Coordonnées": {"latitude": 44.123456, "longitude": 5.654321, "n_files": 2},
        "Site Alpha": {"latitude": 10.0, "longitude": 10.0, "n_files": 2},   # le pkl prime
    }), encoding="utf-8")
    _, (sites, stats) = make(df, path)
    by_name = {s["name"]: s for s in sites["sites"]}
    assert (by_name["Sans Coordonnées"]["lat"], by_name["Sans Coordonnées"]["lon"]) == (44.1235, 5.6543)
    assert by_name["Site Alpha"]["lat"] != 10.0
    assert stats["without_coords"] == [] and stats["from_json"] == 1
    assert all(s["name"] for s in sites["sites"])


def test_four_decimals(files):
    for s in files["sites"]["sites"]:
        for k in ("lat", "lon"):
            assert s[k] is None or round(s[k], 4) == s[k]


@pytest.mark.real
def test_real_sites(real_df):
    import export_web
    flights, (sites, stats) = make(real_df, export_web.DEFAULT_COORDS)
    validate(sites, "SitesFile")
    assert len(sites["sites"]) == len(flights["dict"]["site"])
