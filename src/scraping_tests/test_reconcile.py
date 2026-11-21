"""Tests de la réconciliation avec la liste Syride : sans réseau, pilotes fictifs dans tmp_path."""

import json
import os

import pytest

import flights_db
from scraping_tests.test_flights_db import PILOT, conn, list_data, make_flight  # noqa: F401

TODAY = "2026-11-21"

LIST_KEYS = ("pilote", "id_activite", "num_activite", "types", "site", "date", "heure",
             "flight_time", "voile", "distance", "altitude_max", "instrument", "is_syride")


def item(num, **changes):
    """Entrée de liste au format de get_nav_infos_bs, identique au JSON de list_data()."""
    data = list_data(num)
    entry = {k: data.get(k) for k in LIST_KEYS}
    entry["altitude_max"] = None
    entry.update(changes)
    return entry


def json_path(tmp_path, num):
    return tmp_path / PILOT / "traces" / str(num) / f"{num}.json"


def read(tmp_path, num):
    return json.loads(json_path(tmp_path, num).read_text(encoding="utf-8"))


def reconcile(conn, tmp_path, items, today=TODAY, **kwargs):
    return flights_db.reconcile_pilot(conn, str(tmp_path), PILOT, items, today=today, **kwargs)


def status(conn, num):
    return conn.execute("SELECT syride_status FROM flights WHERE pilot=? AND num=?",
                        (PILOT, str(num))).fetchone()[0]


def test_nouveau_vol(tmp_path, conn):
    entry = item(100, flight_token="secret", expires="123", token="t", nom_vol="Mon vol")
    report = reconcile(conn, tmp_path, [entry])
    assert report["new"] == ["100"] and report["modified"] == [] and not report["guard_triggered"]
    data = read(tmp_path, 100)
    assert data["site"] == "Site Test 01" and data["nom_vol"] == "Mon vol"
    assert data["plafond"] is None and data["vario_max"] is None and "adresse_zip" not in data
    assert not {"flight_token", "expires", "token"} & set(data)   # jetons jamais écrits
    assert data["syride_status"] == "present"
    assert status(conn, 100) == "present"
    assert conn.execute("SELECT last_seen_list FROM flights").fetchone()[0] == TODAY


