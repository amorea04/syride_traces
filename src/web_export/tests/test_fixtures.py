"""Le jeu synthétique (web_export/fixtures.py) a le même schéma que le pkl produit sous pandas 3."""

import pandas as pd
import pytest

import analyze_functions
from web_export.fixtures import synthetic_flights_df


def _raw_row() -> pd.DataFrame:
    """Une ligne brute, telle que la base la fournit avant assign_data_types (tout en texte)."""
    row = {col: "x" for col in ["pilote", "types", "site", "voile", "instrument", "site_activite", "source_stats"]}
    row.update(num_activite="1000", date="01/02/2024", date_activite="01/02/2024", heure="12h30",
               flight_time="0 days 00:30:00", duree_vol="0 days 00:29:59")
    row.update({col: "12.5" for col in analyze_functions.NUMERIC_STATS})
    return pd.DataFrame([row])


def test_types_identiques_a_assign_data_types():
    typed = analyze_functions.assign_data_types(_raw_row())
    fx = synthetic_flights_df()
    ecarts = {c: (str(typed[c].dtype), str(fx[c].dtype) if c in fx.columns else "absente") for c in typed.columns
              if c not in fx.columns or typed[c].dtype != fx[c].dtype}
    assert ecarts == {}, "colonne : (pipeline, fixtures)"


@pytest.mark.real
def test_schema_identique_au_pkl_reel(real_df):
    fx = synthetic_flights_df()
    assert list(fx.columns) == list(real_df.columns)
    ecarts = {c: (str(real_df[c].dtype), str(fx[c].dtype)) for c in real_df.columns if real_df[c].dtype != fx[c].dtype}
    assert ecarts == {}, "colonne : (pkl réel, fixtures)"
