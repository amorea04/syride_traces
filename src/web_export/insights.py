"""
Export des insights (ROADMAP_WEBAPP.md §4.5, tâche 1.5 bis) : le « récit » d'un pilote pour une année,
précalculé en Python et chargé à la demande par la page /pilote/:slug/:annee.

Une seule source de vérité : tout est calculé par `rapport.report_data` et mis en phrases par le
moteur de textes de `rapport.report_html` (ReportBuilder, report_textes.md, tirage crc32). Ce module
ne recopie aucune règle : il appelle ces fonctions, convertit le HTML en texte brut (espaces
insécables conservés) et pose les références de vol sous forme de clés (`pilote-numéro`).

Aucune trace ni coordonnée de vol (D12) : seules les zones de carte portent des coordonnées, celles
des sites (moyenne par site).

Interface (appelée par la CLI) :
    export_insights(df, out_dir, slugs, today, pilots=None) -> [{"pilot", "year", "file"}]
    build_insight(df_prepared, pilot, year, slugs, today) -> dict
"""

import datetime as dt
import html
import multiprocessing
import os
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd

from rapport import report_data as rd
from rapport import report_html as rh
from web_export.common import SCHEMA_VERSION, flight_key, write_hashed_json

MIN_DATE = pd.Timestamp("1980-01-01")      # en deçà : date sentinelle (1901), vol écarté comme dans flights.json
DISC_KEYS = (("tout", "all"), ("parapente", "parapente"), ("paramoteur", "paramoteur"))
BBOX_DECIMALS = 4                          # ~11 m : moyenne de site, pas une position de vol
TEXT_KEYS = ("synthese", "rythme", "quand", "ou", "matos", "records", "meilleure_journee", "journee_type")
INSIGHTS_DIR = "insights"
MAX_WORKERS = 8                            # export en parallèle : un pilote par tâche


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------
def plain(html_text: Optional[str]) -> str:
    """HTML du rapport -> texte brut (balises retirées, entités déséchappées, espaces insécables conservés)."""
    return html.unescape(re.sub(r"<[^>]+>", "", html_text or "")).strip()


def _text_or_none(html_text: Optional[str]) -> Optional[str]:
    return plain(html_text) or None


def _num(metric: str, value: Optional[float]) -> Optional[float]:
    """Arrondis du contrat (§4.2) : altitudes entières, le reste à une décimale."""
    if value is None:
        return None
    return int(round(value)) if metric == "plafond" else round(float(value), 1)


def _iso(date: dt.date) -> str:
    return date.isoformat()


def _flight_lookup(d: pd.DataFrame) -> Dict[str, int]:
    """{url de la fiche Syride: num_activite} des vols d'un pilote (le rapport désigne ses vols par leur URL)."""
    return {str(u): int(n) for u, n in zip(d["flight_url"], d["num_activite"])}


class _Refs:
    """Convertit une référence de vol du rapport (URL) en clé stable `slug-numéro`."""

    def __init__(self, slug: str, urls: Dict[str, int]):
        self.slug, self.urls = slug, urls

    def key(self, url: Optional[str]) -> Optional[str]:
        num = self.urls.get(str(url)) if url else None
        return flight_key(self.slug, num) if num is not None else None


# ---------------------------------------------------------------------------
# Éléments d'un récit
# ---------------------------------------------------------------------------
def _persona(b: "rh.ReportBuilder", disc: str) -> Optional[dict]:
    st = b.story(disc)
    if not st:
        return None
    p = st["persona"]
    label, why = b._two_lines("portrait_" + p["main"]["key"], b._persona_ctx(p["main"], p["n"]))
    if not label:
        return None
    secondary = []
    for hit in p["secondary"]:
        lab, wh = b._two_lines("portrait_" + hit["key"], b._persona_ctx(hit, p["n"]))
        if lab:
            secondary.append({"key": hit["key"], "label": plain(lab), "why": plain(wh)})
    return {"main": p["main"]["key"], "secondary": secondary, "label": plain(label), "why": plain(why)}


def _gap(b: "rh.ReportBuilder", disc: str) -> Optional[dict]:
    g = b.gap(disc)
    status, phrase, note = b.gap_phrase(disc)
    if not g or not phrase:
        return None
    return {"status": status, "ref_year": int(g["ref_year"]), "ongoing": bool(g["ongoing"]),
            "minutes": round(g["minutes"], 1), "flights": int(g["flights"]),
            "text": plain(phrase), "note": plain(note)}


def _milestones(b: "rh.ReportBuilder", disc: str, refs: _Refs) -> List[dict]:
    st = b.story(disc)
    out = []
    for m in (st["milestones"] if st else []):
        title, detail = b._milestone_text(m)
        item = {"date": _iso(m["date"]), "kind": m["type"],
                "value": m["n"] if m["type"] in ("nth_flight", "nth_hour") else None,
                "gold": bool(m["gold"]), "title": plain(title), "detail": plain(detail),
                "flight": refs.key((m.get("flight") or {}).get("url"))}
        if m.get("metrics"):
            item["metrics"] = [{"metric": k, "value": _num(k, v)} for k, v in m["metrics"]]
        out.append(item)
    return out


