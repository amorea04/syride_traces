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


def reconcile(conn, tmp_path, items, today=TODAY):
    return flights_db.reconcile_pilot(conn, str(tmp_path), PILOT, items, today=today)


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
    assert read(tmp_path, 10)["syride_status"] == "present"

    report = reconcile(conn, tmp_path, items[:8])    # 80 % : marques posées
    assert not report["guard_triggered"] and report["absent"] == ["9", "10"]
    # liste vide alors que des vols sont connus : garde-fou aussi
    assert reconcile(conn, tmp_path, [])["guard_triggered"]


def test_vol_non_syride_jamais_marque_absent(tmp_path, conn):
    make_flight(tmp_path, 1)
    make_flight(tmp_path, 2, is_syride=False)
    reconcile(conn, tmp_path, [item(1), item(2, is_syride=False)])
    report = reconcile(conn, tmp_path, [item(1)])
    assert report["absent"] == [] and status(conn, 2) == "present"


def test_doublons_probables(tmp_path, conn):
    make_flight(tmp_path, 10, heure="11h12", flight_time="00:09:59")
    make_flight(tmp_path, 11, heure="11h20", flight_time="00:10:30")    # jumeau de 10
    make_flight(tmp_path, 12, heure="11h40", flight_time="00:09:59")    # trop loin en heure
    make_flight(tmp_path, 13, heure="11h12", flight_time="00:20:00")    # durée trop différente
    make_flight(tmp_path, 14, heure="11h12", flight_time="00:09:59", date="08/11/2026")   # autre jour
    items = [item(10), item(11, heure="11h20", flight_time="00:10:30"), item(12, heure="11h40"),
             item(13, flight_time="00:20:00"), item(14, date="08/11/2026")]
    report = reconcile(conn, tmp_path, items)
    assert report["duplicates"] == [("10", "11")]
    dup = dict(conn.execute("SELECT num, duplicate_of FROM flights"))
    assert dup["11"] == "10" and dup["10"] is None and dup["12"] is None

    # un vol qui n'est plus jumeau perd sa marque
    conn.execute("UPDATE flights SET data_json=replace(data_json, '11h20', '15h00') WHERE num='11'")
    assert flights_db.find_duplicates(conn, PILOT) == []

    path = flights_db.write_duplicates_report(conn, str(tmp_path), [PILOT])
    assert path == str(tmp_path / "_rapport_doublons.txt")
    text = open(path, encoding="utf-8").read()
    assert f"{PILOT} : 1 doublon(s) probable(s)" in text and "11 doublon de 10" in text


def test_rapport_doublons_vide(tmp_path, conn):
    path = flights_db.write_duplicates_report(conn, str(tmp_path), [PILOT])
    assert "Aucun doublon probable" in open(path, encoding="utf-8").read()


def test_aucun_json_reecrit_quand_rien_ne_change(tmp_path, conn):
    for num in (1, 2, 3):
        make_flight(tmp_path, num, plafond="300", instrument="None")
    items = [item(n, instrument="None") for n in (1, 2, 3)]
    reconcile(conn, tmp_path, items)   # première passe : pose syride_status = present
    before = {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)}
    contents = {n: json_path(tmp_path, n).read_bytes() for n in (1, 2, 3)}

    report = reconcile(conn, tmp_path, items, today="2026-12-25")
    assert report["new"] == report["modified"] == report["absent"] == report["reappeared"] == []
    assert {n: json_path(tmp_path, n).stat().st_mtime_ns for n in (1, 2, 3)} == before
    assert {n: json_path(tmp_path, n).read_bytes() for n in (1, 2, 3)} == contents
    # last_seen_list n'existe que dans la base
    assert conn.execute("SELECT DISTINCT last_seen_list FROM flights").fetchall() == [("2026-12-25",)]


def test_donnees_de_fiche_intactes_et_pkl(tmp_path, conn):
    make_flight(tmp_path, 1, plafond="300", gain="120")
    reconcile(conn, tmp_path, [item(1, voile="Autre")])
    df, _ = flights_db.load_pilot_frames(conn, PILOT)
    assert df.iloc[0]["voile"] == "Autre" and df.iloc[0]["plafond"] == "300"
    assert df.iloc[0]["syride_status"] == "present"
    assert "historique_liste" not in df.columns
