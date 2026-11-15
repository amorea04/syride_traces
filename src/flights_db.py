"""
Index SQLite des vols.

Les dossiers (<pilote>/traces/<num>/ avec <num>.json, <num>.gpx, <num>.igc) restent la
SOURCE DE VÉRITÉ. La base n'est qu'un index / cache, reconstructible à tout moment
(supprimer flights.db suffit : elle sera recréée au prochain lancement).

Ce qu'elle apporte :
  - les coordonnées de départ (lecture des GPX/KML) ne sont calculées qu'UNE fois par vol ;
  - la liste des vols « à compléter » (pas de GPX) est immédiate ;
  - le pkl est généré depuis la base, sans reparser tous les fichiers.

Le contenu JSON de chaque vol est stocké tel quel (colonne data_json) : le DataFrame
reconstruit pour le pkl a donc exactement les mêmes colonnes qu'avant.
"""

import json
import os
import sqlite3
import time

import pandas as pd

import analyze_functions
import track_stats
from syride_parsing import FLIGHT_SHEET_FIELDS

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
    conn.commit()
    return conn


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


def sync_pilot(conn: sqlite3.Connection, main_path: str, pilot_folder: str,
               stats: dict = None, verbose: bool = False) -> int:
    """
    Parcourt les dossiers du pilote et met la base à jour :
      - relit le JSON d'un vol seulement s'il a été modifié depuis la dernière lecture
        (date de modification du fichier) ; repère la présence de GPX / IGC ;
      - calcule les coordonnées de départ seulement pour les vols qui n'en ont pas encore ;
      - calcule les statistiques du GPX (track_stats) une seule fois par vol ;
      - supprime de la base les vols dont le dossier n'existe plus.
    Retourne le nombre de vols présents.

    stats   : dict optionnel, complété avec le détail du travail effectué
              {"json_read", "coords", "gpx_stats", "seconds"}.
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

            row = conn.execute(
                "SELECT coords_done, gpx_done, gpx_stats, json_mtime FROM flights "
                "WHERE pilot=? AND num=?",
                (pilot_folder, num),
            ).fetchone()

            if row is not None and row[3] == mtime:
                # JSON inchangé : seuls les fichiers GPX / IGC ont pu changer
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

            did_coords, did_gpx = _update_derived(conn, pilot_folder, num, folder, row, has_gpx)
            work["coords"] += did_coords
            work["gpx_stats"] += did_gpx

            if verbose and time.time() - t_last_print >= 2:
                t_last_print = time.time()
                progress_shown = True
                print(f"\r   {pilot_folder} : {i}/{len(json_files)} vols "
                      f"(JSON relus {work['json_read']}, stats GPX calculées "
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
    conn.execute(
        """INSERT INTO flights (pilot, num, data_json, is_syride, has_gpx, has_igc, has_sheet,
                               json_mtime)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(pilot, num) DO UPDATE SET
               data_json=excluded.data_json,
               is_syride=excluded.is_syride,
               has_gpx=excluded.has_gpx,
               has_igc=excluded.has_igc,
               has_sheet=excluded.has_sheet,
               json_mtime=excluded.json_mtime""",
        (pilot_folder, num, json.dumps(data, ensure_ascii=False), is_syride, has_gpx,
         has_igc, has_sheet, mtime),
    )


def _update_derived(conn, pilot_folder, num, folder, row, has_gpx):
    """
    Coordonnées de départ et statistiques GPX : calculées une seule fois par vol.
    Retourne (coordonnées calculées, statistiques GPX calculées) sous forme de booléens.
    """
    did_coords = did_gpx = False
    coords_done = bool(row and row[0])
    if not coords_done:
        track = _find_track_file(folder, num)
        if track is not None:
            lon, lat = analyze_functions.get_first_coordinates(track)
            conn.execute(
                "UPDATE flights SET longitude=?, latitude=?, coords_done=1 "
                "WHERE pilot=? AND num=?",
                (lon, lat, pilot_folder, num),
            )
            did_coords = True

    # Statistiques du GPX : calculées une fois ; remises à zéro si le GPX disparaît
    gpx_done = bool(row and row[1])
    if gpx_done and row[2]:
        # Calcul modifié depuis (STATS_VERSION) : on recalcule
        cached = json.loads(row[2])
        gpx_done = cached.get("version") == track_stats.STATS_VERSION
    if has_gpx and not gpx_done:
        gpx_path = _find_gpx(folder, num)
        stats = track_stats.compute_gpx_stats(gpx_path) if gpx_path else None
        conn.execute(
            "UPDATE flights SET gpx_stats=?, gpx_done=1 WHERE pilot=? AND num=?",
            (json.dumps(stats) if stats else None, pilot_folder, num),
        )
        did_gpx = True
    elif not has_gpx and gpx_done:
        conn.execute(
            "UPDATE flights SET gpx_stats=NULL, gpx_done=0 WHERE pilot=? AND num=?",
            (pilot_folder, num),
        )
    return did_coords, did_gpx


def get_global_queue(conn: sqlite3.Connection, pilots: list, fill_igc: bool = False,
                     tasks: str = "all") -> list:
    """
    Liste, pour tous les pilotes demandés, les vols Syride à compléter (hors vols marqués
    « sans lien »). Un vol est à compléter s'il lui manque :
      - les informations de la fiche (statistiques) ;
      - ou le fichier GPX ;
      - ou, seulement si fill_igc=True, le fichier IGC.

    Retourne une liste de dicts {pilot, num, data, need_gpx, need_igc, need_info}, triée :
      1. d'abord les vols à qui il manque des informations ou le GPX,
      2. puis (si fill_igc) ceux à qui il ne manque que l'IGC ;
    dans chaque groupe, du plus récent au plus ancien (numéro de trace décroissant, tous
    pilotes confondus).
    """
    if tasks not in ("all", "info", "files"):
        raise ValueError(f"Mode tasks invalide : {tasks!r} (attendu : all, info ou files)")
    if not pilots:
        return []
    marks = ",".join("?" for _ in pilots)
    condition = "has_gpx=0 OR has_sheet=0"
    if fill_igc:
        condition += " OR has_igc=0"
    rows = conn.execute(
        f"SELECT pilot, num, data_json, has_gpx, has_igc, has_sheet FROM flights "
        f"WHERE pilot IN ({marks}) AND is_syride=1 AND no_link=0 AND ({condition})",
        list(pilots),
    ).fetchall()

    queue = []
    for pilot, num, data_json, has_gpx, has_igc, has_sheet in rows:
        item = {
            "pilot": pilot,
            "num": num,
            "data": json.loads(data_json),
            "need_gpx": not has_gpx,
            "need_igc": not has_igc,
            "need_info": not has_sheet,
        }
        if tasks == "info" and item["need_info"]:
            queue.append(item)
        elif tasks == "files" and not item["need_info"] and (item["need_gpx"] or item["need_igc"]):
            queue.append(item)
        elif tasks == "all":
            queue.append(item)

    def sort_key(item):
        igc_only = not (item["need_gpx"] or item["need_info"])
        return (igc_only, -(int(item["num"]) if item["num"].isdigit() else 0))

    queue.sort(key=sort_key)
    return queue


def flight_kind(item: dict) -> str:
    """Classe un vol pour le bilan de la file : infos, fichiers, ou les deux."""
    has_info_work = item["need_info"]
    has_file_work = item["need_gpx"] or item["need_igc"]
    if has_info_work and has_file_work:
        return "info+files"
    if has_info_work:
        return "info"
    return "files"


def summary(conn: sqlite3.Connection, main_path: str, pilot_folder: str) -> dict:
    """
    Bilan d'un pilote, pour vérifier ce que le script a vu sur le disque :
      total       : dossiers de vol lus (avec un JSON)
      syride      : dont vols Syride (seuls concernés par fiche / GPX / IGC)
      no_gpx      : vols Syride sans GPX
      no_sheet    : vols Syride dont les informations de la fiche manquent dans le JSON
      no_igc      : vols Syride sans IGC (traités seulement avec --fill-igc)
      no_link     : vols marqués « sans lien » (ignorés)
      orphans     : dossiers numériques SANS JSON (ignorés : on ne peut pas les compléter)
    """
    row = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(is_syride),0), "
        "COALESCE(SUM(is_syride=1 AND has_gpx=0),0), "
        "COALESCE(SUM(is_syride=1 AND has_sheet=0),0), "
        "COALESCE(SUM(is_syride=1 AND has_igc=0),0), "
        "COALESCE(SUM(no_link),0) FROM flights WHERE pilot=?",
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
            "no_igc": row[4], "no_link": row[5], "orphans": orphans}


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


def apply_gpx_stats(data: dict, stats) -> str:
    """
    Complète / remplace dans `data` (JSON d'un vol) les statistiques calculables depuis le
    GPX. Règle : GPX disponible et exploitable -> ses valeurs priment ; sinon les valeurs du
    JSON (fiche Syride) sont conservées telles quelles.

    vitesse_moyenne : recalculée comme Syride (distance de la page liste / durée GPX).
    vitesse_max      : celle du JSON si elle existe (le GPX, sensible aux sauts GPS, ne sert
                       qu'à combler une valeur absente).
    vario_max, g_max : toujours ceux du JSON (non calculables depuis le GPX).

    Retourne la source des statistiques : "gpx", "fiche" (JSON) ou "aucune".
    """
    if not stats:
        return "aucune" if _missing(data.get("plafond")) else "fiche"

    for field in track_stats.GPX_STAT_FIELDS:
        if stats.get(field) is None:
            continue
        if field in GPX_FILL_ONLY and (_to_float(data.get(field)) or 0) > 0:
            continue
        data[field] = str(stats[field])

    distance = _to_float(data.get("distance_activite"))
    if distance is None:
        distance = _to_float(data.get("distance"))
    h, m, sec = (int(x) for x in stats["duree_vol"].split(":"))
    hours = h + m / 60 + sec / 3600
    if distance is not None and hours > 0:
        data["vitesse_moyenne"] = str(round(distance / hours, 1))
    return "gpx"


def load_pilot_frames(conn: sqlite3.Connection, pilot_folder: str):
    """
    Reconstruit, pour un pilote, les deux DataFrames que produisaient auparavant
    create_dataframe_from_json et create_dataframe_from_all_kml :
        - df_data      : un dict JSON par vol ;
        - df_long_lat  : colonnes num_activite, longitude, latitude.

    Statistiques : celles du GPX quand il est disponible, sinon celles du JSON (voir
    apply_gpx_stats). La colonne `source_stats` indique d'où elles viennent.

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
        "SELECT num, data_json, is_syride, coords_done, longitude, latitude, gpx_stats "
        "FROM flights WHERE pilot=? ORDER BY num",
        (pilot_folder,),
    ).fetchall()

    data_list, coords = [], []
    incomplete = 0
    n_gpx = 0
    for num, data_json, is_syride, coords_done, lon, lat, gpx_stats in rows:
        data = json.loads(data_json)
        # Information de la page liste, conservée dans le JSON mais volontairement absente
        # du pkl pour que celui-ci garde le même format qu'avant.
        data.pop("altitude_max", None)
        # Lien de téléchargement signé : expiré depuis longtemps, sans intérêt dans le pkl
        data.pop("adresse_zip", None)

        stats = json.loads(gpx_stats) if gpx_stats else None
        data["source_stats"] = apply_gpx_stats(data, stats)
        n_gpx += data["source_stats"] == "gpx"

        is_incomplete = _missing(data.get("plafond"))
        if is_incomplete and not is_syride:
            continue
        data["incomplet"] = is_incomplete
        incomplete += is_incomplete

        data_list.append(data)
        if coords_done:
            coords.append((num, lon, lat))

    print(f"  {n_gpx}/{len(data_list)} vol(s) avec statistiques calculées depuis le GPX.")
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
    df_long_lat = pd.DataFrame(coords, columns=["num_activite", "longitude", "latitude"])
    return df_data, df_long_lat
