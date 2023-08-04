"""
Fonctions utilisées dans le scraping de syride.
"""

# ------------------------ Imports -----------------------

import zipfile
import os
import time
import requests
import json
import traceback
import sys
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webelement import WebElement
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
)

from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from selenium.common import exceptions as se_exceptions

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
        time.sleep(3)  # Attendre pour permettre le chargement du contenu
    print("")
    time.sleep(20)


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
    # Trouver l'index du premier "à" dans la chaîne
    index_de_a = text.find("à")

    # Trouver l'index de la première parenthèse ouvrante "(" après le premier "à"
    index_premiere_parenthese = text.find("(", index_de_a)

    # Extraire le texte entre le premier "à" et la première parenthèse
    texte_extrait = text[index_de_a + 1 : index_premiere_parenthese].strip()

    return texte_extrait


def extract_date_heure(date_h_data: str, date_hour: str) -> str:
    try:
        date_h_temp = date_h_data.split(":")[1]
        date_h = date_h_temp.split(" ")
    except:
        date_h = ["None", "None", "None", "None"]
    if date_hour == "date":
        return date_h[1]
    else:
        return date_h[3]


def extract_flight_data(data: list) -> str:
    def extract_flight_time(fl_time_data: str) -> str:
        try:
            fl_time_temp = fl_time_data.split(":")[1:]
            fl_time = fl_time_temp[0] + ":" + fl_time_temp[1] + ":" + fl_time_temp[2]
            fl_time = fl_time[1:-1]
        except:
            fl_time = "None"
        return fl_time

    def extract_voile(voile_data: str) -> str:
        try:
            voile_data_temp = voile_data.split(":")[1]
            index_premiere_parenthese = voile_data_temp.find("(")
            voile = voile_data_temp[1 : index_premiere_parenthese - 1]
        except:
            voile = "None"
        return voile

    def extract_distance(distance_data: str) -> str:
        try:
            distance_data_temp = distance_data.split(":")[1]
            distance = distance_data_temp[1:-2]
        except:
            distance = "None"
        return distance

    def extract_alt_max(altitude_data: str) -> str:
        try:
            altitude_data_temp = altitude_data.split(":")[1]
            altitude = altitude_data_temp[1:-1]
        except:
            altitude = "None"
        return altitude

    def extract_instrument(instrument_data: str) -> str:
        try:
            instrument_data_temp = instrument_data.split(":")[1]
            index_premiere_parenthese = instrument_data_temp.find("(")
            instrument = instrument_data_temp[1 : index_premiere_parenthese - 1]
        except:
            instrument = "None"
        return instrument

    date = extract_date_heure(date_h_data=data[1], date_hour="date")
    heure = extract_date_heure(date_h_data=data[1], date_hour="heure")
    flight_time = extract_flight_time(fl_time_data=data[2])
    voile = extract_voile(voile_data=data[3])
    distance = extract_distance(distance_data=data[4])
    # altitude = extract_alt_max(altitude_data=data[5])
    instrument = extract_instrument(instrument_data=data[6])

    return date, heure, flight_time, voile, distance, instrument


def get_nav_infos1(activity: WebElement, pilote: str):
    resultats = {}
    # Trouver la div avec la classe "dateActivite" à l'intérieur de l'activité
    # date_activite = activity.find_element(By.CLASS_NAME, "dateActivite").text

    # Trouver l'élément avec la classe "photoGps" à l'intérieur de l'activité
    try:
        photo_gps_element = activity.find_element(By.CLASS_NAME, "photoGps")
        photo_gps_url = get_filename_without_extension(
            photo_gps_element.get_attribute("src")
        )
        is_trace = True
    except se_exceptions:  # (NoSuchElementException, StaleElementReferenceException):
        print("", "\n", traceback.format_exc())
        photo_gps_url = "None"
        is_trace = False

    if is_trace is True:
        try:
            # Trouver l'élément dont l'id commence par "type" et est suivi de 7 chiffres à l'intérieur de l'activité
            typename = f"type{photo_gps_url}"
            # elements_type = activity.find_element(
            #    By.XPATH,
            #    f"//*[contains(@id, {typename})]",  # and string-length(@id)=11]"
            # ).text
            elements_type = activity.find_element(By.ID, typename).text
        except Exception:
            elements_type = "None"

        try:
            sitename = f"site{photo_gps_url}"
            # site_name = extract_site(
            #    activity.find_element(
            #        By.XPATH,
            #        f"//*[contains(@id, {sitename})]",  # and string-length(@id)=11]"
            #    ).text
            # )
            site_name = extract_site(activity.find_element(By.ID, sitename).text)
        except Exception:
            site_name = "None"

        ul_element = activity.find_elements(By.XPATH, ".//ul")
        liste_data = [element.text for element in ul_element]

        (
            date,
            heure,
            flight_time,
            voile,
            distance,
            instrument,
        ) = extract_flight_data(data=liste_data)

        # Parcourir les éléments "type" trouvés et récupérer leur texte
        # types = [element.text for element in elements_type]

        # # Ajouter les informations de l'activité au dict des résultats
        resultats["pilote"] = pilote
        resultats["num_activite"] = photo_gps_url
        resultats["types"] = elements_type
        resultats["site"] = site_name
        resultats["date"] = date
        resultats["heure"] = heure
        resultats["flight_time"] = flight_time
        resultats["voile"] = voile
        resultats["distance"] = distance
        resultats["instrument"] = instrument

        return photo_gps_url, resultats


