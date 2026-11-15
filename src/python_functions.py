"""
Fonctions utilisées dans le scraping de syride :
    - login_to_syride
    - scroll_to_bottom
    - get_filename_without_extension
    - extract_site
    - extract_date_heure
    - extract_flight_data
    - extract_flight_data2
    - get_all_navs
    - get_nav_infos_bs
    - read_flight_sheet
    - download_trace_via_browser
    - download_trace_with_retries
    - download_traces
    - save_flight_data
    - initiate_search

L'orchestration (driver unique, Cloudflare, boucle sur les pilotes)
se trouve dans browser_session.py.
"""

# ------------------------ Imports -----------------------

import zipfile
import os
import shutil
import time
import random
import json
import traceback
import re
import requests
from urllib.parse import urljoin
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup

from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)

# Variable globale pour stocker les cookies de session
_session_cookies = None


class RateLimitError(Exception):
    """Syride refuse d'afficher la fiche : trop de fiches consultées."""


class DailyLimitError(Exception):
    """Syride a atteint la limite quotidienne de fiches de vol (ex. 50 par jour)."""


class LinkExpiredError(Exception):
    """Le lien de téléchargement signé a expiré (page « EXPIRED »)."""


def login_to_syride(driver: webdriver):
    """
    Se connecter à Syride à l'aide des identifiants définis dans params_scrap_syride.
    """
    import params_scrap_syride as params
    email = getattr(params, "syride_email", "")
    password = getattr(params, "syride_password", "")

    if not email or not password:
        print("Information : Identifiants Syride non configurés (syride_email / syride_password). Connexion ignorée.")
        return

    try:
        print("Connexion à Syride...")
        driver.get("https://www.syride.com/fr/moncompte")
        time.sleep(2)

        # Fermer le bandeau de cookies s'il est affiché
        try:
            cookie_btn = driver.find_element(By.ID, "tarteaucitronAllDenied")
            cookie_btn.click()
            time.sleep(1)
        except Exception:
            pass

        login_elem = driver.find_element(By.ID, "login2")
        login_elem.click()
        login_elem.clear()
        login_elem.send_keys(email)

        password_elem = driver.find_element(By.ID, "password")
        password_elem.click()
        password_elem.clear()
        password_elem.send_keys(password)

        submit_btn = driver.find_element(By.XPATH, "//div[@class='bouton' and text()='Valider']")
        submit_btn.click()
        time.sleep(10)
        print("Requête de connexion envoyée.")
    except Exception as e:
        print(f"Erreur lors de la tentative de connexion à Syride : {e}")


# ------------------------ Cloudflare (usage interne) -----------------------


def _challenge_present(driver) -> bool:
    """
    Heuristique : titre de page typique d'un défi Cloudflare, ou présence
    de la variable JS _cf_chl_opt dans la page.
    """
    try:
        title = (driver.title or "").lower()
        if "just a moment" in title or "un instant" in title:
            return True
        return "_cf_chl_opt" in driver.page_source
    except Exception:
        return False


def _wait_if_challenge(driver, poll: float = 2.0) -> None:
    """Bloque tant qu'un défi Cloudflare est affiché dans la fenêtre."""
    if not _challenge_present(driver):
        return
    print("\n" + "!" * 60)
    print("Vérification Cloudflare détectée.")
    print("Valide-la dans la fenêtre Chrome : le script reprendra seul.")
    print("!" * 60, flush=True)
    while _challenge_present(driver):
        time.sleep(poll)
    time.sleep(2)
    print("Vérification validée, reprise.\n", flush=True)


# ------------------------ Functions -----------------------


def scroll_to_bottom(driver: webdriver, nb_scroll: int = 40):
    """
    Faire défiler la page jusqu'en bas.
    """
    print(f"Scrolling (total : {nb_scroll})...")
    for i in range(nb_scroll):
        print(f"{i+1} ", end="", flush=True)
        try:
            driver.find_element(By.TAG_NAME, "body").send_keys(Keys.END)
        except Exception:
            pass
        time.sleep(2)  # Attendre pour permettre le chargement du contenu
    print("")
    # Attente de 20 secondes pour permettre le chargement final des éléments
    time.sleep(20)


def get_filename_without_extension(url: str) -> str:
    """
    Fonction utilisée pour récupérer le nom de la trace
    """
    segments = url.split("/")
    filename = segments[-1]
    filename_parts = filename.split(".")
    return filename_parts[0]


