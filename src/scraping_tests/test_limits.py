"""Tests sans réseau des limites et options de la phase 2 : --max-sheets (P4), mode private (P8),
limite par minute (P12), limite quotidienne (P13), lien expiré (P15), détection des limites."""

import re

import pytest

from scraping_tests.test_flights_db import PILOT, make_flight
from scraping_tests.test_session import FakeDriver, NUM, Session, sheet_recent  # noqa: F401

import browser_session
import syride_scraper as scraper
from syride_parsing import detect_download_limit, detect_limit, parse_flight_sheet_full


def nums(n):
    return [str(3766574 + k) for k in range(n)]


def setup_queue(tmp_path, monkeypatch, n):
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: FakeDriver())
    monkeypatch.setattr(browser_session, "open_site_and_login", lambda driver: True)
    for num in nums(n):
        make_flight(tmp_path, num)


def run_pilots(tmp_path, **kwargs):
    return browser_session.process_pilots(
        path=str(tmp_path), pilots=[PILOT], do_scrape=False,
        **{"files_by_pilot": {}, **kwargs})


# ------------------------ détection ------------------------


def test_detect_limit():
    assert detect_limit("Trop de fiches de vol consultées, réessayez plus tard") == "rate"
    assert detect_limit("TROP DE FICHES DE VOL CONSULTÉES") == "rate"
    assert detect_limit("Vous avez atteint la limite quotidienne") == "daily"
    assert detect_limit("Fiche du vol : distance 42 km") is None
    assert detect_limit("") is None and detect_limit(None) is None


def test_detect_download_limit():
    assert detect_download_limit("DOWNLOAD LIMIT REACHED") is True
    assert detect_download_limit("Limite de téléchargement atteinte") is True
    long_page = "Contenu de page. " * 40 + " download limit"
    assert len(long_page) > 300 and detect_download_limit(long_page) is False
    assert detect_download_limit("") is False and detect_download_limit(None) is False


# ------------------------ P4 : --max-sheets ------------------------


def test_budget_unitaire():
    b = browser_session._Budget(2)
    b.consume()
    b.consume()
    with pytest.raises(browser_session.SheetBudgetReached):
        b.consume()
    assert b.used == 2
    free = browser_session._Budget(None)
    for _ in range(50):
        free.consume()
    assert free.used == 50


