"""
Jeu de données synthétique (pilotes fictifs) pour les tests Python et web : mêmes colonnes et dtypes que le pkl.
`python src/web_export/fixtures.py` (ou `make fixtures`) régénère web/tests/fixtures/data/ avec le code de la CLI.
"""

import datetime as dt
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SRC_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SRC_DIR.parent
FIXTURES_DIR = ROOT_DIR / "web" / "tests" / "fixtures" / "data"
FIXTURES_TODAY = dt.date(2025, 12, 31)
FIXTURES_NOW = dt.datetime(2026, 1, 1, 12, 0, 0, tzinfo=dt.timezone.utc)

PILOTS = ["Zoé Test", "Alpha_Test", "bravo test2"]
SITES = {  # nom -> (lat, lon) moyens fictifs ; None = site sans coordonnées
    "Site Alpha": (45.0, 6.0), "Site Bêta": (44.5, 5.5), "Mont Gamma": (43.2, 1.4),
    "Plaine Delta": (46.1, 2.2), "Plage Epsilon": (43.5, -1.5), "Sans Coordonnées": None,
}
WINGS = ["voile un", "Voile Deux", "voile trois", "daytona test"]
INSTRUMENTS = ["Instrument A", "Instrument B"]
MODES = {"parapente": ["Vol site", "Vol treuil", "Vol rando", "Vol bord de mer", "Vol site "], "paramoteur": ["Vol moteur"]}
# Sans accent, comme le pkl réel (`CATEGORY_ORDERS["mois"]` de src/legacy/app_functions.py).
MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
SEASONS = ["hiver", "hiver", "printemps", "printemps", "printemps", "été", "été", "été", "automne", "automne", "automne", "hiver"]
NAN = float("nan")


def _edge_cases(df: pd.DataFrame) -> None:
    """Cas limites déterministes (appliqués seulement si le DataFrame est assez grand)."""
    n = len(df)
    def put(i, **cols):
        if i < n:
            for col, val in cols.items():
                df.iloc[i, df.columns.get_loc(col)] = val
    put(0, vitesse_max=0.0, vario_max=-1.0)
    put(1, gain=-1.0, plafond=NAN)
    put(2, distance=0.04, g_max=NAN)
    put(3, date=pd.Timestamp("1901-01-01"), date_activite=pd.Timestamp("1901-01-01"), annee=1901)
    put(4, date=pd.Timestamp("1901-01-01"), date_activite=pd.Timestamp("1901-01-01"), annee=1901)
    put(5, voile="")
    put(6, voile=NAN)
    put(7, types="Vol site ")
    put(8, instrument=NAN)
    put(9, source_stats="aucune", vitesse_moyenne=NAN, vitesse_max=NAN, plafond=NAN, gain=NAN, vario_max=NAN, g_max=NAN,
        distance_cumulee=NAN, latitude=NAN, longitude=NAN)
    put(10, incomplet=True, duree_vol_minutes=NAN)
    put(11, heure=None, site=NAN)
    put(12, site="Sans Coordonnées", mean_latitude=NAN, mean_longitude=NAN)


def synthetic_flights_df(n_flights: int = 50, seed: int = 0) -> pd.DataFrame:
    """DataFrame synthétique déterministe, même schéma que global_flights_data.pkl."""
    rng = np.random.RandomState(seed)
    n = int(n_flights)
    site_names = list(SITES)
    pilot = [PILOTS[i % len(PILOTS)] for i in range(n)]
    activity = ["paramoteur" if rng.rand() < 0.4 else "parapente" for _ in range(n)]
    types = [MODES[a][rng.randint(len(MODES[a]))] for a in activity]
    site = [site_names[rng.randint(len(site_names))] for _ in range(n)]
    days = rng.randint(0, 2 * 365, size=n)
    date = pd.to_datetime(pd.Timestamp("2024-01-01") + pd.to_timedelta(days, unit="D"))
    minutes = np.round(rng.uniform(5, 180, size=n), 2)
    flight_time = pd.to_timedelta(np.round(minutes * 60), unit="s")
    mean = [SITES[s] for s in site]
    mean_lat = np.array([m[0] + rng.uniform(-0.01, 0.01) if m else NAN for m in mean])
    mean_lon = np.array([m[1] + rng.uniform(-0.01, 0.01) if m else NAN for m in mean])
    dist = np.round(rng.uniform(1, 80, size=n), 1)
    df = pd.DataFrame({
        "pilote": pilot,
        "id_activite": [str(1000000 + i) for i in range(n)],
        "num_activite": np.arange(1000, 1000 + n, dtype="int64"),
        "types": types,
        "site": site,
        "date": date,
        "heure": [dt.time(int(rng.randint(8, 19)), int(rng.randint(0, 60)), 0) for _ in range(n)],
        "flight_time": flight_time,
        "voile": [WINGS[rng.randint(len(WINGS))] for _ in range(n)],
        "distance": dist,
        "instrument": [INSTRUMENTS[rng.randint(len(INSTRUMENTS))] for _ in range(n)],
        "is_syride": True,
        "date_activite": date,
        "site_activite": site,
        "distance_activite": dist,
        "distance_cumulee": np.round(dist * rng.uniform(1, 1.5, size=n), 1),
        "vitesse_max": np.round(rng.uniform(30, 90, size=n), 1),
        "vitesse_moyenne": np.round(rng.uniform(15, 45, size=n), 1),
        "plafond": np.round(rng.uniform(300, 3000, size=n)),
        "gain": np.round(rng.uniform(50, 1500, size=n)),
        "duree_vol": flight_time - pd.to_timedelta(1, unit="s"),
        "vario_max": np.round(rng.uniform(1, 6, size=n), 1),
        "g_max": np.round(rng.uniform(1, 2.5, size=n), 1),
        "source_stats": [["gpx", "fiche"][int(rng.rand() < 0.15)] for _ in range(n)],
        "incomplet": False,
        "longitude": mean_lon + rng.uniform(-0.05, 0.05, size=n),
        "latitude": mean_lat + rng.uniform(-0.05, 0.05, size=n),
        "duree_vol_minutes": minutes,
        "type_vol": activity,
        "annee": np.asarray(date.year, dtype="int32"),
        "mois": [MONTHS[d.month - 1] for d in date],
        "jour_semaine": [DAYS[d.weekday()] for d in date],
        "saison": [SEASONS[d.month - 1] for d in date],
        "mean_longitude": mean_lon,
        "mean_latitude": mean_lat,
        "date_update": pd.Timestamp("2026-01-01 00:00:00"),
    })
    for col in ("heure", "voile", "instrument", "site", "types"):
        df[col] = df[col].astype(object)
    df["mean_latitude"] = df["mean_latitude"].astype("float64")
    _edge_cases(df)
    return df


def generate(out_dir: Path = FIXTURES_DIR, n_flights: int = 50, insights_fn=None, log=print) -> dict:
    """Écrit meta + flights + sites (+ insights si le module existe) via le même code que la CLI."""
    if str(SRC_DIR) not in sys.path:
        sys.path.insert(0, str(SRC_DIR))
    import export_web
    return export_web.run_export(synthetic_flights_df(n_flights), Path(out_dir), full=True, coords_path=None,
                                 today=FIXTURES_TODAY, now=FIXTURES_NOW, insights_fn=insights_fn, log=log)


if __name__ == "__main__":
    sys.path[0] = str(SRC_DIR)      # évite que le dossier web_export masque les modules de src/
    generate()
