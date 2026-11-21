"""
Tests du parsing Syride (src/syride_parsing.py) : fonctions pures, sans réseau ni Chrome.

Fixtures anonymisées dans scraping_tests/fixtures/. Attention : dans les fiches, `points`, `times`
et `terrain` sont SYNTHÉTIQUES ; les métriques, `dl.fv-info`, `<time>`, liens et extrema viennent de
vraies fiches (voir src/migration/SYRIDE_API.md, section 9).
"""

import copy
import json
import re
from pathlib import Path

import pytest

from syride_parsing import (
    FLIGHT_SHEET_FIELDS,
    is_turnstile_gate,
    normalize_missing,
    parse_activities_response,
    parse_flight_sheet,
    parse_flight_sheet_full,
    parse_fv_config,
    parse_id_rider,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _read(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def activities_html():
    return _read("activites_sample.html")


@pytest.fixture(scope="module")
def sheet_recent():
    return _read("sheet_recent.html")


@pytest.fixture(scope="module")
def sheet_old():
    return _read("sheet_old.html")


def _with_config(config):
    """Petit HTML contenant un bloc fv-config."""
    return f'<html><body><script type="application/json" id="fv-config">{json.dumps(config)}</script></body></html>'


def _config(n=5):
    return {
        "id": "1",
        "token": "x" * 40,
        "url3d": "/ion/ion_vol.php?idSession=1&expires=1&key=xxxx&beta3d=1",
        "points": [[45.0 + i * 0.001, 5.0, 500 + i, 30, 0.1, 1.0, 0.1] for i in range(n)],
        "times": [1700000000 + i for i in range(n)],
        "terrain": [[1700000000, 100]],
        "extrema": [{"icon": "up", "label": "Vario max : 2.5 m/s", "position": [45.0, 5.0], "time": 1700000001}],
        "offset": 3600,
        "distance": [[45.0, 5.0], [45.1, 5.1]],
        "units": ["m", "km/h"],
    }


# ------------------------ idRider ------------------------


def test_id_rider_absent_des_fixtures(activities_html, sheet_recent):
    # Les fixtures ne contiennent ni la page du pilote ni son idRider (anonymisé).
    assert parse_id_rider(activities_html) is None
    assert parse_id_rider(sheet_recent) is None


def test_id_rider_input_cache():
    html = "<form><input type=hidden name=idRider value=99999 /></form>"
    assert parse_id_rider(html) == "99999"
    assert parse_id_rider('<input type="hidden" name="idRider" value="123">') == "123"


def test_id_rider_repli_sur_l_url():
    html = "var ajaxUrl = '/ajax/pilotes/activites.php?limit='+n+'&l=fr&idRider=4242&apli=0';"
    assert parse_id_rider(html) == "4242"


def test_id_rider_introuvable():
    assert parse_id_rider("<html></html>") is None
    assert parse_id_rider("") is None
    assert parse_id_rider(None) is None


# ------------------------ Liste des activités ------------------------


def test_liste_cinq_vols(activities_html):
    result = parse_activities_response(activities_html, "PiloteTest")
    flights = result["flights"]
    assert [f["num_activite"] for f in flights] == ["3766574", "3761544", "3761463", "3761259", "3763839"]
    assert result["activity_ids"] == ["4048184", "4042582", "4042475", "4042241", "4045108"]
    assert result["end_of_list"] is False
    assert all(f["pilote"] == "PiloteTest" for f in flights)


def test_liste_vol_syride_valeurs(activities_html):
    first = parse_activities_response(activities_html, "PiloteTest")["flights"][0]
    assert first["id_activite"] == "4048184"
    assert first["is_syride"] is True
    assert first["types"] == "Vol moteur"
    assert first["site"] == "SiteTest1"
    assert first["date"] == "07/11/2026"
    assert first["heure"] == "11h12"
    assert first["voile"] == "Daytona"
    assert first["instrument"] == "Evolution"
    assert first["altitude_max"] == "629"
    assert first["nom_vol"] == "07-11-2026"
    assert first["date_publication"] == "07/11/2026 - 12h19"


def test_liste_jetons(activities_html):
    flights = parse_activities_response(activities_html, "PiloteTest")["flights"]
    for flight in flights[:4]:
        token = flight["flight_token"]
        assert token["expires"] == 1795263521
        assert isinstance(token["expires"], int)
        assert re.fullmatch(r"x{64}", token["token"])


def test_liste_vol_non_syride_sans_jeton(activities_html):
    last = parse_activities_response(activities_html, "PiloteTest")["flights"][4]
    assert last["is_syride"] is False
    assert last["flight_token"] is None
    assert last["num_activite"] == "3763839"
    assert last["nom_vol"] == "VolTest1"
    assert last["date_publication"] == "03/11/2026 - 17h08"


def test_liste_fin_de_liste_et_activite_non_vol(activities_html):
    non_vol = (
        "<div id='activite4999999' class=\"boxno\"><div class=\"dateActivite\">Publié le "
        "<font>01/01/2026 - 10h00</font></div>Une photo publiée</div>"
    )
    html = activities_html + non_vol + "<!-- syride-no-more-activity -->"
    result = parse_activities_response(html, "PiloteTest")
    assert result["end_of_list"] is True
    assert len(result["flights"]) == 5                      # l'activité non-vol est ignorée
    assert result["activity_ids"][-1] == "4999999"          # mais son id sert à la pagination


def test_liste_activite_non_vol_sans_message(activities_html, capsys):
    non_vol = "<div id='activite4999999' class=\"boxno\">Une photo</div>"
    parse_activities_response(activities_html + non_vol, "PiloteTest")
    out = capsys.readouterr().out
    assert "pas un vol" not in out
    assert "Traceback" not in out


def test_liste_fin_seule_sans_activite():
    result = parse_activities_response("<!-- syride-no-more-activity -->", "PiloteTest")
    assert result == {"flights": [], "end_of_list": True, "activity_ids": []}


@pytest.mark.parametrize("html", ["", "   ", "<html><body>Erreur</body></html>", None])
def test_liste_vide_leve_value_error(html):
    with pytest.raises(ValueError):
        parse_activities_response(html, "PiloteTest")


# ------------------------ Fiches ------------------------


def test_fiche_recente(sheet_recent):
    sheet, links, track = parse_flight_sheet_full(sheet_recent)
    assert sheet["plafond"] == "629"
    assert sheet["gain"] == "570"            # valeur affichée, pas le calcul des points synthétiques
    assert sheet["vario_max"] == "2.5"
    assert sheet["vario_min"] == "-3.5"
    assert sheet["vitesse_max"] == "61"
    assert sheet["vitesse_moyenne"] == "34.5"
    assert sheet["distance_activite"] == "38"
    assert sheet["distance_cumulee"] == "42"
    assert sheet["g_max"] == "1.4"
    assert sheet["duree_vol"] == "01:06:00"
    assert sheet["site_activite"] == "SiteTest1"
    assert sheet["date_activite"] == "07/11/2026"
    assert set(links) == {"gpx", "igc", "kml"}
    assert all(links[k] and f"type={k}" in links[k] and "idSession=3766574" in links[k] for k in links)
    assert sheet["adresse_zip"] == links["gpx"]
    assert track is not None and len(track["points"]) == len(track["times"]) == 200


def test_fiche_ancienne(sheet_old):
    sheet, links, track = parse_flight_sheet_full(sheet_old)
    assert sheet["plafond"] == "615"
    assert sheet["gain"] == "483"
    assert sheet["vario_max"] == "3.6"
    assert sheet["vario_min"] == "-2.9"
    assert sheet["vitesse_max"] == "65"
    assert sheet["vitesse_moyenne"] == "21.8"
    assert sheet["distance_activite"] == "8"
    assert sheet["distance_cumulee"] == "14"
    assert sheet["g_max"] == "1.3"
    assert sheet["duree_vol"] == "00:22:00"
    assert sheet["site_activite"] == "SiteTest1"
    assert sheet["date_activite"] == "27/12/2022"
    assert all(links[k] and f"idSession=1941511" in links[k] for k in ("gpx", "igc", "kml"))
    assert track is not None


def test_fiche_champs_attendus(sheet_recent):
    sheet, _, _ = parse_flight_sheet_full(sheet_recent)
    for field in FLIGHT_SHEET_FIELDS:
        assert field in sheet
    assert "vario_min" in sheet


def test_gain_calcule_en_repli(sheet_recent):
    # Sans la ligne « Gain » affichée, le calcul depuis fv-config prend le relais
    # (41 sur cette fixture dont les points sont synthétiques).
    without_gain = re.sub(r"<div><dt>Gain :</dt><dd>[^<]*</dd></div>", "", sheet_recent)
    assert without_gain != sheet_recent
    sheet, _, _ = parse_flight_sheet_full(without_gain)
    assert sheet["gain"] == "41"


def test_adaptateur_parse_flight_sheet(sheet_recent):
    sheet, links = parse_flight_sheet(sheet_recent)
    full_sheet, full_links, _ = parse_flight_sheet_full(sheet_recent)
    assert sheet == full_sheet
    assert links == full_links
    assert links["gpx"] and links["igc"]


def test_ancienne_fiche_volTexte_toujours_lue():
    html = """
    <html><body>
      <div class="volTexte">Date : 12/05/2021</div>
      <div class="volTexte">Décollage : SiteAncien (France)</div>
      <div class="volTexte">Distance : 12 km</div>
      <div class="volTexte">Vitesse max : 55 km/h</div>
      <div class="volTexte">Plafond : 1234 m</div>
      <div class="volTexte">Gain : 450 m</div>
      <div class="volTexte">Temps de vol : 01:10:05</div>
      <div class="volTexte">Vario max : 3.2 m/s</div>
      <div class="volTexte">G max : 1.5 g</div>
      <a href="/scripts/downloadFlightFile.php?idSession=5&type=gpx&key=a">GPX</a>
      <a href="/scripts/downloadFlightFile.php?idSession=5&type=igc&key=a">IGC</a>
    </body></html>
    """
    sheet, links, track = parse_flight_sheet_full(html)
    assert track is None
    assert sheet["date_activite"] == "12/05/2021"
    assert sheet["site_activite"] == "SiteAncien"
    assert sheet["plafond"] == "1234"
    assert sheet["gain"] == "450"
    assert sheet["vario_max"] == "3.2"
    assert sheet["vario_min"] is None
    assert sheet["duree_vol"] == "01:10:05"
    assert links["gpx"].endswith("type=gpx&key=a") and links["igc"] and links["kml"] is None
    # même résultat par l'adaptateur historique
    old_sheet, old_links = parse_flight_sheet(html)
    assert old_sheet == sheet and old_links == links


# ------------------------ fv-config ------------------------


def test_fv_config_nominal(sheet_recent):
    track = parse_fv_config(sheet_recent)
    for key in ("points", "times", "terrain", "extrema", "offset", "distance", "units"):
        assert key in track
    assert track["offset"] == 3600
    assert track["units"] == ["m", "km/h"]
    assert len(track["extrema"]) == 4
    assert track["points"][0][:3] == [51.187475, -5.245315, 61]


def test_fv_config_retire_token_et_url3d(sheet_recent):
    track = parse_fv_config(sheet_recent)
    assert "token" not in track and "url3d" not in track
    assert "key=" not in json.dumps(track)


def test_fv_config_retire_toute_url_signee():
    config = _config()
    config["autre"] = "/download.php?idSession=1&expires=12&key=abcdef"
    track = parse_fv_config(_with_config(config))
    assert "autre" not in track
    assert "points" in track


def test_fv_config_absent():
    assert parse_fv_config("<html><body>rien</body></html>") is None
    assert parse_fv_config("") is None


def test_fv_config_json_invalide(capsys):
    html = '<script type="application/json" id="fv-config">{pas du json</script>'
    assert parse_fv_config(html) is None
    assert capsys.readouterr().out.strip()   # un message court


def test_fv_config_tailles_differentes(capsys):
    config = _config()
    config["times"] = config["times"][:-1]
    assert parse_fv_config(_with_config(config)) is None
    assert capsys.readouterr().out.strip()


def test_fv_config_temps_decroissants(capsys):
    config = _config()
    config["times"][3], config["times"][4] = config["times"][4], config["times"][3]
    assert parse_fv_config(_with_config(config)) is None
    assert "croissants" in capsys.readouterr().out


def test_fv_config_coordonnees_hors_limites():
    for lat, lon in ((91, 0), (-91, 0), (0, 181), (0, -181)):
        config = _config()
        config["points"][2][0], config["points"][2][1] = lat, lon
        assert parse_fv_config(_with_config(config)) is None, (lat, lon)


def test_fv_config_points_vides_ou_mal_formes():
    config = _config()
    config["points"], config["times"] = [], []
    assert parse_fv_config(_with_config(config)) is None
    config = _config()
    config["points"][1] = "n'importe quoi"
    assert parse_fv_config(_with_config(config)) is None
    config = _config()
    del config["times"]
    assert parse_fv_config(_with_config(config)) is None


def test_fv_config_ne_modifie_pas_la_source():
    config = _config()
    original = copy.deepcopy(config)
    parse_fv_config(_with_config(config))
    assert config == original


# ------------------------ Turnstile ------------------------


def test_turnstile_visible():
    assert is_turnstile_gate('<div id="flightTurnstileGate"><div class="cf-turnstile"></div></div>')
    assert is_turnstile_gate('<main><div class="cf-turnstile" data-sitekey="x"></div></main>')
    assert is_turnstile_gate('<div id="flightTurnstileGate">Vérification</div>')


def test_turnstile_texte_brut():
    assert is_turnstile_gate("flightTurnstileGate")
    assert is_turnstile_gate("Un défi Turnstile est affiché")


def test_turnstile_absent():
    assert not is_turnstile_gate("")
    assert not is_turnstile_gate(None)
    assert not is_turnstile_gate("<html><body><p>Fiche de vol</p></body></html>")


def test_turnstile_script_ou_element_cache_ignore():
    # Simple chargement du script : pas de défi à valider
    assert not is_turnstile_gate(
        '<html><head><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></head>'
        "<body><p>Fiche</p></body></html>"
    )
    # Conteneur caché
    assert not is_turnstile_gate('<div id="flightTurnstileGate" hidden><div class="cf-turnstile"></div></div>')
    assert not is_turnstile_gate('<div style="display: none"><div class="cf-turnstile"></div></div>')


# ------------------------ normalize_missing ------------------------


@pytest.mark.parametrize("value", [None, "None", "", "nan", "  ", " None ", "NaN", float("nan")])
def test_normalize_missing_vaut_none(value):
    assert normalize_missing(value) is None


def test_normalize_missing_conserve_le_reste():
    assert normalize_missing("  Daytona ") == "Daytona"
    assert normalize_missing("0") == "0"
    assert normalize_missing(0) == 0
    assert normalize_missing(12.5) == 12.5
    assert normalize_missing(False) is False
    assert normalize_missing(["a"]) == ["a"]
