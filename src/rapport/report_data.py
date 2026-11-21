"""
Calcul des indicateurs d'un rapport de vol : un pilote, une année, et jusqu'à deux années de
comparaison. Aucune mise en forme ici : les fonctions retournent des dictionnaires, que le
rapport HTML (report_html.py) met en page.

Entrée : le DataFrame du pkl (global_flights_data.pkl). Colonnes utilisées :
    pilote, date, heure, type_vol, site, voile, instrument, duree_vol_minutes,
    vitesse_moyenne, vitesse_max, distance, plafond, gain, vario_max, g_max,
    longitude, latitude, num_activite
Les colonnes `heure_decolage` et `flight_url` sont créées ici si elles n'existent pas.

Vocabulaire :
    discipline : "all" (toutes), "parapente" ou "paramoteur"
    cutoff     : (mois, jour) de la date de génération quand l'année du rapport est l'année en
                 cours ; l'année du rapport s'arrête là, les années précédentes restent entières.
"""

import calendar
import datetime as dt
import math
import re
from typing import Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

DISCIPLINES = ("all", "parapente", "paramoteur")

# Façons de voler : colonne `types` du pkl (« Vol site », « Vol treuil »…, parfois avec espaces en fin de chaîne)
MODE_LABELS = {
    "vol site": "Site", "vol treuil": "Treuil", "vol rando": "Rando",
    "vol bord de mer": "Bord de mer", "vol moteur": "Moteur",
}
MODE_ORDER = ["Site", "Treuil", "Rando", "Bord de mer", "Moteur"]
SEASONS = ["hiver", "printemps", "été", "automne"]
SEASON_OF_MONTH = {12: "hiver", 1: "hiver", 2: "hiver", 3: "printemps", 4: "printemps", 5: "printemps",
                   6: "été", 7: "été", 8: "été", 9: "automne", 10: "automne", 11: "automne"}

# Écart à l'an dernier : sous ce seuil (minutes) on parle d'égalité
GAP_EQUAL_MINUTES = 30.0
SYRIDE_PILOT_URL = "https://www.syride.com/fr/pilotes/"

# (clé, colonne du DataFrame) : critères des classements « records »
RECORD_METRICS = [
    ("plafond", "plafond"),
    ("vitesse_max", "vitesse_max"),
    ("distance", "distance"),
    ("vario", "vario_max"),
    ("g", "g_max"),
    ("duree", "duree_vol_minutes"),
]

# (clé, colonne) des mesures dont on indique la couverture (« mesuré sur N vols ») ; les clés reprennent celles des records
MEASURE_COLUMNS = [("plafond", "plafond"), ("distance", "distance"), ("gain", "gain"),
                   ("vitesse_max", "vitesse_max"), ("vario", "vario_max"), ("g", "g_max")]
# Tranches de durée de vol (F7) : bornes hautes en minutes, une tranche = [borne précédente, borne) ; la dernière est ouverte
DURATION_BINS = (15, 30, 60, 120)
DURATION_BIN_LABELS = ("< 15 min", "15–30 min", "30 min–1 h", "1–2 h", "> 2 h")   # une de plus que DURATION_BINS
# (clé de la médiane, colonne) ; le nombre de vols mesurés vient de `_measured` comme partout ailleurs
MEDIAN_COLUMNS = (("plafond", "plafond"), ("vitesse_max", "vitesse_max"), ("distance", "distance"))
SOURCE_KEYS = ("gpx", "fiche", "aucune")   # origine des statistiques d'un vol (colonne `source_stats`)
# « trace » (lot D : statistiques calculées sur la trace de la fiche brute fv-config) est publiée comme « gpx »,
# définie comme « calculées sur la trace ». Une 4e source distincte pourra venir avec le lot H.
SOURCE_ALIASES = {"trace": "gpx"}


# ============================================================================
# Préparation du DataFrame
# ============================================================================


def _hour_of(value) -> float:
    """Heure (0-23) d'un datetime.time / datetime / « HH:MM[:SS] » ; NaN si inconnue."""
    if isinstance(value, str):
        try:
            return float(int(value[:2]))
        except ValueError:
            return np.nan
    hour = getattr(value, "hour", np.nan)
    return float(hour) if hour == hour else np.nan  # NaT -> NaN


def _site_name(value) -> str:
    """Nom du site d'un vol ; « » si le vol n'a pas de site."""
    return "" if value is None or value is pd.NA or (isinstance(value, float) and value != value) else str(value)


def _hhmm_of(value) -> Optional[str]:
    """Heure de décollage « HH:MM » d'un datetime.time / datetime / « HH:MM[:SS] » ; None si inconnue."""
    if isinstance(value, str):
        return value[:5] if re.fullmatch(r"\d{2}:\d{2}(:\d{2})?", value.strip()) else None
    if value is None or value != value or not hasattr(value, "hour"):   # None, NaN, NaT
        return None
    return f"{value.hour:02d}:{value.minute:02d}"


def _int_or_none(value) -> Optional[int]:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return int(v) if v == v else None


def prepare_report_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Retourne une copie du DataFrame prête pour le rapport :
    colonnes `heure_decolage` (heure entière, NaN si inconnue) et `flight_url` créées si
    absentes, `date` en datetime, durées numériques. L'original n'est pas modifié.
    """
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out[out["date"].notna()].copy()
    out["duree_vol_minutes"] = pd.to_numeric(out["duree_vol_minutes"], errors="coerce").fillna(0.0)

    # Site : un nom vide (« », « nan », « none ») n'est pas un site -> NA. Le vol reste compté (durée, km…), mais
    # n'apparaît dans aucun tableau ni décompte de sites (nunique, groupby et value_counts ignorent NA).
    if "site" in out.columns:
        text = out["site"].astype(str).str.strip()
        missing = out["site"].isna() | text.str.lower().isin({"", "nan", "none"})
        out["site"] = text.astype(object).where(~missing, pd.NA)

    if "heure_decolage" not in out.columns:
        source = out["heure"] if "heure" in out.columns else pd.Series(np.nan, index=out.index)
        out["heure_decolage"] = [_hour_of(v) for v in source]

    if "flight_url" not in out.columns:
        out["flight_url"] = (
            SYRIDE_PILOT_URL + out["pilote"].astype(str) + "/" + out["num_activite"].astype(str)
        )

    # Façon de voler (libellé court) et saison ; la saison est recalculée depuis le mois si absente ou inconnue
    types = out["types"] if "types" in out.columns else pd.Series("", index=out.index)
    out["mode"] = [mode_of(v) for v in types]
    month_season = out["date"].dt.month.map(SEASON_OF_MONTH)
    if "saison" in out.columns:
        known = out["saison"].astype(str).str.strip().str.lower()
        out["saison"] = known.where(known.isin(SEASONS), month_season)
    else:
        out["saison"] = month_season
    # Marque le DataFrame : compute_report ne le prépare pas une seconde fois (attrs survit aux copies/filtres)
    out.attrs["report_prepared"] = True
    return out


def mode_of(value) -> str:
    """Libellé court de la façon de voler (« Vol treuil  » -> « Treuil ») ; « » si inconnue."""
    text = str(value).strip() if value == value and value is not None else ""
    if not text or text.lower() == "nan":
        return ""
    label = MODE_LABELS.get(text.lower())
    if label:
        return label
    return (text[4:] if text.lower().startswith("vol ") else text).capitalize()


# ============================================================================
# Utilitaires de calcul
# ============================================================================


def _positive(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    return values[values > 0]


def _mean(series: pd.Series) -> Optional[float]:
    s = _positive(series)
    return float(s.mean()) if len(s) else None


def _max(series: pd.Series) -> Optional[float]:
    s = _positive(series)
    return float(s.max()) if len(s) else None


def _sum(series: pd.Series) -> Optional[float]:
    s = _positive(series)
    return float(s.sum()) if len(s) else None


def x_of_date(date: dt.date) -> float:
    """Position de la FIN de la journée dans l'année, entre 0 et 1 (robuste aux années bissextiles)."""
    days_in_month = calendar.monthrange(date.year, date.month)[1]
    return (date.month - 1 + date.day / days_in_month) / 12


