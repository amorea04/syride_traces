"""
Publication de la webapp sur Cloudflare Pages (ROADMAP_WEBAPP.md §8 phase 7, §9.2).

Usage : uv run python src/publish.py [--dry-run] [--force-export] [--skip-install] [--skip-smoke]
                              [--skip-links] [--project-name NOM]

Étapes (arrêt net à la première erreur, code retour 0/1) :
  1. fraîcheur : le pkl est-il plus récent que web/public/data/meta.json ?
  2. export incrémental des données (export_web.main, sans --full)
  3. build : npm ci (sautable) puis npm run build dans web/
  4. smoke test Playwright sur « vite preview » du build réel (3 pages)
  5. contrôle D12 : aucune trace ni géométrie par vol dans dist/ (bloquant)
  6. liens Syride : 3 vols au hasard, bloquant seulement si les 3 répondent 404
  7. déploiement : wrangler pages deploy (sauté avec --dry-run, whoami compris)
  8. bilan : URL, tailles, nombre de fichiers, durée

Le déploiement se fait toujours depuis le poste local, jamais depuis la CI.
"""

import argparse
import gzip
import json
import os
import random
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
from urllib.parse import quote

SRC_DIR = Path(__file__).resolve().parent
ROOT_DIR = SRC_DIR.parent
WEB_DIR = ROOT_DIR / "web"
DATA_DIR = WEB_DIR / "public" / "data"
DIST_DIR = WEB_DIR / "dist"
SCHEMA_PATH = SRC_DIR / "web_export" / "schema.json"

PROJECT_NAME = "syride-analyse"
SITE_URL = "https://{}.pages.dev"
DEPLOY_BRANCH = "main"
SYRIDE_PILOTS_URL = "https://www.syride.com/fr/pilotes/"
LINK_SAMPLE = 3
LINK_TIMEOUT_S = 10
USER_AGENT = "Mozilla/5.0 (compatible; verification-liens)"
# Statuts qui signalent une protection anti-robots : simple avertissement.
BOT_PROTECTION_STATUSES = (403, 429, 503)

# Règle D12 : aucune trace publiée.
FORBIDDEN_EXTENSIONS = (".gpx", ".igc", ".kml")
FORBIDDEN_DIRS = ("tracks",)
# Repli si le schéma est illisible : un nom de colonne contenant l'un de ces motifs est refusé.
GEOMETRY_COLUMN_PATTERNS = (
    "lat", "lon", "lng", "coord", "geom", "polyline", "track", "trace", "path", "alt_profile",
)


def log(message: str) -> None:
    print(message, flush=True)


