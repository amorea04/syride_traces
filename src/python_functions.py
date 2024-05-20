"""
Fonctions utilisées dans le scraping de syride :
    - scroll_to_bottom
    - get_filename_without_extension
    - extract_site
    - extract_date_heure
    - extract_flight_data
    - extract_flight_data2
    - get_all_navs
    - get_nav_infos_bs
    - get_zip_adresses
    - download_traces
    - initiate_search
    - get_syride_traces
"""

# ------------------------ Imports -----------------------

import zipfile
import os
import time
import json
import traceback
import re
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service

# from selenium.webdriver.remote.webelement import WebElement

from bs4 import BeautifulSoup


from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
)

# ------------------------ Functions -----------------------


def scroll_to_bottom(driver: webdriver, nb_scroll: int = 40):
    """
    Faire défiler la page jusqu'en bas.
    """

    # Utiliser la touche End pour faire défiler jusqu'en bas
    print(f"Scrolling (total : {nb_scroll})...")
    for i in range(nb_scroll):
        print(f"{i+1} ", end="", flush=True)
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.END)
        time.sleep(2)  # Attendre pour permettre le chargement du contenu
    print("")
    time.sleep(30)


def get_filename_without_extension(url: str) -> str:
    """
    Focntion utilisée pour récupérer le nom de la trace
    """

    # Divise l'URL en parties séparées par "/"
    segments = url.split("/")
    # Récupère le dernier segment (nom du fichier)
    filename = segments[-1]
    # Divise le nom du fichier en parties séparées par "."
    filename_parts = filename.split(".")
    # Retourne le nom du fichier sans l'extension
    return filename_parts[0]


def extract_site(text: str) -> str:
    """
    Fonction permettant d'extraire le nom du site
    lorsqu'il est précédé de "à" et suivi de "("
    """
    # Trouver l'index du premier "à" dans la chaîne
    index_de_a = text.find("à")

    # Trouver l'index de la première parenthèse ouvrante "(" après le premier "à"
    index_premiere_parenthese = text.find("(", index_de_a)

    # Extraire le texte entre le premier "à" et la première parenthèse
    texte_extrait = text[index_de_a + 1 : index_premiere_parenthese].strip()

    return texte_extrait