def _value_before_parenthesis(item: str) -> str:
    """
    Extrait la valeur d'une ligne « Libellé : valeur (précision) ».
        'Voile utilisée : Daytona (ITV )'  ->  'Daytona'
        'Instrument utilisé : Nav XL'      ->  'Nav XL'   (sans parenthèse : valeur entière)
    Retourne "None" si la valeur est vide.
    (L'ancienne version coupait le dernier caractère quand il n'y avait pas de parenthèse :
    « Evolution » devenait « Evolutio ».)
    """
    value = item.split(":", 1)[1]
    if "(" in value:
        value = value[: value.index("(")]
    value = value.strip()
    return value if value else "None"


def extract_site(text: str) -> str:
    """
    Fonction permettant d'extraire le nom du site
    lorsqu'il est précédé de "à" et suivi de "("
    """
    index_de_a = text.find("à")
    if index_de_a == -1:
        index_premiere_parenthese = text.find("(")
        if index_premiere_parenthese == -1:
            return text.strip()
        return text[:index_premiere_parenthese].strip()

    index_premiere_parenthese = text.find("(", index_de_a)
    if index_premiere_parenthese == -1:
        return text[index_de_a + 1 :].strip()

    return text[index_de_a + 1 : index_premiere_parenthese].strip()


def extract_date_heure(date_h_data: str) -> str:
    """
    Fonction permettant d'extraire la date et l'heure du vol.
    Rendue robuste contre les IndexErrors.
    """
    try:
        date_h_temp = date_h_data.split(":")[1]
        date_h = date_h_temp.split(" ")
    except Exception:
        date_h = ["None", "None", "None", "None"]

    try:
        date = date_h[1] if len(date_h) > 1 else "None"
    except Exception:
        date = "None"

    try:
        heure = date_h[3] if len(date_h) > 3 else ""
    except Exception:
        heure = ""

    return date, heure


def extract_flight_data(data: list) -> str:
    """
    Fonction permettant d'extraire les données du vol
    """

    def extract_flight_time(fl_time_data: str) -> str:
        """
        Fonction permettant d'extraire la durée du vol
        """
        try:
            fl_time_temp = fl_time_data.split(":")[1:]
            if len(fl_time_temp) == 3:
                fl_time = fl_time_temp[0] + ":" + fl_time_temp[1] + ":" + fl_time_temp[2]
                fl_time = fl_time[1:-1]
            else:
                fl_time = fl_time_temp[0][1:]
        except Exception:
            print("", "\n", traceback.format_exc())
            fl_time = "None"
        return fl_time

    def extract_voile(voile_data: str) -> str:
        """
        Fonction permettant d'extraire la voile utilisée
        """
        try:
            voile = _value_before_parenthesis(voile_data)
        except Exception:
            print("", "\n", traceback.format_exc())
            voile = "None"
        return voile

    def extract_distance(distance_data: str) -> str:
        """
        Fonction permettant d'extraire la distance parcourue
        """
        try:
            distance_data_temp = distance_data.split(":")[1]
            distance = distance_data_temp[1:-2]
        except Exception:
            print("", "\n", traceback.format_exc())
            distance = "None"
        return distance

    def extract_alt_max(altitude_data: str) -> str:
        """
        Fonction permettant d'extraire l'altitude maximale (ex. « Altitude maximum : 629m »).
        Retourne le nombre sous forme de texte (« 629 »), ou "None" si illisible.
        """
        try:
            value = altitude_data.split(":", 1)[1]
            match = re.search(r"-?\d+(?:[.,]\d+)?", value)
            altitude = match.group(0).replace(",", ".") if match else "None"
        except Exception:
            print("", "\n", traceback.format_exc())
            altitude = "None"
        return altitude

    def extract_instrument(instrument_data: str) -> str:
        """
        Fonction permettant d'extraire l'instrument utilisé
        """
        try:
            instrument = _value_before_parenthesis(instrument_data)
        except Exception:
            print("", "\n", traceback.format_exc())
            instrument = "None"
        return instrument

    date = None
    heure = None
    flight_time = None
    voile = None
    distance = None
    altitude_max = None
    instrument = None

    for item in data:
        if item.startswith("Date :"):
            date, heure = extract_date_heure(date_h_data=item)
        elif item.startswith("Temps de vol :"):
            flight_time = extract_flight_time(fl_time_data=item)
        elif item.startswith("Voile utilisée :"):
            voile = extract_voile(voile_data=item)
        elif item.startswith("Distance parcourue :"):
            distance = extract_distance(distance_data=item)
        elif item.lstrip().startswith("Altitude maximum"):
            altitude_max = extract_alt_max(altitude_data=item.lstrip())
        elif item.startswith("Instrument utilisé :"):
            instrument = extract_instrument(instrument_data=item)

    return date, heure, flight_time, voile, distance, altitude_max, instrument


