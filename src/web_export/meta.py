"""
meta.json (ROADMAP_WEBAPP.md §4.1) : construction, écriture non hashée, purge des fichiers hashés obsolètes.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from web_export.common import SCHEMA_VERSION, dumps_compact
from web_export.flights import COLUMNS

COL_DATE = COLUMNS.index("date")

META_NAME = "meta.json"
PURGE_PATTERNS = ["flights.*.json", "sites.*.json", "insights/*.json"]


def build_meta(flights_obj: dict, excluded: int, files: Dict[str, str], insights: List[dict],
               now: Optional[datetime] = None, refreshed_at: Optional[str] = None) -> dict:
    """MetaFile. `data_updated_at` = date du vol le plus récent exporté ; `data_refreshed_at` = date de mise à jour
    des données (max de `date_update` du pkl, AAAA-MM-JJ ; repli : date du dernier vol)."""
    dates = [row[COL_DATE] for row in flights_obj["rows"] if row[COL_DATE]]
    if not dates:
        raise ValueError("aucun vol exporté : impossible de construire meta.json")
    now = now or datetime.now(timezone.utc)
    dictionary = flights_obj["dict"]
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_updated_at": max(dates),
        "data_refreshed_at": refreshed_at or max(dates),
        "counts": {"flights": len(flights_obj["rows"]), "pilots": len(dictionary["pilot"]),
                   "sites": len(dictionary["site"]), "wings": len(dictionary["wing"]),
                   "excluded_flights": int(excluded)},
        "files": {"flights": files["flights"], "sites": files["sites"]},
        "insights": sorted(insights, key=lambda e: (e["pilot"], e["year"])),
    }


def refreshed_date(df) -> Optional[str]:
    """Max de `date_update` du pkl (AAAA-MM-JJ), comme le rapport ; None si absente ou illisible."""
    import pandas as pd
    if df is None or "date_update" not in df.columns:
        return None
    value = pd.to_datetime(df["date_update"], errors="coerce").max()
    return None if value != value else value.strftime("%Y-%m-%d")


def read_previous_meta(out_dir: Path) -> Optional[dict]:
    path = Path(out_dir) / META_NAME
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def check_files_exist(out_dir: Path, rel_paths: List[str]) -> None:
    """Erreur si un fichier repris du meta précédent n'existe plus sur disque."""
    missing = [p for p in rel_paths if not (Path(out_dir) / p).is_file()]
    if missing:
        raise FileNotFoundError("fichiers référencés absents de {} : {}".format(out_dir, ", ".join(missing)))


def write_meta(meta: dict, out_dir: Path) -> Path:
    path = Path(out_dir) / META_NAME
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(dumps_compact(meta))
    return path


def referenced_files(meta: dict) -> List[str]:
    return [meta["files"]["flights"], meta["files"]["sites"]] + [e["file"] for e in meta["insights"]]


def purge_unreferenced(meta: dict, out_dir: Path) -> List[str]:
    """Supprime flights.*.json, sites.*.json et insights/*.json que `meta` ne référence pas ; retourne les noms."""
    keep = set(referenced_files(meta))
    removed = []
    for pattern in PURGE_PATTERNS:
        for path in sorted(Path(out_dir).glob(pattern)):
            rel = path.relative_to(out_dir).as_posix()
            if path.is_file() and rel not in keep:
                path.unlink()
                removed.append(rel)
    return removed