def filter_flights(
    df: pd.DataFrame,
    pilot: str,
    year: int,
    discipline: str = "all",
    cutoff: Optional[tuple] = None,
) -> pd.DataFrame:
    """Vols d'un pilote pour une année, une discipline, éventuellement jusqu'à (mois, jour)."""
    d = df[(df["pilote"] == pilot) & (df["date"].dt.year == year)]
    if discipline != "all":
        d = d[d["type_vol"] == discipline]
    if cutoff is not None:
        month, day = cutoff
        d = d[(d["date"].dt.month < month) | ((d["date"].dt.month == month) & (d["date"].dt.day <= day))]
    return d


# ============================================================================
# Indicateurs d'un ensemble de vols
# ============================================================================


def compute_kpis(d: pd.DataFrame) -> dict:
    """Chiffres clés d'un ensemble de vols (valeurs brutes, None si non calculable)."""
    n = int(len(d))
    if n == 0:
        return {"n_flights": 0, "minutes": 0.0, "days_flown": 0, "n_sites": 0, "n_wings": 0}
    dates = d["date"].dt.date
    return {
        "n_flights": n,
        "minutes": float(d["duree_vol_minutes"].sum()),
        "days_flown": int(dates.nunique()),
        "n_sites": int(d["site"].nunique()),
        "n_wings": int(d["voile"].nunique()),
        "first_date": min(dates),
        "last_date": max(dates),
        # distance = distance affichée par Syride sur la page des vols (référence)
        "distance_total": _sum(d["distance"]),
        "distance_mean": _mean(d["distance"]),
        "distance_max": _max(d["distance"]),
        "duration_mean": float(d["duree_vol_minutes"].mean()),
        "duration_max": float(d["duree_vol_minutes"].max()),
        "speed_avg_mean": _mean(d["vitesse_moyenne"]),
        "speed_avg_max": _max(d["vitesse_moyenne"]),
        "speed_max_mean": _mean(d["vitesse_max"]),
        "speed_max_max": _max(d["vitesse_max"]),
        "ceiling_mean": _mean(d["plafond"]),
        "ceiling_max": _max(d["plafond"]),
        "gain_max": _max(d["gain"]),
        "vario_mean": _mean(d["vario_max"]),
        "vario_max": _max(d["vario_max"]),
        "g_mean": _mean(d["g_max"]),
        "g_max": _max(d["g_max"]),
    }


def _distribution(d: pd.DataFrame, key: pd.Series, size: int, offset: int = 0) -> dict:
    """Nombre de vols et minutes pour chaque valeur de `key` dans [offset, offset + size)."""
    flights = [0] * size
    minutes = [0.0] * size
    for k, m in zip(key, d["duree_vol_minutes"]):
        if k == k and offset <= int(k) < offset + size:  # k == k : exclut NaN
            flights[int(k) - offset] += 1
            minutes[int(k) - offset] += float(m)
    return {"flights": flights, "minutes": minutes}


def week_hour_matrix(d: pd.DataFrame) -> dict:
    """Matrice jour de la semaine x heure de décollage (T53) : {"counts": [7][24] vols, "minutes": [7][24], "missing": n}.
    Lundi = 0 (comme `weekday`) ; les vols sans heure de décollage connue sont comptés dans `missing` et non placés.
    Mêmes vols et mêmes colonnes que `weekday` et `hours` : la somme des cellules vaut le total de `hours`."""
    counts = [[0] * 24 for _ in range(7)]
    minutes = [[0.0] * 24 for _ in range(7)]
    missing = 0
    for day, hour, m in zip(d["date"].dt.day_of_week, d["heure_decolage"], d["duree_vol_minutes"]):
        if hour == hour and 0 <= int(hour) < 24:      # hour == hour : exclut NaN
            counts[int(day)][int(hour)] += 1
            minutes[int(day)][int(hour)] += float(m)
        else:
            missing += 1
    return {"counts": counts, "minutes": minutes, "missing": missing}


def _mean_coords(g: pd.DataFrame, lon_col: str, lat_col: str) -> Optional[Tuple[float, float]]:
    """Moyenne (lon, lat) des lignes valides ; NaN et (0, 0) (lecture échouée) sont exclus."""
    if lon_col not in g or lat_col not in g:
        return None
    lon = pd.to_numeric(g[lon_col], errors="coerce")
    lat = pd.to_numeric(g[lat_col], errors="coerce")
    ok = lon.notna() & lat.notna() & ~((lon == 0) & (lat == 0))
    if not ok.any():
        return None
    return float(lon[ok].mean()), float(lat[ok].mean())


def _site_rows(d: pd.DataFrame) -> List[dict]:
    rows = []
    for site, g in d.groupby("site"):
        coords, source = _mean_coords(g, "longitude", "latitude"), "gpx"
        if coords is None:   # repli : coordonnées du site (remplies pour presque tous les vols)
            coords, source = _mean_coords(g, "mean_longitude", "mean_latitude"), "site"
        if coords is None:
            source = None
        rows.append({
            "site": str(site), "n": int(len(g)), "minutes": float(g["duree_vol_minutes"].sum()),
            "duration_mean": float(g["duree_vol_minutes"].mean()),
            "speed_avg_mean": _mean(g["vitesse_moyenne"]), "coords": coords, "coords_source": source,
        })
    rows.sort(key=lambda r: (-r["minutes"], -r["n"], r["site"]))
    return rows


def _wing_rows(d: pd.DataFrame) -> List[dict]:
    rows = []
    for wing, g in d.groupby("voile"):
        rows.append({
            "voile": str(wing), "n": int(len(g)), "minutes": float(g["duree_vol_minutes"].sum()),
            "duration_mean": float(g["duree_vol_minutes"].mean()),
            "speed_avg_mean": _mean(g["vitesse_moyenne"]),
            "gain_max": _max(g["gain"]), "vario_max": _max(g["vario_max"]), "g_max": _max(g["g_max"]),
        })
    rows.sort(key=lambda r: (-r["minutes"], -r["n"], r["voile"]))
    return rows


def _instrument_rows(d: pd.DataFrame) -> List[dict]:
    if "instrument" not in d.columns:
        return []
    valid = d[~d["instrument"].astype(str).str.strip().str.lower().isin(["", "none", "nan", "-1"])]
    rows = [
        {"instrument": str(name), "n": int(len(g)), "minutes": float(g["duree_vol_minutes"].sum())}
        for name, g in valid.groupby("instrument")
    ]
    rows.sort(key=lambda r: (-r["minutes"], -r["n"], r["instrument"]))
    return rows


def _records(d: pd.DataFrame, top: int = 5) -> Dict[str, List[dict]]:
    """Classement des `top` meilleurs vols pour chaque critère, avec lien vers la fiche Syride."""
    result = {}
    for key, column in RECORD_METRICS:
        if column not in d.columns:
            result[key] = []
            continue
        values = pd.to_numeric(d[column], errors="coerce")
        best = d[values > 0].assign(_v=values[values > 0]).sort_values(
            ["_v", "date"], ascending=[False, False]
        ).head(top)
        result[key] = [
            {
                "value": float(r["_v"]), "date": r["date"].date(), "site": _site_name(r["site"]),
                "voile": str(r["voile"]), "url": str(r["flight_url"]), "discipline": str(r["type_vol"]),
            }
            for _, r in best.iterrows()
        ]
    return result