def extract_flight_data2(flight_data: str):
    def extract_text_flight_data(text: str, ind_end: int, ind_start: int = 1):
        try:
            text_temp = text.split(":")[1]
            text = text_temp[ind_start:-ind_end]
        except Exception as excep:
            print(str(excep))
            text = "None"
        return text

    def extract_site(text: str) -> str:
        try:
            index_de_ponct = text.find(":")
            index_premiere_parenthese = text.find("(", index_de_ponct)
            if index_premiere_parenthese == -1:
                index_premiere_parenthese = len(text)  # pas de parenthèse : valeur entière
            texte_extrait = text[index_de_ponct + 1 : index_premiere_parenthese].strip()
        except Exception as excep:
            print(str(excep))
            texte_extrait = "None"
        return texte_extrait

    def extract_flight_duration(fl_time_data: str) -> str:
        try:
            fl_time_temp = fl_time_data.split(":")[1:]
            if len(fl_time_temp) >= 3:
                fl_time = fl_time_temp[0] + ":" + fl_time_temp[1] + ":" + fl_time_temp[2]
                fl_time = fl_time.strip()
            elif len(fl_time_temp) == 1:
                fl_time = fl_time_temp[0].strip()
            else:
                fl_time = ":".join(fl_time_temp).strip()
        except Exception as excep:
            print(str(excep))
            fl_time = "None"
        return fl_time

    date_act = None
    site_deco = None
    distance = None
    distance_cumulee = None
    vitesse_max = None
    vitesse_moyenne = None
    plafond = None
    gain = None
    flight_duration = None
    vario_max = None
    g_max = None

    for data in flight_data:
        if data.startswith("Date :"):
            date_act = data.split(":")[1].strip()
        elif data.startswith("Décollage :"):
            site_deco = extract_site(data)
        elif data.startswith("Distance :"):
            distance = extract_text_flight_data(text=data, ind_end=2)
        elif data.startswith("Distance cumulée :"):
            distance_cumulee = extract_text_flight_data(text=data, ind_end=2)
        elif data.startswith("Vitesse max :"):
            vitesse_max = extract_text_flight_data(text=data, ind_end=4)
        elif data.startswith("Vitesse moyenne :"):
            vitesse_moyenne = extract_text_flight_data(text=data, ind_end=4)
        elif data.startswith("Plafond :"):
            plafond = extract_text_flight_data(text=data, ind_end=1)
        elif data.startswith("Gain :"):
            gain = extract_text_flight_data(text=data, ind_end=1)
        elif data.startswith("Temps de vol :"):
            flight_duration = extract_flight_duration(fl_time_data=data)
        elif data.startswith("Vario max :"):
            vario_max = extract_text_flight_data(text=data, ind_end=3)
        elif data.startswith("G max :"):
            g_max = extract_text_flight_data(text=data, ind_end=1)

    return (
        date_act,
        site_deco,
        distance,
        distance_cumulee,
        vitesse_max,
        vitesse_moyenne,
        plafond,
        gain,
        flight_duration,
        vario_max,
        g_max,
    )


