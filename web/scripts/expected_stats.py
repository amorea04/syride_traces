"""
Valeurs de référence des statistiques TypeScript (non-régression, ROADMAP_WEBAPP.md lot 2.5).

Relit les fixtures `flights.*.json` (et un jeu dense, généré ici) en DataFrame au format du pkl, appelle les VRAIES
fonctions Python (src/app_functions.py et src/rapport/report_data.py, importées, jamais recopiées) sur plusieurs
sélections, et écrit `web/tests/fixtures/expected_stats.json`, que `web/tests/stats.regression.test.ts` compare aux
fonctions de `web/src/lib/` avec une tolérance de 1e-6.

Lancement (Python 3.8, aucun paquet à installer) : `make expected-stats` ou `npm run gen:expected` dans web/.

Deux accrocs de l'existant, contournés sans toucher aux fichiers de src/ :
  * `app_functions.py` annote `list[str]` (Python 3.9+) : on le charge avec `from __future__ import annotations`
    ajouté en tête du texte source ; le code exécuté est celui du fichier, sans copie. Il importe plotly (présent).
  * `app.py` lance Dash à l'import : il n'est pas importé.
"""

import datetime as dt
import glob
import json
import math
import re
import sys
import types
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
FIXTURES = ROOT / "web" / "tests" / "fixtures"
DATA = FIXTURES / "data"
OUT = FIXTURES / "expected_stats.json"
sys.path.insert(0, str(SRC))

from rapport import report_data as rd  # noqa: E402
from web_export.fixtures import synthetic_flights_df  # noqa: E402
from web_export.flights import build_flights, select_exportable  # noqa: E402
from web_export.sites import build_sites  # noqa: E402

MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre",
          "novembre", "decembre"]
DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
AXES = [("pilote", "pilote"), ("annee", "annee"), ("mois", "mois"), ("voile", "voile"),
        ("jour_semaine", "jour_semaine"), ("saison", "saison"), ("site", "site"), ("heure", "heure_h")]
DENSE_FLIGHTS, DENSE_SEED = 400, 7
DECIMALS = 9        # la tolérance du test est 1e-6 : inutile d'écrire 17 chiffres
DENSE_CASES = (0, 1, 4, 6)   # le jeu dense ne garde que quelques sélections (taille du fichier)


def load_app_functions():
    """Charge src/app_functions.py tel quel, avec des annotations paresseuses (Python 3.8)."""
    path = SRC / "app_functions.py"
    source = "from __future__ import annotations\n" + path.read_text(encoding="utf-8")
    module = types.ModuleType("app_functions")
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


app_functions = load_app_functions()


# ---------------------------------------------------------------------------
# Reconstruction du DataFrame du pkl à partir de flights.json + sites.json
# ---------------------------------------------------------------------------


