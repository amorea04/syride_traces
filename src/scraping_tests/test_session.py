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
    driver2 = GateDriver(validate_after=4)
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


# ------------------------ Turnstile : iframe, sortie sur la fiche, délai, capture ------------------------


class FrameDriver:
    """Fausse page à deux contextes (parent / iframe #popupIframe) dont le contenu évolue à chaque
    « attente humaine » : `script` = liste d'états (parent_html, iframe_html, fiche_affichée)."""

    def __init__(self, script):
        self.script, self.step = list(script), 0
        self.in_frame = False
        self.title = ""
        self.switch_to = types.SimpleNamespace(default_content=self._default, frame=self._frame)

    @property
    def state(self):
        return self.script[min(self.step, len(self.script) - 1)]

    def _default(self):
        self.in_frame = False

    def _frame(self, element):
        self.in_frame = True

    @property
    def page_source(self):
        return self.state[1] if self.in_frame else self.state[0]

    def find_elements(self, by, name):
        if by == "id" and name == "popupIframe":
            return [object()]
        if self.in_frame and by == "cls" and name == "fv-metrics" and self.state[2]:
            return [object()]
        return []

    def sleep(self, seconds):
        self.step += 1


CHALLENGE = '<div class="cf-turnstile"></div>'
PLAIN = "<html><body>rien</body></html>"
DONE_WIDGET = '<div class="cf-turnstile">Succès</div>'   # le widget reste dans le DOM après validation


def test_wait_for_turnstile_sort_des_que_la_fiche_est_affichee_meme_si_le_widget_reste(monkeypatch, fake_selenium):
    driver = FrameDriver([(CHALLENGE, PLAIN, False), (DONE_WIDGET, "<p>x</p>", True)])
    monkeypatch.setattr(scraper.time, "sleep", driver.sleep)
    scraper.wait_for_turnstile(driver, poll=2.0, max_wait=600)
    assert driver.step >= 1 and driver.in_frame is False


def test_wait_for_turnstile_defi_dans_l_iframe(monkeypatch, fake_selenium, capsys):
    driver = FrameDriver([(PLAIN, CHALLENGE, False), (PLAIN, CHALLENGE, False), (PLAIN, PLAIN, False)])
    monkeypatch.setattr(scraper.time, "sleep", driver.sleep)
    scraper.wait_for_turnstile(driver, poll=2.0, max_wait=600)
    assert "Turnstile" in capsys.readouterr().out and driver.step >= 2 and driver.in_frame is False


def test_wait_for_turnstile_delai_maximal_leve_une_erreur_claire(monkeypatch, fake_selenium):
    driver = FrameDriver([(CHALLENGE, PLAIN, False)])
    monkeypatch.setattr(scraper.time, "sleep", driver.sleep)
    with pytest.raises(scraper.TurnstileTimeoutError, match="non validé"):
        scraper.wait_for_turnstile(driver, poll=30.0, max_wait=120)
    assert driver.in_frame is False


def test_capture_de_diagnostic_une_seule_fois_par_execution(tmp_path, monkeypatch, fake_selenium):
    scraper.set_turnstile_debug_dir(str(tmp_path / "donnees"))
    for _ in range(2):
        driver = FrameDriver([(CHALLENGE, "<p>iframe</p>", False), (PLAIN, PLAIN, False)])
        monkeypatch.setattr(scraper.time, "sleep", driver.sleep)
        scraper.wait_for_turnstile(driver, poll=2.0, max_wait=600)
    files = list((tmp_path / "donnees").glob("_debug_turnstile_*.html"))
    assert len(files) == 1
    text = files[0].read_text(encoding="utf-8")
    assert "cf-turnstile" in text and "<p>iframe</p>" in text
    scraper.set_turnstile_debug_dir(None)