def get_all_navs(
    pilote: str,
    known_traces: list,
    scroll: int,
    base_url: str = "https://www.syride.com/fr/pilotes/",
    driver: webdriver = None,
) -> list:
    """
    Fonction utilisée pour identifier toutes les traces disponibles.
    """
    local_driver = None
    try:
        if driver is None:
            # Configuration de Selenium si non fourni
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")

            # Bloquer les images et CSS pour optimiser la vitesse
            prefs = {
                "profile.managed_default_content_settings.images": 2,
                "profile.managed_default_content_settings.stylesheets": 2,
            }
            chrome_options.add_experimental_option("prefs", prefs)

            chrome_service = Service(ChromeDriverManager().install())
            local_driver = webdriver.Chrome(service=chrome_service, options=chrome_options)
            driver = local_driver
            login_to_syride(driver)

        url = base_url + pilote
        dict_navs = {}

        driver.get(url)

        if scroll == -1:
            if len(known_traces) >= 1:
                nb_scroll = 4
            else:
                nb_scroll = 40
        else:
            nb_scroll = scroll

        # Défilement
        driver.implicitly_wait(10)
        scroll_to_bottom(driver, nb_scroll=nb_scroll)

        page_content = driver.page_source
        soup = BeautifulSoup(page_content, "html.parser")

    finally:
        if local_driver is not None:
            local_driver.quit()

    id_pattern = re.compile(r"^activite\d{5,10}$")
    activities = soup.find_all(id=id_pattern)

    for activity in activities:
        try:
            num_activite, dict_activity = get_nav_infos_bs(
                activity=activity, pilote=pilote
            )
            dict_navs[f"{num_activite}"] = dict_activity
        except Exception:
            print("", "\n", traceback.format_exc())
            pass

    dict_navs = {
        key: value
        for key, value in dict_navs.items()
        if key not in known_traces and key != "None"
    }

    final_list = list(set(dict_navs.keys()))
    print(f"{len(final_list)} nouvelles traces trouvées.")

    return final_list, dict_navs


def get_nav_infos_bs(activity: BeautifulSoup, pilote: str):
    def get_activity_number(activity_id: str):
        id_activity = activity_id.replace("activite", "")
        return id_activity

    resultats = {}

    try:
        id_activity = get_activity_number(
            activity_id=activity.get("id"),
        )
    except Exception:
        print("", "\n", traceback.format_exc())
        id_activity = "None"

    element = activity.find(class_="photoGps")
    is_syride = element is not None

    try:
        type_pattern = re.compile(r"^type\d{5,10}$")
        elements_type_temp = activity.find(id=type_pattern)
        elements_type = elements_type_temp.text
        if "\n" in elements_type:
            elements_type = elements_type.replace("\n", "")
        if "\t" in elements_type:
            elements_type = elements_type.replace("\t", "")
        num_activite_temp = elements_type_temp.get("id")
        num_activite = num_activite_temp.replace("type", "")
    except Exception:
        print(f"activite{id_activity}: Ceci n'est pas un vol")
        print("", "\n", traceback.format_exc())
        elements_type = "None"
        num_activite = "None"

    try:
        site_pattern = re.compile(r"^site\d{5,10}$")
        site_name_temp = activity.find(id=site_pattern)
    except Exception:
        print("", "\n", traceback.format_exc())
        site_name_temp = "None"

    ul_elements = activity.find_all("ul")
    liste_data = [element.text for element in ul_elements]

    if is_syride is True:
        if site_name_temp != "None" and site_name_temp is not None:
            try:
                site_name = extract_site(text=site_name_temp.text)
            except Exception:
                print("", "\n", traceback.format_exc())
                site_name = "None"
        else:
            site_name = "None"

        (
            date,
            heure,
            flight_time,
            voile,
            distance,
            altitude_max,
            instrument,
        ) = extract_flight_data(data=liste_data)

    else:
        if site_name_temp != "None" and site_name_temp is not None:
            try:
                site_name = site_name_temp.text
            except Exception:
                print("", "\n", traceback.format_exc())
                site_name = "None"
        else:
            site_name = "None"

        (
            date,
            _,
            flight_time,
            voile,
            _,
            _,
            _,
        ) = extract_flight_data(data=liste_data)
        heure = "None"
        distance = "None"
        altitude_max = None
        instrument = "None"

    resultats["pilote"] = pilote
    resultats["id_activite"] = id_activity
    resultats["num_activite"] = num_activite
    resultats["types"] = elements_type
    resultats["site"] = site_name
    resultats["date"] = date
    resultats["heure"] = heure
    resultats["flight_time"] = flight_time
    resultats["voile"] = voile
    resultats["distance"] = distance
    # Altitude maximum affichée sur la page liste (conservée dans le JSON ; le pkl garde
    # le « plafond » issu de la fiche)
    resultats["altitude_max"] = altitude_max
    resultats["instrument"] = instrument
    resultats["is_syride"] = is_syride

    return num_activite, resultats


