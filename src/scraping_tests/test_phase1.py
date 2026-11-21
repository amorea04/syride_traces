"""Tests de la phase 1 (liste des vols par HTTP, sans Chrome) : FakeTransport, pilotes fictifs
dans tmp_path, aucun réseau."""

import gzip
import re
import sys
import types
import urllib.error
import urllib.request
from email.message import Message
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from scraping_tests.test_flights_db import PILOT, conn, make_flight  # noqa: F401  (installe aussi les modules factices)

try:   # Chrome n'est pas installé partout : module factice (jamais utilisé par ces tests)
    import undetected_chromedriver  # noqa: F401
except ImportError:
    sys.modules["undetected_chromedriver"] = types.ModuleType("undetected_chromedriver")

import browser_session  # noqa: E402
import flights_db  # noqa: E402
import syride_scraper as scraper  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
PAGE_WITH_ID = "<html><form><input type=hidden name=idRider value=4242 /></form></html>"
END_MARKER = "<!-- syride-no-more-activity -->"


@pytest.fixture(scope="module")
def sample_html():
    return (FIXTURES / "activites_sample.html").read_text(encoding="utf-8")


class FakeTransport:
    """Sert la page du pilote et les réponses de activites.php ; garde la trace des appels."""

    def __init__(self, page=PAGE_WITH_ID, lists=None):
        self.page = page
        self.lists = lists if lists is not None else []   # réponses successives de activites.php
        self.calls = []

    def get_text(self, url, referer):
        self.calls.append((url, referer))
        if "activites.php" in url:
            return self.lists.pop(0) if len(self.lists) > 1 else self.lists[0]
        return self.page

    def list_calls(self):
        return [c for c in self.calls if "activites.php" in c[0]]


def tree(root):
    """Contenu complet d'un dossier : {chemin relatif: (taille, mtime)}."""
    root = Path(root)
    return {str(p.relative_to(root)): (p.stat().st_size, p.stat().st_mtime_ns)
            for p in sorted(root.rglob("*")) if p.is_file() and p.name != "flights.db"}


def db_state(conn):
    return (conn.execute("SELECT COUNT(*) FROM flights").fetchone()[0],
            conn.execute("SELECT COUNT(*) FROM pilots").fetchone()[0])


# ------------------------ sync_pilot_list ------------------------


def test_nouveaux_vols_bilan_et_cache_id_rider(tmp_path, conn, sample_html, capsys):
    transport = FakeTransport(lists=[sample_html])
    result = browser_session.sync_pilot_list(conn, transport, str(tmp_path), PILOT)

    report = result["report"]
    assert len(report["new"]) == 5 and report["modified"] == [] and report["absent"] == []
    assert result["listed"] == 5 and result["complete"] is True
    assert capsys.readouterr().out.strip() == (
        f"{PILOT} : 5 vols sur Syride, 5 nouveaux, 0 modifiés, 0 absents, 0 réapparus")

    # JSON créés, instantané de la liste, idRider en cache
    for num in report["new"]:
        assert (tmp_path / PILOT / "traces" / num / f"{num}.json").exists()
    assert len(list((tmp_path / PILOT / "_raw").glob("activites_*.html.gz"))) == 1
    assert flights_db.get_id_rider(conn, PILOT) == "4242"
    page_call, list_call = transport.calls
    assert page_call[0] == "https://www.syride.com/fr/pilotes/" + PILOT
    assert "idRider=4242" in list_call[0] and "limit=5000" in list_call[0]
    assert list_call[1] == page_call[0]   # Referer = page du pilote

    # Deuxième passage : idRider lu en cache (pas de nouvelle requête sur la page), rien de nouveau
    transport2 = FakeTransport(lists=[sample_html])
    again = browser_session.sync_pilot_list(conn, transport2, str(tmp_path), PILOT)
    assert len(transport2.calls) == 1 and "activites.php" in transport2.calls[0][0]
    assert again["report"]["new"] == [] and again["report"]["modified"] == []