def err(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


class PublishError(Exception):
    """Erreur bloquante : message affiché sur stderr, code retour 1."""


# --- 1. fraîcheur -----------------------------------------------------------------------------

def needs_export(pkl_mtime: float, meta_mtime: Optional[float], force: bool = False) -> bool:
    """Vrai si l'export doit être (re)lancé : forcé, pas de meta, ou pkl plus récent que le meta."""
    if force or meta_mtime is None:
        return True
    return pkl_mtime > meta_mtime


# --- 5. contrôle D12 --------------------------------------------------------------------------

def allowed_flight_columns(schema_path: Path = SCHEMA_PATH) -> Optional[List[str]]:
    """Colonnes autorisées de flights.*.json d'après schema.json ; None si illisible."""
    try:
        schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
        columns = schema["$defs"]["FlightsFile"]["properties"]["columns"]["const"]
        if isinstance(columns, list) and columns and all(isinstance(c, str) for c in columns):
            return columns
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def check_d12(dist_dir: Path, allowed_columns: Optional[Sequence[str]] = None) -> List[str]:
    """Violations de la règle D12 dans dist_dir (liste vide = conforme).

    - aucun fichier .gpx/.igc/.kml (casse indifférente) ni dossier « tracks » ;
    - dans chaque data/flights.*.json : liste blanche des colonnes lue depuis schema.json ;
      si elle est indisponible, liste noire de motifs (GEOMETRY_COLUMN_PATTERNS).
    """
    dist_dir = Path(dist_dir)
    violations: List[str] = []
    for path in sorted(dist_dir.rglob("*")):
        rel = path.relative_to(dist_dir)
        if path.is_dir():
            if path.name.lower() in FORBIDDEN_DIRS:
                violations.append("dossier interdit : {}".format(rel))
        elif path.suffix.lower() in FORBIDDEN_EXTENSIONS:
            violations.append("fichier de trace interdit : {}".format(rel))
    if allowed_columns is None:
        allowed_columns = allowed_flight_columns()
    for path in sorted((dist_dir / "data").glob("flights.*.json")):
        try:
            columns = json.loads(path.read_text(encoding="utf-8")).get("columns", [])
        except (OSError, ValueError, AttributeError):
            violations.append("illisible : {}".format(path.relative_to(dist_dir)))
            continue
        for column in columns:
            if allowed_columns is not None:
                bad = column not in allowed_columns
            else:
                bad = any(p in str(column).lower() for p in GEOMETRY_COLUMN_PATTERNS)
            if bad:
                violations.append("colonne non autorisée « {} » dans {}".format(column, path.name))
    return violations


# --- 6. liens Syride --------------------------------------------------------------------------

def flight_url(pilot: str, num: int) -> str:
    """Même construction que web/src/lib/syride.ts (encodeURIComponent)."""
    return "{}{}/{}".format(SYRIDE_PILOTS_URL, quote(pilot, safe="-_.!~*'()"), num)


def sample_flight_urls(flights: Dict, n: int = LINK_SAMPLE, rng: Optional[random.Random] = None) -> List[str]:
    """Tire n vols (avec syride_num) du contenu d'un flights.*.json et renvoie leurs URL Syride."""
    rng = rng or random.Random()
    columns = flights["columns"]
    i_pilot, i_num = columns.index("pilot"), columns.index("syride_num")
    pilots = flights["dict"]["pilot"]
    candidates = [r for r in flights["rows"] if r[i_num] is not None]
    chosen = rng.sample(candidates, min(n, len(candidates)))
    return [flight_url(pilots[r[i_pilot]], r[i_num]) for r in chosen]


def link_verdict(statuses: Sequence[Optional[int]]) -> Tuple[bool, List[str]]:
    """(bloquant ?, avertissements) d'après les statuts HTTP (None = pas de réponse).

    Bloquant seulement si tous les liens répondent 404.
    """
    warnings: List[str] = []
    for status in statuses:
        if status is None:
            warnings.append("pas de réponse (réseau)")
        elif status in BOT_PROTECTION_STATUSES:
            warnings.append("HTTP {} (protection anti-robots probable)".format(status))
        elif status == 404:
            warnings.append("HTTP 404")
        elif not 200 <= status < 400:
            warnings.append("HTTP {}".format(status))
    blocking = bool(statuses) and all(s == 404 for s in statuses)
    return blocking, warnings


def http_status(url: str) -> Optional[int]:
    """Statut d'une requête HEAD (repli GET si 405) ; None si le réseau échoue."""
    for method in ("HEAD", "GET"):
        request = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=LINK_TIMEOUT_S) as response:
                return response.status
        except urllib.error.HTTPError as exc:
            if exc.code == 405 and method == "HEAD":
                continue
            return exc.code
        except (urllib.error.URLError, OSError):
            return None
    return None


# --- 8. tailles -------------------------------------------------------------------------------

def dir_sizes(directory: Path) -> Dict[str, int]:
    """Nombre de fichiers, taille brute et taille gzip (niveau 6) du dossier."""
    files = raw = packed = 0
    for path in Path(directory).rglob("*"):
        if path.is_file():
            content = path.read_bytes()
            files += 1
            raw += len(content)
            packed += len(gzip.compress(content, compresslevel=6))
    return {"files": files, "raw": raw, "gzip": packed}


def format_size(n: int) -> str:
    if n >= 1024 * 1024:
        return "{:.2f} Mo".format(n / (1024 * 1024))
    return "{:.1f} Ko".format(n / 1024)


# --- étapes -----------------------------------------------------------------------------------

def step(number: int, title: str) -> None:
    log("\n[{}/8] {}".format(number, title))


# Pas de télémétrie wrangler (statistiques d'usage envoyées à Cloudflare par défaut).
ENV = dict(os.environ, WRANGLER_SEND_METRICS="false")


def run(cmd: List[str], cwd: Path) -> None:
    """Lance une commande en laissant sa sortie à l'écran ; PublishError si elle échoue."""
    log("$ " + " ".join(cmd))
    try:
        result = subprocess.run(cmd, cwd=str(cwd), env=ENV)
    except FileNotFoundError:
        raise PublishError("commande introuvable : {} (Node est-il installé ?)".format(cmd[0]))
    if result.returncode != 0:
        raise PublishError("échec de « {} » (code {})".format(" ".join(cmd), result.returncode))


def npm(*args: str) -> List[str]:
    return [shutil.which("npm") or "npm"] + list(args)


def npx(*args: str) -> List[str]:
    return [shutil.which("npx") or "npx"] + list(args)