# Message affiché par Syride dans la fiche quand trop de fiches sont consultées
RATE_LIMIT_MARKER = "trop de fiches de vol"
# Message affiché quand la limite quotidienne est atteinte (à ne PAS réessayer aujourd'hui)
DAILY_LIMIT_MARKER = "limite quotidienne"

# Champs ajoutés à chaque vol à partir de la fiche de vol
FLIGHT_SHEET_FIELDS = [
    "date_activite", "site_activite", "distance_activite", "distance_cumulee",
    "vitesse_max", "vitesse_moyenne", "plafond", "gain", "duree_vol",
    "vario_max", "g_max", "adresse_zip",
]

_debug_saved = False


def _page_text(driver) -> str:
    """Texte visible de la page (ou de l'iframe courante). Chaîne vide si indisponible."""
    try:
        return driver.find_element(By.TAG_NAME, "body").text or ""
    except Exception:
        return ""


def _read_flight_iframe(driver, pilote: str, trace: str, base_url: str, timeout: int = 20) -> str:
    """
    Charge la page du vol (ex. .../pilotes/<pilote>/<trace>) puis lit le contenu de
    l'iframe #popupIframe DANS le contexte de la page (comme le fait un navigateur).
    Retourne le HTML de l'iframe.
    Lève RateLimitError si Syride affiche « Trop de fiches de vol consultées ».
    """
    driver.get(f"{base_url}{pilote}/{trace}")
    _wait_if_challenge(driver)
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.find_elements(By.ID, "popupIframe")
        )
        driver.switch_to.frame(driver.find_element(By.ID, "popupIframe"))
        try:
            # Attendre soit le contenu de la fiche, soit le message de limite de débit
            WebDriverWait(driver, timeout).until(
                lambda d: d.find_elements(By.CLASS_NAME, "volTexte")
                or RATE_LIMIT_MARKER in _page_text(d).lower()
                or DAILY_LIMIT_MARKER in _page_text(d).lower()
            )
        except TimeoutException:
            raise RuntimeError(
                f"contenu de la fiche introuvable (texte reçu : {_page_text(driver)[:150]!r})"
            )
        text_now = _page_text(driver).lower()
        if DAILY_LIMIT_MARKER in text_now:
            raise DailyLimitError(_page_text(driver)[:150])
        if RATE_LIMIT_MARKER in text_now:
            raise RateLimitError(_page_text(driver)[:150])
        return driver.page_source
    finally:
        driver.switch_to.default_content()


def _parse_flight_sheet(html: str):
    """
    Extrait les statistiques et les liens de téléchargement d'une fiche de vol.
    Retourne (sheet, links) :
        sheet : champs de FLIGHT_SHEET_FIELDS (adresse_zip = lien GPX, ou ZIP à défaut)
        links : {"gpx": url|None, "igc": url|None}
    """
    soup = BeautifulSoup(html, "html.parser")

    links = {"gpx": None, "igc": None}
    zip_link = None
    for a in soup.find_all("a"):
        href = a.get("href")
        if not href:
            continue
        full = urljoin("https://www.syride.com/", href)
        if "type=gpx" in href and links["gpx"] is None:
            links["gpx"] = full
        elif "type=igc" in href and links["igc"] is None:
            links["igc"] = full
        elif ("downloadZIP" in href or "type=zip" in href) and zip_link is None:
            zip_link = full

    flight_datas = [
        el.get_text().strip()
        for el in soup.find_all(class_="volTexte")
        if el and el.get_text().strip()
    ]

    (
        date_act, site_deco, distance, distance_cumulee, vitesse_max, vitesse_moyenne,
        plafond, gain, flight_duration, vario_max, g_max,
    ) = extract_flight_data2(flight_data=flight_datas)

    sheet = {
        "date_activite": date_act,
        "site_activite": site_deco,
        "distance_activite": distance,
        "distance_cumulee": distance_cumulee,
        "vitesse_max": vitesse_max,
        "vitesse_moyenne": vitesse_moyenne,
        "plafond": plafond,
        "gain": gain,
        "duree_vol": flight_duration,
        "vario_max": vario_max,
        "g_max": g_max,
    }
    # Nettoyage des espaces / tabulations / retours à la ligne résiduels
    for key, value in sheet.items():
        if isinstance(value, str):
            sheet[key] = value.strip()
    sheet["adresse_zip"] = links["gpx"] or zip_link
    return sheet, links


