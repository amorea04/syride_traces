"""
Index SQLite des vols.

Les dossiers (<pilote>/traces/<num>/ avec <num>.json, <num>.sheet.html.gz, <num>.gpx, <num>.igc) restent la
SOURCE DE VÉRITÉ. La base n'est qu'un index / cache, reconstructible à tout moment
(supprimer flights.db suffit : elle sera recréée au prochain lancement).

Ce qu'elle apporte :
  - les coordonnées de départ (trace de la fiche brute, sinon GPX/KML) ne sont calculées
    qu'UNE fois par vol ;
  - la liste des vols « à compléter » (pas de GPX) est immédiate ;
  - le pkl est généré depuis la base, sans reparser tous les fichiers.

Le contenu JSON de chaque vol est stocké tel quel (colonne data_json) : le DataFrame
reconstruit pour le pkl a donc exactement les mêmes colonnes qu'avant.
"""

import hashlib
import json
import os
import re
import sqlite3
import time
from datetime import date, datetime

import pandas as pd

import analyze_functions
import track_stats
from syride_parsing import FLIGHT_SHEET_FIELDS, parse_fv_config

DB_NAME = "flights.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS flights (
    pilot       TEXT NOT NULL,
    num         TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    is_syride   INTEGER NOT NULL DEFAULT 0,
    has_gpx     INTEGER NOT NULL DEFAULT 0,
    has_igc     INTEGER NOT NULL DEFAULT 0,
    coords_done INTEGER NOT NULL DEFAULT 0,
    longitude   REAL,
    latitude    REAL,
    no_link     INTEGER NOT NULL DEFAULT 0,
    has_sheet   INTEGER NOT NULL DEFAULT 0,
    gpx_done    INTEGER NOT NULL DEFAULT 0,
    gpx_stats   TEXT,
    json_mtime  REAL,
    PRIMARY KEY (pilot, num)
);
"""


# Colonnes ajoutées après la première version de la base (ALTER TABLE idempotent dans connect)
_NEW_COLUMNS = [
    ("has_sheet_raw", "INTEGER DEFAULT 0"),    # fiche brute <num>.sheet.html.gz présente
    ("track_source", "TEXT"),                  # « fv-config », « gpx » ou NULL
    ("track_stats", "TEXT"),                   # statistiques (JSON, avec version) de la meilleure trace
    ("syride_status", "TEXT DEFAULT 'unknown'"),  # present / absent / unknown
    ("last_seen_list", "TEXT"),                # date de la dernière liste où le vol figurait
    ("list_hash", "TEXT"),                     # empreinte des champs de liste
    ("duplicate_of", "TEXT"),                  # numéro du vol jumeau probable
]


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute(_SCHEMA)
    # Migration : base créée par une version précédente (sans la colonne has_sheet)
    columns = {r[1] for r in conn.execute("PRAGMA table_info(flights)")}
    if "has_sheet" not in columns:
        conn.execute("ALTER TABLE flights ADD COLUMN has_sheet INTEGER NOT NULL DEFAULT 0")
    # Migration : statistiques calculées depuis le GPX (track_stats)
    if "gpx_done" not in columns:
        conn.execute("ALTER TABLE flights ADD COLUMN gpx_done INTEGER NOT NULL DEFAULT 0")
    if "gpx_stats" not in columns:
        conn.execute("ALTER TABLE flights ADD COLUMN gpx_stats TEXT")
    # Migration : date de modification du JSON (pour ne relire que les JSON modifiés)
    if "json_mtime" not in columns:
        conn.execute("ALTER TABLE flights ADD COLUMN json_mtime REAL")
    # Migrations : fiche brute, trace prioritaire, réconciliation avec la liste Syride
    for name, definition in _NEW_COLUMNS:
        if name not in columns:
            conn.execute(f"ALTER TABLE flights ADD COLUMN {name} {definition}")
    # Identifiant Syride des pilotes (évite de le relire sur la page à chaque lancement)
    conn.execute("CREATE TABLE IF NOT EXISTS pilots ("
                 "pilot TEXT PRIMARY KEY, id_rider TEXT, updated TEXT)")
    conn.commit()
    return conn


def get_id_rider(conn: sqlite3.Connection, pilot: str):
    """idRider Syride mis en cache pour ce pilote, ou None."""
    row = conn.execute("SELECT id_rider FROM pilots WHERE pilot=?", (pilot,)).fetchone()
    return row[0] if row else None


def set_id_rider(conn: sqlite3.Connection, pilot: str, id_rider) -> None:
    conn.execute(
        "INSERT INTO pilots (pilot, id_rider, updated) VALUES (?, ?, ?) "
        "ON CONFLICT(pilot) DO UPDATE SET id_rider=excluded.id_rider, updated=excluded.updated",
        (pilot, str(id_rider), datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()


def _find_track_file(folder: str, num: str):
    """GPX en priorité, sinon KML. Retourne le chemin ou None."""
    found = {}
    for f in os.listdir(folder):
        prefix, ext = os.path.splitext(f)
        if prefix == num and ext.lower() in (".gpx", ".kml"):
            found[ext.lower()] = os.path.join(folder, f)
    return found.get(".gpx") or found.get(".kml")


def _find_gpx(folder: str, num: str):
    """<num>.gpx en priorité, sinon le premier .gpx du dossier. Retourne le chemin ou None."""
    preferred = os.path.join(folder, f"{num}.gpx")
    if os.path.exists(preferred):
        return preferred
    for f in sorted(os.listdir(folder)):
        if f.lower().endswith(".gpx"):
            return os.path.join(folder, f)
    return None


def _has_ext(folder: str, ext: str) -> bool:
    return any(f.lower().endswith(ext) for f in os.listdir(folder))


def _read_fv_config(folder: str, num: str):
    """Trace `fv-config` de la fiche brute du vol (dict), ou None."""
    from syride_scraper import load_sheet_raw   # import tardif : syride_scraper charge Selenium
    html = load_sheet_raw(folder, num)
    return parse_fv_config(html) if html else None


def _first_point(track):
    """(longitude, latitude) du premier point d'une trace `fv-config`, ou None si invraisemblable."""
    try:
        lat, lon = (float(x) for x in track["points"][0][:2])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lon, lat