def test_vol_modifie_historique(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300")
    reconcile(conn, tmp_path, [item(1)])
    report = reconcile(conn, tmp_path, [item(1, voile="Autre aile", site="Nouveau site")], today="2026-12-01")
    assert report["modified"] == [{"num": "1", "fields": ["site", "voile"]}]
    data = read(tmp_path, 1)
    assert data["voile"] == "Autre aile" and data["site"] == "Nouveau site"
    assert data["plafond"] == "300"   # champs de fiche intacts
    assert data["historique_liste"] == [
        {"date": "2026-12-01", "champ": "site", "avant": "Site Test 01", "apres": "Nouveau site"},
        {"date": "2026-12-01", "champ": "voile", "avant": "Aile", "apres": "Autre aile"},
    ]
    # la base a relu le JSON
    assert json.loads(conn.execute("SELECT data_json FROM flights").fetchone()[0])["voile"] == "Autre aile"
    # relance identique : plus de modification
    assert reconcile(conn, tmp_path, [item(1, voile="Autre aile", site="Nouveau site")])["modified"] == []


def test_valeur_manquante_sous_une_autre_forme_n_est_pas_une_modification(tmp_path, conn):
    # vieux JSON : "None" texte, chaîne vide, durée au format minutes, champ absent (altitude_max)
    make_flight(tmp_path, 1, instrument="None", voile="", flight_time="00:04:07", distance="38")
    reconcile(conn, tmp_path, [item(1, instrument="None", voile="", flight_time="00:04:07", distance="38")])
    report = reconcile(conn, tmp_path, [
        item(1, instrument=None, voile="None", flight_time="4min", distance="38.0", altitude_max="629")])
    assert report["modified"] == []
    assert "historique_liste" not in read(tmp_path, 1)
    assert "altitude_max" not in read(tmp_path, 1)
    # une valeur qui devient manquante dans la liste n'efface pas celle du JSON
    report = reconcile(conn, tmp_path, [item(1, instrument="None", voile=None, distance="None", flight_time="00:04:07")])
    assert report["modified"] == [] and read(tmp_path, 1)["distance"] == "38"
    # mais une vraie valeur qui apparaît est bien une modification
    report = reconcile(conn, tmp_path, [item(1, instrument="Nav", voile="Aile", flight_time="1h 06min", distance="38")])
    assert report["modified"] == [{"num": "1", "fields": ["flight_time", "voile", "instrument"]}]


def test_absent_puis_reapparu(tmp_path, conn):
    for num in (1, 2, 3, 4, 5):
        make_flight(tmp_path, num)
    items = [item(n) for n in (1, 2, 3, 4, 5)]
    reconcile(conn, tmp_path, items)
    assert {status(conn, n) for n in (1, 2, 3, 4, 5)} == {"present"}

    report = reconcile(conn, tmp_path, items[:4] + [])    # 4 sur 5 = 80 % : pas de garde-fou
    assert report["absent"] == ["5"] and not report["guard_triggered"]
    assert read(tmp_path, 5)["syride_status"] == "absent" and status(conn, 5) == "absent"
    assert os.path.isdir(tmp_path / PILOT / "traces" / "5")   # rien n'est supprimé
    assert flights_db.summary(conn, str(tmp_path), PILOT)["absent"] == 1

    mtime = json_path(tmp_path, 5).stat().st_mtime_ns
    assert reconcile(conn, tmp_path, items[:4])["absent"] == []    # déjà marqué : pas réécrit
    assert json_path(tmp_path, 5).stat().st_mtime_ns == mtime

    report = reconcile(conn, tmp_path, items)
    assert report["reappeared"] == ["5"] and report["absent"] == []
    assert read(tmp_path, 5)["syride_status"] == "present" and status(conn, 5) == "present"


def test_garde_fou_80_pourcent(tmp_path, conn):
    for num in range(1, 11):
        make_flight(tmp_path, num)
    items = [item(n) for n in range(1, 11)]
    reconcile(conn, tmp_path, items)

    report = reconcile(conn, tmp_path, items[:7])    # 70 % : liste tronquée probable
    assert report["guard_triggered"] and report["absent"] == []
    assert {status(conn, n) for n in range(1, 11)} == {"present"}
    assert read(tmp_path, 10).get("syride_status") != "absent"

    report = reconcile(conn, tmp_path, items[:8])    # 80 % : marques posées
    assert not report["guard_triggered"] and report["absent"] == ["9", "10"]
    # liste vide alors que des vols sont connus : garde-fou aussi
    assert reconcile(conn, tmp_path, [])["guard_triggered"]


def test_garde_fou_compte_les_vols_syride_des_deux_cotes(tmp_path, conn):
    for num in range(1, 11):
        make_flight(tmp_path, num)
    for num in range(11, 21):
        make_flight(tmp_path, num, is_syride=False)
    items = [item(n) for n in range(1, 11)] + [item(n, is_syride=False) for n in range(11, 21)]
    reconcile(conn, tmp_path, items)
    # 7 vols Syride sur 10, mais 17 entrées en tout : les vols non Syride ne doivent pas aveugler la garde
    report = reconcile(conn, tmp_path, items[:7] + items[10:])
    assert report["guard_triggered"] and report["absent"] == []


def test_liste_incomplete_aucune_marque_absent(tmp_path, conn):
    for num in range(1, 11):
        make_flight(tmp_path, num)
    items = [item(n) for n in range(1, 11)]
    reconcile(conn, tmp_path, items)
    # 9 sur 10 = 90 % passerait le garde-fou, mais l'appelant dit que la liste est tronquée (limit atteinte)
    report = reconcile(conn, tmp_path, items[:9] + [item(100)], complete=False)
    assert report["absent"] == [] and report["absent_skipped"] and not report["guard_triggered"]
    assert report["new"] == ["100"]   # le reste du travail est fait
    assert read(tmp_path, 10).get("syride_status") != "absent"
    report = reconcile(conn, tmp_path, items[:9] + [item(100)])
    assert report["absent"] == ["10"]


def test_vol_non_syride_jamais_marque_absent(tmp_path, conn):
    make_flight(tmp_path, 1)
    make_flight(tmp_path, 2, is_syride=False)
    reconcile(conn, tmp_path, [item(1), item(2, is_syride=False)])
    report = reconcile(conn, tmp_path, [item(1)])
    assert report["absent"] == [] and status(conn, 2) == "present"


def test_doublons_probables(tmp_path, conn):
    make_flight(tmp_path, 10, heure="11h12", flight_time="00:09:59")
    make_flight(tmp_path, 11, heure="11h14", flight_time="00:10:30")    # jumeau de 10
    make_flight(tmp_path, 12, heure="11h40", flight_time="00:09:59")    # trop loin en heure
    make_flight(tmp_path, 13, heure="11h12", flight_time="00:20:00")    # durée trop différente
    make_flight(tmp_path, 14, heure="11h12", flight_time="00:09:59", date="08/11/2026")   # autre jour
    make_flight(tmp_path, 15, heure="11h18", flight_time="00:09:59")    # 5 min d'écart : pas un jumeau
    items = [item(10), item(11, heure="11h14", flight_time="00:10:30"), item(12, heure="11h40"),
             item(13, flight_time="00:20:00"), item(14, date="08/11/2026"), item(15, heure="11h18")]
    report = reconcile(conn, tmp_path, items)
    assert report["duplicates"] == [("10", "11")]
    dup = dict(conn.execute("SELECT num, duplicate_of FROM flights"))
    assert dup["11"] == "10" and dup["10"] is None and dup["12"] is None

    # un vol qui n'est plus jumeau perd sa marque
    conn.execute("UPDATE flights SET data_json=replace(data_json, '11h14', '15h00') WHERE num='11'")
    assert flights_db.find_duplicates(conn, PILOT) == []

    path = flights_db.write_duplicates_report(conn, str(tmp_path), [PILOT])
    assert path == str(tmp_path / "_rapport_doublons.txt")
    text = open(path, encoding="utf-8").read()
    assert f"{PILOT} : 1 doublon(s) probable(s)" in text and "11 doublon de 10" in text


def test_doublons_ignorent_les_vols_courts(tmp_path, conn):
    # treuil : vols de moins de 5 min enchaînés, jumeaux exacts ou non, jamais signalés
    make_flight(tmp_path, 1, heure="11h12", flight_time="00:03:10")
    make_flight(tmp_path, 2, heure="11h12", flight_time="00:03:10")
    make_flight(tmp_path, 3, heure="12h00", flight_time="00:05:00")
    make_flight(tmp_path, 4, heure="12h00", flight_time="00:05:30")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    assert flights_db.find_duplicates(conn, PILOT) == [(3, 4)]


def test_rapport_doublons_paires_absentes_en_premier(tmp_path, conn):
    make_flight(tmp_path, 1, heure="09:00", flight_time="00:20:00")
    make_flight(tmp_path, 2, heure="09:00", flight_time="00:20:00")
    make_flight(tmp_path, 3, heure="14:00", flight_time="00:30:00", syride_status="absent")
    make_flight(tmp_path, 4, heure="14:00", flight_time="00:30:00")
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    flights_db._update_duplicates(conn, PILOT)
    text = open(flights_db.write_duplicates_report(conn, str(tmp_path), [PILOT]),
                encoding="utf-8").read()
    assert text.index("4 doublon de 3") < text.index("2 doublon de 1")
    assert "absent de Syride" in text


def test_rapport_doublons_vide(tmp_path, conn):
    path = flights_db.write_duplicates_report(conn, str(tmp_path), [PILOT])
    assert "Aucun doublon probable" in open(path, encoding="utf-8").read()


def test_aucun_json_reecrit_quand_rien_ne_change(tmp_path, conn):
    for num in (1, 2, 3):
        make_flight(tmp_path, num, plafond="300", instrument="None")
    items = [item(n, instrument="None") for n in (1, 2, 3)]
    before = {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)}
    contents = {n: json_path(tmp_path, n).read_bytes() for n in (1, 2, 3)}

    report = reconcile(conn, tmp_path, items, today="2026-12-25")
    assert report["new"] == report["modified"] == report["absent"] == report["reappeared"] == []
    assert {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)} == before
    assert {n: json_path(tmp_path, n).read_bytes() for n in (1, 2, 3)} == contents
    # last_seen_list n'existe que dans la base
    assert conn.execute("SELECT DISTINCT last_seen_list FROM flights").fetchall() == [("2026-12-25",)]