def read_flight_sheet(
    driver,
    pilote: str,
    trace: str,
    base_url: str = "https://www.syride.com/fr/pilotes/",
    rate_limit_waits=(120, 300, 600),
):
    """
    Lit la fiche d'UN vol et retourne (sheet, links, nb_limites_rencontrees) :
      - sheet : dict des champs de FLIGHT_SHEET_FIELDS (adresse_zip = lien GPX signé) ;
      - links : {"gpx": url|None, "igc": url|None}, liens signés à durée de vie courte
        (à utiliser tout de suite).

    Si Syride affiche « Trop de fiches de vol consultées », attend (rate_limit_waits, en
    secondes) puis réessaie. Si la limite persiste après toutes les attentes, lève
    RateLimitError. Si la limite QUOTIDIENNE est atteinte, lève DailyLimitError tout de suite.
    """
    global _debug_saved
    n_rate_limits = 0
    html = None

    for attempt in range(len(rate_limit_waits) + 1):
        try:
            html = _read_flight_iframe(driver, pilote, trace, base_url)
            break
        except RateLimitError:
            n_rate_limits += 1
            if attempt >= len(rate_limit_waits):
                raise
            wait = rate_limit_waits[attempt]
            print(
                f"\n[Trace {trace}] Limite Syride atteinte (« Trop de fiches de vol consultées »). "
                f"Pause de {wait // 60} min {wait % 60:02d} s avant nouvel essai "
                f"({attempt + 1}/{len(rate_limit_waits)})...",
                flush=True,
            )
            time.sleep(wait)

    sheet, links = _parse_flight_sheet(html)

    if sheet["adresse_zip"] is None:
        print(f"\n[Trace {trace}] Fiche lue mais aucun lien de téléchargement trouvé "
              f"({len(html)} caractères).", flush=True)
        if not _debug_saved:
            debug_path = f"_debug_iframe_{trace}.html"
            try:
                with open(debug_path, "w", encoding="utf-8") as fp:
                    fp.write(html)
                print(f"HTML sauvegardé dans {os.path.abspath(debug_path)}", flush=True)
            except Exception as e_dbg:
                print(f"Impossible de sauvegarder le HTML de debug : {e_dbg}")
            _debug_saved = True

    return sheet, links, n_rate_limits


def download_trace_via_browser(
    driver: webdriver, main_repertoire: str, nav: str, link: str, download_dir: str, timeout: int = 45,
    expected_ext: str = None,
):
    """
    Télécharge une trace en utilisant directement le navigateur Selenium (et non requests).
    Contrairement à un client HTTP scripté, le navigateur a la vraie empreinte, les vrais
    en-têtes et exécute le JS de la page : c'est la manière la plus fiable de contourner un
    éventuel blocage anti-bot, quel que soit son mécanisme exact (fréquence, fingerprint,
    jeton généré en JS, etc.).

    expected_ext : "gpx" ou "igc". Sert à nommer le fichier <nav>.<ext> si l'extension du
    fichier téléchargé n'est pas reconnue.
    """
    repertoire_extraction = main_repertoire + "/traces"
    os.makedirs(f"{repertoire_extraction}/{nav}", exist_ok=True)

    before_files = set(os.listdir(download_dir))

    driver.get(link)

    downloaded_file = None
    start = time.time()
    while time.time() - start < timeout:
        # Lien signé expiré : Syride affiche une page « EXPIRED » au lieu du fichier
        if _page_text(driver).strip().upper().startswith("EXPIRED"):
            raise LinkExpiredError(f"Lien de téléchargement expiré pour la trace {nav}.")
        current_files = set(os.listdir(download_dir)) - before_files
        finished = [
            f for f in current_files
            if not f.endswith(".crdownload") and not f.endswith(".tmp")
        ]
        if finished:
            time.sleep(0.5)  # petite marge pour que l'écriture du fichier soit bien terminée
            downloaded_file = finished[0]
            break
        time.sleep(1)

    if downloaded_file is None:
        raise TimeoutError(
            f"Le téléchargement navigateur de la trace {nav} n'a pas abouti dans le délai imparti ({timeout}s)."
        )

    src_path = os.path.join(download_dir, downloaded_file)

    # Vérifier qu'on n'a pas récupéré une page d'erreur HTML déguisée
    with open(src_path, "rb") as f:
        head = f.read(200).lower()
    if b"<html" in head or b"<!doctype html" in head:
        os.remove(src_path)
        raise ValueError(
            f"Réponse HTML reçue au lieu d'un fichier de trace pour {nav} (probable blocage/erreur)."
        )

    if downloaded_file.lower().endswith(".gpx"):
        dst_path = f"{repertoire_extraction}/{nav}/{nav}.gpx"
        shutil.move(src_path, dst_path)
        print(f"GPX enregistré (via navigateur) dans le répertoire : {nav}", flush=True)
    elif downloaded_file.lower().endswith(".igc"):
        dst_path = f"{repertoire_extraction}/{nav}/{nav}.igc"
        shutil.move(src_path, dst_path)
        print(f"IGC enregistré (via navigateur) dans le répertoire : {nav}", flush=True)
    elif downloaded_file.lower().endswith(".zip"):
        dst_zip = f"{repertoire_extraction}/{nav}/{nav}.zip"
        shutil.move(src_path, dst_zip)
        with zipfile.ZipFile(dst_zip, "r") as zip_ref:
            zip_ref.extractall(f"{repertoire_extraction}/{nav}")
        os.remove(dst_zip)
        print(f"Archive extraite (via navigateur) dans le répertoire : {nav}", flush=True)
    elif expected_ext in ("gpx", "igc"):
        # Extension non reconnue mais contenu non-HTML : on nomme selon le type demandé
        dst_path = f"{repertoire_extraction}/{nav}/{nav}.{expected_ext}"
        shutil.move(src_path, dst_path)
        print(f"Fichier '{downloaded_file}' enregistré en {nav}.{expected_ext}", flush=True)
    else:
        os.remove(src_path)
        raise ValueError(f"Type de fichier téléchargé inattendu pour la trace {nav} : {downloaded_file}")


