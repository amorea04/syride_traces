"""Tests du stockage brut (fiche gzip, instantanés de liste) : sans réseau, dans tmp_path."""

import gzip
import importlib
import os
import sys
import types
from datetime import datetime

import pytest


def _stub(name, **attrs):
    """Module factice si le vrai n'est pas installé (Selenium, fastkml : absents de la CI)."""
    try:
        importlib.import_module(name)
        return
    except ImportError:
        pass
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    sys.modules[name] = module


for _name, _attrs in [
    ("selenium", {}), ("selenium.common", {}),
    ("selenium.common.exceptions", {"TimeoutException": type("TimeoutException", (Exception,), {})}),
    ("selenium.webdriver", {}), ("selenium.webdriver.common", {}),
    ("selenium.webdriver.common.by", {"By": object}),
    ("selenium.webdriver.common.keys", {"Keys": object}),
    ("selenium.webdriver.support", {}),
    ("selenium.webdriver.support.ui", {"WebDriverWait": object}),
    ("fastkml", {"kml": types.ModuleType("kml")}),
]:
    _stub(_name, **_attrs)

import analyze_functions  # noqa: E402
import syride_scraper as scraper  # noqa: E402
from syride_parsing import parse_fv_config  # noqa: E402

HTML = "<html><body>Fiche é à ü</body></html>"


def test_sheet_raw_aller_retour(tmp_path):
    path = scraper.save_sheet_raw(str(tmp_path), "123", HTML)
    assert path == str(tmp_path / "traces" / "123" / "123.sheet.html.gz")
    with gzip.open(path, "rb") as fp:
        assert fp.read().decode("utf-8") == HTML
    assert scraper.load_sheet_raw(str(tmp_path / "traces" / "123"), "123") == HTML
    assert not [f for f in os.listdir(tmp_path / "traces" / "123") if f.endswith(".tmp")]


def test_sheet_raw_non_compressee_et_absente(tmp_path):
    folder = tmp_path / "traces" / "5"
    folder.mkdir(parents=True)
    assert scraper.load_sheet_raw(str(folder), "5") is None
    (folder / "5.sheet.html").write_text(HTML, encoding="utf-8")
    assert scraper.load_sheet_raw(str(folder), "5") == HTML


def test_sheet_raw_illisible(tmp_path):
    folder = tmp_path / "traces" / "5"
    folder.mkdir(parents=True)
    (folder / "5.sheet.html.gz").write_bytes(b"pas du gzip")
    assert scraper.load_sheet_raw(str(folder), "5") is None


def test_sheet_raw_deflate_abime_et_mauvais_encodage(tmp_path, capsys):
    folder = tmp_path / "traces" / "5"
    folder.mkdir(parents=True)
    good = gzip.compress(HTML.encode("utf-8"))
    (folder / "5.sheet.html.gz").write_bytes(good[:12] + b"\x00" * 20 + good[32:])   # zlib.error
    assert scraper.load_sheet_raw(str(folder), "5") is None
    assert "illisible" in capsys.readouterr().out
    (folder / "5.sheet.html.gz").write_bytes(gzip.compress(b"\xff\xfe\xfa"))         # pas de l'UTF-8
    assert scraper.load_sheet_raw(str(folder), "5") is None


def test_sheet_raw_ecriture_atomique(tmp_path, monkeypatch):
    scraper.save_sheet_raw(str(tmp_path), "123", "ancienne")

    def boom(src, dst):
        raise OSError("plantage")

    monkeypatch.setattr(scraper.os, "replace", boom)
    with pytest.raises(OSError):
        scraper.save_sheet_raw(str(tmp_path), "123", "nouvelle")
    monkeypatch.undo()
    # l'ancienne fiche est intacte
    assert scraper.load_sheet_raw(str(tmp_path / "traces" / "123"), "123") == "ancienne"


def test_snapshot_rotation(tmp_path):
    for minute in range(8):
        scraper.save_list_snapshot(str(tmp_path), f"liste {minute}", keep=5,
                                   now=datetime(2026, 11, 21, 10, minute, 0))
    names = sorted(os.listdir(tmp_path / "_raw"))
    assert names == [f"activites_20261121-10{m:02d}00.html.gz" for m in range(3, 8)]
    with gzip.open(tmp_path / "_raw" / names[-1], "rb") as fp:
        assert fp.read().decode("utf-8") == "liste 7"


def test_raw_ignore_par_le_scan(tmp_path):
    pilot = tmp_path / "Pilote"
    scraper.save_list_snapshot(str(pilot), "liste")
    scraper.save_sheet_raw(str(pilot), "42", HTML)
    scraper.save_flight_data(str(pilot), {"num_activite": "42"}, quiet=True)
    assert scraper.initiate_search(str(pilot)) == ["42"]
    jsons = analyze_functions.get_json_files(directory=str(pilot))
    assert [os.path.basename(j) for j in jsons] == ["42.json"]


def test_parse_fv_config():
    ok = '<html><script id="fv-config" type="application/json">{"points": [[1, 2, 3]], "times": [1]}</script></html>'
    assert parse_fv_config(ok) == {"points": [[1, 2, 3]], "times": [1]}
    assert parse_fv_config("<html></html>") is None
    assert parse_fv_config('<script id="fv-config">{pas du json</script>') is None
    assert parse_fv_config('<script id="fv-config">[1, 2]</script>') is None
