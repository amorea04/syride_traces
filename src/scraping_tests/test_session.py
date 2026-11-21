"""Tests de la phase 2 (session navigateur) sans réseau ni Chrome : read_flight_sheet et
download_trace_via_browser sont remplacés ; faux pilote et fausse page pour Turnstile."""

import ast
import json
import sys
import types
from pathlib import Path

import pytest

from scraping_tests.test_flights_db import PILOT, conn, make_flight  # noqa: F401  (installe aussi les modules factices)

try:   # Chrome n'est pas installé partout : module factice (jamais utilisé par ces tests)
    import undetected_chromedriver  # noqa: F401
except ImportError:
    sys.modules["undetected_chromedriver"] = types.ModuleType("undetected_chromedriver")

import browser_session  # noqa: E402
import flights_db  # noqa: E402
import syride_scraper as scraper  # noqa: E402
from syride_parsing import parse_flight_sheet_full  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
NUM = "3766574"


@pytest.fixture(scope="module")
def sheet_recent():
    return (FIXTURES / "sheet_recent.html").read_text(encoding="utf-8")


class Session:
    """Remplace la lecture de fiche et le téléchargement ; enregistre les appels."""

    def __init__(self, monkeypatch, html, sheet=None, links=None, track="auto", download_error=None):
        parsed_sheet, parsed_links, parsed_track = parse_flight_sheet_full(html)
        self.html = html
        self.sheet = parsed_sheet if sheet is None else sheet
        self.links = parsed_links if links is None else links
        self.track = parsed_track if track == "auto" else track
        self.download_error = download_error
        self.reads, self.downloads = [], []
        monkeypatch.setattr(scraper, "read_flight_sheet", self.read)
        monkeypatch.setattr(scraper, "download_trace_via_browser", self.download)
        monkeypatch.setattr(browser_session.time, "sleep", lambda s: None)

    def read(self, driver, pilote, trace, *args, **kwargs):
        self.reads.append((pilote, trace))
        return self.sheet, self.links, self.track, self.html, 0

    def download(self, **kwargs):
        if self.download_error:
            raise self.download_error
        self.downloads.append(kwargs["expected_ext"])


def run(tmp_path, nav=NUM, **kwargs):
    data = make_flight(tmp_path, nav)
    return browser_session.process_flight(
        None, str(tmp_path / "dl"), str(tmp_path), PILOT, nav, dict(data),
        browser_session._Budget(None), **kwargs)


def raw_path(tmp_path, nav=NUM):
    return tmp_path / PILOT / "traces" / nav / f"{nav}.sheet.html.gz"


def saved_json(tmp_path, nav=NUM):
    return json.loads((tmp_path / PILOT / "traces" / nav / f"{nav}.json").read_text(encoding="utf-8"))


# ------------------------ process_flight ------------------------