def _records_beaten(report: dict, disc: str, refs: _Refs) -> List[dict]:
    beaten = report["records_beaten"][disc]
    out = []
    for metric, _ in rd.RECORD_METRICS:
        r = beaten.get(metric)
        if r:
            out.append({"metric": metric, "value": _num(metric, r["value"]), "previous": _num(metric, r["previous"]),
                        "previous_year": int(r["previous_year"]), "date": _iso(r["date"]), "flight": refs.key(r["url"])})
    return out


def _new_sites(df: pd.DataFrame, report: dict, disc: str, year: int) -> List[dict]:
    """Sites découverts cette année et volés dans la discipline (mêmes sites que le rapport, avec leurs chiffres de la discipline)."""
    if disc == "all":
        return [{"site": s["site"], "first_date": _iso(s["first_date"]), "n": s["n"]} for s in report["new_sites"]]
    d = rd.filter_flights(df, report["pilot"], year, disc, report["cutoff"])
    names = {s["site"] for s in report["new_sites"]}
    out = [{"site": str(site), "first_date": _iso(g["date"].min().date()), "n": int(len(g))}
           for site, g in d.groupby("site") if str(site) in names]
    return sorted(out, key=lambda s: (s["first_date"], s["site"]))


def _new_wings(df: pd.DataFrame, report: dict, disc: str, year: int) -> List[dict]:
    """Voiles jamais utilisées les années précédentes (même règle que les jalons : sans historique, aucune n'est « nouvelle »)."""
    pilot = report["pilot"]
    earlier = df[(df["pilote"] == pilot) & (df["date"].dt.year < year)]
    if earlier.empty:
        return []
    d = rd.filter_flights(df, pilot, year, disc, report["cutoff"])
    known = set(earlier["voile"])
    out = [{"wing": str(w), "first_date": _iso(g["date"].min().date())}
           for w, g in d.groupby("voile") if str(w).strip() and w not in known]
    return sorted(out, key=lambda w: (w["first_date"], w["wing"]))


def _map_zones(sites: List[dict]) -> List[dict]:
    """Zones de la carte (« Autour de … »), avec l'emprise des sites de la zone (positions moyennes de sites)."""
    by_name = {s["site"]: s for s in sites if s.get("coords")}
    out = []
    for z in rd.compute_map_zones(sites):
        pts = [by_name[n]["coords"] for n in z["sites"]]
        lons, lats = [p[0] for p in pts], [p[1] for p in pts]
        out.append({"name": z["name"], "top": z["top"], "sites": z["sites"], "flights": int(z["n"]),
                    "minutes": round(z["minutes"], 1),
                    "bbox": [round(min(lons), BBOX_DECIMALS), round(min(lats), BBOX_DECIMALS),
                             round(max(lons), BBOX_DECIMALS), round(max(lats), BBOX_DECIMALS)]})
    return out


def _reach(d: dict) -> Optional[dict]:
    """Portée autour du site principal (même condition que la phrase « Où » du rapport)."""
    top = d["highlights"]["top_site"]
    reach = rd.compute_reach(d["sites"], top["site"]) if top else None
    if not reach or len(d["sites"]) < 2:
        return None
    return {"main_site": reach["main"], "farthest_site": reach["far"],
            "km": None if reach["km"] is None else round(reach["km"], 1), "main_share": round(reach["share"], 3)}


def _texts(b: "rh.ReportBuilder", disc: str) -> Dict[str, Optional[str]]:
    sentences = b.sentences(disc)
    best = b.main(disc)["highlights"].get("best_day")
    out = {k: _text_or_none(sentences.get(k)) for k in ("synthese", "rythme", "quand", "ou", "matos")}
    out["records"] = _text_or_none(b._records_sentence(disc))
    out["meilleure_journee"] = _text_or_none(b.best_day_sentence(best)) if best else None
    out["journee_type"] = _text_or_none(b.typical_day_sentence(disc))
    return {k: out[k] for k in TEXT_KEYS}


def _story(df: pd.DataFrame, report: dict, b: "rh.ReportBuilder", disc: str, year: int, refs: _Refs) -> Optional[dict]:
    d = b.main(disc)
    if d["empty"]:
        return None
    return {
        "persona": _persona(b, disc),
        "gap": _gap(b, disc),
        "milestones": _milestones(b, disc, refs),
        "records_beaten": _records_beaten(report, disc, refs),
        "equivalences": [plain(e) for e in b.equivalences(disc)],
        "new_sites": _new_sites(df, report, disc, year),
        "new_wings": _new_wings(df, report, disc, year),
        "map_zones": _map_zones(d["sites"]),
        "reach": _reach(d),
        "texts": _texts(b, disc),
    }