def extract_date_heure(date_h_data: str) -> str:
    """
    Fonction permettant d'extraire la date et
    l'heure du vol
    """
    try:
        date_h_temp = date_h_data.split(":")[1]
        date_h = date_h_temp.split(" ")
    except Exception:
        print("", "\n", traceback.format_exc())
        date_h = ["None", "None", "None", "None"]

    date = date_h[1]

    try:
        heure = date_h[3]
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
            fl_time = fl_time_temp[0] + ":" + fl_time_temp[1] + ":" + fl_time_temp[2]
            fl_time = fl_time[1:-1]
        except Exception:
            print("", "\n", traceback.format_exc())
            fl_time = "None"
        return fl_time

    def extract_voile(voile_data: str) -> str:
        """
        Fonction permettant d'extraire la voile utilisée
        """
        try:
            voile_data_temp = voile_data.split(":")[1]
            index_premiere_parenthese = voile_data_temp.find("(")
            voile = voile_data_temp[1 : index_premiere_parenthese - 1]
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
        Fonction permettant d'extraire l'altitude maximale
        """
        try:
            altitude_data_temp = altitude_data.split(":")[1]
            altitude = altitude_data_temp[1:-1]
        except Exception:
            print("", "\n", traceback.format_exc())
            altitude = "None"
        return altitude

    def extract_instrument(instrument_data: str) -> str:
        """
        Fonction permettant d'extraire l'instrument utilisé
        """
        try:
            instrument_data_temp = instrument_data.split(":")[1]
            index_premiere_parenthese = instrument_data_temp.find("(")
            instrument = instrument_data_temp[1 : index_premiere_parenthese - 1]
        except Exception:
            print("", "\n", traceback.format_exc())
            instrument = "None"
        return instrument

    date = None
    heure = None
    flight_time = None
    voile = None
    distance = None
    # altitude = None
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
        elif item.startswith("Instrument utilisé :"):
            instrument = extract_instrument(instrument_data=item)

    return date, heure, flight_time, voile, distance, instrument


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
            # Trouver l'index du premier ":" puis 1ere parenthese dans la chaîne
            index_de_ponct = text.find(":")
            index_premiere_parenthese = text.find("(", index_de_ponct)
            # Extraire le texte entre le premier ":" et la première parenthèse
            texte_extrait = text[index_de_ponct + 1 : index_premiere_parenthese].strip()
        except Exception as excep:
            print(str(excep))
            texte_extrait = "None"
        return texte_extrait

    def extract_flight_duration(fl_time_data: str) -> str:
        try:
            fl_time_temp = fl_time_data.split(":")[1:]
            fl_time = fl_time_temp[0] + ":" + fl_time_temp[1] + ":" + fl_time_temp[2]
            fl_time = fl_time[1:-1]
        except Exception as excep:
            print(str(excep))
            fl_time = "None"
        return fl_time

    date_act = (None,)
    site_deco = (None,)
    distance = (None,)
    distance_cumulee = (None,)
    vitesse_max = (None,)
    vitesse_moyenne = (None,)
    plafond = (None,)
    gain = (None,)
    flight_duration = (None,)
    vario_max = (None,)
    g_max = (None,)

    for data in flight_data:
        if data.startswith("Date :"):
            date_act = data.split(":")[1].strip()
        elif data.startswith("Décollage :"):
            site_deco = extract_site(flight_data[1])
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
) -> list:
    """
    Fonction utilisée pour identifier toutes les traces disponibles.
    """

    # Configuration de Selenium
    chrome_options = Options()
    chrome_options.add_argument(
        "--headless"
    )  # Exécuter le navigateur en mode headless (sans interface graphique)
    webdriver_path = "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/chromedriver-mac-x64/chromedriver"
    chrome_service = Service(webdriver_path)
    driver = webdriver.Chrome(service=chrome_service, options=chrome_options)

    url = base_url + pilote
    dict_navs = {}

    driver.get(url)

    if scroll == -1:
        if len(known_traces) >= 1:
            nb_scroll = 3
        else:
            nb_scroll = 40
    else:
        nb_scroll = scroll

    # Faire défiler jusqu'en bas de la page
    driver.implicitly_wait(600)
    scroll_to_bottom(driver, nb_scroll=nb_scroll)

    page_content = driver.page_source
    soup = BeautifulSoup(page_content, "html.parser")
    driver.quit()

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

    # On supprime toutes les activités déjà téléchargées
    # et les activité qui ne sont pas un vol.
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
        # Trouver le numéro d'activité
        id_activity = get_activity_number(
            activity_id=activity.get("id"),
        )
    except Exception:
        print("", "\n", traceback.format_exc())
        id_activity = "None"

    # identifier s'il s'agit d'une trace syride ou non
    element = activity.find(class_="photoGps")
    if element is not None:
        is_syride = True
    else:
        is_syride = False

    # identifier le numero d'activite et le type de vol
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

    # identifier l'id du nom du site
    try:
        site_pattern = re.compile(r"^site\d{5,10}$")
        site_name_temp = activity.find(id=site_pattern)
    except Exception:
        print("", "\n", traceback.format_exc())
        site_name_temp = "None"

    # Récupérer les éléments de l'activté
    ul_elements = activity.find_all("ul")
    liste_data = [element.text for element in ul_elements]

    # Récupérer les éléments en fonction de is_syride
    if is_syride is True:
        if site_name_temp != "None":
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
            instrument,
        ) = extract_flight_data(data=liste_data)

    else:
        if site_name_temp != "None":
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
        ) = extract_flight_data(data=liste_data)
        heure = "None"
        distance = "None"
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
    resultats["instrument"] = instrument
    resultats["is_syride"] = is_syride

    return num_activite, resultats


def get_zip_adresses(
    pilote: str, traces: dict, base_url: str = "https://www.syride.com/fr/pilotes/"
) -> dict:
    """
    Récupère l'adresse du fichier ZIP
    """
    chrome_options = Options()
    chrome_options.add_argument(
        "--headless"
    )  # Exécuter le navigateur en mode headless (sans interface graphique)
    webdriver_path = "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/chromedriver-mac-x64/chromedriver"
    chrome_service = Service(webdriver_path)
    driver = webdriver.Chrome(service=chrome_service, options=chrome_options)
    # driver = webdriver.Chrome(options=chrome_options)

    # Charger la page
    url = base_url + pilote

    updated_dict_navs = {}
    for i, dict_nav in enumerate(traces.items()):
        trace = dict_nav[0]
        dict_nav = dict_nav[1]
        print(f"{i+1} ", end="", flush=True)

        if dict_nav["is_syride"] is True:
            url1 = url + "/" + trace

            driver.get(url1)

            try:
                iframe_selector = "popupIframe"
                iframe = driver.find_element(By.ID, iframe_selector)

                # Basculer vers l'iframe
                driver.switch_to.frame(iframe)

                liens_iframe = driver.find_elements(By.TAG_NAME, "a")
                liens_download_zip = [
                    lien.get_attribute("href")
                    for lien in liens_iframe
                    if "downloadZIP" in lien.get_attribute("href")
                ]

                flight_datas_temp = driver.find_elements(By.CLASS_NAME, "volTexte")
                # flight_datas = [element.text for element in flight_datas_temp]
                flight_datas = [
                    element.accessible_name for element in flight_datas_temp
                ]

                (
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
                ) = extract_flight_data2(flight_data=flight_datas)

                dict_nav["date_activite"] = date_act
                dict_nav["site_activite"] = site_deco
                dict_nav["distance_activite"] = distance
                dict_nav["distance_cumulee"] = distance_cumulee
                dict_nav["vitesse_max"] = vitesse_max
                dict_nav["vitesse_moyenne"] = vitesse_moyenne
                dict_nav["plafond"] = plafond
                dict_nav["gain"] = gain
                dict_nav["duree_vol"] = flight_duration
                dict_nav["vario_max"] = vario_max
                dict_nav["g_max"] = g_max
                dict_nav["adresse_zip"] = liens_download_zip[0]

                updated_dict_navs[trace] = dict_nav

                driver.switch_to.default_content()
            except (NoSuchElementException, StaleElementReferenceException, Exception):
                dict_nav["date_activite"] = None
                dict_nav["site_activite"] = None
                dict_nav["distance_activite"] = None
                dict_nav["distance_cumulee"] = None
                dict_nav["vitesse_max"] = None
                dict_nav["vitesse_moyenne"] = None
                dict_nav["plafond"] = None
                dict_nav["gain"] = None
                dict_nav["duree_vol"] = None
                dict_nav["vario_max"] = None
                dict_nav["g_max"] = None
                dict_nav["adresse_zip"] = None
                updated_dict_navs[trace] = dict_nav
                driver.switch_to.default_content()
        else:
            dict_nav["date_activite"] = None
            dict_nav["site_activite"] = None
            dict_nav["distance_activite"] = None
            dict_nav["distance_cumulee"] = None
            dict_nav["vitesse_max"] = None
            dict_nav["vitesse_moyenne"] = None
            dict_nav["plafond"] = None
            dict_nav["gain"] = None
            dict_nav["duree_vol"] = None
            dict_nav["vario_max"] = None
            dict_nav["g_max"] = None
            dict_nav["adresse_zip"] = None

            updated_dict_navs[trace] = dict_nav

    print("")

    # Fermer le navigateur Selenium
    driver.quit()

    return updated_dict_navs


def download_traces(main_repertoire: str, nav: str, link: str):
    """
    Fonction utilisée pour télécharger les traces.
    """

    repertoire_extraction = main_repertoire + "/traces"
    response = requests.get(link)

    if response.status_code == 200:
        # Spécifier le nom de fichier souhaité
        nom_fichier_zip = nav + ".zip"

        # Enregistrer le contenu téléchargé dans le fichier avec le nom spécifié
        with open(nom_fichier_zip, "wb") as f:
            f.write(response.content)
        # print(f"Téléchargement réussi. Fichier enregistré sous le nom : {nom_fichier_zip}")

        # Extraire le contenu de l'archive zip dans le dossier "traces"
        with zipfile.ZipFile(nom_fichier_zip, "r") as zip_ref:
            zip_ref.extractall(f"{repertoire_extraction}/{nav}")
        print(f"Archive extraite dans le répertoire : {nav}")

        # Supprimer le fichier zip après l'extraction (facultatif)
        os.remove(nom_fichier_zip)
        # print(f"Fichier zip supprimé : {nom_fichier_zip}")
    else:
        print(f"Échec du téléchargement. Code d'état : {response.status_code}")


def save_flight_data(main_repertoire: str, flight_data: dict):
    num_act = flight_data["num_activite"]
    file_name = main_repertoire + "/traces/" + f"{num_act}/" + f"{num_act}.json"
    with open(file_name, "w", encoding="utf-8") as fp:
        json.dump(
            flight_data,
            fp,
            ensure_ascii=False,
        )
    print(f"Données de vol {num_act} sauvegardées")


def initiate_search(main_repertoire: str):
    """
    Fonction used to create a specific folder for a pilot.
    If not exists, the function creates the initial folder,
    it then create the "traces" directtory and finally
    lists all traces already available in the directory.


    args:
    -----------
    * main_repertoire: str
        main path for the folder

    returns:
    -----------
    * folder_list: list
        list of all folder names contained in the
        "traces" directory.
    """

    if not os.path.exists(main_repertoire):
        os.makedirs(main_repertoire)

    repertoire_extraction = main_repertoire + "/traces"
    if not os.path.exists(repertoire_extraction):
        os.makedirs(repertoire_extraction)
        folder_list = []
        print("Dossiers créés, aucune traces déjà téléchargées")
    else:
        directory_path = repertoire_extraction + "/"
        folder_list = [
            f
            for f in os.listdir(directory_path)
            if os.path.isdir(os.path.join(directory_path, f))
        ]
        print(f"Dossiers trouvés, {len(folder_list)} trace(s) déjà téléchargée(s).")

    return folder_list


def get_syride_traces(path: str, pilot: str, scroll: int):
    """
    docstring
    """

    repertoire_pilote = path + pilot
    list_of_known_traces = initiate_search(main_repertoire=repertoire_pilote)

    new_navs, dict_navs = get_all_navs(
        pilote=pilot, known_traces=list_of_known_traces, scroll=scroll
    )

    if len(new_navs) > 0:
        print(f"Réupération des liens (total {len(new_navs)})...")
        updated_dict_navs = get_zip_adresses(pilote=pilot, traces=dict_navs)

        print("")
        print(f"Téléchargement des traces (total {len(updated_dict_navs)})...")
        for i, dict_item in enumerate(updated_dict_navs.items()):
            nav = dict_item[0]
            data_nav = dict_item[1]
            link = data_nav["adresse_zip"]
            print(f"{i+1} ", end="", flush=True)
            try:
                if data_nav["is_syride"] is True:
                    download_traces(
                        main_repertoire=repertoire_pilote, nav=nav, link=link
                    )
                else:
                    if not os.path.exists(f"{repertoire_pilote}/traces/{nav}"):
                        os.makedirs(f"{repertoire_pilote}/traces/{nav}")

                save_flight_data(
                    main_repertoire=repertoire_pilote, flight_data=data_nav
                )
            except Exception:
                print("", "\n", traceback.format_exc())
                print(f"Trace {nav} non sauvegardée")
                pass

    else:
        print("Pas de nouvelles traces a telecharger.")
