"""Fixtures communes : DataFrame synthétique, export de référence, faux module d'insights."""

import datetime as dt
import sys
from pathlib import Path

import pandas as pd
import pytest

SRC_DIR = Path(__file__).resolve().parents[2]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import export_web  # noqa: E402
from web_export.common import write_hashed_json  # noqa: E402
from web_export.fixtures import FIXTURES_NOW, FIXTURES_TODAY, synthetic_flights_df  # noqa: E402

INSIGHTS_YEAR = 2025


def pytest_configure(config):
    config.addinivalue_line("markers", "real: test sur le vrai pkl (sauté s'il est absent)")


def fake_export_insights(df, out_dir, slugs, today=None, pilots=None):
    """Remplace web_export.insights.export_insights : un fichier minimal valide par pilote."""
    selected = list(slugs) if pilots is None else list(pilots)
    entries = []
    for pseudo in sorted(selected):
        slug = slugs[pseudo]
        obj = {"v": 1, "pilot": slug, "year": INSIGHTS_YEAR, "cutoff": today.isoformat(),
               "by_disc": {"tout": None, "parapente": None, "paramoteur": None}}
        rel = write_hashed_json(obj, out_dir, "insights/{}-{}".format(slug, INSIGHTS_YEAR))
        entries.append({"pilot": slug, "year": INSIGHTS_YEAR, "file": rel})
    return entries


def export(df, out_dir, **kwargs):
    """run_export silencieux avec dates figées et faux insights (sauf si insights_fn est fourni)."""
    kwargs.setdefault("insights_fn", fake_export_insights)
    kwargs.setdefault("coords_path", None)
    kwargs.setdefault("today", FIXTURES_TODAY)
    kwargs.setdefault("now", FIXTURES_NOW)
    return export_web.run_export(df, Path(out_dir), log=lambda _msg: None, **kwargs)


@pytest.fixture(scope="session")
def df():
    return synthetic_flights_df()


@pytest.fixture(scope="session")
def exported(tmp_path_factory, df):
    """(dossier de sortie, résumé) d'un export complet des fixtures."""
    out = tmp_path_factory.mktemp("export")
    return out, export(df, out)


@pytest.fixture()
def fresh_dir(tmp_path):
    return tmp_path / "data"


def load(out_dir, rel):
    import json
    return json.loads((Path(out_dir) / rel).read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def files(exported):
    out, summary = exported
    meta = summary["meta"]
    return {"flights": load(out, meta["files"]["flights"]), "sites": load(out, meta["files"]["sites"]), "meta": meta}


@pytest.fixture(scope="session")
def real_df():
    try:
        import params_scrap_syride as params
        path = Path(params.pkl_path)
    except Exception:  # pragma: no cover
        pytest.skip("params_scrap_syride indisponible")
    if not path.exists():
        pytest.skip("pkl réel absent")
    return pd.read_pickle(path)