def _best_flight(d: pd.DataFrame, column: str) -> Optional[dict]:
    """Meilleur vol d'un ensemble pour une colonne (valeur > 0 ; le plus ancien en cas d'égalité) ; None si aucune mesure."""
    if column not in d.columns or d.empty:
        return None
    values = pd.to_numeric(d[column], errors="coerce")
    ok = d[values > 0].assign(_v=values[values > 0])
    if ok.empty:
        return None
    r = ok.sort_values(["_v", "date"], ascending=[False, True]).iloc[0]
    return {"value": float(r["_v"]), "date": r["date"].date(), "year": int(r["date"].year), "site": _site_name(r["site"]),
            "voile": str(r["voile"]), "url": str(r["flight_url"]), "discipline": str(r["type_vol"])}


def compute_records_history(df: pd.DataFrame, pilot: str, year: int, cutoff: Optional[tuple]) -> dict:
    """Records personnels (F10) : l'année du rapport face à TOUTES les années antérieures (pas seulement celles comparées).

    Retour : {discipline: {"beaten": {critère: {...}}, "best": {critère: meilleur des années antérieures},
                           "measured": {critère: (vols mesurés cette année, vols de l'année)}}}.
    Un critère n'est « battu » que s'il existe un historique mesuré (sinon : premier vol mesuré).
    "beaten" : {"value", "previous", "previous_year", "delta", "date", "url", "site", "voile", "discipline"}."""
    out = {}
    for disc in DISCIPLINES:
        cur = filter_flights(df, pilot, year, disc, cutoff)
        past = df[(df["pilote"] == pilot) & (df["date"].dt.year < year)]
        if disc != "all":
            past = past[past["type_vol"] == disc]
        entry = {"beaten": {}, "best": {}, "measured": {}}
        for key, column in RECORD_METRICS:
            if column in cur.columns:
                entry["measured"][key] = (_measured(cur, column), int(len(cur)))
            old, new = _best_flight(past, column), _best_flight(cur, column)
            if old:
                entry["best"][key] = old
            if old and new and new["value"] > old["value"]:
                entry["beaten"][key] = dict(new, previous=old["value"], previous_year=old["year"],
                                            delta=new["value"] - old["value"])
        out[disc] = entry
    return out


def _longest_gap(dates: List[dt.date]) -> Optional[Tuple[int, dt.date, dt.date]]:
    """Plus longue pause entre deux jours de vol consécutifs de la liste triée `dates` :
    (nombre de jours sans vol, premier jour sans vol, dernier jour sans vol), ou None s'il n'y en a pas.
    Source unique de `longest_gap_days` (phrase du rythme) et de la tuile « Plus longue pause »."""
    best = None
    for a, b in zip(dates, dates[1:]):
        days = (b - a).days - 1
        if days > 0 and (best is None or days > best[0]):
            best = (days, a + dt.timedelta(days=1), b - dt.timedelta(days=1))
    return best


def _highlights(d: pd.DataFrame, dist_month: dict, dist_day: dict, sites: List[dict], wings: List[dict]) -> dict:
    """Faits marquants utilisés pour les phrases d'interprétation."""
    out = {"busiest_month": None, "busiest_weekday": None, "top_site": None, "top_wing": None,
           "longest_gap_days": 0, "best_day": None}
    if len(d) == 0:
        return out
    if max(dist_month["flights"]) > 0:
        i = int(np.argmax(dist_month["flights"]))
        out["busiest_month"] = {"index": i, "flights": dist_month["flights"][i]}
    if max(dist_day["flights"]) > 0:
        i = int(np.argmax(dist_day["flights"]))
        out["busiest_weekday"] = {"index": i, "flights": dist_day["flights"][i]}
    if sites:
        out["top_site"] = {"site": sites[0]["site"], "n": sites[0]["n"], "minutes": sites[0]["minutes"]}
    if wings:
        out["top_wing"] = {"voile": wings[0]["voile"], "n": wings[0]["n"], "minutes": wings[0]["minutes"]}
    dates = sorted(set(d["date"].dt.date))
    gap = _longest_gap(dates)
    out["longest_gap_days"] = gap[0] if gap else 0
    per_day = d.groupby(d["date"].dt.date).agg(minutes=("duree_vol_minutes", "sum"), n=("duree_vol_minutes", "size"))
    best_date = per_day["minutes"].idxmax()
    day = d[d["date"].dt.date == best_date]
    out["best_day"] = {"date": best_date, "minutes": float(per_day.loc[best_date, "minutes"]),
                       "n": int(per_day.loc[best_date, "n"]),
                       "sites": [str(x) for x in day["site"].dropna().astype(str).value_counts().index]}
    return out


# ---- Séries et régularité (F5) ----
RHYTHM_MIN_STREAK = 2      # une « série » compte au moins 2 jours de vol consécutifs
WEEKEND_DAYS = (5, 6)      # samedi, dimanche (lundi = 0)


def _longest_run(keys: List[int]) -> Optional[Tuple[int, int, int]]:
    """Plus longue suite d'entiers consécutifs dans la liste triée `keys` : (longueur, premier, dernier) ;
    la première rencontrée en cas d'égalité."""
    best, start = None, 0
    for i in range(1, len(keys) + 1):
        if i == len(keys) or keys[i] != keys[i - 1] + 1:
            length = i - start
            if best is None or length > best[0]:
                best = (length, keys[start], keys[i - 1])
            start = i
    return best


