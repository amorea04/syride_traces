"""Tests de web_export.insights : contrat, déterminisme, garde-fous D12 et identité avec le rapport HTML."""

import datetime as dt
import html
import json
import re
from pathlib import Path

import pandas as pd
import pytest

from rapport.report_html import MAP_MAX_ZONE_VIEWS, build_report
from rapport import report_data as rd
from web_export import insights
from web_export.common import pilot_slugs
from web_export.schema import validate

TODAY = dt.date(2025, 12, 31)
REAL_TODAY = dt.date(2026, 11, 15)
COORD_KEYS = {"lat", "lon", "latitude", "longitude", "mean_latitude", "mean_longitude", "coords", "url"}


def _slugs(df):
    return pilot_slugs(sorted(set(df["pilote"])))


def _read(out, entries):
    return [json.loads((Path(out) / e["file"]).read_text(encoding="utf-8")) for e in entries]


def _walk(obj, path=""):
    """(chemin, clé, valeur) de chaque entrée de dictionnaire du JSON."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield path, k, v
            for item in _walk(v, "{}/{}".format(path, k)):
                yield item
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            for item in _walk(v, "{}/{}".format(path, i)):
                yield item


@pytest.fixture(scope="module")
def synthetic_export(tmp_path_factory, df):
    out = tmp_path_factory.mktemp("insights")
    entries = insights.export_insights(df, out, _slugs(df), TODAY)
    return out, entries


def test_un_fichier_par_pilote_et_annee_valide(synthetic_export, df):
    out, entries = synthetic_export
    assert entries == sorted(entries, key=lambda e: (e["pilot"], e["year"]))
    assert entries, "aucun fichier produit"
    clean = df[pd.to_datetime(df["date"]) >= "1980-01-01"]
    expected = {(s, y) for p, s in _slugs(df).items()
                for y in set(pd.to_datetime(clean[clean["pilote"] == p]["date"]).dt.year)}
    assert {(e["pilot"], e["year"]) for e in entries} == expected
    for e, obj in zip(entries, _read(out, entries)):
        assert re.fullmatch(r"insights/{}-{}\.[0-9a-f]{{10}}\.json".format(e["pilot"], e["year"]), e["file"])
        assert (obj["pilot"], obj["year"]) == (e["pilot"], e["year"])
        validate(obj, "InsightsFile")


def test_date_sentinelle_ecartee(synthetic_export):
    _, entries = synthetic_export
    assert all(e["year"] >= 1980 for e in entries)


def test_deterministe(synthetic_export, df, tmp_path):
    out, entries = synthetic_export
    again = insights.export_insights(df, tmp_path, _slugs(df), TODAY)
    assert again == entries
    for e in entries:
        assert (out / e["file"]).read_bytes() == (tmp_path / e["file"]).read_bytes()


def test_parallele_identique_au_sequentiel(synthetic_export, df, tmp_path):
    out, entries = synthetic_export
    assert insights.export_insights(df, tmp_path, _slugs(df), TODAY, workers=1) == entries
    for e in entries:
        assert (out / e["file"]).read_bytes() == (tmp_path / e["file"]).read_bytes()


def test_filtre_pilotes(df, tmp_path):
    pseudo = sorted(set(df["pilote"]))[0]
    entries = insights.export_insights(df, tmp_path, _slugs(df), TODAY, pilots=[pseudo])
    assert entries and {e["pilot"] for e in entries} == {_slugs(df)[pseudo]}


def test_discipline_absente_null(df):
    """Un pilote sans vol de paramoteur : by_disc.paramoteur vaut null, les deux autres sont remplis."""
    pseudo = sorted(set(df["pilote"]))[0]
    sub = df[~((df["pilote"] == pseudo) & (df["type_vol"] == "paramoteur"))]
    prepared = insights.prepare(sub)
    year = int(prepared[prepared["pilote"] == pseudo]["date"].dt.year.max())
    obj = insights.build_insight(prepared, pseudo, year, _slugs(df), TODAY)
    assert obj["by_disc"]["paramoteur"] is None
    assert obj["by_disc"]["tout"] is not None and obj["by_disc"]["parapente"] is not None
    validate(obj, "InsightsFile")


def test_cutoff(df):
    pseudo = sorted(set(df["pilote"]))[0]
    prepared = insights.prepare(df)
    today = dt.date(2025, 6, 30)
    assert insights.build_insight(prepared, pseudo, 2025, _slugs(df), today)["cutoff"] == "2025-06-30"
    assert insights.build_insight(prepared, pseudo, 2024, _slugs(df), today)["cutoff"] == "2024-12-31"


def test_aucune_coordonnee_de_vol_ni_url(synthetic_export):
    out, entries = synthetic_export
    for obj in _read(out, entries):
        for _, key, value in _walk(obj):
            assert key not in COORD_KEYS
            assert not (isinstance(value, str) and "syride.com" in value)
        for disc in filter(None, obj["by_disc"].values()):
            assert all(len(zone["bbox"]) == 4 for zone in disc["map_zones"])


def test_references_de_vol_sont_des_cles(synthetic_export):
    out, entries = synthetic_export
    for obj in _read(out, entries):
        for _, key, value in _walk(obj):
            if key == "flight" and value is not None:
                assert re.fullmatch(r"{}-\d+".format(re.escape(obj["pilot"])), value)


def test_pas_de_balise_html(synthetic_export):
    out, entries = synthetic_export
    for obj in _read(out, entries):
        for _, key, value in _walk(obj):
            if isinstance(value, str):
                assert "<" not in value and "&amp;" not in value, (key, value)


# ---------------------------------------------------------------------------
# Identité avec le rapport HTML (données réelles)
# ---------------------------------------------------------------------------
def _page_text(page):
    return html.unescape(re.sub(r"<[^>]+>", "", page))


def _expected_strings(obj, disc):
    """Chaînes d'une Story qui doivent se retrouver telles quelles dans la page du rapport."""
    st = obj["by_disc"][disc]
    out = []
    if st["persona"]:
        p = st["persona"]
        out += [p["label"], p["why"]] + [x for s in p["secondary"] for x in (s["label"], s["why"])]
    if st["gap"]:
        out += [st["gap"]["text"], st["gap"]["note"]]
    for m in st["milestones"]:
        out += [m["title"], m["detail"]]
    out += st["equivalences"]
    out += [v for v in st["texts"].values() if v]
    out += [s["site"] for s in st["new_sites"]] + [w["wing"] for w in st["new_wings"]]
    return [s for s in out if s]