def test_json_sans_syride_status_jamais_reecrit_pour_poser_present(tmp_path, conn):
    # JSON réels : aucune clé syride_status (= present). Une réconciliation complète ne touche à rien.
    for num in (1, 2, 3):
        make_flight(tmp_path, num, plafond="300")
        assert "syride_status" not in read(tmp_path, num)
    items = [item(n) for n in (1, 2, 3)]
    before = {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)}
    report = reconcile(conn, tmp_path, items)
    assert report["new"] == report["modified"] == report["absent"] == report["reappeared"] == []
    assert {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)} == before
    assert all("syride_status" not in read(tmp_path, n) for n in (1, 2, 3))
    assert {status(conn, n) for n in (1, 2, 3)} == {"present"}
    assert conn.execute("SELECT DISTINCT last_seen_list FROM flights").fetchall() == [(TODAY,)]


def test_json_illisible_jamais_ecrase(tmp_path, conn):
    for num in (1, 2, 3, 4, 5):
        make_flight(tmp_path, num, plafond="300")
    items = [item(n) for n in (1, 2, 3, 4, 5)]
    reconcile(conn, tmp_path, items)
    broken = json_path(tmp_path, 2)
    original = broken.read_text(encoding="utf-8")
    broken.write_text(original[:40], encoding="utf-8")     # JSON tronqué
    mtime = broken.stat().st_mtime_ns

    report = reconcile(conn, tmp_path, items + [item(6)])
    assert report["unreadable"] == ["2"] and report["new"] == ["6"]
    assert broken.read_text(encoding="utf-8") == original[:40] and broken.stat().st_mtime_ns == mtime
    # absent de la liste ET illisible : pas écrasé non plus
    report = reconcile(conn, tmp_path, [item(n) for n in (1, 3, 4, 5, 6)])
    assert broken.read_text(encoding="utf-8") == original[:40] and report["absent"] == []


def test_empreinte_inchangee_court_circuite_la_comparaison(tmp_path, conn, monkeypatch):
    make_flight(tmp_path, 1, plafond="300")
    items = [item(1)]
    reconcile(conn, tmp_path, items)
    assert conn.execute("SELECT list_hash FROM flights").fetchone()[0] == flights_db.list_hash(items[0])
    reads = []
    original = flights_db._read_json
    monkeypatch.setattr(flights_db, "_read_json", lambda p: reads.append(p) or original(p))
    reconcile(conn, tmp_path, items)
    assert reads == []   # liste identique : JSON non relu
    reconcile(conn, tmp_path, [item(1, voile="Autre")])
    assert len(reads) == 1 and read(tmp_path, 1)["voile"] == "Autre"


def test_donnees_de_fiche_intactes_et_pkl(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300", gain="120")
    reconcile(conn, tmp_path, [item(1, voile="Autre")])
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert df.iloc[0]["voile"] == "Autre" and df.iloc[0]["plafond"] == "300"
    assert df.iloc[0]["syride_status"] == "present"
    assert "historique_liste" not in df.columns