def sync_pilot(conn: sqlite3.Connection, main_path: str, pilot_folder: str,
               stats: dict = None, verbose: bool = False) -> int:
    """
    Parcourt les dossiers du pilote et met la base à jour :
      - relit le JSON d'un vol seulement s'il a été modifié depuis la dernière lecture
        (date de modification du fichier) ; repère la présence de fiche brute / GPX / IGC ;
      - calcule les coordonnées de départ seulement pour les vols qui n'en ont pas encore ;
      - calcule les statistiques de la trace (track_stats) une seule fois par vol. Trace
        prioritaire : fiche brute (fv-config) > GPX > KML ;
      - supprime de la base les vols dont le dossier n'existe plus.
    Ne fait que LIRE les dossiers : seule la base est modifiée.
    Retourne le nombre de vols présents.

    stats   : dict optionnel, complété avec le détail du travail effectué
              {"json_read", "coords", "gpx_stats", "seconds"} ("gpx_stats" = statistiques
              de trace calculées, quelle qu'en soit la source).
    verbose : affiche une ligne de progression pendant les calculs longs (premier passage,
              changement de STATS_VERSION...) pour qu'on voie que le script avance.
    """
    t_start = time.time()
    pilot_dir = os.path.join(main_path, pilot_folder)
    seen = set()
    work = {"json_read": 0, "coords": 0, "gpx_stats": 0}
    t_last_print = t_start
    progress_shown = False

    if os.path.isdir(pilot_dir):
        json_files = analyze_functions.get_json_files(directory=pilot_dir)
        for i, json_path in enumerate(json_files, 1):
            folder = os.path.dirname(json_path)
            num = os.path.basename(json_path)[:-5]
            mtime = os.path.getmtime(json_path)
            has_gpx = int(_has_ext(folder, ".gpx"))
            has_igc = int(_has_ext(folder, ".igc"))
            has_raw = int(os.path.exists(os.path.join(folder, f"{num}.sheet.html.gz")))

            row = conn.execute(
                "SELECT coords_done, gpx_done, gpx_stats, json_mtime, track_stats, "
                "track_source, has_sheet_raw, has_gpx FROM flights WHERE pilot=? AND num=?",
                (pilot_folder, num),
            ).fetchone()

            if row is not None and row[3] == mtime:
                # JSON inchangé : seuls les fichiers GPX / IGC / fiche brute ont pu changer
                seen.add(num)
                conn.execute(
                    "UPDATE flights SET has_gpx=?, has_igc=? WHERE pilot=? AND num=?",
                    (has_gpx, has_igc, pilot_folder, num),
                )
            else:
                try:
                    data = analyze_functions.extract_json_data(json_path)
                except Exception as e:
                    print(f"Warning: JSON illisible ({json_path}) : {e}")
                    continue
                seen.add(num)
                _upsert_json(conn, pilot_folder, num, data, has_gpx, has_igc, mtime)
                work["json_read"] += 1

            did_coords, did_stats = _update_derived(
                conn, pilot_folder, num, folder, row, has_gpx, has_raw)
            work["coords"] += did_coords
            work["gpx_stats"] += did_stats

            if verbose and time.time() - t_last_print >= 2:
                t_last_print = time.time()
                progress_shown = True
                print(f"\r   {pilot_folder} : {i}/{len(json_files)} vols "
                      f"(JSON relus {work['json_read']}, stats de trace calculées "
                      f"{work['gpx_stats']})...", end="", flush=True)

    if progress_shown:
        print()

    # Nettoyage : vols dont le dossier a disparu
    in_db = [r[0] for r in conn.execute("SELECT num FROM flights WHERE pilot=?", (pilot_folder,))]
    for num in in_db:
        if num not in seen:
            conn.execute("DELETE FROM flights WHERE pilot=? AND num=?", (pilot_folder, num))

    conn.commit()
    if stats is not None:
        stats.update(work, seconds=time.time() - t_start)
    return len(seen)