def download_trace_with_retries(
    driver: webdriver,
    session: requests.Session,
    main_repertoire: str,
    nav: str,
    link: str,
    download_dir: str,
    max_retries: int = 3,
    on_failure=None,
) -> bool:
    """
    Tente le téléchargement via le navigateur (méthode principale, la plus fiable face à un
    blocage anti-bot). En cas d'échec répété, se rabat sur l'ancienne méthode requests,
    au cas où le problème serait ponctuel plutôt que structurel.

    on_failure : callback optionnel appelé après chaque échec du téléchargement navigateur
    (utilisé pour vérifier un défi Cloudflare et resynchroniser les cookies de la session).
    """
    for attempt in range(max_retries):
        try:
            download_trace_via_browser(
                driver=driver, main_repertoire=main_repertoire, nav=nav, link=link, download_dir=download_dir
            )
            return True
        except Exception as e:
            if on_failure is not None:
                try:
                    on_failure()
                except Exception as cb_exc:
                    print(f"\n[Trace {nav}] Erreur dans le callback on_failure : {cb_exc}", flush=True)
            sleep_time = 20 * (attempt + 1)
            if attempt < max_retries - 1:
                print(
                    f"\n[Trace {nav}] Échec du téléchargement via navigateur ({e}). "
                    f"Pause de {sleep_time}s avant tentative {attempt + 2}/{max_retries}...",
                    flush=True,
                )
                time.sleep(sleep_time)
            else:
                print(f"\n[Trace {nav}] Échec du téléchargement via navigateur après {max_retries} tentatives ({e}).", flush=True)

    print(f"[Trace {nav}] Tentative de secours via requests...", flush=True)
    try:
        download_traces(main_repertoire=main_repertoire, nav=nav, link=link, session=session)
        return True
    except Exception as e:
        print(f"[Trace {nav}] Échec définitif du téléchargement : {e}", flush=True)
        return False


