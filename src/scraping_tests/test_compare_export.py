"""migration/compare_export.py : comparaison de deux exports web (recette de la migration Python 3.14)."""

import json

from migration import compare_export


def _write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def _export(root, flights_hash, plafond, generated_at, with_insight=True):
    _write(root / f"flights.{flights_hash}.json", {"rows": [{"id": 1, "plafond": plafond}]})
    files = {"flights": f"flights.{flights_hash}.json"}
    insights = []
    if with_insight:
        _write(root / "insights" / f"x-2024.{flights_hash}.json", {"n": 3})
        insights.append({"pilot": "x", "year": 2024, "file": f"insights/x-2024.{flights_hash}.json"})
    _write(root / "meta.json", {"generated_at": generated_at, "data_refreshed_at": generated_at[:10],
                                "files": files, "insights": insights, "counts": {"flights": 1}})


def test_identique_malgre_hash(tmp_path):
    _export(tmp_path / "a", "1111111111", 1500, "2026-11-21T21:00:00Z")
    _export(tmp_path / "b", "2222222222", 1500, "2026-11-22T08:00:00Z")
    assert compare_export.main(["--a", str(tmp_path / "a"), "--b", str(tmp_path / "b")]) == 0


def test_valeur_differente(tmp_path, capsys):
    _export(tmp_path / "a", "1111111111", 1500, "2026-11-21T21:00:00Z")
    _export(tmp_path / "b", "2222222222", 1501, "2026-11-21T21:00:00Z")
    assert compare_export.main(["--a", str(tmp_path / "a"), "--b", str(tmp_path / "b")]) == 1
    out = capsys.readouterr().out
    assert "flights" in out and "plafond" in out


def test_fichier_manquant(tmp_path, capsys):
    _export(tmp_path / "a", "1111111111", 1500, "2026-11-21T21:00:00Z")
    _export(tmp_path / "b", "1111111111", 1500, "2026-11-21T21:00:00Z", with_insight=False)
    assert compare_export.main(["--a", str(tmp_path / "a"), "--b", str(tmp_path / "b")]) == 1
    assert "insights/x-2024.json" in capsys.readouterr().out


def test_dossier_illisible(tmp_path):
    assert compare_export.main(["--a", str(tmp_path / "absent"), "--b", str(tmp_path)]) == 2