def _upsert_json(conn, pilot_folder, num, data, has_gpx, has_igc, mtime):
    """Enregistre le contenu (relu) du JSON d'un vol."""
    is_syride = int(data.get("is_syride") is True)
    # Fiche lue = statistiques de la fiche présentes dans le JSON
    has_sheet = int(data.get("plafond") is not None)
    syride_status = data.get("syride_status") or "unknown"
    conn.execute(
        """INSERT INTO flights (pilot, num, data_json, is_syride, has_gpx, has_igc, has_sheet,
                               json_mtime, syride_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pilot, num) DO UPDATE SET
               data_json=excluded.data_json,
               is_syride=excluded.is_syride,
               has_gpx=excluded.has_gpx,
               has_igc=excluded.has_igc,
               has_sheet=excluded.has_sheet,
               json_mtime=excluded.json_mtime,
               syride_status=excluded.syride_status""",
        (pilot_folder, num, json.dumps(data, ensure_ascii=False), is_syride, has_gpx,
         has_igc, has_sheet, mtime, syride_status),
    )


def _compute_stats(folder, num, has_gpx, get_track):
    """(statistiques, source) de la meilleure trace : fv-config, puis GPX ; sinon (None, None)."""
    track = get_track()
    if track is not None:
        stats = track_stats.compute_track_stats(track)
        if stats:
            return stats, "fv-config"
    if has_gpx:
        gpx_path = _find_gpx(folder, num)
        stats = track_stats.compute_gpx_stats(gpx_path) if gpx_path else None
        if stats:
            return stats, "gpx"
    return None, None


def _update_derived(conn, pilot_folder, num, folder, row, has_gpx, has_raw):
    """
    Coordonnées de départ et statistiques de trace : calculées une seule fois par vol.
    `row` : ligne de la base AVANT cette passe (None pour un vol nouveau).
    Retourne (coordonnées calculées, statistiques calculées) sous forme de booléens.
    """
    (coords_done, stats_done, gpx_stats, _, cached_json, source,
     old_raw, old_gpx) = row or (0, 0, None, None, None, None, 0, 0)
    key = (pilot_folder, num)
    did_coords = did_stats = False

    track_cache = {}

    def get_track():   # fiche brute lue (et analysée) au plus une fois, et seulement si utile
        if "track" not in track_cache:
            track_cache["track"] = _read_fv_config(folder, num) if has_raw else None
        return track_cache["track"]

    # Coordonnées de départ : fiche brute, sinon GPX/KML. Un vol dont les coordonnées sont
    # déjà connues (GPX/KML) les garde quand une fiche brute arrive.
    if not coords_done:
        point = _first_point(get_track()) if has_raw and get_track() else None
        if point is None:
            track_file = _find_track_file(folder, num)
            if track_file is not None:
                point = tuple(analyze_functions.get_first_coordinates(track_file))
        if point is not None:
            conn.execute(
                "UPDATE flights SET longitude=?, latitude=?, coords_done=1 "
                "WHERE pilot=? AND num=?", (point[0], point[1]) + key)
            did_coords = True

    # Statistiques : base ancienne (gpx_stats, gpx_done) -> copiées dans track_stats sans recalcul
    cached = json.loads(cached_json) if cached_json else None
    legacy_stale = False
    if stats_done and cached is None and gpx_stats and has_gpx and not has_raw:
        legacy = json.loads(gpx_stats)
        if legacy.get("version") == track_stats.STATS_VERSION:
            conn.execute("UPDATE flights SET track_stats=?, track_source='gpx' "
                         "WHERE pilot=? AND num=?", (gpx_stats,) + key)
            cached, source = legacy, "gpx"
        else:
            legacy_stale = True   # calcul d'une ancienne STATS_VERSION : à refaire

    recompute = False
    if has_raw or has_gpx:
        if not stats_done or legacy_stale:
            recompute = True
        elif cached is not None and cached.get("version") != track_stats.STATS_VERSION:
            recompute = True      # calcul modifié depuis
        elif source != "fv-config" and ((has_raw and not old_raw) or (has_gpx and not old_gpx)):
            recompute = True      # une meilleure trace est apparue
        elif (source == "fv-config" and not has_raw) or (source == "gpx" and not has_gpx):
            recompute = True      # la trace qui servait de source a disparu
    elif stats_done or cached_json or source:
        conn.execute("UPDATE flights SET track_stats=NULL, track_source=NULL, gpx_stats=NULL, "
                     "gpx_done=0 WHERE pilot=? AND num=?", key)

    if recompute:
        stats, source = _compute_stats(folder, num, has_gpx, get_track)
        conn.execute(
            "UPDATE flights SET track_stats=?, track_source=?, gpx_stats=?, gpx_done=1 "
            "WHERE pilot=? AND num=?",
            (json.dumps(stats) if stats else None, source,
             json.dumps(stats) if source == "gpx" else None) + key)
        did_stats = True

    conn.execute("UPDATE flights SET has_sheet_raw=? WHERE pilot=? AND num=?", (has_raw,) + key)
    return did_coords, did_stats