def test_max_sheets_deux_fiches_sur_cinq(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    setup_queue(tmp_path, monkeypatch, 5)
    result = run_pilots(tmp_path, max_sheets=2)
    out = capsys.readouterr().out
    assert len(session.reads) == 2 and result["sheets_used"] == 2
    assert result["pending"] == 3 and result["stopped"] == "Nombre maximum de fiches atteint (2)."
    assert "3 vol(s) restent à compléter" in out and "3 vol(s) attendent d'être complétés" in out


def test_max_sheets_ne_montre_pas_la_ligne_suivante_ni_ne_pause(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    setup_queue(tmp_path, monkeypatch, 5)
    sleeps = []
    monkeypatch.setattr(browser_session.time, "sleep", lambda s: sleeps.append(s))
    monkeypatch.setattr(browser_session.random, "uniform", lambda a, b: 8.0)
    run_pilots(tmp_path, max_sheets=2)
    out = capsys.readouterr().out
    assert "[1/5]" in out and "[2/5]" in out
    assert "[3/5]" not in out
    assert sleeps.count(8.0) == 1        # une seule pause SHEET_DELAY (entre fiche 1 et 2)
    assert len(session.reads) == 2


# ------------------------ P8 : mode private ------------------------


def test_private_profil_temporaire_supprime(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)
    monkeypatch.setattr(browser_session, "open_site_and_login", lambda driver: True)
    seen = []

    def fake_create(**kw):
        seen.append(kw)
        import os
        assert os.path.isdir(kw["profile_dir"])
        return FakeDriver()

    monkeypatch.setattr(browser_session, "create_driver", fake_create)
    make_flight(tmp_path, NUM)
    run_pilots(tmp_path, private=True, files_by_pilot={PILOT: ("gpx",)})   # vol à fichiers : fenêtre connectée
    kw = seen[0]
    import os
    assert kw["private"] is True and "syride_private_" in kw["profile_dir"]
    assert str(tmp_path) not in kw["profile_dir"]           # pas le profil persistant du pilote
    assert not os.path.exists(kw["profile_dir"])             # supprimé à la fin
    assert not (tmp_path / "_chrome_profile").exists()


def test_non_private_profil_persistant(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)
    monkeypatch.setattr(browser_session, "open_site_and_login", lambda driver: True)
    seen = []
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: seen.append(kw) or FakeDriver())
    make_flight(tmp_path, NUM)
    run_pilots(tmp_path, files_by_pilot={PILOT: ("gpx",)})   # vol à fichiers : fenêtre connectée
    assert seen[0]["private"] is False and seen[0]["profile_dir"].endswith("_chrome_profile")


# ------------------------ P12 : limite par minute ------------------------


def test_limite_par_minute_ralentissement_plafonne(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    setup_queue(tmp_path, monkeypatch, 6)

    def read(driver, pilote, trace, *a, **k):
        session.reads.append((pilote, trace))
        return session.sheet, session.links, session.track, session.html, 1   # 1 limite rencontrée

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    sleeps = []
    monkeypatch.setattr(browser_session.time, "sleep", lambda s: sleeps.append(s))
    monkeypatch.setattr(browser_session.random, "uniform", lambda a, b: 10.0)
    result = run_pilots(tmp_path)
    out = capsys.readouterr().out
    assert len(session.reads) == 6 and result["pending"] == 0
    assert sleeps == [15.0, 22.5, 33.75, 40.0, 40.0]         # x1,5 à chaque limite, plafond x4
    assert browser_session.MAX_DELAY_SCALE == 4.0
    assert "Rythme ralenti (x1.5)" in out and "Rythme ralenti (x4.0)" in out


def html_ok(sheet_recent):
    return sheet_recent


def test_read_flight_sheet_attentes_puis_reprise(monkeypatch, sheet_recent):
    calls, sleeps = [], []

    def iframe(driver, pilote, trace, base_url):
        calls.append(trace)
        if len(calls) <= 2:
            raise scraper.RateLimitError("trop")
        return sheet_recent

    monkeypatch.setattr(scraper, "_read_flight_iframe", iframe)
    monkeypatch.setattr(scraper.time, "sleep", lambda s: sleeps.append(s))
    sheet, links, track, html, n = scraper.read_flight_sheet(None, PILOT, NUM)
    assert sleeps == [120, 120] and n == 2 and html == sheet_recent and len(calls) == 3


def test_read_flight_sheet_limite_persistante_leve_ratelimit(monkeypatch):
    sleeps = []

    def iframe(*a):
        raise scraper.RateLimitError("trop")

    monkeypatch.setattr(scraper, "_read_flight_iframe", iframe)
    monkeypatch.setattr(scraper.time, "sleep", lambda s: sleeps.append(s))
    with pytest.raises(scraper.RateLimitError):
        scraper.read_flight_sheet(None, PILOT, NUM)
    assert sleeps == [120, 120, 300]


def test_limite_par_minute_persistante_arret_propre(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    setup_queue(tmp_path, monkeypatch, 4)
    state = {"n": 0}

    def read(driver, pilote, trace, *a, **k):
        state["n"] += 1
        if state["n"] == 2:
            raise scraper.RateLimitError("persiste")
        return session.sheet, session.links, session.track, session.html, 0

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    result = run_pilots(tmp_path)
    assert result["stopped"] == "La limite par minute de Syride persiste malgré les pauses."
    assert result["pending"] == 3          # vol 2, 3 et 4 restent à compléter


# ------------------------ P13 : limite quotidienne ------------------------


def test_limite_quotidienne_arret_propre(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    setup_queue(tmp_path, monkeypatch, 5)
    state = {"n": 0}

    def read(driver, pilote, trace, *a, **k):
        state["n"] += 1
        if state["n"] == 3:
            raise scraper.DailyLimitError("quotidienne")
        return session.sheet, session.links, session.track, session.html, 0

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    result = run_pilots(tmp_path)          # aucune exception remontée
    out = capsys.readouterr().out
    assert result["stopped"] == "Limite QUOTIDIENNE de fiches de Syride atteinte."
    assert result["pending"] == 3 and state["n"] == 3
    assert "3 vol(s) restent à compléter" in out
    assert "PHASE 3/3" in out              # l'index est quand même mis à jour


# ------------------------ P15 : lien expiré ------------------------


def test_lien_expire_relit_la_fiche_puis_telecharge(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    attempts = []

    def download(**kwargs):
        attempts.append(kwargs["link"])
        if len(attempts) == 1:
            raise scraper.LinkExpiredError("expiré")
        session.downloads.append(kwargs["expected_ext"])

    monkeypatch.setattr(scraper, "download_trace_via_browser", download)
    fresh = "https://www.syride.com/lien-neuf.gpx"
    sheet = dict(parse_flight_sheet_full(sheet_recent)[0], adresse_zip="https://www.syride.com/lien-ancien.gpx")
    reads = []

    def read(driver, pilote, trace, *a, **k):
        reads.append(trace)
        s = sheet if len(reads) == 1 else dict(sheet, adresse_zip=fresh)
        return s, {"gpx": s["adresse_zip"], "igc": None, "kml": None}, session.track, session.html, 0

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    data = make_flight(tmp_path, NUM)
    status, _ = browser_session.process_flight(
        None, str(tmp_path / "dl"), str(tmp_path), PILOT, NUM, dict(data),
        browser_session._Budget(None), files=("gpx",), need_gpx=True, need_igc=False)
    assert status == "ok" and session.downloads == ["gpx"]
    assert len(reads) == 2                                   # fiche relue une fois
    assert attempts == ["https://www.syride.com/lien-ancien.gpx", fresh]
    assert "relecture de la fiche" in capsys.readouterr().out