def _monday(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def _weeks_active_total(days, year: int, end: dt.date) -> Tuple[int, int]:
    """Définition UNIQUE de la régularité : (semaines lundi-dimanche avec au moins un vol, semaines écoulées de
    l'année, la semaine du 1er janvier comptant). Partagée par `compute_rhythm` (tuile) et le portrait."""
    weeks = {_monday(d) for d in days}
    return len(weeks), max((_monday(end) - _monday(dt.date(year, 1, 1))).days // 7 + 1, len(weeks))


def compute_rhythm(daily: Dict[dt.date, dict], year: int, end: dt.date) -> Optional[dict]:
    """
    Séries et régularité d'un ensemble de jours de vol (`daily` : {date: {"n", "minutes", ...}}), pour la
    section Rythme. `end` : dernier jour écoulé (aujourd'hui pour l'année en cours, 31 décembre sinon).
    Retour (None sans vol) :
      streak  : {"days", "start", "end"} plus longue série de jours consécutifs volés, None si elle fait moins
                de RHYTHM_MIN_STREAK jours ;
      gap     : {"days", "start", "end"} plus longue pause entre deux jours de vol de l'année (la période après
                le dernier vol n'en fait pas partie), None s'il n'y a pas de pause ;
      week    : {"start" (lundi), "end" (dimanche), "minutes", "n"} meilleure semaine civile (heures, puis vols) ;
      weeks_active, weeks_total, weeks_streak : semaines (lundi-dimanche) avec au moins un vol, semaines écoulées
                de l'année (la semaine du 1er janvier compte), plus longue suite de semaines avec vol ;
      weekend_share : part des vols faits le samedi ou le dimanche (0 à 1).
    """
    dates = sorted(daily)
    if not dates:
        return None
    out = {"streak": None, "gap": None}
    run = _longest_run([d.toordinal() for d in dates])
    if run and run[0] >= RHYTHM_MIN_STREAK:
        out["streak"] = {"days": run[0], "start": dt.date.fromordinal(run[1]), "end": dt.date.fromordinal(run[2])}
    gap = _longest_gap(dates)
    if gap:
        out["gap"] = {"days": gap[0], "start": gap[1], "end": gap[2]}

    def monday(day: dt.date) -> dt.date:
        return day - dt.timedelta(days=day.weekday())

    weeks: Dict[dt.date, List[float]] = {}
    for day, info in daily.items():
        w = weeks.setdefault(monday(day), [0.0, 0])
        w[0] += info["minutes"]
        w[1] += info["n"]
    best = max(weeks, key=lambda k: (weeks[k][0], weeks[k][1], -k.toordinal()))
    out["week"] = {"start": best, "end": best + dt.timedelta(days=6), "minutes": weeks[best][0], "n": weeks[best][1]}
    out["weeks_active"], out["weeks_total"] = _weeks_active_total(daily, year, end)
    streak = _longest_run(sorted(k.toordinal() // 7 for k in weeks))   # un lundi a l'ordinal 7k + 1 : k est continu d'une semaine à l'autre
    out["weeks_streak"] = streak[0]
    total = sum(info["n"] for info in daily.values())
    out["weekend_share"] = sum(info["n"] for day, info in daily.items() if day.weekday() in WEEKEND_DAYS) / max(total, 1)
    return out


def _flight_modes(d: pd.DataFrame) -> List[dict]:
    """Vols et minutes par façon de voler (ordre canonique, puis les libellés inconnus) ; modes vides omis."""
    modes = d["mode"].astype(str)
    rows = []
    for name in sorted(set(modes) - {""}, key=lambda m: (MODE_ORDER.index(m) if m in MODE_ORDER else 99, m)):
        sel = d[modes == name]
        rows.append({"mode": name, "n": int(len(sel)), "minutes": float(sel["duree_vol_minutes"].sum())})
    return rows


def _seasons(d: pd.DataFrame) -> Dict[str, dict]:
    """Vols et minutes par saison (les quatre saisons sont toujours présentes, éventuellement à 0)."""
    out = {}
    for name in SEASONS:
        sel = d[d["saison"] == name]
        out[name] = {"n": int(len(sel)), "minutes": float(sel["duree_vol_minutes"].sum())}
    return out


def _measured(d: pd.DataFrame, column: str) -> int:
    """Nombre de vols où la mesure `column` existe (> 0). Source unique de « vols mesurés »."""
    return int(len(_positive(d[column]))) if column in d.columns and len(d) else 0


def _duration_stats(d: pd.DataFrame) -> dict:
    """Médianes et distribution des durées (F7, D9) d'un ensemble de vols non vide :
        bins        nombre de vols par tranche de DURATION_BINS
        median_bin  indice de la tranche qui contient le vol médian
        medians     {"duree": (minutes, vols), "plafond"/"vitesse_max"/"distance": (médiane, vols mesurés)} ;
                    la médiane d'une mesure sans aucun vol mesuré est None."""
    minutes = pd.to_numeric(d["duree_vol_minutes"], errors="coerce").dropna()
    median = float(minutes.median()) if len(minutes) else None
    bins = [0] * (len(DURATION_BINS) + 1)
    for m in minutes:
        bins[sum(m >= edge for edge in DURATION_BINS)] += 1
    medians = {"duree": (median, int(len(minutes)))}
    for key, column in MEDIAN_COLUMNS:
        values = _positive(d[column]) if column in d.columns else pd.Series(dtype=float)
        medians[key] = (float(values.median()) if len(values) else None, _measured(d, column))
    return {"bins": bins, "median_bin": None if median is None else sum(median >= edge for edge in DURATION_BINS),
            "medians": medians}


def _coverage(d: pd.DataFrame, sites: Optional[List[dict]] = None) -> dict:
    """Couverture des données d'un ensemble de vols (transparence chiffrée, F18) :
        n               nombre de vols
        measured        {mesure: vols où elle existe (> 0)}, pour MEASURE_COLUMNS
        sources         {"gpx", "fiche", "aucune": vols}, ou None sans colonne `source_stats`
        no_position     vols dont le site n'a aucune coordonnée (absents de la carte) ; None si `sites` n'est pas fourni
        updated         date de mise à jour la plus récente (date) ou None
        gain, distance  parts mesurées (0 à 1) et gain_total : servent à ne proposer une équivalence que si la
                        mesure est assez complète."""
    n = int(len(d))
    measured = {key: _measured(d, column) for key, column in MEASURE_COLUMNS}
    sources = None
    if "source_stats" in d.columns:
        counts = d["source_stats"].astype(str).str.strip().str.lower().replace(SOURCE_ALIASES).value_counts()
        sources = {k: int(counts.get(k, 0)) for k in SOURCE_KEYS}
        sources["aucune"] += n - sum(sources.values())      # valeur absente ou inconnue : pas de statistiques connues
    updated = None
    if "date_update" in d.columns and n:
        value = pd.to_datetime(d["date_update"], errors="coerce").max()
        updated = value.date() if value == value else None
    gain = _positive(d["gain"]) if "gain" in d.columns else pd.Series(dtype=float)
    return {
        "n": n, "measured": measured, "sources": sources, "updated": updated,
        "no_position": None if sites is None else sum(r["n"] for r in sites if r["coords"] is None),
        "gain": measured["gain"] / max(n, 1), "distance": measured["distance"] / max(n, 1), "gain_total": float(gain.sum()),
    }


def compute_indicators(d: pd.DataFrame) -> dict:
    """Tous les indicateurs d'un ensemble de vols (une année, une discipline)."""
    kpis = compute_kpis(d)
    if kpis["n_flights"] == 0:
        return {"empty": True, "kpis": kpis}

    month = _distribution(d, d["date"].dt.month, 12, offset=1)
    monthly_details = [""] * 12
    for month_number, group in d.groupby(d["date"].dt.month):
        sites = group["site"].dropna().astype(str).value_counts().head(2)
        wings = group["voile"].astype(str).value_counts().head(2)
        site_text = ", ".join(f"{name} ({n})" for name, n in sites.items())
        wing_text = ", ".join(f"{name} ({n})" for name, n in wings.items())
        monthly_details[int(month_number) - 1] = f"Sites : {site_text or '—'} · Voiles : {wing_text or '—'}"
    weekday = _distribution(d, d["date"].dt.day_of_week, 7)
    hours = _distribution(d, d["heure_decolage"], 24)

    daily = {}
    for date, g in d.groupby(d["date"].dt.date):
        site_counts = g["site"].dropna().astype(str).value_counts()
        wing_counts = g["voile"].astype(str).value_counts()
        daily[date] = {
            "n": int(len(g)), "minutes": float(g["duree_vol_minutes"].sum()),
            "disciplines": sorted(set(g["type_vol"])),
            "sites": [(str(name), int(n)) for name, n in site_counts.items()],
            "wings": [(str(name), int(n)) for name, n in wing_counts.items()],
        }

    cumulative, steps = 0.0, []
    for date in sorted(daily):
        cumulative += daily[date]["minutes"]
        steps.append((x_of_date(date), cumulative / 60))

    sites, wings = _site_rows(d), _wing_rows(d)
    return {
        "empty": False,
        "kpis": kpis,
        "monthly": month,
        "monthly_details": monthly_details,
        "weekday": weekday,
        "hours": hours,
        "week_hour": week_hour_matrix(d),
        "daily": daily,
        "steps": steps,
        "sites": sites,
        "wings": wings,
        "instruments": _instrument_rows(d),
        "records": _records(d),
        "highlights": _highlights(d, month, weekday, sites, wings),
        "flight_modes": _flight_modes(d),
        "seasons": _seasons(d),
        "coverage": _coverage(d, sites),
        "durations": _duration_stats(d),
        "flights": [
            {
                "date": r["date"].date(), "site": _site_name(r["site"]), "voile": str(r["voile"]),
                "discipline": str(r["type_vol"]), "mode": str(r["mode"]), "minutes": float(r["duree_vol_minutes"]),
                "distance": r.get("distance"), "ceiling": r.get("plafond"),
                "speed_max": r.get("vitesse_max"), "url": str(r["flight_url"]),
                "time": _hhmm_of(r.get("heure")), "vario": r.get("vario_max"), "num": _int_or_none(r.get("num_activite")),
            }
            for _, r in d.sort_values("date", ascending=False).iterrows()
        ],
    }


# ============================================================================
# Rapport complet
# ============================================================================


def _discipline_share(d_all: pd.DataFrame) -> dict:
    total_n, total_min = len(d_all), float(d_all["duree_vol_minutes"].sum())
    share = {}
    for disc in ("parapente", "paramoteur"):
        g = d_all[d_all["type_vol"] == disc]
        share[disc] = {
            "n": int(len(g)), "minutes": float(g["duree_vol_minutes"].sum()),
            "pct_flights": 100 * len(g) / total_n if total_n else 0.0,
            "pct_minutes": 100 * float(g["duree_vol_minutes"].sum()) / total_min if total_min else 0.0,
        }
    return share


def compute_report(
    df: pd.DataFrame,
    pilot: str,
    year: int,
    compare_years: Union[str, List[int]] = "auto",
    max_compare: int = 2,
    today: Optional[dt.date] = None,
    compare_indicators: bool = True,
) -> dict:
    """
    Calcule toutes les données du rapport d'un pilote pour une année.

    compare_years : "auto" = jusqu'à `max_compare` années précédentes où le pilote a volé
                    (les plus récentes), ou une liste explicite d'années.
    today         : date de génération (par défaut aujourd'hui). Si `year` est l'année en cours,
                    l'année du rapport est arrêtée à cette date et comparée aux années précédentes entières.
    compare_indicators : False = pas d'indicateurs détaillés (`data`) pour les années comparées, seulement leurs
                    chiffres clés (`kpi_equiv`) : suffit à l'écart avec l'an dernier, 3 fois plus rapide (export web).

    Lève ValueError si le pilote n'a aucun vol cette année-là.
    """
    today = today or dt.date.today()
    if not df.attrs.get("report_prepared"):
        df = prepare_report_df(df)
    pilot_df = df[df["pilote"] == pilot]
    if pilot_df.empty:
        raise ValueError(f"Aucun vol trouvé pour le pilote « {pilot} ».")

    cutoff = (today.month, today.day) if year == today.year else None
    main_all = filter_flights(df, pilot, year, "all", cutoff)
    if main_all.empty:
        raise ValueError(f"Aucun vol pour « {pilot} » en {year}.")

    years_available = sorted(set(pilot_df["date"].dt.year), reverse=True)
    if compare_years == "auto":
        compare = [y for y in years_available if y < year][:max_compare]
    else:
        compare = [int(y) for y in compare_years if int(y) != year and y in years_available][:max_compare]
    compare = sorted(compare, reverse=True)

    report = {
        "pilot": pilot,
        "pilot_url": SYRIDE_PILOT_URL + pilot,
        "year": year,
        "today": today,
        "cutoff": cutoff,
        "years_available": years_available,
        "compare_years": compare,
        "share": _discipline_share(main_all),
        "data": {},        # data[annee][discipline] -> indicateurs complets (année entière)
        "kpi_equiv": {},   # kpi_equiv[annee][discipline] -> chiffres clés (année du rapport jusqu'à aujourd'hui, années comparées entières)
    }

    for y in [year] + compare:
        report["data"][y], report["kpi_equiv"][y] = {}, {}
        y_cutoff = cutoff if y == year else None  # année du rapport arrêtée à aujourd'hui, années comparées entières
        for disc in DISCIPLINES:
            # Graphiques : année du rapport jusqu'à aujourd'hui, années précédentes en entier
            if y == year or compare_indicators:
                full = filter_flights(df, pilot, y, disc, cutoff if y == year else None)
                report["data"][y][disc] = compute_indicators(full)
            equiv = filter_flights(df, pilot, y, disc, y_cutoff)
            report["kpi_equiv"][y][disc] = compute_kpis(equiv)

    # Sites découverts cette année-là (jamais volés avant, toutes disciplines)
    earlier = df[(df["pilote"] == pilot) & (df["date"].dt.year < year)]
    known = set(earlier["site"].dropna())
    new_sites = []
    for site, g in main_all.groupby("site"):
        if site not in known:
            new_sites.append({"site": str(site), "first_date": g["date"].min().date(), "n": int(len(g))})
    new_sites.sort(key=lambda r: r["first_date"])
    report["new_sites"] = new_sites if len(earlier) else []   # sans historique, tout serait « nouveau »
    end = today if cutoff else dt.date(year, 12, 31)
    report["rhythm"] = {disc: None if report["data"][year][disc]["empty"]
                        else compute_rhythm(report["data"][year][disc]["daily"], year, end) for disc in DISCIPLINES}
    report["records_history"] = compute_records_history(df, pilot, year, cutoff)   # records battus (F10)
    report["records_beaten"] = {disc: h["beaten"] for disc, h in report["records_history"].items()}
    report["story"] = compute_story(df, pilot, year, cutoff, today, report["records_beaten"])   # portrait, jalons
    report["career"] = compute_career(df, pilot, year, cutoff)   # section « Depuis tes débuts » (F16)
    # Couverture des données sur tous les vols du pilote (toutes années), par discipline
    report["coverage_all"] = {}
    for disc in DISCIPLINES:
        sel = pilot_df if disc == "all" else pilot_df[pilot_df["type_vol"] == disc]
        report["coverage_all"][disc] = _coverage(sel, _site_rows(sel)) if len(sel) else None
    return report


# ---- Zones de la carte (T46, I5) et rayon d'action (F12) ----
ZONE_LINK_KM = 80        # deux sites à moins de 80 km l'un de l'autre sont dans la même zone (lien simple)
ZONE_MAX_SPAN_KM = 180   # deux zones voisines fusionnent tant que la zone obtenue tient dans 180 km (lisible zoomée)
EARTH_RADIUS_KM = 6371.0


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Distance à vol d'oiseau (km) entre deux points (lon, lat) en degrés."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def compute_map_zones(sites: List[dict]) -> List[dict]:
    """
    Regroupe les sites placés (clé "coords") en zones géographiques, pour la carte par zones.
    1. lien simple : deux sites à moins de ZONE_LINK_KM sont dans la même zone (de proche en proche) ;
    2. les zones les plus proches fusionnent tant que la zone obtenue reste lisible zoomée (diamètre
       <= ZONE_MAX_SPAN_KM) : évite qu'un même bassin (ex. la Charente) se découpe en trois zones.
    Retour, zones triées par nombre de vols décroissant :
        [{"name": "Autour de <site le plus volé>", "top": site, "sites": [noms], "n", "minutes"}]
    """
    pts = [s for s in sites if s.get("coords")]
    if not pts:
        return []
    dist = [[haversine_km(a["coords"], b["coords"]) for b in pts] for a in pts]
    groups = [[i] for i in range(len(pts))]

    def link(g1, g2):
        return min(dist[i][j] for i in g1 for j in g2)

    def span(g):
        return max(dist[i][j] for i in g for j in g)

    while True:   # agrégation : la paire de zones la plus proche d'abord
        best = None
        for a in range(len(groups)):
            for b in range(a + 1, len(groups)):
                d = link(groups[a], groups[b])
                if (best is None or d < best[0]) and (d < ZONE_LINK_KM or span(groups[a] + groups[b]) <= ZONE_MAX_SPAN_KM):
                    best = (d, a, b)
        if best is None:
            break
        _, a, b = best
        groups[a] = groups[a] + groups[b]
        del groups[b]

    zones = []
    for g in groups:
        members = sorted((pts[i] for i in g), key=lambda s: (-s["n"], -s["minutes"], s["site"]))
        zones.append({"name": "Autour de " + members[0]["site"], "top": members[0]["site"],
                      "sites": [s["site"] for s in members], "n": sum(s["n"] for s in members),
                      "minutes": sum(s["minutes"] for s in members)})
    zones.sort(key=lambda z: (-z["n"], -z["minutes"], z["top"]))
    return zones


def compute_reach(sites: List[dict], main_site: Optional[str]) -> Optional[dict]:
    """Rayon d'action (F12) autour du site principal : {"main", "far", "km", "share"} (share = part des vols
    sur le site principal, 0-1). "far"/"km" valent None si le site principal ou les autres sites n'ont pas de position."""
    if not sites or not main_site:
        return None
    total = sum(s["n"] for s in sites)
    main = next((s for s in sites if s["site"] == main_site), None)
    if main is None or not total:
        return None
    out = {"main": main_site, "far": None, "km": None, "share": main["n"] / total}
    if main.get("coords"):
        others = [(haversine_km(main["coords"], s["coords"]), s["site"]) for s in sites
                  if s.get("coords") and s["site"] != main_site]
        if others:
            out["km"], out["far"] = max(others)
    return out


# ---- Carrière (F16) ----
CAREER_MIN_YEARS = 2          # la section « Depuis tes débuts » demande au moins 2 années de données


def compute_career(df: pd.DataFrame, pilot: str, year: int, cutoff: Optional[tuple]) -> Optional[dict]:
    """Cumul de carrière jusqu'à la date du rapport (années postérieures ignorées, année du rapport jusqu'à la coupure).
    None s'il y a moins de CAREER_MIN_YEARS années. Retour : {"years": [{"year", "p_min", "m_min", "p_n", "m_n"}],
    "minutes", "flights", "sites", "distance", "distance_n" (vols avec distance), "first_date", "best_year", "best_flights_year"}."""
    d = df[(df["pilote"] == pilot) & (df["date"].dt.year <= year)]
    if cutoff is not None:
        month, day = cutoff
        d = d[(d["date"].dt.year < year) | (d["date"].dt.month < month)
              | ((d["date"].dt.month == month) & (d["date"].dt.day <= day))]
    years = sorted(set(d["date"].dt.year))
    if len(years) < CAREER_MIN_YEARS:
        return None
    rows = []
    for y in years:
        g = d[d["date"].dt.year == y]
        row = {"year": int(y)}
        for code, disc in (("p", "parapente"), ("m", "paramoteur")):
            sub = g[g["type_vol"] == disc]
            row[code + "_min"], row[code + "_n"] = float(sub["duree_vol_minutes"].sum()), int(len(sub))
        rows.append(row)
    dist = _positive(d["distance"]) if "distance" in d.columns else pd.Series(dtype=float)
    return {
        "years": rows, "minutes": float(d["duree_vol_minutes"].sum()), "flights": int(len(d)),
        "sites": int(d["site"].nunique()), "distance": float(dist.sum()), "distance_n": int(len(dist)),
        "first_date": d["date"].min().date(),
        "best_year": max(rows, key=lambda r: (r["p_min"] + r["m_min"], r["year"]))["year"],
        "best_flights_year": max(rows, key=lambda r: (r["p_n"] + r["m_n"], r["year"]))["year"],
    }


def delta_pct(current: Optional[float], reference: Optional[float]) -> Optional[float]:
    """Variation en % de `current` par rapport à `reference` ; None si non calculable."""
    if current is None or reference is None or reference == 0:
        return None
    return 100.0 * (current - reference) / reference


def year_gap(report: dict, disc: str) -> Optional[dict]:
    """
    Avance ou retard de l'année du rapport sur la PREMIÈRE année de comparaison (la plus récente),
    à partir de `kpi_equiv` : l'année du rapport (jusqu'à aujourd'hui si en cours) face à l'année de référence ENTIÈRE.
    Indépendant des boutons d'années. None s'il n'y a pas d'année de comparaison, ou si l'une des deux
    années n'a aucun vol dans cette discipline.

    Retour : {"ref_year", "status" ("avance" / "retard" / "egal"), "minutes" (écart absolu),
              "signed_minutes", "flights" (écart signé en vols), "ongoing"}
    """
    if not report["compare_years"]:
        return None
    ref_year = report["compare_years"][0]
    cur = report["kpi_equiv"][report["year"]][disc]
    ref = report["kpi_equiv"][ref_year][disc]
    if cur["n_flights"] == 0 or ref["n_flights"] == 0:
        return None
    diff = cur["minutes"] - ref["minutes"]
    status = "egal" if abs(diff) < GAP_EQUAL_MINUTES else ("avance" if diff > 0 else "retard")
    return {"ref_year": ref_year, "status": status, "minutes": abs(diff), "signed_minutes": diff,
            "flights": cur["n_flights"] - ref["n_flights"], "ongoing": report["cutoff"] is not None}


# ============================================================================
# Récit de l'année : portrait du pilote (F1), frise des jalons (F3)
# ============================================================================
# Tout est calculé par discipline sur les vols de l'année du rapport (jusqu'à la date de coupure).
# Le rendu (report_html.py) ne fait que traduire ces dictionnaires en texte (report_textes.md).

STORY_MIN_COVER = 0.5         # une mesure (plafond, heure, distance) doit exister pour au moins la moitié des vols

# ---- Portrait (F1) : seuils calés sur les pilotes réels (script d'essai : voir le compte rendu T18) ----
PERSONA_MIN_FLIGHTS = 5       # en dessous, portrait neutre (pourcentages trop fragiles)
EARLY_HOUR = 11.0             # Lève-tôt : décollage médian avant 11 h (les pilotes réels décollent vers 14-16 h)
EARLY_HOUR_FLOOR = 7.0        #   (score maximal à 7 h)
EVENING_HOUR = 16.0           # Pilote du soir : décollage médian à partir de 16 h
EVENING_HOUR_CEIL = 20.0
WEEKEND_SHARE = 0.65          # Pilote du week-end : au moins 65 % des vols le samedi ou le dimanche
LOYAL_SHARE = 0.45            # Fidèle : un site concentre au moins 45 % des vols
EXPLORER_SITES = 30           # Explorateur : au moins 30 sites différents… (20 à 30 sites est courant ici)
EXPLORER_NEW_SITES = 20       #   … ou au moins 20 sites découverts cette année
NOMAD_RATIO = 0.5             # Nomade : au moins un site différent pour deux vols…
NOMAD_MIN_SITES = 8           #   … et au moins 8 sites
MARATHON_MINUTES = 35.0       # Marathonien : durée médiane d'au moins 35 min (médiane courante : 10 à 25 min)
MARATHON_CEIL = 90.0
REGULAR_WEEKS = 0.65          # Régulier : au moins un vol dans 65 % des semaines écoulées
CEILING_HUNTER_M = 3000.0     # Chasseur de plafond : plafond max d'au moins 3 000 m
CEILING_HUNTER_CEIL = 4500.0
VERSATILE_SHARE = 0.28        # Polyvalent : parapente et paramoteur pèsent chacun au moins 28 % du temps de vol
WINCH_SHARE = 0.30            # Treuilleur : au moins 30 % des vols au treuil
HIKE_SHARE = 0.15             # Marcheur : au moins 15 % des vols en rando
PERSONA_SECONDARY = 2         # nombre d'étiquettes secondaires au plus


def _clip01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _decimal_hour(value) -> Optional[float]:
    """Heure décimale (10:30 -> 10.5) d'un datetime.time / datetime / « HH:MM[:SS] » ; None si inconnue."""
    hhmm = _hhmm_of(value)
    if not hhmm:
        return None
    return int(hhmm[:2]) + int(hhmm[3:5]) / 60


def _story_frame(d: pd.DataFrame) -> pd.DataFrame:
    """Vols triés par date puis heure, avec heure décimale, jour et cumuls (vols, minutes)."""
    out = d.copy()
    out["_h"] = [_decimal_hour(v) for v in (out["heure"] if "heure" in out.columns else [None] * len(out))]
    out["_day"] = out["date"].dt.date
    out["_hsort"] = out["_h"].fillna(99.0)
    out = out.sort_values(["_day", "_hsort"], kind="mergesort").reset_index(drop=True)
    out["_cum_min"] = out["duree_vol_minutes"].cumsum()
    return out


def _flight_ref(row) -> dict:
    """Vol cité par un jalon."""
    return {"date": row["_day"], "site": _site_name(row["site"]), "voile": str(row["voile"]),
            "minutes": float(row["duree_vol_minutes"]), "url": str(row["flight_url"]),
            "time": _hhmm_of(row.get("heure"))}


def _cover(d: pd.DataFrame, column: str) -> float:
    return _measured(d, column) / len(d) if len(d) else 0.0


def _elapsed(year: int, end: dt.date) -> Tuple[dt.date, dt.date]:
    return dt.date(year, 1, 1), min(end, dt.date(year, 12, 31))


def _persona_metrics(s: pd.DataFrame, ctx: dict) -> dict:
    """Mesures utilisées par les règles du portrait."""
    n = len(s)
    hours = s["_h"].dropna()
    start, end = ctx["period"]
    weeks_active, weeks_total = _weeks_active_total(s["_day"], start.year, end)   # même définition que la tuile « Régularité »
    site_counts = s["site"].dropna().astype(str).value_counts()
    modes = s["mode"].astype(str).value_counts()
    ceiling = _positive(s["plafond"]) if "plafond" in s.columns else pd.Series(dtype=float)
    return {
        "n": n,
        "hour_median": float(hours.median()) if len(hours) >= n * STORY_MIN_COVER and len(hours) else None,
        "weekend": float((s["date"].dt.day_of_week >= 5).mean()),
        "top_site": str(site_counts.index[0]) if len(site_counts) else "",
        "top_site_share": float(site_counts.iloc[0] / n) if len(site_counts) else 0.0,
        "n_sites": int(site_counts.size), "n_new_sites": ctx["n_new_sites"],
        "duration_median": float(s["duree_vol_minutes"].median()),
        "weeks_share": weeks_active / max(1, weeks_total),
        "ceiling_max": float(ceiling.max()) if len(ceiling) and _cover(s, "plafond") >= STORY_MIN_COVER else None,
        "winch": float(modes.get("Treuil", 0) / n), "hike": float(modes.get("Rando", 0) / n),
        "share": ctx["share"],
    }





def _rule_early(m):
    h = m["hour_median"]
    return None if h is None or h >= EARLY_HOUR else ((EARLY_HOUR - h) / (EARLY_HOUR - EARLY_HOUR_FLOOR), h)


def _rule_evening(m):
    h = m["hour_median"]
    return None if h is None or h < EVENING_HOUR else ((h - EVENING_HOUR) / (EVENING_HOUR_CEIL - EVENING_HOUR), h)


def _rule_weekend(m):
    v = m["weekend"]
    return None if v < WEEKEND_SHARE else ((v - WEEKEND_SHARE) / (1 - WEEKEND_SHARE), v)


def _rule_loyal(m):
    v = m["top_site_share"]
    return None if v < LOYAL_SHARE else ((v - LOYAL_SHARE) / (1 - LOYAL_SHARE), v)


def _rule_explorer(m):
    a = (m["n_sites"] - EXPLORER_SITES) / EXPLORER_SITES if m["n_sites"] >= EXPLORER_SITES else None
    b = (m["n_new_sites"] - EXPLORER_NEW_SITES) / EXPLORER_NEW_SITES if m["n_new_sites"] >= EXPLORER_NEW_SITES else None
    if a is None and b is None:
        return None
    return (max(x for x in (a, b) if x is not None), m["n_sites"])


def _rule_nomad(m):
    v = m["n_sites"] / m["n"]
    if m["n_sites"] < NOMAD_MIN_SITES or v < NOMAD_RATIO:
        return None
    return ((v - NOMAD_RATIO) / (1 - NOMAD_RATIO), m["n_sites"])


def _rule_marathon(m):
    v = m["duration_median"]
    return None if v < MARATHON_MINUTES else ((v - MARATHON_MINUTES) / (MARATHON_CEIL - MARATHON_MINUTES), v)


def _rule_regular(m):
    v = m["weeks_share"]
    return None if v < REGULAR_WEEKS else ((v - REGULAR_WEEKS) / (1 - REGULAR_WEEKS), v)


def _rule_ceiling(m):
    v = m["ceiling_max"]
    return None if v is None or v < CEILING_HUNTER_M else ((v - CEILING_HUNTER_M) / (CEILING_HUNTER_CEIL - CEILING_HUNTER_M), v)


def _rule_versatile(m):
    sh = m["share"]
    if not sh:
        return None
    low = min(sh["parapente"], sh["paramoteur"])
    return None if low < VERSATILE_SHARE else ((low - VERSATILE_SHARE) / (0.5 - VERSATILE_SHARE), sh["parapente"])


def _rule_winch(m):
    v = m["winch"]
    return None if v < WINCH_SHARE else ((v - WINCH_SHARE) / (1 - WINCH_SHARE), v)


def _rule_hike(m):
    v = m["hike"]
    return None if v < HIKE_SHARE else ((v - HIKE_SHARE) / (1 - HIKE_SHARE), v)


# Règles du portrait : clé -> (test, poids). Le test reçoit les mesures (_persona_metrics) et renvoie None si la
# règle ne s'applique pas, sinon (score, valeur) : score = à quel point le seuil est dépassé (0 = tout juste,
# 1 = largement), valeur = chiffre cité dans la justification. Le poids départage les étiquettes : les plus
# rares et parlantes (façon de voler, plafond) passent devant les plus courantes (week-end).
# Libellés et justifications : report_textes.md, sections « portrait_<clé> ».
PERSONA_RULES = {
    "polyvalent": (_rule_versatile, 0.85),
    "treuilleur": (_rule_winch, 1.2),
    "marcheur": (_rule_hike, 1.2),
    "plafond": (_rule_ceiling, 1.1),
    "explorateur": (_rule_explorer, 1.0),
    "nomade": (_rule_nomad, 1.0),
    "marathonien": (_rule_marathon, 1.0),
    "regulier": (_rule_regular, 1.0),
    "leve_tot": (_rule_early, 0.9),
    "soir": (_rule_evening, 0.9),
    "fidele": (_rule_loyal, 0.9),
    "week_end": (_rule_weekend, 0.8),
}
PERSONA_FALLBACK = "libre"
PERSONA_FEW = "debut"          # moins de PERSONA_MIN_FLIGHTS vols


def compute_persona(s: pd.DataFrame, ctx: dict) -> dict:
    """Portrait : {"main": {key, value, score}, "secondary": [...], "n"}. `s` = _story_frame()."""
    if len(s) < PERSONA_MIN_FLIGHTS:
        return {"main": {"key": PERSONA_FEW, "value": len(s), "score": 0.0}, "secondary": [], "n": len(s)}
    m = _persona_metrics(s, ctx)
    hits = []
    for key, (test, weight) in PERSONA_RULES.items():
        res = test(m)
        if res is not None:
            score, value = res
            hits.append({"key": key, "value": value, "score": weight * (0.25 + _clip01(score)),
                         "site": m["top_site"] if key == "fidele" else None,
                         "new_sites": m["n_new_sites"] if key == "explorateur" else None})
    hits.sort(key=lambda h: -h["score"])
    if not hits:
        hits = [{"key": PERSONA_FALLBACK, "value": m["n_sites"], "score": 0.0}]
    return {"main": hits[0], "secondary": hits[1:1 + PERSONA_SECONDARY], "n": len(s), "metrics": m}


# ---- Frise des jalons (F3) ----
MILESTONE_FLIGHTS = (10, 25, 50, 100, 200)
MILESTONE_HOURS = (10, 25, 50, 100)
MILESTONE_MAX = 12            # nombre de jalons affichés au plus
MILESTONE_NEW_SITES_MAX = 3   # au-delà, seul le premier nouveau site est montré (« + N autres »)
MILESTONE_NEW_WINGS_MAX = 2   # idem pour les voiles jamais utilisées les années précédentes
MILESTONE_PAUSE_DAYS = 14     # reprise après une pause d'au moins 14 jours
# Priorité (plus petit = gardé en premier quand il faut couper) ; le premier vol est toujours gardé
MILESTONE_PRIORITY = {"first": 0, "record": 1, "nth_flight": 2, "nth_hour": 2, "best_day": 3,
                      "new_wing": 4, "new_site": 5, "comeback": 6}
MILESTONE_SMALL_STEP = 25      # paliers 10 et 25 : moins prioritaires que les records et les nouveautés
MILESTONE_GOLD = {"record", "new_site", "new_wing", "best_day"}   # records et nouveautés en or


def compute_milestones(s: pd.DataFrame, ctx: dict) -> List[dict]:
    """Jalons de l'année, triés par date. Chaque jalon : {"type", "date", "gold", "flight" (vol unique ou None),
    "day" (jour de vol à ouvrir), + données propres au type}."""
    if not len(s):
        return []
    out = []

    def add(kind, row=None, day=None, **extra):
        out.append(dict(type=kind, date=day or row["_day"], day=day or row["_day"],
                        flight=_flight_ref(row) if row is not None else None,
                        gold=kind in MILESTONE_GOLD, **extra))

    add("first", s.iloc[0])
    for n in MILESTONE_FLIGHTS:
        if len(s) >= n:
            add("nth_flight", s.iloc[n - 1], n=n)
    for h in MILESTONE_HOURS:
        reached = s.index[s["_cum_min"] >= h * 60]
        if len(reached):
            add("nth_hour", s.loc[reached[0]], n=h)

    # Records de l'année : regroupés par vol (le plus long et le plus haut peuvent être le même vol)
    by_flight = {}
    for metric, column in (("duree", "duree_vol_minutes"), ("plafond", "plafond"), ("distance", "distance")):
        if column not in s.columns:
            continue
        values = pd.to_numeric(s[column], errors="coerce")
        if not (values > 0).any():
            continue
        i = values.idxmax()
        by_flight.setdefault(i, []).append((metric, float(values[i])))
    for i, metrics in by_flight.items():
        personal = [k for k, v in metrics if k in ctx["beaten"] and abs(ctx["beaten"][k]["value"] - v) < 1e-9]
        if i == 0:   # le premier vol est aussi un record : on le dit sur le jalon du premier vol
            out[0]["metrics"] = metrics
            out[0]["personal"] = personal
            out[0]["gold"] = True
        else:
            add("record", s.loc[i], metrics=metrics, personal=personal)

    days = s.groupby("_day").agg(minutes=("duree_vol_minutes", "sum"), n=("duree_vol_minutes", "size"))
    if len(days) >= 2:
        best = days["minutes"].idxmax()
        if days.loc[best, "n"] >= 2:   # un seul vol ce jour-là : déjà raconté par le record de durée
            sites = list(s[s["_day"] == best]["site"].dropna().astype(str).value_counts().index)
            add("best_day", day=best, n_flights=int(days.loc[best, "n"]), minutes=float(days.loc[best, "minutes"]),
                sites=sites)

    if ctx["has_history"]:
        new = [(site, g.iloc[0]) for site, g in s.groupby("site", sort=False) if site not in ctx["known_sites"]]
        new.sort(key=lambda x: (x[1]["_day"], x[1]["_hsort"]))
        if new and new[0][1].name == 0:   # premier vol de l'année sur un site nouveau : dit sur le jalon du premier vol
            out[0]["new_site"] = True
            out[0]["gold"] = True
            new = new[1:]
        if len(new) > MILESTONE_NEW_SITES_MAX:
            add("new_site", new[0][1], others=[str(x[0]) for x in new[1:]])
        else:
            for _, row in new:
                add("new_site", row, others=[])
        wings = [(str(w), g.iloc[0]) for w, g in s.groupby("voile", sort=False)
                 if str(w).strip() and w not in ctx["known_wings"]]
        wings.sort(key=lambda x: (x[1]["_day"], x[1]["_hsort"]))
        if len(wings) > MILESTONE_NEW_WINGS_MAX:
            add("new_wing", wings[0][1], wing=wings[0][0], others=[w for w, _ in wings[1:]])
        else:
            for w, row in wings:
                add("new_wing", row, wing=w, others=[])

    dates = sorted(days.index)
    if len(dates) >= 2:
        gaps = [((b - a).days - 1, b) for a, b in zip(dates, dates[1:])]
        gap, back = max(gaps, key=lambda x: x[0])
        if gap >= MILESTONE_PAUSE_DAYS:
            add("comeback", s[s["_day"] == back].iloc[0], gap=gap)

    # Plafond : priorité (records et paliers d'abord), le premier vol toujours gardé, puis tri par date
    def rank(m):
        small = m["type"] in ("nth_flight", "nth_hour") and m["n"] <= MILESTONE_SMALL_STEP
        return (MILESTONE_PRIORITY["new_site"] if small else MILESTONE_PRIORITY[m["type"]], m["date"])
    out.sort(key=rank)
    kept = out[:MILESTONE_MAX]
    kept.sort(key=lambda m: (m["date"], MILESTONE_PRIORITY[m["type"]]))
    return kept


def compute_story(df: pd.DataFrame, pilot: str, year: int, cutoff: Optional[tuple], today: dt.date,
                  beaten: Optional[dict] = None) -> Dict[str, dict]:
    """Portrait et jalons par discipline : {discipline: {"persona", "milestones"}}."""
    pilot_df = df[df["pilote"] == pilot]
    earlier = pilot_df[pilot_df["date"].dt.year < year]
    end = dt.date(year, *cutoff) if cutoff else dt.date(year, 12, 31)
    d_all = filter_flights(df, pilot, year, "all", cutoff)
    total_min = float(d_all["duree_vol_minutes"].sum()) or 1.0
    share = {disc: float(d_all[d_all["type_vol"] == disc]["duree_vol_minutes"].sum()) / total_min
             for disc in ("parapente", "paramoteur")}
    out = {}
    for disc in DISCIPLINES:
        d = filter_flights(df, pilot, year, disc, cutoff)
        if d.empty:
            out[disc] = None
            continue
        s = _story_frame(d)
        known_sites = set(earlier["site"].dropna())
        ctx = {
            "disc": disc, "period": _elapsed(year, end), "has_history": len(earlier) > 0,
            "known_sites": known_sites, "known_wings": set(earlier["voile"]),
            "n_new_sites": int(len(set(s["site"].dropna()) - known_sites)) if len(earlier) else 0,
            "share": share if disc == "all" else None,
            "beaten": (beaten or {}).get(disc, {}),
            "n_parapente": int((s["type_vol"] == "parapente").sum()),
            "n_paramoteur": int((s["type_vol"] == "paramoteur").sum()),
        }
        out[disc] = {"persona": compute_persona(s, ctx), "milestones": compute_milestones(s, ctx)}
    return out
