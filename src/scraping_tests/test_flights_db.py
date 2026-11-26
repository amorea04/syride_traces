"""Tests de l'index flights.db : migration, trace prioritaire, file d'attente, réanalyse.
Pilotes fictifs dans tmp_path, trace synthétique, sans réseau."""

import gzip
import importlib
import json
import os
import sqlite3
import sys
import types

import numpy as np
import pytest


def _stub(name, **attrs):
    """Module factice si le vrai n'est pas installé (Selenium, fastkml : absents de la CI)."""
    try:
        importlib.import_module(name)
        return
    except ImportError:
        pass
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    sys.modules[name] = module


for _name, _attrs in [
    ("selenium", {}), ("selenium.common", {}),
    ("selenium.common.exceptions", {"TimeoutException": type("TimeoutException", (Exception,), {})}),
    ("selenium.webdriver", {}), ("selenium.webdriver.common", {}),
    ("selenium.webdriver.common.by", {"By": object}),
    ("selenium.webdriver.common.keys", {"Keys": object}),
    ("selenium.webdriver.support", {}),
    ("selenium.webdriver.support.ui", {"WebDriverWait": object}),
    ("fastkml", {"kml": types.ModuleType("kml")}),
]:
    _stub(_name, **_attrs)

import flights_db  # noqa: E402
import syride_scraper as scraper  # noqa: E402
import track_stats  # noqa: E402

T0 = 1700000000
PILOT = "PiloteTest"


# ------------------------ outils de fabrication ------------------------


def make_track(n=120, lat0=45.0, lon0=6.0):
    """Trace fv-config synthétique : 1 point/s, montée de 60 m à 560 m puis descente."""
    i = np.arange(n)
    alt = 60 + 500 * np.sin(np.pi * i / (n - 1))
    points = [[lat0, lon0 + 0.0001 * k, float(alt[k]), 54.0, 0.5, 1.2, 0] for k in range(n)]
    return {
        "points": points,
        "times": [T0 + k for k in range(n)],
        "terrain": [[T0 + k, 40.0] for k in range(0, n, 2)],
        "extrema": [
            {"icon": "up", "label": "Vario max : 2.5 m/s"},
            {"icon": "down", "label": "Vario min. : -3.5 m/s"},
            {"icon": "g", "label": "G max : 1.4 g"},
        ],
    }


def fiche_html(track):
    return ('<html><body><script id="fv-config" type="application/json">'
            + json.dumps(track) + "</script></body></html>")


def write_gpx(path, lat0=46.0, lon0=7.0, n=120):
    lines = ['<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>']
    for k in range(n):
        alt = 60 + 300 * np.sin(np.pi * k / (n - 1))
        iso = "2023-11-14T22:13:{:02d}Z".format(k % 60) if k < 60 else "2023-11-14T22:14:{:02d}Z".format(k - 60)
        lines.append('<trkpt lat="{}" lon="{}"><ele>{:.1f}</ele><time>{}</time></trkpt>'.format(
            lat0, lon0 + 0.0001 * k, alt, iso))
    lines.append("</trkseg></trk></gpx>")
    path.write_text("\n".join(lines), encoding="utf-8")


def list_data(num, **extra):
    """JSON d'un vol tel qu'écrit à l'identification (champs de fiche vides)."""
    data = {"pilote": PILOT, "id_activite": str(int(num) + 1000), "num_activite": str(num),
            "types": "Vol libre", "site": "Site Test 01", "date": "07/11/2026", "heure": "11h12",
            "flight_time": "00:09:59", "voile": "Aile", "distance": "10", "instrument": "Nav",
            "is_syride": True, "date_activite": None, "site_activite": None,
            "distance_activite": None, "distance_cumulee": None, "vitesse_max": None,
            "vitesse_moyenne": None, "plafond": None, "gain": None, "duree_vol": None,
            "vario_max": None, "g_max": None}
    data.update(extra)
    return data


def make_flight(main, num, pilot=PILOT, gpx=False, raw=None, **extra):
    """Crée <main>/<pilot>/traces/<num>/ avec son JSON, et en option un GPX / une fiche brute."""
    data = list_data(num, **extra)
    base = str(main / pilot)
    scraper.save_flight_data(base, data, quiet=True)
    folder = main / pilot / "traces" / str(num)
    if gpx:
        write_gpx(folder / f"{num}.gpx")
    if raw is not None:
        scraper.save_sheet_raw(base, str(num), fiche_html(raw))
    return data