def step_export(force: bool) -> None:
    step(1, "Fraîcheur des données")
    import params_scrap_syride as params

    pkl = Path(params.pkl_path)
    if not pkl.exists():
        raise PublishError("pkl introuvable : {}".format(pkl))
    meta = DATA_DIR / "meta.json"
    meta_mtime = meta.stat().st_mtime if meta.exists() else None
    do_export = needs_export(pkl.stat().st_mtime, meta_mtime, force)
    step(2, "Export des données")
    if not do_export:
        log("meta.json est plus récent que le pkl : export sauté (--force-export pour forcer).")
        return
    import export_web

    if export_web.main([]) != 0:
        raise PublishError("l'export des données a échoué")


def step_build(skip_install: bool) -> None:
    step(3, "Build")
    if skip_install:
        log("npm ci sauté (--skip-install).")
    else:
        run(npm("ci"), WEB_DIR)
    run(npm("run", "build"), WEB_DIR)


def step_smoke(skip: bool) -> None:
    step(4, "Smoke test du build réel")
    if skip:
        log("sauté (--skip-smoke).")
        return
    run(npx("playwright", "test", "-c", "playwright.publish.config.ts"), WEB_DIR)


def step_d12() -> None:
    step(5, "Contrôle D12 (aucune trace dans dist/)")
    if not DIST_DIR.is_dir():
        raise PublishError("dist/ introuvable : le build a-t-il réussi ?")
    violations = check_d12(DIST_DIR)
    if violations:
        raise PublishError("violations de la règle D12 :\n  - " + "\n  - ".join(violations))
    log("OK : aucune trace ni colonne de géométrie.")


def step_links(skip: bool) -> None:
    step(6, "Liens Syride")
    if skip:
        log("sauté (--skip-links).")
        return
    candidates = sorted((DIST_DIR / "data").glob("flights.*.json"))
    if not candidates:
        raise PublishError("aucun flights.*.json dans dist/data")
    flights = json.loads(candidates[0].read_text(encoding="utf-8"))
    urls = sample_flight_urls(flights)
    statuses = []
    for url in urls:
        status = http_status(url)
        statuses.append(status)
        log("  {} -> {}".format(url, status if status is not None else "pas de réponse"))
    blocking, warnings = link_verdict(statuses)
    for warning in warnings:
        err("ATTENTION : " + warning)
    if blocking:
        raise PublishError("les {} liens tirés répondent 404 : le format des liens a changé ?".format(len(urls)))


def step_deploy(project: str, dry_run: bool) -> None:
    step(7, "Déploiement")
    if dry_run:
        log("sauté (--dry-run).")
        return
    whoami = subprocess.run(npx("wrangler", "whoami"), cwd=str(WEB_DIR), env=ENV, capture_output=True, text=True)
    if whoami.returncode != 0 or "not authenticated" in (whoami.stdout + whoami.stderr).lower():
        raise PublishError("wrangler n'est pas connecté à Cloudflare : lance `cd web && npx wrangler login`.")
    run(npx("wrangler", "pages", "deploy", "dist", "--project-name", project, "--branch", DEPLOY_BRANCH, "--commit-dirty=true"), WEB_DIR)


def step_report(project: str, started: float) -> None:
    step(8, "Bilan")
    total = dir_sizes(DIST_DIR)
    data = dir_sizes(DIST_DIR / "data")
    log("URL            : " + SITE_URL.format(project))
    log("dist/          : {} fichiers, {} brut, {} gzip".format(total["files"], format_size(total["raw"]), format_size(total["gzip"])))
    log("dist/data/     : {} fichiers, {} brut, {} gzip".format(data["files"], format_size(data["raw"]), format_size(data["gzip"])))
    log("Durée totale   : {:.0f} s".format(time.time() - started))


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publie la webapp sur Cloudflare Pages.")
    parser.add_argument("--dry-run", action="store_true", help="tout sauf le déploiement (et wrangler whoami)")
    parser.add_argument("--force-export", action="store_true", help="exporte même si meta.json est plus récent que le pkl")
    parser.add_argument("--skip-install", action="store_true", help="saute npm ci")
    parser.add_argument("--skip-smoke", action="store_true", help="saute le smoke test Playwright")
    parser.add_argument("--skip-links", action="store_true", help="saute la vérification des liens Syride (hors ligne)")
    parser.add_argument("--project-name", default=PROJECT_NAME, help="projet Cloudflare Pages (défaut : {})".format(PROJECT_NAME))
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    started = time.time()
    try:
        step_export(args.force_export)
        step_build(args.skip_install)
        step_smoke(args.skip_smoke)
        step_d12()
        step_links(args.skip_links)
        step_deploy(args.project_name, args.dry_run)
        step_report(args.project_name, started)
    except PublishError as exc:
        err("\nERREUR : {}".format(exc))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