# ---------------------------------------------------------------------------
# Points d'entrée
# ---------------------------------------------------------------------------
def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """DataFrame brut du pkl -> DataFrame du rapport, sans les vols à date sentinelle (< 1980)."""
    dates = pd.to_datetime(df["date"], errors="coerce")
    return rd.prepare_report_df(df[dates >= MIN_DATE])


def _date_update(df: pd.DataFrame) -> Optional[dt.date]:
    """Date de dernière mise à jour des données, comme `build_report` (texte du rapport)."""
    if "date_update" not in df.columns:
        return None
    value = pd.to_datetime(df["date_update"], errors="coerce").max()
    return value.date() if value == value else None


def build_insight(df_prepared: pd.DataFrame, pilot: str, year: int, slugs: Dict[str, str], today: dt.date,
                  texts: Optional[Dict[str, str]] = None) -> dict:
    """
    Insights d'un pilote pour une année : dict conforme à #/$defs/InsightsFile.
    `df_prepared` vient de `prepare()` ; `slugs` = {pseudo: slug} ; `texts` = report_textes.md déjà lu (sinon lu ici).
    Lève ValueError si le pilote n'a aucun vol cette année-là.
    """
    slug = slugs[pilot]
    mine = df_prepared[df_prepared["pilote"] == pilot]
    mine.attrs["report_prepared"] = True
    # Seul l'écart avec l'année précédente utilise une année de comparaison : ses chiffres clés suffisent
    report = rd.compute_report(mine, pilot, year, max_compare=1, today=today, compare_indicators=False)
    b = rh.ReportBuilder(report, texts if texts is not None else rh.load_texts(), _date_update(df_prepared))
    refs = _Refs(slug, _flight_lookup(mine))
    end = today if report["cutoff"] else dt.date(year, 12, 31)
    return {"v": SCHEMA_VERSION, "pilot": slug, "year": int(year), "cutoff": _iso(end),
            "by_disc": {key: _story(mine, report, b, disc, year, refs) for key, disc in DISC_KEYS}}


def _export_pilot(prepared: pd.DataFrame, pilot: str, slugs: Dict[str, str], today: dt.date,
                  texts: Dict[str, str], out_dir: Path) -> List[dict]:
    """Écrit les fichiers de tous les ans d'un pilote ; retourne leurs entrées."""
    mine = prepared[prepared["pilote"] == pilot]
    mine.attrs["report_prepared"] = True
    entries = []
    for year in sorted(set(mine["date"].dt.year)):
        obj = build_insight(mine, pilot, int(year), slugs, today, texts)
        rel = write_hashed_json(obj, out_dir, "{}/{}-{}".format(INSIGHTS_DIR, slugs[pilot], int(year)))
        entries.append({"pilot": slugs[pilot], "year": int(year), "file": rel})
    return entries


_SHARED: dict = {}   # état hérité par les processus fils (fork) : évite de recopier le DataFrame


def _export_pilot_forked(pilot: str) -> List[dict]:
    return _export_pilot(pilot=pilot, **_SHARED)


def export_insights(df: pd.DataFrame, out_dir: Path, slugs: Dict[str, str], today: dt.date,
                    pilots: Optional[Iterable[str]] = None, workers: Optional[int] = None) -> List[dict]:
    """
    Écrit insights/<slug>-<année>.<hash>.json pour chaque couple (pilote, année) ayant au moins un vol.
    `df` = DataFrame brut du pkl ; `pilots` = pseudos Syride à traiter (tous par défaut).
    `workers` : processus en parallèle, un pilote par tâche (défaut : un par cœur, 8 au plus ; 1 = séquentiel).
    Retourne [{"pilot": slug, "year": année, "file": chemin relatif à out_dir}], trié par pilote puis année.
    """
    prepared = prepare(df)
    wanted = set(pilots) if pilots is not None else None
    todo = sorted((p for p in set(prepared["pilote"]) if wanted is None or p in wanted), key=lambda p: slugs[p])
    workers = min(len(todo), MAX_WORKERS, os.cpu_count() or 1) if workers is None else min(len(todo), workers)
    shared = dict(prepared=prepared, slugs=slugs, today=today, texts=rh.load_texts(), out_dir=Path(out_dir))
    if workers > 1 and "fork" in multiprocessing.get_all_start_methods():
        _SHARED.update(shared)
        try:
            with multiprocessing.get_context("fork").Pool(workers) as pool:
                batches = pool.map(_export_pilot_forked, todo, chunksize=1)
        finally:
            _SHARED.clear()
    else:
        batches = [_export_pilot(pilot=p, **shared) for p in todo]
    return sorted((e for batch in batches for e in batch), key=lambda e: (e["pilot"], e["year"]))