@pytest.fixture
def conn(tmp_path):
    c = flights_db.connect(str(tmp_path / "flights.db"))
    yield c
    c.close()


def columns(conn):
    return {r[1] for r in conn.execute("PRAGMA table_info(flights)")}


def row(conn, num, *cols):
    return conn.execute(f"SELECT {', '.join(cols)} FROM flights WHERE pilot=? AND num=?",
                        (PILOT, str(num))).fetchone()


# ------------------------ migration ------------------------


OLD_SCHEMA = """
CREATE TABLE flights (
    pilot TEXT NOT NULL, num TEXT NOT NULL, data_json TEXT NOT NULL,
    is_syride INTEGER NOT NULL DEFAULT 0, has_gpx INTEGER NOT NULL DEFAULT 0,
    has_igc INTEGER NOT NULL DEFAULT 0, coords_done INTEGER NOT NULL DEFAULT 0,
    longitude REAL, latitude REAL, no_link INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (pilot, num));
"""
NEW_COLUMNS = {"has_sheet_raw", "track_source", "track_stats", "syride_status", "last_seen_list",
               "list_hash", "duplicate_of"}


def test_migration_ancienne_base_idempotente(tmp_path):
    db = str(tmp_path / "old.db")
    old = sqlite3.connect(db)
    old.execute(OLD_SCHEMA)
    old.execute("INSERT INTO flights (pilot, num, data_json, is_syride) VALUES ('P', '1', '{}', 1)")
    old.commit()
    old.close()

    conn = flights_db.connect(db)
    first = columns(conn)
    assert NEW_COLUMNS <= first and {"has_sheet", "gpx_done", "gpx_stats", "json_mtime"} <= first
    conn.close()
    conn = flights_db.connect(db)   # deuxième passage : rien ne casse, rien ne change
    assert columns(conn) == first
    assert conn.execute("SELECT syride_status, has_sheet_raw FROM flights").fetchone() == ("unknown", 0)
    conn.close()


def test_table_pilots(conn):
    assert flights_db.get_id_rider(conn, "AdrienM") is None
    flights_db.set_id_rider(conn, "AdrienM", 12345)
    assert flights_db.get_id_rider(conn, "AdrienM") == "12345"
    flights_db.set_id_rider(conn, "AdrienM", "999")
    assert flights_db.get_id_rider(conn, "AdrienM") == "999"


def test_stats_gpx_de_l_ancienne_base_reprises_sans_recalcul(tmp_path, monkeypatch):
    """Une base d'avant la migration garde ses statistiques GPX (pas de recalcul de 9 800 GPX)."""
    make_flight(tmp_path, 1, gpx=True)
    db = str(tmp_path / "flights.db")
    conn = flights_db.connect(db)
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    stats = row(conn, 1, "track_stats")[0]
    # on retire ce qu'une base ancienne ne connaît pas : stats dans gpx_stats seulement
    conn.execute("UPDATE flights SET track_stats=NULL, track_source=NULL, gpx_stats=?, gpx_done=1", (stats,))
    conn.commit()

    def boom(path):
        raise AssertionError("recalcul inutile")

    monkeypatch.setattr(track_stats, "compute_gpx_stats", boom)
    work = {}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT, stats=work)
    assert work["gpx_stats"] == 0
    assert row(conn, 1, "track_source", "track_stats") == ("gpx", stats)
    conn.close()


def test_stats_gpx_d_ancienne_version_recalculees(tmp_path):
    make_flight(tmp_path, 1, gpx=True)
    conn = flights_db.connect(str(tmp_path / "flights.db"))
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    stats = json.loads(row(conn, 1, "track_stats")[0])
    stats["version"] = track_stats.STATS_VERSION - 1
    conn.execute("UPDATE flights SET track_stats=NULL, track_source=NULL, gpx_stats=?, gpx_done=1",
                 (json.dumps(stats),))
    conn.commit()
    work = {}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT, stats=work)
    assert work["gpx_stats"] == 1
    assert row(conn, 1, "track_source")[0] == "gpx"
    assert json.loads(row(conn, 1, "track_stats")[0])["version"] == track_stats.STATS_VERSION
    conn.close()


