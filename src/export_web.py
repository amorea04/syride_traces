"""
Export des données de la webapp (ROADMAP_WEBAPP.md §4) : meta.json, flights.<hash>.json,
sites.<hash>.json, insights/<pilote>-<année>.<hash>.json. Chaque fichier est validé contre
src/web_export/schema.json avant écriture.

Usage : uv run python src/export_web.py [--only flights|sites|insights] [--pilot X] [--full] [--out DIR] [--pkl PATH]
"""

import argparse
import datetime as dt
import gzip
import importlib
import json
import shutil
import sys
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

SRC_DIR = Path(__file__).resolve().parent
ROOT_DIR = SRC_DIR.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import pandas as pd  # noqa: E402

from web_export import meta as meta_mod  # noqa: E402
from web_export.common import dumps_compact, pilot_slugs, write_hashed_json  # noqa: E402
from web_export.flights import build_flights, select_exportable  # noqa: E402
from web_export.schema import validate  # noqa: E402
from web_export.sites import build_sites  # noqa: E402

DEFAULT_OUT = ROOT_DIR / "web" / "public" / "data"
DEFAULT_COORDS = ROOT_DIR / "sites_coordinates.json"
PARTS = ("flights", "sites", "insights")
INSIGHTS_MODULE = "web_export.insights"


def _load_insights_fn() -> Optional[Callable]:
    """export_insights importé à la demande ; None si le module n'existe pas encore."""
    try:
        return importlib.import_module(INSIGHTS_MODULE).export_insights
    except ModuleNotFoundError as exc:
        if exc.name != INSIGHTS_MODULE:
            raise
        return None


def purge_all(out_dir: Path) -> None:
    """--full : supprime les données précédentes (json de premier niveau et dossier insights)."""
    for path in out_dir.glob("*.json"):
        path.unlink()
    shutil.rmtree(out_dir / "insights", ignore_errors=True)


def _resolve_pilots(requested: Optional[List[str]], slugs: Dict[str, str]) -> Optional[List[str]]:
    """Pseudos Syride correspondant aux valeurs demandées (pseudo exact ou slug)."""
    if not requested:
        return None
    by_slug = {s: p for p, s in slugs.items()}
    out = []
    for value in requested:
        pseudo = value if value in slugs else by_slug.get(value) or by_slug.get(value.lower())
        if pseudo is None:
            raise ValueError("pilote inconnu : {!r} (connus : {})".format(value, ", ".join(sorted(slugs))))
        out.append(pseudo)
    return out


def _sizes(data: bytes) -> dict:
    return {"raw": len(data), "gzip": len(gzip.compress(data, 9, mtime=0))}


def _write(obj: dict, kind: str, out_dir: Path, stem: str) -> (str, dict):
    validate(obj, kind)
    rel = write_hashed_json(obj, out_dir, stem)
    return rel, _sizes(dumps_compact(obj))


def _previous_entry(previous: Optional[dict], part: str):
    if previous is None:
        raise FileNotFoundError("export partiel ({}) impossible : pas de meta.json précédent dans le dossier de sortie".format(part))
    return previous["files"][part] if part != "insights" else previous["insights"]


def run_export(df: pd.DataFrame, out_dir: Path, only: Optional[str] = None, pilots: Optional[List[str]] = None,
               full: bool = False, coords_path: Optional[Path] = DEFAULT_COORDS, today: Optional[dt.date] = None,
               now: Optional[dt.datetime] = None, insights_fn: Optional[Callable] = None,
               log: Callable[[str], None] = print) -> dict:
    """Exporte tout ou la partie `only`. Retourne un résumé (meta, tailles, avertissements, fichiers purgés)."""
    started = time.perf_counter()
    out_dir = Path(out_dir)
    if only is not None and only not in PARTS:
        raise ValueError("--only doit valoir {}".format(" ou ".join(PARTS)))
    if full and only:
        raise ValueError("--full et --only sont incompatibles")
    out_dir.mkdir(parents=True, exist_ok=True)
    if full:
        purge_all(out_dir)
    previous = None if full else meta_mod.read_previous_meta(out_dir)
    wanted = set(PARTS) if only is None else {only}
    today = today or dt.date.today()
    warnings: List[str] = []
    sizes: Dict[str, dict] = {}

    flights_obj, fstats = build_flights(df)
    kept, _ = select_exportable(df)
    slugs = pilot_slugs(flights_obj["dict"]["pilot"])
    files: Dict[str, str] = {}

    if "flights" in wanted:
        files["flights"], sizes["flights"] = _write(flights_obj, "FlightsFile", out_dir, "flights")
    else:
        files["flights"] = _previous_entry(previous, "flights")
    if "sites" in wanted:
        sites_obj, sstats = build_sites(kept, flights_obj, coords_path)
        files["sites"], sizes["sites"] = _write(sites_obj, "SitesFile", out_dir, "sites")
        if sstats["without_coords"]:
            warnings.append("{} site(s) sans coordonnées : {}".format(
                len(sstats["without_coords"]), ", ".join(sstats["without_coords"][:10])
                + (" …" if len(sstats["without_coords"]) > 10 else "")))
    else:
        files["sites"] = _previous_entry(previous, "sites")

    insights = _insights_part(df, out_dir, slugs, today, wanted, only, pilots, previous, insights_fn, warnings, sizes)
    carried = [files[p] for p in ("flights", "sites") if p not in wanted] + [e["file"] for e in insights]
    meta_mod.check_files_exist(out_dir, carried)

    meta = meta_mod.build_meta(flights_obj, fstats["excluded"], files, insights, now=now,
                               refreshed_at=meta_mod.refreshed_date(df))
    validate(meta, "MetaFile")
    meta_mod.write_meta(meta, out_dir)
    purged = meta_mod.purge_unreferenced(meta, out_dir)

    summary = {"meta": meta, "stats": fstats, "sizes": sizes, "warnings": warnings, "purged": purged,
               "duration_s": time.perf_counter() - started}
    _report(summary, log)
    return summary