def frame_from_export(flights_obj, sites_obj):
    """DataFrame au format du pkl (colonnes lues par app_functions.py et report_data.py)."""
    d = flights_obj["dict"]
    coords = {s["name"]: (s["lat"], s["lon"]) for s in sites_obj["sites"]}
    nan = float("nan")
    records = []
    for row in flights_obj["rows"]:
        r = dict(zip(flights_obj["columns"], row))
        date = pd.Timestamp(r["date"])
        site = d["site"][r["site"]] if r["site"] is not None else nan
        lat, lon = coords.get(site, (None, None)) if r["site"] is not None else (None, None)
        h, m = (int(x) for x in r["time"].split(":")) if r["time"] else (None, None)
        mode = d["mode"][r["mode"]] if r["mode"] is not None else None
        record = {
            "pilote": d["pilot"][r["pilot"]],
            "type_vol": d["activity"][r["activity"]],
            "date": date,
            "heure": dt.time(h, m) if h is not None else None,
            "site": site,
            "voile": d["wing"][r["wing"]] if r["wing"] is not None else nan,
            "instrument": d["instrument"][r["instrument"]] if r["instrument"] is not None else nan,
            "types": "Vol " + mode.lower() if mode else nan,
            "duree_vol_minutes": nan if r["duration_min"] is None else float(r["duration_min"]),
            "distance": r["dist_km"], "distance_cumulee": r["dist_cum_km"],
            "vitesse_moyenne": r["speed_avg"], "vitesse_max": r["speed_max"], "plafond": r["ceiling_m"],
            "gain": r["gain_m"], "vario_max": r["vario_max"], "g_max": r["g_max"],
            "incomplet": bool(r["incomplete"]), "source_stats": d["source"][r["source"]],
            "num_activite": r["syride_num"],
            "annee": date.year, "saison": rd.SEASON_OF_MONTH[date.month], "mois": MONTHS[date.month - 1], "jour_semaine": DAYS[date.weekday()],
            "latitude": nan if lat is None else lat, "longitude": nan if lon is None else lon,
            "mean_latitude": nan if lat is None else lat, "mean_longitude": nan if lon is None else lon,
        }
        records.append(record)
    df = pd.DataFrame(records)
    for col in ("distance", "distance_cumulee", "vitesse_moyenne", "vitesse_max", "plafond", "gain",
                "vario_max", "g_max"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")   # None -> NaN
    df["annee"] = df["annee"].astype("int64")
    return df


def with_hour(df):
    """Colonne `heure_h` (heure entière de décollage, NaN si inconnue) : axe « heure de décollage », nouveau."""
    out = df.copy()
    out["heure_h"] = [rd._hour_of(v) for v in out["heure"]]
    return out


# ---------------------------------------------------------------------------
# Conversion en JSON : camelCase, dates ISO, NaN -> null
# ---------------------------------------------------------------------------


def camel(name):
    parts = name.split("_")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def plain(value):
    """Valeur JSON : numpy -> natif, date -> ISO, NaN -> None, tuple -> liste."""
    if isinstance(value, dict):
        return {(camel(k) if isinstance(k, str) else str(k)): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if isinstance(value, (dt.date, dt.datetime, pd.Timestamp)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return None if math.isnan(value) else round(float(value), DECIMALS)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def nan_to_none(text):
    return None if text == "nan" else text


# ---------------------------------------------------------------------------
# app_functions.py
# ---------------------------------------------------------------------------


def numbers(text):
    """Nombres d'un texte de get_flight_params ; « nan » -> None."""
    return [None if t == "nan" else float(t) for t in re.findall(r"-?\d+(?:\.\d+)?|nan", text)]


def mean_max(text):
    mean, mx = numbers(text)[:2]
    return {"mean": mean, "max": mx}


def expected_params(df):
    p = app_functions.get_flight_params(df)
    h, m = (int(x) for x in re.findall(r"\d+", p["tot_heures_vol"]))
    speeds = numbers(p["print_speed_tot"])
    return {
        "nbVols": int(p["nb_tot_vols"]),
        "totalMinutes": h * 60 + m, "hours": h, "minutes": m,
        "nbSites": int(p["nb_tot_sites"]),
        "nbPilots": int(p["nb_tot_pilots"]),
        "speedAvg": {"mean": speeds[0], "max": speeds[1]},
        "speedMax": {"mean": speeds[2], "max": speeds[3]},
        "duration": mean_max(p["mean_max_flight_duration_tot_str"]),
        "distance": mean_max(p["mean_max_flight_distance_tot_str"]),
        "ceiling": mean_max(p["mean_max_flight_ceiling_tot_str"]),
        "vario": mean_max(p["mean_max_flight_vario_tot_str"]),
        "g": mean_max(p["mean_max_flight_g_tot_str"]),
    }


def expected_groups(df):
    out = {}
    for axis, column in AXES:
        grouped = app_functions.create_grouped_df(df, [column])
        rows = []
        for rec in grouped.to_dict("records"):
            key = rec.pop(column)
            if axis == "heure":
                key = str(int(float(key)))
            rows.append({"key": key, "values": {k: plain(v) for k, v in rec.items()}})
        out[axis] = rows
    return out


# ---------------------------------------------------------------------------
# report_data.py
# ---------------------------------------------------------------------------


def flight_num(url):
    return int(url.rsplit("/", 1)[1])


def clean_records(records):
    out = {}
    for key, entries in records.items():
        out[key] = [{"value": e["value"], "date": e["date"], "site": nan_to_none(e["site"]),
                     "wing": nan_to_none(e["voile"]), "discipline": e["discipline"],
                     "syrideNum": flight_num(e["url"])} for e in entries]
    return plain(out)


def expected_indicators(d):
    """Appelle compute_indicators (qui appelle compute_kpis, _distribution, week_hour_matrix, _records, ...)."""
    ind = rd.compute_indicators(d)
    sites = ind["sites"]
    day = d[d["date"].dt.date == ind["highlights"]["best_day"]["date"]]
    highlights = ind["highlights"]
    best = dict(highlights["best_day"])
    # `_highlights` compte n avec ("site", "count"), qui saute les vols sans site : on donne le vrai nombre de vols
    # du jour, et on écarte « nan » (vol sans site) de la liste des sites ; TS compare ce dernier sans ordre.
    best["nPython"] = best["n"]
    best["n"] = int(len(day))
    best["sites"] = sorted(s for s in best["sites"] if s != "nan")
    highlights = dict(highlights, best_day=best)
    durations = ind["durations"]
    medians = {camel(k): {"value": plain(v[0]), "count": v[1]} for k, v in durations["medians"].items()}
    return {
        "kpis": plain(ind["kpis"]),
        "monthly": plain(ind["monthly"]),
        "weekday": plain(ind["weekday"]),
        "hours": plain(ind["hours"]),
        "weekHour": plain(ind["week_hour"]),
        "daily": [dict(plain({"date": k, "n": v["n"], "minutes": v["minutes"], "disciplines": v["disciplines"]}))
                  for k, v in sorted(ind["daily"].items())],
        "steps": plain(ind["steps"]),
        "sites": [plain({"site": r["site"], "n": r["n"], "minutes": r["minutes"],
                         "duration_mean": r["duration_mean"], "speed_avg_mean": r["speed_avg_mean"]}) for r in sites],
        "wings": [plain({"wing": r["voile"], "n": r["n"], "minutes": r["minutes"],
                         "duration_mean": r["duration_mean"], "speed_avg_mean": r["speed_avg_mean"],
                         "gain_max": r["gain_max"], "vario_max": r["vario_max"], "g_max": r["g_max"]})
                  for r in ind["wings"]],
        "instruments": plain(ind["instruments"]),
        "records": clean_records(ind["records"]),
        "highlights": plain({
            "busiest_month": highlights["busiest_month"], "busiest_weekday": highlights["busiest_weekday"],
            "top_site": highlights["top_site"],
            "top_wing": None if highlights["top_wing"] is None else
            {"wing": highlights["top_wing"]["voile"], "n": highlights["top_wing"]["n"],
             "minutes": highlights["top_wing"]["minutes"]},
            "longest_gap_days": highlights["longest_gap_days"], "best_day": highlights["best_day"]}),
        "flightModes": plain(ind["flight_modes"]),
        "seasons": plain(ind["seasons"]),
        "coverage": plain({k: v for k, v in ind["coverage"].items() if k != "updated"}),
        "durations": {"bins": durations["bins"], "medianBin": durations["median_bin"],
                      "medians": medians},
    }, ind


def expected_rhythm(ind, year, end):
    r = rd.compute_rhythm(ind["daily"], year, end)
    return {"year": year, "end": end.isoformat(), "rhythm": plain(r)}


def career_cases(df, pilots, years):
    cases = []
    for pilot in pilots:
        for year in years:
            for cutoff in (None, (6, 30)):
                cases.append({"pilot": pilot, "year": year, "cutoff": list(cutoff) if cutoff else None,
                              "career": plain(rd.compute_career(df, pilot, year, cutoff))})
    return cases


# ---------------------------------------------------------------------------
# Cas de test
# ---------------------------------------------------------------------------


def selections(df):
    """(nom, filtre, masque) : tout, un pilote, une discipline, une année, un croisement."""
    pilots = sorted(df["pilote"].unique())
    years = sorted(df["annee"].unique())
    cases = [("tout", {}, np.ones(len(df), dtype=bool))]
    for p in pilots:
        cases.append(("pilote " + p, {"pilot": p}, (df["pilote"] == p).values))
    for a in ("parapente", "paramoteur"):
        cases.append(("discipline " + a, {"activity": a}, (df["type_vol"] == a).values))
    for y in years:
        cases.append(("année %d" % y, {"year": int(y)}, (df["annee"] == y).values))
    cases.append(("pilote × année × discipline",
                  {"pilot": pilots[0], "year": int(years[-1]), "activity": "parapente"},
                  ((df["pilote"] == pilots[0]) & (df["annee"] == years[-1]) & (df["type_vol"] == "parapente")).values))
    return cases


def build_dataset(name, flights_obj, sites_obj, only=None):
    df = with_hour(frame_from_export(flights_obj, sites_obj))
    prepared = rd.prepare_report_df(df)
    pilots = sorted(df["pilote"].unique())
    years = [int(y) for y in sorted(df["annee"].unique())]
    cases = []
    for index, (label, flt, mask) in enumerate(selections(df)):
        if only is not None and index not in only:
            continue
        sel_app = df[mask]
        if len(sel_app) == 0:
            continue
        sel_report = prepared[mask]
        indicators, ind = expected_indicators(sel_report)
        last_year = int(sel_report["date"].dt.year.max())
        ends = [(last_year, dt.date(last_year, 12, 31)), (last_year, dt.date(last_year, 6, 15))]
        case = {
            "name": label, "filter": flt,
            "params": expected_params(sel_app),
            "groups": expected_groups(sel_app),
            "indicators": indicators,
            "rhythms": [expected_rhythm(ind, y, e) for y, e in ends],
        }
        cases.append(case)
    deltas = [[c, r, plain(rd.delta_pct(c, r))] for c, r in
              [(110.0, 100.0), (50.0, 100.0), (1.0, 0.0), (None, 5.0), (5.0, None), (0.0, 4.0)]]
    return {"name": name, "cases": cases, "careers": career_cases(prepared, pilots, years), "deltaPct": deltas}


def main():
    flights_path = sorted(glob.glob(str(DATA / "flights.*.json")))[0]
    sites_path = sorted(glob.glob(str(DATA / "sites.*.json")))[0]
    flights_fixture = json.load(open(flights_path, encoding="utf-8"))
    sites_fixture = json.load(open(sites_path, encoding="utf-8"))

    # Jeu dense (séries de plusieurs jours, ex æquo...) que les fixtures commitables (48 vols) ne couvrent pas :
    # inclus tel quel dans le JSON attendu, même format que flights.json et sites.json.
    dense_df = synthetic_flights_df(DENSE_FLIGHTS, seed=DENSE_SEED)
    flights_dense, _ = build_flights(dense_df)
    kept, _ = select_exportable(dense_df)
    sites_dense, _ = build_sites(kept, flights_dense, None)

    expected = {
        "generatedBy": "web/scripts/expected_stats.py",
        "datasets": [
            dict(build_dataset("fixtures", flights_fixture, sites_fixture), source=Path(flights_path).name),
            dict(build_dataset("dense", flights_dense, sites_dense, DENSE_CASES),
                 flights=flights_dense, sites=sites_dense),
        ],
    }
    OUT.write_text(json.dumps(expected, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("écrit {} ({} Ko)".format(OUT.relative_to(ROOT), OUT.stat().st_size // 1024))


if __name__ == "__main__":
    main()