def test_fiche_brute_toujours_enregistree_sans_fichiers(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    status, n_limits = run(tmp_path, files=())
    assert status == "ok" and n_limits == 0
    assert raw_path(tmp_path).exists()
    assert session.downloads == []                       # profil sans fichiers : aucun téléchargement
    data = saved_json(tmp_path)
    assert data["plafond"] is not None and "adresse_zip" not in data   # infos de fiche, sans lien signé
    assert scraper.load_sheet_raw(str(raw_path(tmp_path).parent), NUM) == sheet_recent


def test_profil_gpx_igc_deux_telechargements(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    status, _ = run(tmp_path, files=("gpx", "igc"))
    assert status == "ok" and session.downloads == ["gpx", "igc"]
    assert raw_path(tmp_path).exists()


def test_profil_gpx_seul(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    status, _ = run(tmp_path, files=("gpx",))
    assert status == "ok" and session.downloads == ["gpx"]


def test_telechargement_seulement_si_besoin(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    run(tmp_path, files=("gpx", "igc"), need_gpx=False, need_igc=True, need_info=False)
    assert session.downloads == ["igc"]


def test_trace_absente_sans_lien_gpx_est_nolink(tmp_path, monkeypatch, sheet_recent):
    sheet = dict(parse_flight_sheet_full(sheet_recent)[0], adresse_zip=None)
    session = Session(monkeypatch, sheet_recent, sheet=sheet, links={"gpx": None, "igc": None, "kml": None},
                      track=None)
    status, _ = run(tmp_path, files=("gpx", "igc"))
    assert status == "nolink" and session.downloads == []
    assert raw_path(tmp_path).exists()                    # la fiche brute est gardée quand même


def test_trace_presente_sans_lien_gpx_profil_sans_fichiers(tmp_path, monkeypatch, sheet_recent):
    sheet = dict(parse_flight_sheet_full(sheet_recent)[0], adresse_zip=None)
    Session(monkeypatch, sheet_recent, sheet=sheet)       # trace fv-config présente
    status, _ = run(tmp_path, files=(), need_gpx=False)
    assert status == "ok"


def test_gpx_voulu_mais_sans_lien_est_nolink(tmp_path, monkeypatch, sheet_recent):
    sheet = dict(parse_flight_sheet_full(sheet_recent)[0], adresse_zip=None)
    Session(monkeypatch, sheet_recent, sheet=sheet)
    status, _ = run(tmp_path, files=("gpx",), need_gpx=True)
    assert status == "nolink"


def test_limite_de_telechargement(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent, download_error=scraper.DownloadLimitError("DOWNLOAD LIMIT REACHED"))
    status, _ = run(tmp_path, files=("gpx", "igc"))
    assert status == "download_blocked"
    assert raw_path(tmp_path).exists() and saved_json(tmp_path)["plafond"] is not None   # rien de perdu


def test_mode_informations_seules(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    assert run(tmp_path, files=("gpx", "igc"), allow_download=False)[0] == "info_only"
    assert session.downloads == [] and raw_path(tmp_path).exists()


def test_informations_seules_sans_fichiers_voulus_est_ok(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)
    assert run(tmp_path, files=(), allow_download=False)[0] == "ok"   # rien à télécharger : pas « en attente »


def test_fiche_brute_non_reecrite_si_deja_presente(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)
    run(tmp_path, files=(), need_raw=False)
    assert not raw_path(tmp_path).exists()


# ------------------------ process_pilots : file et bilan ------------------------


class FakeDriver:
    def implicitly_wait(self, seconds):
        pass

    def quit(self):
        pass


def test_process_pilots_file_raw_et_bilan(tmp_path, monkeypatch, sheet_recent, capsys):
    """Un vol à JSON complet mais sans fiche brute : rattrapé (type « raw »), fiche enregistrée,
    aucun fichier téléchargé pour un pilote sans profil ; Chrome ouvert une seule fois."""
    opened = []
    session = Session(monkeypatch, sheet_recent)
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: opened.append(kw) or FakeDriver())
    monkeypatch.setattr(browser_session, "open_site_and_login", lambda driver: True)
    full = parse_flight_sheet_full(sheet_recent)[0]
    full.pop("adresse_zip", None)
    make_flight(tmp_path, NUM, **full)

    result = browser_session.process_pilots(
        path=str(tmp_path), pilots=[PILOT], do_scrape=False, files_by_pilot={})
    out = capsys.readouterr().out
    assert len(opened) == 1 and result["sheets_used"] == 1
    assert session.reads == [(PILOT, NUM)] and session.downloads == []
    assert raw_path(tmp_path).exists()
    assert "1 avec fiche brute manquante seulement" in out
    assert "Tous les vols Syride ont leur fiche brute." in out
    assert "sans fiche brute : 1" in out   # bilan du début de phase 2


def test_process_pilots_sans_rattrapage_raw_pas_de_chrome(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)

    def no_chrome(**kwargs):
        raise AssertionError("Chrome ne doit pas être ouvert")

    monkeypatch.setattr(browser_session, "create_driver", no_chrome)
    full = parse_flight_sheet_full(sheet_recent)[0]
    full.pop("adresse_zip", None)
    make_flight(tmp_path, NUM, **full)
    result = browser_session.process_pilots(
        path=str(tmp_path), pilots=[PILOT], do_scrape=False, files_by_pilot={}, backfill_raw=False)
    assert result["sheets_used"] == 0


def test_process_pilots_dry_run_ne_cree_rien(tmp_path, monkeypatch, sheet_recent):
    Session(monkeypatch, sheet_recent)
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: pytest.fail("Chrome"))
    make_flight(tmp_path, NUM)
    before = sorted(p.name for p in tmp_path.rglob("*"))
    browser_session.process_pilots(path=str(tmp_path), pilots=[PILOT], do_scrape=False, dry_run=True,
                                   files_by_pilot={}, db_path=str(tmp_path / "copie.db"))
    created = set(p.name for p in tmp_path.rglob("*")) - set(before)
    assert created <= {"copie.db", "copie.db-journal"}     # ni _tmp_downloads ni autre dossier


# ------------------------ Turnstile ------------------------

GATE = '<html><body><div class="cf-turnstile" data-sitekey="x"></div></body></html>'


class GateDriver:
    """Fausse page : un défi Turnstile s'affiche dans la page parente jusqu'à ce que « l'humain »
    le valide (ici : après `validate_after` attentes), puis l'iframe de la fiche apparaît."""

    def __init__(self, gate=True, validate_after=2):
        self.gate, self.validate_after = gate, validate_after
        self.in_frame = False
        self.sleeps = 0
        self.visited = []
        self.title = ""
        self.switch_to = types.SimpleNamespace(default_content=self._default, frame=self._frame)

    def _default(self):
        self.in_frame = False

    def _frame(self, element):
        self.in_frame = True

    def get(self, url):
        self.visited.append(url)

    @property
    def page_source(self):
        if self.in_frame:
            return "<html>FICHE</html>"
        return GATE if self.gate else "<html><iframe id='popupIframe'></iframe></html>"

    def find_element(self, *args):
        return types.SimpleNamespace(text="")

    def find_elements(self, *args):
        return []

    def human_sleep(self, seconds):
        self.sleeps += 1
        if self.sleeps >= self.validate_after:
            self.gate = False


class FakeWait:
    """WebDriverWait factice : l'attente de l'iframe échoue tant que le défi est affiché."""

    def __init__(self, driver, timeout):
        self.driver = driver

    def until(self, condition):
        if self.driver.gate:
            raise scraper.TimeoutException("délai dépassé")
        return True


@pytest.fixture
def fake_selenium(monkeypatch):
    monkeypatch.setattr(scraper, "By", types.SimpleNamespace(ID="id", TAG_NAME="tag", CLASS_NAME="cls"))
    monkeypatch.setattr(scraper, "WebDriverWait", FakeWait)
    monkeypatch.setattr(scraper, "wait_for_cloudflare", lambda driver: None)


def test_turnstile_declenche_l_attente_puis_reprise(monkeypatch, fake_selenium, capsys):
    driver = GateDriver(validate_after=3)
    monkeypatch.setattr(scraper.time, "sleep", driver.human_sleep)

    html = scraper._read_flight_iframe(driver, "pilote", NUM, "https://www.syride.com/fr/pilotes/")

    out = capsys.readouterr().out
    assert "Turnstile" in out and "Valide-la dans la fenêtre Chrome" in out and "reprendra seul" in out
    assert driver.sleeps >= 3                            # le script a attendu l'humain
    assert html == "<html>FICHE</html>"                  # puis lu la fiche dans l'iframe
    assert driver.visited == [f"https://www.syride.com/fr/pilotes/pilote/{NUM}"]   # navigation, rien d'autre
    assert driver.in_frame is False


def test_sans_turnstile_pas_d_attente_et_erreur_claire(monkeypatch, fake_selenium, capsys):
    driver = GateDriver(gate=False)
    driver.gate = False

    class AlwaysTimeout(FakeWait):
        def until(self, condition):
            raise scraper.TimeoutException("délai dépassé")

    monkeypatch.setattr(scraper, "WebDriverWait", AlwaysTimeout)
    monkeypatch.setattr(scraper.time, "sleep", driver.human_sleep)
    with pytest.raises(RuntimeError, match="contenu de la fiche introuvable"):
        scraper._read_flight_iframe(driver, "pilote", NUM, "https://www.syride.com/fr/pilotes/")
    assert driver.sleeps == 0 and "Turnstile" not in capsys.readouterr().out


def test_wait_for_turnstile_rappel_toutes_les_60_secondes(monkeypatch, capsys):
    driver = GateDriver(validate_after=10)
    monkeypatch.setattr(scraper.time, "sleep", driver.human_sleep)
    scraper.wait_for_turnstile(driver, poll=2.0)
    out = capsys.readouterr().out
    assert "toujours en attente" not in out              # 10 attentes de 2 s : 20 s seulement
    driver2 = GateDriver(validate_after=40)
    monkeypatch.setattr(scraper.time, "sleep", driver2.human_sleep)
    scraper.wait_for_turnstile(driver2, poll=30.0)
    assert "toujours en attente (60 s)" in capsys.readouterr().out


def test_wait_for_turnstile_sans_defi_ne_fait_rien(monkeypatch):
    driver = GateDriver(gate=False)
    monkeypatch.setattr(scraper.time, "sleep", driver.human_sleep)
    scraper.wait_for_turnstile(driver)
    assert driver.sleeps == 0


def _code_strings(path):
    """Chaînes littérales du code (docstrings exclues) d'un module."""
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef)) and node.body \
                and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant):
            docstrings.add(id(node.body[0].value))
    return [n.value for n in ast.walk(tree)
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings]


def test_aucune_adresse_de_fiche_ni_d_autorisation_dans_le_code():
    """Règle absolue : le code n'appelle jamais ficheVol.php ni autoriser-affichage.php (la fiche
    s'obtient par la navigation Chrome vers la page du vol) et ne fait aucun POST."""
    src = Path(scraper.__file__).parent
    for name in ("syride_scraper.py", "browser_session.py", "main.py", "debug_flight_page.py"):
        for text in _code_strings(src / name):
            assert "ficheVol" not in text and "autoriser-affichage" not in text, (name, text)
        code = (src / name).read_text(encoding="utf-8")
        assert "method=\"POST\"" not in code and ".post(" not in code and "data=" not in code.split(
            "def get_text")[-1].split("def ")[0], name