def get_global_queue(conn: sqlite3.Connection, pilots: list, fill_igc: bool = False,
                     tasks: str = "all", files_by_pilot: dict = None,
                     backfill_raw: bool = True) -> list:
    """
    Liste, pour tous les pilotes demandés, les vols Syride à compléter (hors vols marqués
    « sans lien »). Un vol est à compléter s'il lui manque :
      - les informations de la fiche (statistiques) ;
      - ou le fichier GPX (profils à fichiers seulement) ;
      - ou, seulement si fill_igc=True, le fichier IGC (profils à fichiers seulement) ;
      - ou la fiche brute (rattrapage, écarté si backfill_raw=False).

    files_by_pilot : {pilote: ("gpx", "igc")} = fichiers téléchargés pour ce pilote ; un pilote
        absent du dict (ou à tuple vide) n'a PAS de fichiers : on lit seulement sa fiche.
        None = comportement historique : tous les pilotes téléchargent le GPX (et l'IGC avec
        fill_igc), et le rattrapage des fiches brutes seules n'est pas mis en file (le code de
        session qui ne connaît pas encore les fiches brutes continue de fonctionner).

    Retourne une liste de dicts {pilot, num, data, need_gpx, need_igc, need_info, need_raw},
    triée par groupes :
      1. informations de fiche manquantes,
      2. GPX manquant (informations présentes),
      3. IGC seul,
      4. fiche brute seule (rattrapage) ;
    dans chaque groupe, du plus récent au plus ancien (numéro de trace décroissant, tous
    pilotes confondus).
    """
    if tasks not in ("all", "info", "files"):
        raise ValueError(f"Mode tasks invalide : {tasks!r} (attendu : all, info ou files)")
    if not pilots:
        return []
    marks = ",".join("?" for _ in pilots)
    rows = conn.execute(
        f"SELECT pilot, num, data_json, has_gpx, has_igc, has_sheet, has_sheet_raw FROM flights "
        f"WHERE pilot IN ({marks}) AND is_syride=1 AND no_link=0",
        list(pilots),
    ).fetchall()

    queue = []
    for pilot, num, data_json, has_gpx, has_igc, has_sheet, has_raw in rows:
        if files_by_pilot is None:
            wants_gpx, wants_igc, raw_backfill = True, True, False
        else:
            files = files_by_pilot.get(pilot) or ()
            wants_gpx, wants_igc, raw_backfill = "gpx" in files, "igc" in files, backfill_raw
        item = {
            "pilot": pilot,
            "num": num,
            "data": json.loads(data_json),
            "need_gpx": wants_gpx and not has_gpx,
            "need_igc": wants_igc and not has_igc,
            "need_info": not has_sheet,
            "need_raw": not has_raw,
        }
        # IGC : n'est une raison de visiter la fiche qu'avec fill_igc
        igc_work = item["need_igc"] and fill_igc
        raw_only = item["need_raw"] and raw_backfill
        if not (item["need_info"] or item["need_gpx"] or igc_work or raw_only):
            continue
        if tasks == "info" and not item["need_info"]:
            continue
        if tasks == "files" and (item["need_info"] or not (item["need_gpx"] or igc_work)):
            continue
        queue.append(item)

    def sort_key(item):
        if item["need_info"]:
            group = 0
        elif item["need_gpx"]:
            group = 1
        elif item["need_igc"] and fill_igc:
            group = 2
        else:
            group = 3
        return (group, -(int(item["num"]) if item["num"].isdigit() else 0))

    queue.sort(key=sort_key)
    return queue


def flight_kind(item: dict) -> str:
    """Classe un vol pour le bilan de la file : info, files, info+files, ou raw (rattrapage seul)."""
    has_info_work = item["need_info"]
    has_file_work = item["need_gpx"] or item["need_igc"]
    if has_info_work and has_file_work:
        return "info+files"
    if has_info_work:
        return "info"
    if has_file_work:
        return "files"
    return "raw"


def summary(conn: sqlite3.Connection, main_path: str, pilot_folder: str) -> dict:
    """
    Bilan d'un pilote, pour vérifier ce que le script a vu sur le disque :
      total       : dossiers de vol lus (avec un JSON)
      syride      : dont vols Syride (seuls concernés par fiche / GPX / IGC)
      no_gpx      : vols Syride sans GPX
      no_sheet    : vols Syride dont les informations de la fiche manquent dans le JSON
      no_igc      : vols Syride sans IGC (traités seulement avec --fill-igc)
      no_link     : vols marqués « sans lien » (ignorés)
      no_raw      : vols Syride sans fiche brute (<num>.sheet.html.gz)
      absent      : vols Syride absents de la dernière liste complète (syride_status = absent)
      orphans     : dossiers numériques SANS JSON (ignorés : on ne peut pas les compléter)
    """
    row = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(is_syride),0), "
        "COALESCE(SUM(is_syride=1 AND has_gpx=0),0), "
        "COALESCE(SUM(is_syride=1 AND has_sheet=0),0), "
        "COALESCE(SUM(is_syride=1 AND has_igc=0),0), "
        "COALESCE(SUM(no_link),0), "
        "COALESCE(SUM(is_syride=1 AND has_sheet_raw=0),0), "
        "COALESCE(SUM(is_syride=1 AND syride_status='absent'),0) FROM flights WHERE pilot=?",
        (pilot_folder,),
    ).fetchone()

    orphans = []
    traces_dir = os.path.join(main_path, pilot_folder, "traces")
    if os.path.isdir(traces_dir):
        for d in os.listdir(traces_dir):
            full = os.path.join(traces_dir, d)
            if d.isdigit() and os.path.isdir(full) and not os.path.exists(os.path.join(full, f"{d}.json")):
                orphans.append(d)

    return {"total": row[0], "syride": row[1], "no_gpx": row[2], "no_sheet": row[3],
            "no_igc": row[4], "no_link": row[5], "no_raw": row[6], "absent": row[7],
            "orphans": orphans}