def _insights_part(df, out_dir, slugs, today, wanted, only, pilots, previous, insights_fn, warnings, sizes) -> List[dict]:
    """Entrées insights du meta : générées, reprises du meta précédent, ou fusion pour --pilot."""
    if "insights" not in wanted:
        return list(_previous_entry(previous, "insights"))
    fn = insights_fn or _load_insights_fn()
    if fn is None:
        if only == "insights":
            raise ModuleNotFoundError("module {} introuvable : insights non exportés".format(INSIGHTS_MODULE))
        warnings.append("module {} introuvable : export sans insights".format(INSIGHTS_MODULE))
        return []
    selected = _resolve_pilots(pilots, slugs)
    entries = list(fn(df, out_dir, slugs, today=today, pilots=selected))
    for entry in entries:
        path = Path(out_dir) / entry["file"]
        validate(json.loads(path.read_text(encoding="utf-8")), "InsightsFile")
    total = {"raw": 0, "gzip": 0, "files": len(entries)}
    for entry in entries:
        s = _sizes((Path(out_dir) / entry["file"]).read_bytes())
        total["raw"] += s["raw"]
        total["gzip"] += s["gzip"]
    sizes["insights"] = total
    if selected is not None and previous is not None:
        done = {slugs[p] for p in selected}
        entries += [e for e in previous["insights"] if e["pilot"] not in done]
    return entries


def _kb(n: int) -> str:
    return "{:.1f} Ko".format(n / 1024)


def _report(summary: dict, log: Callable[[str], None]) -> None:
    stats, meta = summary["stats"], summary["meta"]
    log("Vols exportés : {} (écartés : {} sur {})".format(stats["exported"], stats["excluded"], stats["input"]))
    log("Pilotes {} | sites {} | voiles {} | données au {}".format(
        meta["counts"]["pilots"], meta["counts"]["sites"], meta["counts"]["wings"], meta["data_updated_at"]))
    raw = gz = 0
    for name, s in summary["sizes"].items():
        extra = " ({} fichiers)".format(s["files"]) if "files" in s else ""
        log("  {:<9} {:>12} brut  {:>12} gzip{}".format(name, _kb(s["raw"]), _kb(s["gzip"]), extra))
        raw, gz = raw + s["raw"], gz + s["gzip"]
    log("  {:<9} {:>12} brut  {:>12} gzip".format("total", _kb(raw), _kb(gz)))
    if summary["purged"]:
        log("Fichiers obsolètes supprimés : {}".format(len(summary["purged"])))
    for warning in summary["warnings"]:
        log("ATTENTION : " + warning)
    log("Durée : {:.1f} s".format(summary["duration_s"]))


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export des données web (flights, sites, insights).")
    parser.add_argument("--only", choices=PARTS, help="n'exporter que cette partie (le reste vient du meta.json précédent)")
    parser.add_argument("--pilot", action="append", help="limite les insights à ce pilote (pseudo ou slug ; répétable)")
    parser.add_argument("--full", action="store_true", help="purge complète du dossier de sortie avant export")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="dossier de sortie (défaut : web/public/data)")
    parser.add_argument("--pkl", type=Path, help="pkl des vols (défaut : params_scrap_syride.pkl_path)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.pkl is None:
        import params_scrap_syride as params
        args.pkl = Path(params.pkl_path)
    if not args.pkl.exists():
        print("pkl introuvable : {}".format(args.pkl), file=sys.stderr)
        return 1
    df = pd.read_pickle(args.pkl)
    try:
        run_export(df, args.out, only=args.only, pilots=args.pilot, full=args.full)
    except (ValueError, FileNotFoundError, ModuleNotFoundError) as exc:
        print("ERREUR : {}".format(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