def test_vol_absent_et_garde_fou_dans_le_bilan(tmp_path, conn, sample_html, capsys):
    browser_session.sync_pilot_list(conn, FakeTransport(lists=[sample_html]), str(tmp_path), PILOT)
    make_flight(tmp_path, 9999999)   # vol du disque absent de la liste
    capsys.readouterr()
    result = browser_session.sync_pilot_list(conn, FakeTransport(lists=[sample_html]), str(tmp_path), PILOT)
    assert result["report"]["absent"] == ["9999999"]
    assert "1 absents" in capsys.readouterr().out


def test_dry_run_n_ecrit_rien(tmp_path, conn, sample_html, capsys):
    # un vol déjà connu sur disque + base
    make_flight(tmp_path, 9999999)
    flights_db.sync_pilot(conn, str(tmp_path), PILOT)
    files_before, db_before = tree(tmp_path), db_state(conn)
    id_before = flights_db.get_id_rider(conn, PILOT)

    result = browser_session.sync_pilot_list(
        conn, FakeTransport(lists=[sample_html]), str(tmp_path), PILOT, dry_run=True)

    # le bilan est celui d'une vraie exécution
    assert len(result["report"]["new"]) == 5
    assert f"{PILOT} : 5 vols sur Syride, 5 nouveaux" in capsys.readouterr().out
    # mais rien n'est écrit : ni fichier, ni instantané, ni base, ni idRider
    assert tree(tmp_path) == files_before
    assert not (tmp_path / PILOT / "_raw").exists()
    assert db_state(conn) == db_before
    assert flights_db.get_id_rider(conn, PILOT) == id_before is None
    assert conn.execute("SELECT syride_status FROM flights WHERE num='9999999'").fetchone()[0] != "absent"


def test_dry_run_dossier_pilote_inexistant(tmp_path, conn, sample_html):
    browser_session.sync_pilot_list(conn, FakeTransport(lists=[sample_html]), str(tmp_path), PILOT,
                                    dry_run=True)
    assert list(tmp_path.iterdir()) == [tmp_path / "flights.db"]


@pytest.mark.parametrize("page,lists", [("", [""]), ("<html>rien</html>", [""]),
                                        (PAGE_WITH_ID, ["<html>Forbidden</html>"])])
def test_reponse_vide_ou_illisible(tmp_path, conn, monkeypatch, page, lists):
    monkeypatch.chdir(tmp_path)   # le HTML de diagnostic est écrit dans le dossier courant
    with pytest.raises(scraper.PilotPageError):
        browser_session.sync_pilot_list(conn, FakeTransport(page=page, lists=lists), str(tmp_path), PILOT)
    assert list(tmp_path.glob("_debug_pilot_page_*.html"))
    assert db_state(conn) == (0, 0)


def test_id_rider_en_cache_perime_relu_sur_la_page(tmp_path, conn, sample_html, monkeypatch):
    monkeypatch.chdir(tmp_path)
    flights_db.set_id_rider(conn, PILOT, "1")
    transport = FakeTransport(lists=["<html>Forbidden</html>", sample_html])
    browser_session.sync_pilot_list(conn, transport, str(tmp_path), PILOT)
    assert flights_db.get_id_rider(conn, PILOT) == "4242"
    assert "idRider=1&" in transport.list_calls()[0][0] and "idRider=4242&" in transport.list_calls()[1][0]


# ------------------------ fetch_pilot_list : pagination et complétude ------------------------


def _blocks(sample_html):
    soup = BeautifulSoup(sample_html, "html.parser")
    return [str(b) for b in soup.find_all(id=re.compile(r"^activite\d+$"))]


def test_pagination_before_id(sample_html, monkeypatch):
    monkeypatch.setattr(scraper, "LIST_LIMIT", 3)
    monkeypatch.setattr(scraper, "LIST_PAGE_SIZE", 2)
    blocks = _blocks(sample_html)
    pages = ["".join(blocks[:3]), "".join(blocks[3:5]), END_MARKER]
    transport = FakeTransport(lists=pages)

    html, parsed = scraper.fetch_pilot_list(transport, PILOT)

    assert len(parsed["flights"]) == 5 and parsed["complete"] is True and parsed["end_of_list"]
    assert parsed["id_rider"] == "4242"
    calls = transport.list_calls()
    assert len(calls) == 3
    q1, q2, q3 = (parse_qs(urlparse(c[0]).query) for c in calls)
    assert q1["limit"] == ["3"] and "beforeId" not in q1
    assert q2["limit"] == ["2"] and q2["append"] == ["1"]
    assert q2["beforeId"] == [parsed["activity_ids"][2]]
    assert q3["beforeId"] == [parsed["activity_ids"][4]]
    assert len(re.findall(r"id=.activite\d+.", html)) == 5