def mark_no_link(conn: sqlite3.Connection, pilot_folder: str, num: str) -> None:
    """La fiche a été lue mais ne propose aucun GPX : on ne la retente plus automatiquement."""
    conn.execute("UPDATE flights SET no_link=1 WHERE pilot=? AND num=?", (pilot_folder, num))
    conn.commit()


# Champs pour lesquels la fiche Syride prime sur le GPX (le GPX comble seulement un manque)
GPX_FILL_ONLY = {"vitesse_max"}


def _missing(value) -> bool:
    return value is None or str(value).strip() in ("", "None", "nan")


def _to_float(value):
    try:
        return None if _missing(value) else float(str(value).replace(",", "."))
    except ValueError:
        return None


# Champs ajoutés au pkl depuis la trace `fv-config` (None sans trace : jamais 0)
TRACK_NEW_FIELDS = ["vario_min", "hauteur_sol_max", "heure_plafond"]
# Champs de la fiche prioritaires sur la trace (la trace ne comble qu'un manque)
TRACK_FILL_ONLY = ("vario_max", "g_max")


def apply_track_stats(data: dict, stats) -> str:
    """
    Complète / remplace dans `data` (JSON d'un vol) les statistiques calculables depuis la
    trace. Règle : trace disponible et exploitable -> ses valeurs priment ; sinon les valeurs
    du JSON (fiche Syride) sont conservées telles quelles.

    vitesse_moyenne : recalculée comme Syride (distance de la page liste / durée de la trace).
    vitesse_max      : celle du JSON si elle existe (la trace, sensible aux sauts GPS, ne sert
                       qu'à combler une valeur absente).
    vario_max, g_max : ceux du JSON (fiche) ; la trace fv-config ne comble qu'un manque ;
                       un GPX ne permet pas de les calculer.
    vario_min, hauteur_sol_max, heure_plafond (TRACK_NEW_FIELDS) : de la trace fv-config
                       seulement ; sinon valeur du JSON si la fiche la donne, sinon None.

    Retourne la source des statistiques : "trace" (fv-config), "gpx", "fiche" (JSON) ou
    "aucune".
    """
    from_fv = bool(stats) and stats.get("source") == "fv-config"
    for field in TRACK_NEW_FIELDS:
        value = stats.get(field) if from_fv else None
        if value is None and not _missing(data.get(field)):
            value = data[field]
        data[field] = value

    if not stats:
        return "aucune" if _missing(data.get("plafond")) else "fiche"

    for field in track_stats.GPX_STAT_FIELDS:
        if stats.get(field) is None:
            continue
        if field in GPX_FILL_ONLY and (_to_float(data.get(field)) or 0) > 0:
            continue
        data[field] = str(stats[field])
    if from_fv:
        for field in TRACK_FILL_ONLY:
            if _missing(data.get(field)) and stats.get(field) is not None:
                data[field] = str(stats[field])

    distance = _to_float(data.get("distance_activite"))
    if distance is None:
        distance = _to_float(data.get("distance"))
    h, m, sec = (int(x) for x in stats["duree_vol"].split(":"))
    hours = h + m / 60 + sec / 3600
    if distance is not None and hours > 0:
        data["vitesse_moyenne"] = str(round(distance / hours, 1))
    return "trace" if from_fv else "gpx"


apply_gpx_stats = apply_track_stats   # ancien nom, conservé


def load_pilot_frames(conn: sqlite3.Connection, pilot_folder: str):
    """
    Reconstruit, pour un pilote, les deux DataFrames que produisaient auparavant
    create_dataframe_from_json et create_dataframe_from_all_kml :
        - df_data      : un dict JSON par vol ;
        - df_long_lat  : colonnes num_activite, longitude, latitude.

    Statistiques : celles de la trace (fiche brute fv-config, sinon GPX) quand elle est
    disponible, sinon celles du JSON (voir apply_track_stats). La colonne `source_stats`
    indique d'où elles viennent. Colonnes optionnelles ajoutées : `syride_status`,
    `vario_min`, `hauteur_sol_max`, `heure_plafond` (None quand inconnues).

    Vols Syride « incomplets » (ni fiche lue ni GPX : statistiques inconnues) :
    ils SONT inclus, avec la colonne `incomplet` = True. Ils ont déjà le site, la date/heure,
    la durée et la voile (page liste) ; leurs statistiques de fiche (plafond, vitesses,
    distance, gain, vario, g) restent vides (0 après le pipeline = « inconnu »).
    Rien n'est stocké dans le pkl à ce sujet : à chaque génération, le pkl est reconstruit
    depuis les JSON ; dès que la fiche (et/ou le GPX) est récupérée, le vol repasse
    automatiquement en `incomplet` = False avec toutes ses informations.

    Les vols non Syride sans statistiques restent écartés (comme avant).
    """
    rows = conn.execute(
        "SELECT num, data_json, is_syride, coords_done, longitude, latitude, track_stats, "
        "syride_status FROM flights WHERE pilot=? ORDER BY num",
        (pilot_folder,),
    ).fetchall()

    data_list, coords = [], []
    incomplete = 0
    n_trace = n_gpx = 0
    for num, data_json, is_syride, coords_done, lon, lat, stats_json, syride_status in rows:
        data = json.loads(data_json)
        # Information de la page liste, conservée dans le JSON mais volontairement absente
        # du pkl pour que celui-ci garde le même format qu'avant.
        data.pop("altitude_max", None)
        data.pop("nom_vol", None)
        # Historique des modifications de la liste (réconciliation) : propre au JSON
        data.pop("historique_liste", None)
        # Lien de téléchargement signé : expiré depuis longtemps, sans intérêt dans le pkl
        data.pop("adresse_zip", None)

        stats = json.loads(stats_json) if stats_json else None
        data["source_stats"] = apply_track_stats(data, stats)
        n_trace += data["source_stats"] == "trace"
        n_gpx += data["source_stats"] == "gpx"
        data["syride_status"] = syride_status or "unknown"

        is_incomplete = _missing(data.get("plafond"))
        if is_incomplete and not is_syride:
            continue
        data["incomplet"] = is_incomplete
        incomplete += is_incomplete

        data_list.append(data)
        if coords_done:
            coords.append((num, lon, lat))

    print(f"  {n_trace + n_gpx}/{len(data_list)} vol(s) avec statistiques calculées depuis la "
          f"trace ({n_trace} fiche brute, {n_gpx} GPX).")
    if incomplete:
        print(f"  {incomplete} vol(s) Syride incomplet(s) (ni fiche ni GPX) : inclus dans le pkl, "
              f"taggés incomplet.")

    df_data = pd.DataFrame(data_list)
    # Garantit les colonnes de la fiche même si AUCUN vol du pilote n'a encore sa fiche
    # (sinon le pipeline échouerait sur des colonnes absentes).
    if not df_data.empty:
        for col in FLIGHT_SHEET_FIELDS:
            if col != "adresse_zip" and col not in df_data.columns:
                df_data[col] = None
        for col in TRACK_NEW_FIELDS:
            if col not in df_data.columns:
                df_data[col] = None
    df_long_lat = pd.DataFrame(coords, columns=["num_activite", "longitude", "latitude"])
    return df_data, df_long_lat