def test_phase_2_s_arrete_proprement_sur_delai_turnstile(tmp_path, monkeypatch, sheet_recent, capsys):
    reads = []

    def read(driver, pilote, trace, *a, **k):
        reads.append(trace)
        raise scraper.TurnstileTimeoutError("défi Turnstile non validé après 15 min")

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    monkeypatch.setattr(browser_session.time, "sleep", lambda s: None)
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: FakeDriver())
    monkeypatch.setattr(browser_session, "open_site_and_login", lambda driver: True)
    make_flight(tmp_path, "10")
    make_flight(tmp_path, "11")
    result = browser_session.process_pilots(path=str(tmp_path), pilots=[PILOT], do_scrape=False,
                                            files_by_pilot={})
    assert len(reads) == 1                       # aucune autre fiche consommée
    assert "Turnstile" in result["stopped"] and result["pending"] == 2


# ------------------------ --dry-run sans --db : copie temporaire ------------------------


def test_dry_run_sans_db_ne_touche_pas_a_la_vraie_base(tmp_path, monkeypatch):
    import hashlib
    import tempfile

    data, tmpdir = tmp_path / "donnees", tmp_path / "tmp"
    data.mkdir()
    tmpdir.mkdir()
    make_flight(data, NUM)
    real = data / flights_db.DB_NAME
    c = flights_db.connect(str(real))
    c.close()
    digest = hashlib.sha256(real.read_bytes()).hexdigest()
    mtime = real.stat().st_mtime_ns
    monkeypatch.setattr(tempfile, "tempdir", str(tmpdir))
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: pytest.fail("Chrome"))
    before = sorted(p.name for p in data.rglob("*"))

    browser_session.process_pilots(path=str(data), pilots=[PILOT], do_scrape=False, dry_run=True,
                                   files_by_pilot={})

    assert hashlib.sha256(real.read_bytes()).hexdigest() == digest
    assert real.stat().st_mtime_ns == mtime
    assert sorted(p.name for p in data.rglob("*")) == before
    assert list(tmpdir.iterdir()) == []          # copie temporaire supprimée


def test_dry_run_sans_base_existante_n_en_cree_pas(tmp_path, monkeypatch):
    import tempfile

    tmpdir = tmp_path / "tmp"
    tmpdir.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(tmpdir))
    data = tmp_path / "donnees"
    data.mkdir()
    make_flight(data, NUM)
    browser_session.process_pilots(path=str(data), pilots=[PILOT], do_scrape=False, dry_run=True,
                                   files_by_pilot={})
    assert not (data / flights_db.DB_NAME).exists() and list(tmpdir.iterdir()) == []


# ------------------------ Bilan : libellé « sans IGC » et file ------------------------


def test_libelle_sans_igc_selon_le_profil():
    note = browser_session._igc_note
    assert note(False, ("gpx",)) == " (profil sans IGC : non téléchargés)"
    assert note(True, ("gpx",)) == " (profil sans IGC : non téléchargés)"
    assert note(True, ("gpx", "igc")) == ""
    assert "récupérés à la visite de la fiche" in note(False, ("gpx", "igc"))


def test_flight_kind_ignore_l_igc_sans_fill_igc():
    item = {"need_info": False, "need_gpx": False, "need_igc": True, "need_raw": True}
    assert flights_db.flight_kind(item, fill_igc=False) == "raw"
    assert flights_db.flight_kind(item, fill_igc=True) == "files"


# ------------------------ Connexion à la demande : deux fenêtres, l'une après l'autre ------------------------

AUTRE = "AutrePilote"


class Windows:
    """Faux Chrome : journal des événements (création, connexion, fermeture, lecture de fiche)."""

    def __init__(self, monkeypatch, session, logged_in=True):
        self.events = []
        self.logged_in = logged_in
        outer = self

        class Driver(FakeDriver):
            def __init__(self, n):
                self.n = n

            def quit(self):
                outer.events.append(("quit", self.n))

        def create(**kw):
            n = sum(1 for e in outer.events if e[0] == "create") + 1
            outer.events.append(("create", n, kw["private"], kw["profile_dir"]))
            return Driver(n)

        def login(driver):
            outer.events.append(("login", driver.n))
            return outer.logged_in

        def read(driver, pilote, trace, *args, **kwargs):
            outer.events.append(("read", driver.n, pilote, trace))
            return session.read(driver, pilote, trace)

        monkeypatch.setattr(browser_session, "create_driver", create)
        monkeypatch.setattr(browser_session, "open_site_and_login", login)
        monkeypatch.setattr(scraper, "read_flight_sheet", read)

    def kinds(self):
        return [e[0] for e in self.events]

    def reads(self):
        return [(e[1], e[2], e[3]) for e in self.events if e[0] == "read"]


