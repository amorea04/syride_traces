"""Lot 7.1 : publish.py (fonctions pures, sans réseau ni npm)."""

import gzip
import json
import random

import pytest

import publish

COLUMNS = ["pilot", "activity", "date", "time", "site", "wing", "instrument", "mode",
           "duration_min", "dist_km", "dist_cum_km", "speed_avg", "speed_max", "ceiling_m", "gain_m",
           "vario_max", "g_max", "incomplete", "source", "syride_num"]


def write_flights(dist, columns=COLUMNS):
    data = dist / "data"
    data.mkdir(parents=True, exist_ok=True)
    (data / "flights.abcdef.json").write_text(json.dumps({"columns": columns}), encoding="utf-8")


def test_check_d12_propre(tmp_path):
    write_flights(tmp_path)
    (tmp_path / "index.html").write_text("<html></html>")
    assert publish.check_d12(tmp_path, COLUMNS) == []


def test_check_d12_schema_reel():
    assert publish.allowed_flight_columns() == COLUMNS


def test_check_d12_fichier_gpx_imbrique_casse_indifferente(tmp_path):
    write_flights(tmp_path)
    nested = tmp_path / "assets" / "x"
    nested.mkdir(parents=True)
    (nested / "vol.GPX").write_text("<gpx/>")
    violations = publish.check_d12(tmp_path, COLUMNS)
    assert len(violations) == 1 and "vol.GPX" in violations[0]


@pytest.mark.parametrize("name", ["a.igc", "b.KML"])
def test_check_d12_autres_extensions(tmp_path, name):
    write_flights(tmp_path)
    (tmp_path / name).write_text("x")
    assert len(publish.check_d12(tmp_path, COLUMNS)) == 1


def test_check_d12_dossier_tracks(tmp_path):
    write_flights(tmp_path)
    (tmp_path / "data" / "tracks").mkdir()
    violations = publish.check_d12(tmp_path, COLUMNS)
    assert len(violations) == 1 and "tracks" in violations[0]


def test_check_d12_colonne_lat_liste_blanche(tmp_path):
    write_flights(tmp_path, COLUMNS + ["lat"])
    violations = publish.check_d12(tmp_path, COLUMNS)
    assert len(violations) == 1 and "lat" in violations[0]


def test_check_d12_colonne_lat_liste_noire(tmp_path, monkeypatch):
    monkeypatch.setattr(publish, "allowed_flight_columns", lambda *a, **k: None)
    write_flights(tmp_path, COLUMNS + ["start_lat"])
    assert len(publish.check_d12(tmp_path)) == 1
    write_flights(tmp_path, COLUMNS)
    assert publish.check_d12(tmp_path) == []


def test_fraicheur():
    assert publish.needs_export(100.0, None) is True
    assert publish.needs_export(200.0, 100.0) is True
    assert publish.needs_export(100.0, 200.0) is False
    assert publish.needs_export(100.0, 200.0, force=True) is True


def test_urls_des_vols_tires():
    flights = {
        "columns": COLUMNS,
        "dict": {"pilot": ["j2f", "Tof Torsac"]},
        "rows": [
            [0] + [None] * 18 + [7],
            [1] + [None] * 18 + [42],
            [1] + [None] * 18 + [None],  # sans syride_num : jamais tiré
        ],
    }
    urls = publish.sample_flight_urls(flights, 5, random.Random(1))
    assert sorted(urls) == [
        "https://www.syride.com/fr/pilotes/Tof%20Torsac/42",
        "https://www.syride.com/fr/pilotes/j2f/7",
    ]
    assert len(publish.sample_flight_urls(flights, 1, random.Random(1))) == 1


@pytest.mark.parametrize(
    "statuses, blocking, nb_warnings",
    [
        ([200, 200, 301], False, 0),
        ([404, 404, 404], True, 3),
        ([404, 200, 404], False, 2),
        ([403, 429, 503], False, 3),
        ([404, 403, None], False, 3),
        ([500, 200, 200], False, 1),
    ],
)
def test_verdict_statuts(statuses, blocking, nb_warnings):
    is_blocking, warnings = publish.link_verdict(statuses)
    assert is_blocking is blocking
    assert len(warnings) == nb_warnings


def test_tailles(tmp_path):
    (tmp_path / "sub").mkdir()
    a, b = b"a" * 1000, b"bonjour" * 100
    (tmp_path / "a.txt").write_bytes(a)
    (tmp_path / "sub" / "b.txt").write_bytes(b)
    sizes = publish.dir_sizes(tmp_path)
    assert sizes["files"] == 2
    assert sizes["raw"] == len(a) + len(b)
    assert sizes["gzip"] == len(gzip.compress(a, 6)) + len(gzip.compress(b, 6))
    assert publish.format_size(2048) == "2.0 Ko"
    assert publish.format_size(3 * 1024 * 1024) == "3.00 Mo"
