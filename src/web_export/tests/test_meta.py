"""Lot 1.6 : meta.json, purge et export partiel."""

import json
from pathlib import Path

import pytest

from web_export.tests.conftest import export, fake_export_insights, load
from web_export.meta import build_meta, purge_unreferenced
from web_export.schema import validate


def test_meta_content(exported, files):
    out, summary = exported
    meta = files["meta"]
    validate(meta, "MetaFile")
    assert meta["counts"] == {"flights": 48, "pilots": 3, "sites": 6, "wings": 4, "excluded_flights": 2}
    assert meta["data_updated_at"] == max(r[2] for r in files["flights"]["rows"])
    assert meta["generated_at"].endswith("Z")
    assert [(e["pilot"], e["year"]) for e in meta["insights"]] == [("alpha-test", 2025), ("bravo-test2", 2025), ("zoe-test", 2025)]
    assert (Path(out) / "meta.json").exists() and "." not in "meta.json".replace(".json", "")
    assert (Path(out) / meta["files"]["flights"]).exists()


def test_insights_sorted_by_pilot_then_year(files):
    entries = [{"pilot": "b", "year": 2024, "file": "x"}, {"pilot": "a", "year": 2025, "file": "y"},
               {"pilot": "a", "year": 2024, "file": "z"}]
    meta = build_meta(files["flights"], 0, files["meta"]["files"], entries)
    assert [(e["pilot"], e["year"]) for e in meta["insights"]] == [("a", 2024), ("a", 2025), ("b", 2024)]


def test_purge_removes_only_unreferenced(df, fresh_dir):
    export(df, fresh_dir)
    (fresh_dir / "insights").mkdir(exist_ok=True)
    stale = ["flights.0123456789.json", "sites.0123456789.json", "insights/old-2020.0123456789.json"]
    for rel in stale:
        (fresh_dir / rel).write_text("{}")
    (fresh_dir / "notes.txt").write_text("à garder")
    summary = export(df, fresh_dir)
    assert sorted(summary["purged"]) == sorted(stale)
    assert (fresh_dir / "notes.txt").exists()
    meta = load(fresh_dir, "meta.json")
    for rel in [meta["files"]["flights"], meta["files"]["sites"]] + [e["file"] for e in meta["insights"]]:
        assert (fresh_dir / rel).exists()
    assert purge_unreferenced(meta, fresh_dir) == []


def test_partial_sites_keeps_other_entries(df, fresh_dir):
    export(df, fresh_dir)
    before = load(fresh_dir, "meta.json")
    export(df, fresh_dir, only="sites")
    after = load(fresh_dir, "meta.json")
    assert after["files"] == before["files"] and after["insights"] == before["insights"]


def test_partial_flights_changes_only_flights(df, fresh_dir):
    export(df, fresh_dir)
    before = load(fresh_dir, "meta.json")
    changed = df.copy()
    changed.loc[changed.index[20], "distance"] = 77.7
    export(changed, fresh_dir, only="flights")
    after = load(fresh_dir, "meta.json")
    assert after["files"]["flights"] != before["files"]["flights"]
    assert after["files"]["sites"] == before["files"]["sites"]
    assert after["insights"] == before["insights"]
    assert not (fresh_dir / before["files"]["flights"]).exists()      # ancien fichier purgé


def test_partial_insights_single_pilot_merges(df, fresh_dir):
    export(df, fresh_dir)
    before = load(fresh_dir, "meta.json")
    seen = {}

    def spy(df_, out_dir, slugs, today=None, pilots=None):
        seen["pilots"] = pilots
        return fake_export_insights(df_, out_dir, slugs, today=today, pilots=pilots)

    export(df, fresh_dir, only="insights", pilots=["zoe-test"], insights_fn=spy)
    assert seen["pilots"] == ["Zoé Test"]
    after = load(fresh_dir, "meta.json")
    assert after["insights"] == before["insights"]       # même contenu -> mêmes noms, 3 pilotes conservés


def test_partial_without_previous_meta_fails(df, fresh_dir):
    with pytest.raises(FileNotFoundError):
        export(df, fresh_dir, only="sites")


def test_partial_with_missing_file_fails(df, fresh_dir):
    export(df, fresh_dir)
    meta = load(fresh_dir, "meta.json")
    (fresh_dir / meta["files"]["sites"]).unlink()
    with pytest.raises(FileNotFoundError):
        export(df, fresh_dir, only="flights")


def test_full_purges_everything(df, fresh_dir):
    export(df, fresh_dir)
    (fresh_dir / "flights.0123456789.json").write_text("{}")
    export(df, fresh_dir, full=True)
    assert not (fresh_dir / "flights.0123456789.json").exists()


def test_full_and_only_are_incompatible(df, fresh_dir):
    with pytest.raises(ValueError):
        export(df, fresh_dir, full=True, only="flights")


def test_deterministic_hashes(df, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    export(df, a)
    export(df.copy(), b)
    names = lambda d: sorted(p.relative_to(d).as_posix() for p in d.rglob("*.json"))
    assert names(a) == names(b)
    for rel in names(a):
        assert (a / rel).read_bytes() == (b / rel).read_bytes()