def download_traces(main_repertoire: str, nav: str, link: str, session: requests.Session = None):
    """
    Fonction utilisée pour télécharger les traces (méthode requests, conservée comme solution
    de secours si le téléchargement via navigateur échoue).
    """
    repertoire_extraction = main_repertoire + "/traces"
    os.makedirs(f"{repertoire_extraction}/{nav}", exist_ok=True)

    if session is None:
        session = requests.Session()
        global _session_cookies
        if _session_cookies is not None:
            for cookie in _session_cookies:
                session.cookies.set(
                    cookie['name'],
                    cookie['value'],
                    domain=cookie.get('domain'),
                    path=cookie.get('path', '/')
                )
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })

    # Gérer le rate-limiting (status 429) et les erreurs de connexion temporaires avec retentatives
    response = None
    max_retries = 4
    for attempt in range(max_retries):
        try:
            response = session.get(link, timeout=30)
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    sleep_time = int(retry_after) + 5  # petite marge de sécurité
                else:
                    sleep_time = 60 * (attempt + 1)  # backoff plus long : 60s, 120s, 180s...

                if attempt < max_retries - 1:
                    print(f"\n[Trace {nav}] Rate limit (429) rencontré. Pause de {sleep_time} secondes avant tentative {attempt + 2}/{max_retries}...", flush=True)
                    time.sleep(sleep_time)
                else:
                    print(f"\n[Trace {nav}] Rate limit (429) persistant après {max_retries} tentatives.", flush=True)
            else:
                break
        except requests.exceptions.RequestException as e:
            sleep_time = 10 * (attempt + 1)
            if attempt < max_retries - 1:
                print(f"\n[Trace {nav}] Erreur de connexion ({e}). Pause de {sleep_time} secondes avant tentative {attempt + 2}/{max_retries}...", flush=True)
                time.sleep(sleep_time)
            else:
                print(f"\n[Trace {nav}] Erreur de connexion persistante ({e}) après {max_retries} tentatives.", flush=True)
                raise

    if response is not None and response.status_code == 200:
        # Vérification du type de contenu pour éviter les redirections HTML (ex: page d'erreur ou login)
        content_lower = response.content[:200].lower()
        if b"<html" in content_lower or b"<!doctype html" in content_lower:
            print(f"Échec du téléchargement pour la trace {nav} : la réponse contient du code HTML.", flush=True)
            raise ValueError("Réponse HTML reçue au lieu d'un fichier de trace.")

        if "type=gpx" in link:
            nom_fichier_gpx = f"{repertoire_extraction}/{nav}/{nav}.gpx"
            with open(nom_fichier_gpx, "wb") as f:
                f.write(response.content)
            print(f"GPX enregistré dans le répertoire : {nav}", flush=True)
        else:
            nom_fichier_zip = f"{repertoire_extraction}/{nav}/{nav}.zip"
            with open(nom_fichier_zip, "wb") as f:
                f.write(response.content)

            with zipfile.ZipFile(nom_fichier_zip, "r") as zip_ref:
                zip_ref.extractall(f"{repertoire_extraction}/{nav}")
            print(f"Archive extraite dans le répertoire : {nav}", flush=True)

            os.remove(nom_fichier_zip)
    else:
        status = response.status_code if response is not None else "Aucune réponse"
        print(f"Échec du téléchargement. Code d'état : {status}", flush=True)


def save_flight_data(main_repertoire: str, flight_data: dict):
    num_act = flight_data["num_activite"]
    os.makedirs(main_repertoire + "/traces/" + f"{num_act}", exist_ok=True)
    file_name = main_repertoire + "/traces/" + f"{num_act}/" + f"{num_act}.json"
    with open(file_name, "w", encoding="utf-8") as fp:
        json.dump(
            flight_data,
            fp,
            ensure_ascii=False,
        )
    print(f"Données de vol {num_act} sauvegardées", flush=True)


def initiate_search(main_repertoire: str):
    """
    Crée le dossier d'un pilote si besoin et retourne la liste des traces déjà présentes
    (dossiers numériques).

    Aucun dossier n'est supprimé : un vol dont le GPX manque garde ses informations
    (JSON) et sera complété plus tard. Seuls les dossiers totalement VIDES (reste d'un
    plantage) sont retirés, pour que la trace soit identifiée à nouveau.
    """
    if not os.path.exists(main_repertoire):
        os.makedirs(main_repertoire)

    repertoire_extraction = main_repertoire + "/traces"
    if not os.path.exists(repertoire_extraction):
        os.makedirs(repertoire_extraction)
        print("Dossiers créés, aucune traces déjà téléchargées")
        return []

    folder_list = []
    for f in os.listdir(repertoire_extraction):
        full_path = os.path.join(repertoire_extraction, f)
        if os.path.isdir(full_path) and f.isdigit():
            if not os.listdir(full_path):
                try:
                    os.rmdir(full_path)
                except OSError:
                    pass
                continue
            folder_list.append(f)

    print(f"Dossiers trouvés, {len(folder_list)} trace(s) déjà présente(s).")
    return folder_list