def extract_flight_data2(flight_data: str):
    def extract_text_flight_data(text: str, ind_end: int, ind_start: int = 1):
        try:
            text_temp = text.split(":")[1]
            text = text_temp[ind_start:-ind_end]
        except Exception as excep:
            print(str(excep))
            text = "None"
        return text

    def extract_flight_site(text: str) -> str:
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

    date_act = extract_text_flight_data(text=flight_data[0], ind_end=1)
    site_deco = extract_flight_site(flight_data[1])
    distance = extract_text_flight_data(text=flight_data[7], ind_end=2)
    distance_cumulee = extract_text_flight_data(text=flight_data[8], ind_end=2)
    vitesse_max = extract_text_flight_data(text=flight_data[9], ind_end=4)
    vitesse_moyenne = extract_text_flight_data(text=flight_data[10], ind_end=4)
    plafond = extract_text_flight_data(text=flight_data[11], ind_end=1)
    gain = extract_text_flight_data(text=flight_data[12], ind_end=1)
    flight_duration = extract_flight_duration(fl_time_data=flight_data[13])
    vario_max = extract_text_flight_data(text=flight_data[14], ind_end=3)
    g_max = extract_text_flight_data(text=flight_data[15], ind_end=1)

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
    # service = Service(
    #     "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/chromedriver-mac-x64/chromedriver"
    # )
    # driver = webdriver.Chrome(service=service, options=chrome_options)
    driver = webdriver.Chrome(options=chrome_options)

    url = base_url + pilote
    dict_navs = {}

    driver.get(url)

    if len(known_traces) >= 50:
        nb_scroll = 1
    else:
        nb_scroll = 1
    # Faire défiler jusqu'en bas de la page
    scroll_to_bottom(driver, nb_scroll=nb_scroll)

    activities = driver.find_elements(
        By.XPATH, "//*[contains(@id, 'activite') and string-length(@id)=15]"
    )

    for activity in activities:
        try:
            num_activite, dict_activity = get_nav_infos1(
                activity=activity, pilote=pilote
            )
            dict_navs[f"{num_activite}"] = dict_activity
        except:
            pass

    dict_navs = {
        key: value for key, value in dict_navs.items() if key not in known_traces
    }

    final_list = list(set(dict_navs.keys()))

    print(f"{len(final_list)} nouvelles traces trouvées.")

    driver.quit()

    return final_list, dict_navs


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
    driver = webdriver.Chrome(options=chrome_options)

    # Charger la page
    url = base_url + pilote

    updated_dict_navs = {}
    for i, dict_nav in enumerate(traces.items()):
        trace = dict_nav[0]
        dict_nav = dict_nav[1]
        print(f"{i+1} ", end="", flush=True)
        url1 = url + "/" + trace

        driver.get(url1)

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
        flight_datas = [element.text for element in flight_datas_temp]

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
        # Spécifier le nom de fichier souhaité (dans cet exemple, nous utilisons '2181222.zip')
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
    with open(file_name, "w") as fp:
        json.dump(flight_data, fp)
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


def get_syride_traces(path: str, pilot: str):
    """
    docstring
    """

    repertoire_pilote = path + pilot
    list_of_known_traces = initiate_search(main_repertoire=repertoire_pilote)

    new_navs, dict_navs = get_all_navs(pilote=pilot, known_traces=list_of_known_traces)

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
            download_traces(main_repertoire=repertoire_pilote, nav=nav, link=link)
            save_flight_data(main_repertoire=repertoire_pilote, flight_data=data_nav)
    else:
        print("Pas de nouvelles traces a telecharger.")