def test_liste_tronquee_non_complete_aucun_absent(tmp_path, conn, sample_html, monkeypatch):
    """Limite atteinte (5 activités reçues pour limit=5) : liste jugée incomplète même avec le
    marqueur de fin ; aucun vol n'est marqué absent."""
    monkeypatch.setattr(scraper, "LIST_LIMIT", 5)
    make_flight(tmp_path, 9999999)
    transport = FakeTransport(lists=[sample_html + END_MARKER])
    result = browser_session.sync_pilot_list(conn, transport, str(tmp_path), PILOT)
    assert result["complete"] is False
    assert result["report"]["absent"] == [] and result["report"]["absent_skipped"]
    assert len(transport.list_calls()) == 1


def test_garde_fou_de_pagination(sample_html, monkeypatch):
    monkeypatch.setattr(scraper, "LIST_LIMIT", 1)
    monkeypatch.setattr(scraper, "LIST_PAGE_SIZE", 1)
    monkeypatch.setattr(scraper, "LIST_MAX_PAGES", 2)
    blocks = _blocks(sample_html)
    transport = FakeTransport(lists=blocks[:4])   # chaque page rend 1 activité : jamais plus courte
    _, parsed = scraper.fetch_pilot_list(transport, PILOT, id_rider="4242")
    assert parsed["complete"] is False and len(transport.list_calls()) == 3


# ------------------------ HttpTransport ------------------------


class _Response:
    def __init__(self, body, headers):
        self._body, self.headers = body, headers

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _headers(**fields):
    msg = Message()
    for key, value in fields.items():
        msg[key.replace("_", "-")] = value
    return msg


def test_http_transport_en_tetes_et_gzip(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout=None):
        seen["request"], seen["timeout"] = request, timeout
        return _Response(gzip.compress("Été".encode("utf-8")),
                         _headers(Content_Encoding="gzip", Content_Type="text/html; charset=utf-8"))

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    text = scraper.HttpTransport(timeout=7).get_text("https://www.syride.com/x", referer="https://www.syride.com/y")
    assert text == "Été" and seen["timeout"] == 7
    headers = {k.lower(): v for k, v in seen["request"].header_items()}
    assert headers["referer"] == "https://www.syride.com/y"
    assert headers["accept-language"] == "fr" and headers["user-agent"].startswith("Mozilla/")
    assert set(headers) <= {"referer", "user-agent", "accept-language", "accept-encoding"}   # rien de personnel


def test_http_transport_erreur_http(monkeypatch):
    def fake_urlopen(request, timeout=None):
        raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError, match="403"):
        scraper.HttpTransport().get_text("https://www.syride.com/x", referer="r")


# ------------------------ process_pilots : phase 1 seule, sans Chrome ------------------------


def test_process_pilots_phase1_sans_chrome(tmp_path, sample_html, monkeypatch, capsys):
    def no_chrome(*args, **kwargs):
        raise AssertionError("Chrome ne doit pas être ouvert")

    monkeypatch.setattr(browser_session, "create_driver", no_chrome)
    transport = FakeTransport(lists=[sample_html])
    result = browser_session.process_pilots(
        path=str(tmp_path), pilots=[PILOT], transport=transport, files_by_pilot={},
        tasks="files")   # aucun fichier à télécharger : file vide, donc pas de Chrome
    out = capsys.readouterr().out
    assert result["failed_pilots"] == [] and result["sheets_used"] == 0
    assert "doublon(s) probable(s), voir" in out and (tmp_path / "_rapport_doublons.txt").exists()
    assert f"{PILOT} : 5 vols sur Syride, 5 nouveaux" in out