# ------------------------ Réconciliation avec la liste Syride ------------------------

# Champs de la page liste, suivis pour détecter une modification faite sur Syride
LIST_FIELDS = ("types", "site", "date", "heure", "flight_time", "voile", "distance",
               "altitude_max", "instrument", "nom_vol")
# Jetons d'affichage éphémères de la liste : jamais écrits sur disque
_TOKEN_KEYS = ("flight_token", "expires", "token")


def _norm(value):
    """Valeur comparable : les représentations d'une valeur manquante (None, "None", "")
    deviennent None ; les textes sont débarrassés des espaces de bord."""
    if _missing(value):
        return None
    return value.strip() if isinstance(value, str) else value


def _fields_hash(fields: dict, keys) -> str:
    """Empreinte (sha1 du JSON trié) des champs `keys` d'un dict, valeurs normalisées."""
    payload = {k: _norm(fields.get(k)) for k in sorted(keys)}
    return hashlib.sha1(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                   default=str).encode("utf-8")).hexdigest()


def list_hash(fields: dict) -> str:
    """Empreinte des champs de liste (LIST_FIELDS ; `nom_vol` seulement quand il est présent)."""
    return _fields_hash(fields, [k for k in LIST_FIELDS if k != "nom_vol" or "nom_vol" in fields])


def _duration_seconds(text):
    """(secondes, précision en secondes ?) d'une durée « 00:04:07 », « 1h 06min », « 45min »,
    ou None."""
    if _missing(text):
        return None
    text = str(text).strip()
    match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if match:
        h, m, s = int(match.group(1)), int(match.group(2)), match.group(3)
        return h * 3600 + m * 60 + int(s or 0), s is not None
    hours = re.search(r"(\d+)\s*h", text)
    minutes = re.search(r"(\d+)\s*min", text)
    seconds = re.search(r"(\d+)\s*s\b", text)
    if not (hours or minutes or seconds):
        return None
    total = (int(hours.group(1)) * 3600 if hours else 0) + \
            (int(minutes.group(1)) * 60 if minutes else 0) + \
            (int(seconds.group(1)) if seconds else 0)
    return total, seconds is not None


def _same_value(field, a, b) -> bool:
    """Deux valeurs d'un champ de liste sont-elles « les mêmes » ? Tolère les différences de
    représentation (valeur manquante, espaces, durée au format minutes ou hh:mm:ss, 38 / 38.0)."""
    a, b = _norm(a), _norm(b)
    if a == b:
        return True
    if a is None or b is None:
        return False
    if field == "flight_time":
        da, db = _duration_seconds(a), _duration_seconds(b)
        if da and db:
            if da[1] and db[1]:
                return da[0] == db[0]
            return abs(da[0] - db[0]) < 60   # l'une n'a pas de secondes
        return False
    fa, fb = _to_float(a), _to_float(b)
    return fa is not None and fb is not None and fa == fb


def _today_str(today) -> str:
    if today is None:
        return date.today().isoformat()
    return today.isoformat() if hasattr(today, "isoformat") else str(today)


def _read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fp:
        return json.load(fp)


def _hour_minutes(text):
    match = re.fullmatch(r"\s*(\d{1,2})\s*[h:]\s*(\d{2})\s*", str(text)) if not _missing(text) else None
    return int(match.group(1)) * 60 + int(match.group(2)) if match else None


