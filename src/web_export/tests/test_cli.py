"""Lot 1.7 : CLI export_web.py."""

import json
import sys
import types

import pytest

import export_web
from web_export.tests.conftest import fake_export_insights, load


@pytest.fixture()
def pkl(df, tmp_path):
    path = tmp_path / "flights.pkl"
    df.to_pickle(path)
    return path


def fake_module(monkeypatch):
    mod = types.ModuleType("web_export.insights")
    mod.export_insights = fake_export_insights
    monkeypatch.setitem(sys.modules, "web_export.insights", mod)


def test_cli_full_export(pkl, tmp_path, monkeypatch, capsys):
    fake_module(monkeypatch)
    out = tmp_path / "out"
    assert export_web.main(["--pkl", str(pkl), "--out", str(out)]) == 0
    text = capsys.readouterr().out
    assert "Vols exportés : 48 (écartés : 2 sur 50)" in text and "gzip" in text and "Durée" in text
    meta = load(out, "meta.json")
    assert len(meta["insights"]) == 3


def test_cli_warns_without_insights_module(pkl, tmp_path, monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "web_export.insights", None)
    out = tmp_path / "out"
    assert export_web.main(["--pkl", str(pkl), "--out", str(out)]) == 0
    assert "ATTENTION" in capsys.readouterr().out
    assert load(out, "meta.json")["insights"] == []


def test_cli_only_insights_without_module_fails(pkl, tmp_path, monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "web_export.insights", None)
    out = tmp_path / "out"
    export_web.main(["--pkl", str(pkl), "--out", str(out), "--only", "flights"]) 
    assert export_web.main(["--pkl", str(pkl), "--out", str(out), "--only", "insights"]) == 1


def test_cli_pilot_option_accepts_slug_and_pseudo(pkl, tmp_path, monkeypatch):
    seen = []
    mod = types.ModuleType("web_export.insights")

    def spy(df, out_dir, slugs, today=None, pilots=None):
        seen.append(pilots)
        return fake_export_insights(df, out_dir, slugs, today=today, pilots=pilots)

    mod.export_insights = spy
    monkeypatch.setitem(sys.modules, "web_export.insights", mod)
    out = tmp_path / "out"
    assert export_web.main(["--pkl", str(pkl), "--out", str(out), "--pilot", "zoe-test", "--pilot", "Alpha_Test"]) == 0
    assert seen == [["Zoé Test", "Alpha_Test"]]
    assert [e["pilot"] for e in load(out, "meta.json")["insights"]] == ["alpha-test", "zoe-test"]
    assert export_web.main(["--pkl", str(pkl), "--out", str(out), "--pilot", "inconnu"]) == 1


def test_cli_errors(pkl, tmp_path, monkeypatch):
    fake_module(monkeypatch)
    assert export_web.main(["--pkl", str(tmp_path / "absent.pkl"), "--out", str(tmp_path / "o")]) == 1
    assert export_web.main(["--pkl", str(pkl), "--out", str(tmp_path / "o"), "--full", "--only", "sites"]) == 1


def test_fixtures_generation_matches_cli(tmp_path, monkeypatch):
    from web_export import fixtures
    monkeypatch.setitem(sys.modules, "web_export.insights", None)
    fixtures.generate(tmp_path / "fx", log=lambda _m: None)
    assert sorted(p.name.split(".")[0] for p in (tmp_path / "fx").glob("*.json")) == ["flights", "meta", "sites"]


@pytest.mark.real
def test_real_export(real_df, tmp_path):
    summary = export_web.run_export(real_df, tmp_path / "real", only=None, insights_fn=lambda *a, **k: [],
                                    log=lambda _m: None)
    n_excluded = int((real_df["date"].dt.year < 1980).sum())     # vols à date sentinelle 1901
    assert summary["meta"]["counts"]["flights"] == len(real_df) - n_excluded
    assert summary["meta"]["counts"]["pilots"] == real_df["pilote"].nunique()
    assert summary["meta"]["counts"]["excluded_flights"] == n_excluded
