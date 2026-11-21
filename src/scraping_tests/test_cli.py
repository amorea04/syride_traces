"""Tests de la ligne de commande de main.py (analyse des options, sans réseau ni Chrome)."""

import pytest

import main
import params_scrap_syride as params


def test_valeurs_par_defaut():
    args = main.parse_args([])
    assert args.files == "auto" and args.files_override is None
    assert args.backfill_raw == 1 and args.reparse == 0 and args.fill_igc == 0
    assert args.scrape == 1 and args.dry_run == 0 and args.db is None
    assert args.scroll_obsolete is False


@pytest.mark.parametrize("value,expected", [
    ("auto", None), ("none", ()), ("gpx", ("gpx",)), ("gpx,igc", ("gpx", "igc")),
    ("GPX, IGC", ("gpx", "igc")),
])
def test_option_files(value, expected):
    assert main.parse_args(["--files", value]).files_override == expected


@pytest.mark.parametrize("value", ["kml", "gpx,foo", "", "tout"])
def test_option_files_invalide(value, capsys):
    with pytest.raises(SystemExit):
        main.parse_args(["--files", value])
    assert "--files" in capsys.readouterr().err


def test_scroll_obsolete_accepte():
    args = main.parse_args(["--scroll", "30"])
    assert args.scroll_obsolete is True      # accepté (sans effet) ; main() affiche « option obsolète »


def test_reparse_et_backfill():
    args = main.parse_args(["--reparse", "1", "--backfill-raw", "0"])
    assert args.reparse == 1 and args.backfill_raw == 0
    with pytest.raises(SystemExit):
        main.parse_args(["--backfill-raw", "2"])


def test_db_personnalisee_exige_pas_de_pkl(capsys):
    with pytest.raises(SystemExit):
        main.parse_args(["--db", "/x/flights.db"])
    assert "--pkl 0" in capsys.readouterr().err
    assert main.parse_args(["--db", "/x/flights.db", "--dry-run", "1"]).db == "/x/flights.db"
    assert main.parse_args(["--db", "/x/flights.db", "--pkl", "0"]).db == "/x/flights.db"


def test_profils_par_defaut():
    assert params.FICHIERS_PAR_PILOTE == {"AdrienM": ("gpx", "igc")}
    files = main.effective_files(["AdrienM", "j2f"], None)
    assert files == {"AdrienM": ("gpx", "igc"), "j2f": ()}
    assert main.effective_files(["AdrienM", "j2f"], ("gpx",)) == {"AdrienM": ("gpx",), "j2f": ("gpx",)}
    assert main.effective_files(["AdrienM"], ()) == {"AdrienM": ()}


class _Recorder:
    """Remplace process_pilots / create_gobal_flight_data pour observer ce que main() demande."""

    def __init__(self):
        self.calls = []

    def process_pilots(self, **kwargs):
        self.calls.append(kwargs)
        return {"sheets_used": 0, "pending": 0, "failed_pilots": []}


@pytest.fixture
def recorder(monkeypatch):
    import sys
    import types
    rec = _Recorder()
    try:
        import undetected_chromedriver  # noqa: F401
    except ImportError:
        sys.modules["undetected_chromedriver"] = types.ModuleType("undetected_chromedriver")
    import browser_session
    monkeypatch.setattr(browser_session, "process_pilots", rec.process_pilots)
    return rec


def test_main_transmet_les_options(recorder, capsys):
    main.main(["--dry-run", "1", "--pilots", "AdrienM,j2f", "--db", "/x/copie.db", "--scroll", "10",
               "--files", "gpx", "--backfill-raw", "0", "--reparse", "1", "--fill-igc", "1"])
    kwargs = recorder.calls[0]
    out = capsys.readouterr().out
    assert "obsolète" in out
    assert kwargs["db_path"] == "/x/copie.db" and kwargs["dry_run"] is True
    assert kwargs["files_override"] == ("gpx",) and kwargs["backfill_raw"] is False
    assert kwargs["reparse"] is True and kwargs["pilots"] == ["AdrienM", "j2f"]
    assert kwargs["files_by_pilot"] == params.FICHIERS_PAR_PILOTE
    # --fill-igc : aucun pilote n'a l'IGC avec --files gpx -> message, option neutralisée
    assert "--fill-igc ignoré" in out and kwargs["fill_igc"] is False


def test_main_fill_igc_avec_profil_igc(recorder, capsys):
    main.main(["--dry-run", "1", "--pilots", "AdrienM,j2f", "--fill-igc", "1"])
    assert recorder.calls[0]["fill_igc"] is True
    assert "--fill-igc ignoré" not in capsys.readouterr().out


def test_main_fill_igc_sans_pilote_igc(recorder, capsys):
    main.main(["--dry-run", "1", "--pilots", "j2f", "--fill-igc", "1"])
    assert recorder.calls[0]["fill_igc"] is False
    assert "--fill-igc ignoré" in capsys.readouterr().out