def run_session(tmp_path, **kwargs):
    kwargs.setdefault("files_by_pilot", {PILOT: ("gpx", "igc")})
    return browser_session.process_pilots(path=str(tmp_path), pilots=[PILOT, AUTRE],
                                          do_scrape=False, **kwargs)


def test_is_file_flight_classement():
    flight = browser_session.is_file_flight
    item = {"need_gpx": True, "need_igc": True}
    assert flight(item, ("gpx", "igc")) and flight(item, ("gpx",)) and flight(item, ("igc",))
    assert not flight(item, ()) and not flight(item, None)               # pilote sans profil
    assert not flight({"need_gpx": False, "need_igc": False}, ("gpx", "igc"))
    assert not flight({"need_gpx": False, "need_igc": True}, ("gpx",))   # IGC voulu mais profil gpx seul
    assert flight({"need_gpx": False, "need_igc": True}, ("gpx", "igc"))
    assert not flight({"need_gpx": True, "need_igc": False}, ("igc",))


def test_sans_vol_a_fichiers_une_seule_fenetre_sans_connexion(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session)
    make_flight(tmp_path, "10", pilot=PILOT)
    make_flight(tmp_path, "11", pilot=AUTRE)
    result = run_session(tmp_path, files_by_pilot={})
    assert win.kinds().count("create") == 1 and "login" not in win.kinds()
    assert win.events[0][2] is True and "_chrome_profile" not in win.events[0][3]   # privée, profil temporaire
    assert result["sheets_used"] == 2 and result["pending"] == 0
    assert not Path(win.events[0][3]).exists()                                       # profil supprimé


def test_file_mixte_fenetre_connectee_d_abord_puis_sans_connexion(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session)
    make_flight(tmp_path, "12", pilot=AUTRE)      # plus récent, mais sans fichiers : passe 2
    make_flight(tmp_path, "10", pilot=PILOT)
    result = run_session(tmp_path)
    assert [e[0] for e in win.events] == ["create", "login", "read", "quit", "create", "read", "quit"]
    first, second = win.events[0], win.events[4]
    assert first[2] is False and first[3].endswith("_chrome_profile")   # fenêtre connectée, profil habituel
    assert second[2] is True and "_chrome_profile" not in second[3]     # sans connexion : privée, temporaire
    assert win.reads() == [(1, PILOT, "10"), (2, AUTRE, "12")]
    assert session.downloads == ["gpx", "igc"]                          # téléchargés dans la fenêtre connectée
    assert result["pending"] == 0 and result["pending_downloads"] == 0
    assert not Path(second[3]).exists()


def test_connexion_refusee_fiches_lues_sans_connexion_en_infos_seules(tmp_path, monkeypatch, sheet_recent,
                                                                      capsys):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session, logged_in=False)
    monkeypatch.setattr(flights_db, "mark_no_link",
                        lambda *a, **k: pytest.fail("mark_no_link ne doit pas être appelé"))
    make_flight(tmp_path, "10", pilot=PILOT)
    make_flight(tmp_path, "11", pilot=AUTRE)
    result = run_session(tmp_path)
    out = capsys.readouterr().out
    assert session.downloads == []                                       # aucun téléchargement tenté
    assert win.kinds().count("login") == 1 and win.kinds().count("create") == 2
    assert win.kinds().index("quit") < [i for i, k in enumerate(win.kinds()) if k == "create"][1]
    assert {r[0] for r in win.reads()} == {2}                             # toutes les fiches : fenêtre 2
    assert sorted(r[1:] for r in win.reads()) == [(AUTRE, "11"), (PILOT, "10")]
    assert result["stopped"] is None and result["pending"] == 0
    assert result["pending_downloads"] == 1 and result["sheets_used"] == 2
    assert "Connexion à Syride non confirmée" in out and "SYRIDE_EMAIL" in out
    assert (tmp_path / PILOT / "traces" / "10" / "10.sheet.html.gz").exists()