# ------------------------ trace prioritaire ------------------------


def test_priorite_fv_config_sur_gpx(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True, raw=make_track())
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    source, stats_json, has_raw = row(conn, 1, "track_source", "track_stats", "has_sheet_raw")
    assert (source, has_raw) == ("fv-config", 1)
    assert json.loads(stats_json)["source"] == "fv-config"
    # départ : premier point de la fiche brute (45.0, 6.0), pas celui du GPX (46.0, 7.0)
    assert row(conn, 1, "longitude", "latitude") == (pytest.approx(6.0), pytest.approx(45.0))

    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    r = df.iloc[0]
    assert r["source_stats"] == "trace"
    assert r["plafond"] == "560" and r["vario_min"] == -3.5
    assert r["hauteur_sol_max"] == pytest.approx(520.0, abs=1.0)
    assert r["vario_max"] == "2.5" and r["g_max"] == "1.4"   # comblés : la fiche était vide
    assert r["syride_status"] == "present"   # clé absente du JSON = present


def test_gpx_seul(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True)
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "track_source", "has_sheet_raw") == ("gpx", 0)
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert df.iloc[0]["source_stats"] == "gpx"
    assert df.iloc[0]["vario_min"] is None


def test_fiche_brute_apparait_apres_le_gpx(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True)
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "track_source")[0] == "gpx"
    assert row(conn, 1, "longitude")[0] == pytest.approx(7.0)

    scraper.save_sheet_raw(str(tmp_path / PILOT), "1", fiche_html(make_track()))
    work = {}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT, stats=work)
    assert work["gpx_stats"] == 1 and work["coords"] == 0
    assert row(conn, 1, "track_source", "has_sheet_raw") == ("fv-config", 1)
    assert row(conn, 1, "longitude")[0] == pytest.approx(7.0)   # coordonnées du GPX gardées

    work = {}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT, stats=work)   # puis plus rien à faire
    assert work == {"json_read": 0, "coords": 0, "gpx_stats": 0, "seconds": work["seconds"]}


def test_coordonnees_depuis_fiche_brute_sans_gpx(tmp_path, conn):
    make_flight(tmp_path, 1, raw=make_track())
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "longitude", "latitude") == (pytest.approx(6.0), pytest.approx(45.0))
    assert row(conn, 1, "track_source")[0] == "fv-config"


def test_fiche_brute_sans_trace_exploitable_retombe_sur_gpx(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True)
    scraper.save_sheet_raw(str(tmp_path / PILOT), "1", "<html>fiche sans fv-config</html>")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "track_source", "has_sheet_raw") == ("gpx", 1)
    assert row(conn, 1, "longitude")[0] == pytest.approx(7.0)


def test_recalcul_si_version_change(tmp_path, conn):
    make_flight(tmp_path, 1, raw=make_track())
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    old = json.loads(row(conn, 1, "track_stats")[0])
    old["version"] = track_stats.STATS_VERSION - 1
    conn.execute("UPDATE flights SET track_stats=?", (json.dumps(old),))
    work = {}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT, stats=work)
    assert work["gpx_stats"] == 1
    assert json.loads(row(conn, 1, "track_stats")[0])["version"] == track_stats.STATS_VERSION


def test_nouvelles_colonnes_none_sans_trace(tmp_path, conn):
    make_flight(tmp_path, 1)                                    # ni GPX ni fiche brute
    make_flight(tmp_path, 2, plafond="300", vario_max="1.5")    # fiche lue, sans trace
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert set(df["source_stats"]) == {"aucune", "fiche"}
    for col in flights_db.TRACK_NEW_FIELDS:
        assert col in df.columns and df[col].isna().all(), col
    assert not (df[flights_db.TRACK_NEW_FIELDS] == 0).any().any()
    assert "syride_status" in df.columns and "historique_liste" not in df.columns


