"""Lot 1.1 : validation contre schema.json."""

import copy

import pytest

from web_export.schema import SchemaValidationError, validate


def test_exports_are_valid(files):
    validate(files["meta"], "MetaFile")
    validate(files["flights"], "FlightsFile")
    validate(files["sites"], "SitesFile")


def test_unknown_kind():
    with pytest.raises(ValueError):
        validate({}, "Nope")


def test_error_message_has_path(files):
    bad = copy.deepcopy(files["flights"])
    bad["rows"][3][3] = "1901-01-01"
    with pytest.raises(SchemaValidationError) as exc:
        validate(bad, "FlightsFile")
    assert "rows/3/3" in str(exc.value)


def test_rejects_extra_property_and_nonpositive(files):
    bad = copy.deepcopy(files["flights"])
    bad["lat"] = 1
    with pytest.raises(SchemaValidationError):
        validate(bad, "FlightsFile")
    bad = copy.deepcopy(files["flights"])
    bad["rows"][0][12] = 0
    with pytest.raises(SchemaValidationError):
        validate(bad, "FlightsFile")


def test_error_count_is_limited(files):
    bad = copy.deepcopy(files["flights"])
    for row in bad["rows"]:
        row[2] = "1901-01-01"   # colonne date
    with pytest.raises(SchemaValidationError) as exc:
        validate(bad, "FlightsFile")
    assert str(exc.value).count("\n") <= 7
    assert "autre(s) erreur(s)" in str(exc.value)


def test_date_time_format_is_checked(files):
    bad = dict(files["meta"], generated_at="hier")
    with pytest.raises(SchemaValidationError):
        validate(bad, "MetaFile")
    validate(dict(files["meta"], generated_at="2026-01-01T00:00:00Z"), "MetaFile")


def test_insights_file(files):
    ok = {"v": 1, "pilot": "j2f", "year": 2025, "cutoff": "2025-12-31",
          "by_disc": {"tout": None, "parapente": None, "paramoteur": None}}
    validate(ok, "InsightsFile")
    with pytest.raises(SchemaValidationError):
        validate(dict(ok, year=1979), "InsightsFile")