def find_duplicates(conn: sqlite3.Connection, pilot: str) -> list:
    """
    Doublons probables d'un pilote : même date, heure à moins de 10 min, durée à moins de
    2 min, numéros différents. Retourne [(num_ancien, num_recent)] triés (numéros entiers).
    Ne modifie rien.
    """
    flights = []
    for num, data_json in conn.execute("SELECT num, data_json FROM flights WHERE pilot=?", (pilot,)):
        if not num.isdigit():
            continue
        data = json.loads(data_json)
        minutes, duration = _hour_minutes(data.get("heure")), _duration_seconds(data.get("flight_time"))
        day = _norm(data.get("date"))
        if day is None or minutes is None or duration is None:
            continue
        flights.append((day, minutes, duration[0], int(num)))
    flights.sort()

    pairs = []
    for i, (day, minutes, seconds, num) in enumerate(flights):
        for day2, minutes2, seconds2, num2 in flights[i + 1:]:
            if day2 != day or minutes2 - minutes > 10:
                break
            if abs(seconds2 - seconds) <= 120 and num2 != num:
                pairs.append((min(num, num2), max(num, num2)))
    return sorted(set(pairs))


def _update_duplicates(conn, pilot):
    """Remplit `duplicate_of` : le vol au numéro le plus grand (publié le dernier) pointe vers
    son jumeau au plus petit numéro (le premier publié, celui que garde le pipeline du pkl).
    Rien n'est supprimé. Retourne la liste des paires."""
    pairs = find_duplicates(conn, pilot)
    conn.execute("UPDATE flights SET duplicate_of=NULL WHERE pilot=?", (pilot,))
    first = {}
    for older, newer in pairs:
        first[newer] = min(first.get(newer, older), older)
    for newer, older in first.items():
        conn.execute("UPDATE flights SET duplicate_of=? WHERE pilot=? AND num=?",
                     (str(older), pilot, str(newer)))
    return [(str(a), str(b)) for a, b in pairs]


def reconcile_pilot(conn: sqlite3.Connection, main_path: str, pilot: str, list_items: list,
                    today=None) -> dict:
    """
    Compare la liste COMPLÈTE d'un pilote sur Syride (`list_items`, au format de
    get_nav_infos_bs) au contenu du disque et met à jour les JSON et l'index. Pas de réseau.

      - vol nouveau (dossier absent)  -> JSON créé (champs de fiche à None) ;
      - vol connu dont un champ de liste (LIST_FIELDS) a changé sur Syride -> ce champ
        seulement est mis à jour dans le JSON, l'ancienne valeur est tracée dans
        `historique_liste` ({"date", "champ", "avant", "apres"}). Ne sont pas des modifications :
        une valeur manquante sous une autre forme (None / "None" / ""), un champ absent du
        vieux JSON (ex. altitude_max), une valeur qui devient manquante dans la liste ;
      - vol Syride du disque absent de la liste -> syride_status = "absent" dans le JSON ;
        rien n'est jamais supprimé ; il repasse "present" s'il réapparaît ;
      - vol présent -> syride_status = "present" (écrit seulement s'il change) ; la date de la
        dernière liste est gardée dans la base seulement (last_seen_list) ;
      - garde-fou : liste de moins de 80 % des vols Syride connus -> aucune marque « absent » ;
      - doublons probables -> colonne duplicate_of (voir _update_duplicates).

    Aucun JSON n'est réécrit quand rien ne change. Les jetons éphémères de la liste
    (flight_token, expires, token) ne sont jamais écrits.

    Retourne {"new", "modified": [{"num", "fields"}], "absent", "reappeared",
    "duplicates": [(a, b)], "guard_triggered"}.
    """
    from syride_scraper import save_flight_data   # import tardif : syride_scraper charge Selenium

    today_str = _today_str(today)
    pilot_dir = os.path.join(main_path, pilot)
    report = {"new": [], "modified": [], "absent": [], "reappeared": [],
              "duplicates": [], "guard_triggered": False}

    sync_pilot(conn, main_path, pilot)   # la base reflète le disque avant de comparer
    known = {num: (json.loads(data_json), is_syride, status or "unknown")
             for num, data_json, is_syride, status in conn.execute(
                 "SELECT num, data_json, is_syride, syride_status FROM flights WHERE pilot=?",
                 (pilot,))}

    items = {}
    for item in list_items:
        num = str(item.get("num_activite", ""))
        if num.isdigit() and num not in items:
            items[num] = item

    syride_known = sum(1 for _, is_syride, _ in known.values() if is_syride)
    report["guard_triggered"] = len(list_items) < 0.8 * syride_known

    def write(num, data):
        save_flight_data(main_repertoire=pilot_dir, flight_data=data, quiet=True)

    # --- vols de la liste : nouveaux, modifiés, présents
    for num, item in items.items():
        fields = {k: v for k, v in item.items() if k not in _TOKEN_KEYS}
        if num not in known:
            data = dict(fields)
            for field in FLIGHT_SHEET_FIELDS:
                if field != "adresse_zip":
                    data.setdefault(field, None)
            data["syride_status"] = "present"
            save_flight_data(main_repertoire=pilot_dir, flight_data=data)
            report["new"].append(num)
            continue

        _, _, status = known[num]
        json_path = os.path.join(pilot_dir, "traces", num, f"{num}.json")
        try:
            data = _read_json(json_path)
        except (OSError, ValueError) as e:
            print(f"Warning: JSON illisible ({json_path}) : {e}")
            continue

        changed = False
        # Champs de liste : empreinte comparée sur les champs que le JSON possède
        keys = [k for k in LIST_FIELDS if k in data and k in fields]
        if _fields_hash(fields, keys) != _fields_hash(data, keys):
            modified = []
            for field in keys:
                new, old = fields[field], data[field]
                if _same_value(field, old, new) or _missing(new):
                    continue
                data[field] = new
                data.setdefault("historique_liste", []).append(
                    {"date": today_str, "champ": field, "avant": old, "apres": new})
                modified.append(field)
            if modified:
                report["modified"].append({"num": num, "fields": modified})
                changed = True

        if data.get("syride_status") != "present":
            data["syride_status"] = "present"
            changed = True
            if status == "absent":
                report["reappeared"].append(num)
        if changed:
            write(num, data)

    # --- vols du disque absents de la liste
    if not report["guard_triggered"]:
        for num, (data, is_syride, status) in sorted(known.items(), key=lambda kv: int(kv[0])
                                                     if kv[0].isdigit() else 0):
            if is_syride and num not in items and status != "absent":
                json_path = os.path.join(pilot_dir, "traces", num, f"{num}.json")
                try:
                    data = _read_json(json_path)
                except (OSError, ValueError):
                    continue
                data["syride_status"] = "absent"
                write(num, data)
                report["absent"].append(num)

    # --- index : relire les JSON modifiés, puis dates de liste, empreintes, doublons
    sync_pilot(conn, main_path, pilot)
    for num, item in items.items():
        conn.execute("UPDATE flights SET last_seen_list=?, list_hash=? WHERE pilot=? AND num=?",
                     (today_str, list_hash(item), pilot, num))
    report["duplicates"] = _update_duplicates(conn, pilot)
    conn.commit()
    return report