def test_pipeline_ne_remplit_pas_les_nouvelles_colonnes(tmp_path, conn):
    import analyze_functions
    make_flight(tmp_path, 1, plafond="300")
    make_flight(tmp_path, 2, raw=make_track(), heure="12h30")   # pas un jumeau du vol 1
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    out = analyze_functions.assign_data_types(analyze_functions.valeurs_manquantes(df))
    by_num = out.set_index("num_activite")
    assert np.isnan(by_num.loc[1, "vario_min"]) and np.isnan(by_num.loc[1, "hauteur_sol_max"])
    assert by_num.loc[2, "vario_min"] == -3.5 and by_num.loc[2, "heure_plafond"] > T0
    assert by_num["vario_min"].dtype == float


def test_sync_ne_modifie_pas_les_dossiers(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True, raw=make_track())
    before = sorted((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in tmp_path.rglob("*")
                    if p.is_file() and p.name != "flights.db")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    after = sorted((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in tmp_path.rglob("*")
                   if p.is_file() and p.name != "flights.db")
    assert before == after


# ------------------------ file d'attente ------------------------


def build_queue_fixture(tmp_path, conn):
    # 10 : rien (ni fiche, ni gpx, ni brute)       -> infos + gpx
    # 20 : infos + gpx, sans fiche brute           -> rattrapage seul
    # 30 : infos + gpx + fiche brute               -> rien
    # 40 : infos, gpx, sans igc, sans fiche brute
    # 50 : infos, sans gpx, sans brute
    make_flight(tmp_path, 10)
    make_flight(tmp_path, 20, gpx=True, plafond="300")
    make_flight(tmp_path, 30, gpx=True, raw=make_track(), plafond="300")
    make_flight(tmp_path, 40, gpx=True, plafond="300")
    make_flight(tmp_path, 50, plafond="300")
    scraper.save_flight_data(str(tmp_path / "Autre"), list_data(60, pilote="Autre"), quiet=True)
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    flights_db.sync_pilot(conn, str(tmp_path), "Autre")
    conn.execute("UPDATE flights SET has_igc=1 WHERE num IN ('20', '30')")
    conn.commit()


def nums(queue):
    return [i["num"] for i in queue]


def test_file_sans_files_by_pilot_comportement_historique(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    queue = flights_db.get_global_queue(conn, [PILOT, "Autre"])
    # comme avant : infos / GPX manquants seulement, pas de rattrapage de fiche brute seule
    assert sorted(nums(queue)) == ["10", "50", "60"]
    assert all("need_raw" in i for i in queue)
    by = {i["num"]: i for i in queue}
    assert by["50"]["need_gpx"] is True and by["50"]["need_info"] is False
    assert by["10"]["need_info"] and by["10"]["need_gpx"] and by["10"]["need_raw"]

    queue = flights_db.get_global_queue(conn, [PILOT], fill_igc=True)
    assert "40" in nums(queue) and by["10"]["need_igc"]
    assert flights_db.flight_kind(
        {"need_info": False, "need_gpx": False, "need_igc": True, "need_raw": True}) == "files"


def test_file_avec_files_by_pilot(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    queue = flights_db.get_global_queue(conn, [PILOT, "Autre"],
                                        files_by_pilot={PILOT: ("gpx", "igc")})
    # vols à fichiers (50, 10), puis les autres fiches par numéro décroissant : infos (60), brut (40, 20)
    assert nums(queue) == ["50", "10", "60", "40", "20"]
    by = {i["num"]: i for i in queue}
    assert by["60"]["need_gpx"] is False and by["60"]["need_igc"] is False   # profil sans fichiers
    assert by["60"]["need_info"] and by["60"]["need_raw"]
    assert by["20"]["need_raw"] and not by["20"]["need_info"] and not by["20"]["need_gpx"]
    assert flights_db.flight_kind(by["20"]) == "raw"
    assert flights_db.flight_kind(by["10"]) == "info+files"
    assert flights_db.flight_kind(by["60"]) == "info"
    assert flights_db.flight_kind(by["50"]) == "files"


def test_file_fill_igc_et_groupes(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    queue = flights_db.get_global_queue(conn, [PILOT], fill_igc=True, backfill_raw=False,
                                        files_by_pilot={PILOT: ("gpx", "igc")})
    assert nums(queue) == ["50", "40", "10"]    # tous à fichiers (GPX ou IGC) ; 20 et 30 sont complets
    queue = flights_db.get_global_queue(conn, [PILOT], fill_igc=True,
                                        files_by_pilot={PILOT: ("gpx",)})
    assert nums(queue) == ["50", "10", "40", "20"]   # profil sans IGC : IGC ignoré ; 40 et 20 en rattrapage


def test_file_backfill_raw(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    avec = flights_db.get_global_queue(conn, [PILOT], files_by_pilot={PILOT: ("gpx",)})
    sans = flights_db.get_global_queue(conn, [PILOT], files_by_pilot={PILOT: ("gpx",)},
                                       backfill_raw=False)
    assert nums(avec) == ["50", "10", "40", "20"]
    assert nums(sans) == ["50", "10"]


def test_file_modes_et_no_link(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    fbp = {PILOT: ("gpx",)}
    assert nums(flights_db.get_global_queue(conn, [PILOT], tasks="info", files_by_pilot=fbp)) == ["10"]
    assert nums(flights_db.get_global_queue(conn, [PILOT], tasks="files", files_by_pilot=fbp)) == ["50"]
    flights_db.mark_no_link(conn, PILOT, "10")
    assert "10" not in nums(flights_db.get_global_queue(conn, [PILOT], files_by_pilot=fbp))
    with pytest.raises(ValueError):
        flights_db.get_global_queue(conn, [PILOT], tasks="autre")
    assert flights_db.get_global_queue(conn, []) == []


def test_summary_no_raw_et_absent(tmp_path, conn):
    build_queue_fixture(tmp_path, conn)
    conn.execute("UPDATE flights SET syride_status='absent' WHERE num='50'")
    st = flights_db.summary(conn, str(tmp_path), PILOT)
    assert st["syride"] == 5 and st["no_raw"] == 4 and st["absent"] == 1


# ------------------------ réanalyse hors ligne ------------------------


def test_reparse_ecrit_seulement_si_changement(tmp_path, conn):
    make_flight(tmp_path, 1, raw=make_track(), gain="100", plafond="300")
    make_flight(tmp_path, 2, raw=make_track(), gain="500", plafond="300")   # déjà à jour
    make_flight(tmp_path, 3)                                                  # pas de fiche brute
    json_paths = {n: tmp_path / PILOT / "traces" / n / f"{n}.json" for n in "123"}
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    mtimes = {n: p.stat().st_mtime_ns for n, p in json_paths.items()}

    result = flights_db.reparse_pilot(conn, str(tmp_path), PILOT)
    assert result == {"read": 2, "updated": 1, "errors": []}
    assert json.loads(json_paths["1"].read_text(encoding="utf-8"))["gain"] == "500"
    assert json_paths["2"].stat().st_mtime_ns == mtimes["2"]
    assert json_paths["3"].stat().st_mtime_ns == mtimes["3"]
    assert json.loads(json_paths["1"].read_text(encoding="utf-8"))["plafond"] == "300"

    again = flights_db.reparse_pilot(conn, str(tmp_path), PILOT)
    assert again["updated"] == 0
    assert row(conn, 1, "track_source")[0] == "fv-config"


def test_reparse_signale_les_erreurs(tmp_path, conn, monkeypatch):
    make_flight(tmp_path, 1, raw=make_track())
    import syride_parsing

    def boom(html):
        raise ValueError("fiche incompréhensible")

    monkeypatch.setattr(syride_parsing, "parse_flight_sheet", boom)
    result = flights_db.reparse_pilot(conn, str(tmp_path), PILOT)
    assert result["read"] == 0 and result["errors"] == [("1", "fiche incompréhensible")]


# ------------------------ corrections de la revue du lot D ------------------------


def _after_dedup(conn):
    """Vols restant après le dédoublonnage du pipeline (analyze_functions)."""
    import analyze_functions
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    out = analyze_functions.remove_duplicate_flights(
        analyze_functions.assign_data_types(analyze_functions.valeurs_manquantes(
            analyze_functions.start_pipeline(df))))
    return sorted(out["num_activite"]), df


def test_jumeaux_memes_statistiques_pendant_le_rattrapage(tmp_path, conn):
    # 1 et 2 : même vol importé deux fois (même date, heure, durée) ; seule la fiche de 1 est
    # récupérée. Sans repli, 1 aurait un plafond de trace (560) et 2 celui de la fiche (300) :
    # le doublon survivrait au dédoublonnage du pipeline.
    make_flight(tmp_path, 1, raw=make_track(), plafond="300", gain="100")
    make_flight(tmp_path, 2, plafond="300", gain="100")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "track_source")[0] == "fv-config"   # la trace est bien connue de la base
    kept, df = _after_dedup(conn)
    assert kept == [1] and set(df["source_stats"]) == {"fiche"}

    # la fiche du second arrive : les deux passent ensemble à la trace
    scraper.save_sheet_raw(str(tmp_path / PILOT), "2", fiche_html(make_track()))
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    kept, df = _after_dedup(conn)
    assert kept == [1] and set(df["source_stats"]) == {"trace"}


def test_jumeaux_avec_gpx_gardent_les_statistiques_gpx(tmp_path, conn):
    make_flight(tmp_path, 1, gpx=True, raw=make_track(), plafond="300")
    make_flight(tmp_path, 2, gpx=True, plafond="300")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "gpx_stats")[0] is not None   # GPX calculé même quand la fv-config prime
    kept, df = _after_dedup(conn)
    assert kept == [1] and set(df["source_stats"]) == {"gpx"}


def test_non_jumeaux_gardent_la_trace(tmp_path, conn):
    make_flight(tmp_path, 1, raw=make_track(), plafond="300")
    make_flight(tmp_path, 2, plafond="300", heure="15h00")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert dict(zip(df["num_activite"], df["source_stats"])) == {"1": "trace", "2": "fiche"}


def test_cles_de_liste_absentes_du_pkl(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300", date_publication="21/11/2026", nom_vol="X",
                historique_liste=[], altitude_max="900")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert not {"date_publication", "nom_vol", "historique_liste", "altitude_max"} & set(df.columns)
    assert {"vario_min", "hauteur_sol_max", "heure_plafond", "syride_status"} <= set(df.columns)


def test_fiche_brute_non_compressee_detectee(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300")
    folder = tmp_path / PILOT / "traces" / "1"
    (folder / "1.sheet.html").write_text(fiche_html(make_track()), encoding="utf-8")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "has_sheet_raw", "track_source") == (1, "fv-config")


def test_fiche_brute_corrompue_ne_bloque_rien(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300")
    make_flight(tmp_path, 2, raw=make_track(), plafond="300", heure="12h30")
    folder = tmp_path / PILOT / "traces" / "1"
    good = gzip.compress(fiche_html(make_track()).encode("utf-8"))
    (folder / "1.sheet.html.gz").write_bytes(good[:12] + b"\x00" * 20 + good[32:])   # deflate abîmé
    assert scraper.load_sheet_raw(str(folder), "1") is None
    assert flights_db.sync_pilot(conn, str(tmp_path), PILOT) == 2
    assert row(conn, 1, "has_sheet_raw")[0] == 1
    assert row(conn, 2, "track_source")[0] == "fv-config"
    result = flights_db.reparse_pilot(conn, str(tmp_path), PILOT)
    assert result["read"] == 1 and result["errors"] == [("1", "fiche brute illisible")]


def test_fiche_sans_fv_config_pas_relue_a_chaque_passage(tmp_path, conn, monkeypatch):
    make_flight(tmp_path, 1, plafond="300")
    scraper.save_sheet_raw(str(tmp_path / PILOT), "1", "<html><body>pas de trace</body></html>")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert row(conn, 1, "track_source", "coords_done") == ("none", 0)

    calls = []
    monkeypatch.setattr(scraper, "load_sheet_raw", lambda *a: calls.append(a))
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert calls == []   # ni relue ni analysée
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert df.iloc[0]["source_stats"] == "fiche"

    # une nouvelle version des statistiques refait l'essai
    conn.execute("UPDATE flights SET track_stats='{\"version\": 0}'")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert len(calls) >= 1


def test_file_historique_ordre_sans_files_by_pilot(tmp_path, conn):
    # avec files_by_pilot=None : (IGC seul en dernier, numéro décroissant), infos et GPX mêlés
    make_flight(tmp_path, 10)                            # infos + gpx
    make_flight(tmp_path, 20, plafond="300")             # gpx seul
    make_flight(tmp_path, 30, gpx=True, plafond="300")   # IGC seul
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    queue = flights_db.get_global_queue(conn, [PILOT], fill_igc=True)
    assert nums(queue) == ["20", "10", "30"]