def test_connexion_refusee_vol_a_qui_il_ne_manque_que_des_fichiers_non_lu(tmp_path, monkeypatch,
                                                                          sheet_recent):
    """Sans connexion, lire la fiche d'un vol à JSON complet n'apporterait rien : pas de fiche
    consommée, le vol attend ses fichiers."""
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session, logged_in=False)
    full = parse_flight_sheet_full(sheet_recent)[0]
    full.pop("adresse_zip", None)
    make_flight(tmp_path, "10", pilot=PILOT, **full)   # JSON complet : il ne manque que les fichiers
    make_flight(tmp_path, "11", pilot=AUTRE)
    result = run_session(tmp_path, backfill_raw=False)
    assert win.reads() == [(2, AUTRE, "11")] and session.downloads == []
    assert result["sheets_used"] == 1 and result["pending_downloads"] == 1


def test_budget_partage_entre_les_deux_passes(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session)
    make_flight(tmp_path, "10", pilot=PILOT)
    for num in ("11", "12", "13"):
        make_flight(tmp_path, num, pilot=AUTRE)
    result = run_session(tmp_path, max_sheets=2)
    assert len(win.reads()) == 2 and win.reads()[0][1:] == (PILOT, "10")   # passe 1 d'abord
    assert result["sheets_used"] == 2 and result["pending"] == 2
    assert "Nombre maximum de fiches atteint (2)" in result["stopped"]


def test_budget_epuise_apres_la_passe_1_n_ouvre_pas_la_fenetre_2(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session)
    make_flight(tmp_path, "10", pilot=PILOT)
    make_flight(tmp_path, "11", pilot=AUTRE)
    result = run_session(tmp_path, max_sheets=1)
    assert win.kinds().count("create") == 1 and result["pending"] == 1


def test_arret_turnstile_en_passe_1_pas_de_passe_2(tmp_path, monkeypatch, sheet_recent):
    session = Session(monkeypatch, sheet_recent)
    win = Windows(monkeypatch, session)

    def read(driver, pilote, trace, *a, **k):
        win.events.append(("read", driver.n, pilote, trace))
        raise scraper.TurnstileTimeoutError("défi Turnstile non validé après 15 min")

    monkeypatch.setattr(scraper, "read_flight_sheet", read)
    make_flight(tmp_path, "10", pilot=PILOT)
    make_flight(tmp_path, "11", pilot=AUTRE)
    make_flight(tmp_path, "12", pilot=AUTRE)
    result = run_session(tmp_path)
    assert win.kinds() == ["create", "login", "read", "quit"]            # fenêtre fermée, pas de passe 2
    assert "Turnstile" in result["stopped"] and result["pending"] == 3


def test_dry_run_annonce_la_fenetre_prevue(tmp_path, monkeypatch, sheet_recent, capsys):
    session = Session(monkeypatch, sheet_recent)
    monkeypatch.setattr(browser_session, "create_driver", lambda **kw: pytest.fail("Chrome"))
    make_flight(tmp_path, "10", pilot=PILOT)
    make_flight(tmp_path, "11", pilot=AUTRE)
    run_session(tmp_path, dry_run=True, db_path=str(tmp_path / "copie.db"))
    out = capsys.readouterr().out
    assert f"{PILOT} / trace 10" in out and "[fenêtre connectée]" in out
    assert f"{AUTRE} / trace 11" in out and "[fenêtre sans connexion]" in out
    assert session.reads == []