@pytest.mark.real
@pytest.mark.parametrize("pilot", ["AdrienM", "j2f"])
def test_identite_avec_le_rapport_html(real_df, pilot):
    year = 2025
    slugs = pilot_slugs(sorted(set(real_df["pilote"])))
    prepared = insights.prepare(real_df)
    obj = insights.build_insight(prepared, pilot, year, slugs, REAL_TODAY)
    validate(obj, "InsightsFile")
    page = _page_text(build_report(real_df, pilot, year, today=REAL_TODAY))
    assert obj["cutoff"] == "2025-12-31"

    checked = 0
    for disc in ("tout", "parapente", "paramoteur"):
        if obj["by_disc"][disc] is None:
            continue
        for text in _expected_strings(obj, disc):
            assert text in page, "{} / {} : texte absent du rapport : {!r}".format(pilot, disc, text)
            checked += 1
    assert checked > 20

    tout = obj["by_disc"]["tout"]
    # zones de carte : légende des vues zoomées (zones d'au moins 2 sites, 6 au plus, s'il y en a plusieurs)
    zones = tout["map_zones"]
    if len(zones) > 1:
        shown = [z for z in zones if len(z["sites"]) > 1][:MAP_MAX_ZONE_VIEWS]
        for z in shown:
            assert z["name"] in page
    # records battus : autant de cartes « nouveau record » que de records dans les trois disciplines
    n_beaten = sum(len(obj["by_disc"][d]["records_beaten"]) for d in obj["by_disc"] if obj["by_disc"][d])
    raw_page = build_report(real_df, pilot, year, today=REAL_TODAY)
    assert raw_page.count('class="record is-new"') == n_beaten
    # chaque vol cité est un vol du pilote, présent dans la liste du rapport
    for m in tout["milestones"]:
        if m["flight"]:
            num = m["flight"].rsplit("-", 1)[1]
            assert "{}{}/{}".format(rd.SYRIDE_PILOT_URL, pilot, num) in raw_page



def test_coverage_counts_trace_as_gpx():
    """Un vol source_stats « trace » compte dans les statistiques mesurées (gpx), pas dans « aucune »."""
    import pandas as pd
    from rapport.report_data import _coverage
    d = pd.DataFrame({"source_stats": ["gpx", "trace", "fiche", "aucune"]})
    assert _coverage(d)["sources"] == {"gpx": 2, "fiche": 1, "aucune": 1}