def write_duplicates_report(conn: sqlite3.Connection, main_path: str, pilots: list) -> str:
    """
    Écrit <main_path>/_rapport_doublons.txt : les doublons probables (colonne duplicate_of) des
    pilotes demandés, à valider par une personne. Jamais de suppression. Retourne le chemin.
    """
    lines = ["Doublons probables (même pilote, même date, heure à moins de 10 min, durée à moins",
             "de 2 min, numéros différents). Le vol au numéro le plus grand est signalé comme",
             "doublon du plus ancien. Rien n'a été supprimé : à vérifier à la main.", ""]
    total = 0
    for pilot in sorted(pilots):
        rows = conn.execute(
            "SELECT CAST(duplicate_of AS INTEGER), CAST(num AS INTEGER), data_json, syride_status "
            "FROM flights WHERE pilot=? AND duplicate_of IS NOT NULL "
            "ORDER BY CAST(duplicate_of AS INTEGER), CAST(num AS INTEGER)", (pilot,)).fetchall()
        if not rows:
            continue
        lines.append(f"{pilot} : {len(rows)} doublon(s) probable(s)")
        for original, num, data_json, status in rows:
            data = json.loads(data_json)
            lines.append(f"  {num} doublon de {original} | {data.get('date')} {data.get('heure')} | "
                         f"{data.get('site')} | durée {data.get('flight_time')} | "
                         f"voile {data.get('voile')} | statut Syride : {status}")
        lines.append("")
        total += len(rows)
    if total == 0:
        lines.append("Aucun doublon probable.")

    path = os.path.join(main_path, "_rapport_doublons.txt")
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fp:
        fp.write("\n".join(lines) + "\n")
    os.replace(tmp_path, path)
    return path


# ------------------------ Réanalyse hors ligne ------------------------


def reparse_pilot(conn: sqlite3.Connection, main_path: str, pilot: str) -> dict:
    """
    Relit les fiches brutes du pilote avec le parser actuel et réécrit dans le JSON les champs
    de fiche dont la valeur change (pas de réécriture si rien ne change ; adresse_zip, lien
    expiré, n'est jamais touchée ; une valeur présente n'est pas effacée par une valeur
    manquante). Puis met l'index à jour. Sans réseau.

    Retourne {"read": fiches lues, "updated": JSON réécrits, "errors": [(num, message)]}.
    """
    from syride_parsing import parse_flight_sheet
    from syride_scraper import load_sheet_raw, save_flight_data

    sync_pilot(conn, main_path, pilot)
    pilot_dir = os.path.join(main_path, pilot)
    nums = [r[0] for r in conn.execute(
        "SELECT num FROM flights WHERE pilot=? AND has_sheet_raw=1 ORDER BY num", (pilot,))]
    result = {"read": 0, "updated": 0, "errors": []}

    for num in nums:
        folder = os.path.join(pilot_dir, "traces", num)
        html = load_sheet_raw(folder, num)
        if html is None:
            result["errors"].append((num, "fiche brute illisible"))
            continue
        try:
            sheet, _ = parse_flight_sheet(html)
            data = _read_json(os.path.join(folder, f"{num}.json"))
        except Exception as e:
            result["errors"].append((num, str(e)))
            continue
        result["read"] += 1

        changed = False
        for field, new in sheet.items():
            if field == "adresse_zip" or _missing(new):
                continue
            old = data.get(field)
            if _missing(old) or str(old).strip() != str(new).strip():
                data[field] = new
                changed = True
        if changed:
            save_flight_data(main_repertoire=pilot_dir, flight_data=data, quiet=True)
            result["updated"] += 1

    sync_pilot(conn, main_path, pilot)
    return result
