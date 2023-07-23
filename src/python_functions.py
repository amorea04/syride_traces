"""
Fonctions utilisées dans le scraping de syride.
"""

# ------------------------ Imports -----------------------

import zipfile
import os
import time
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys

# ------------------------ Functions -----------------------


def scroll_to_bottom(driver: webdriver, nb_scroll: int = 20):
    """
    Faire défiler la page jusqu'en bas.
    """

    # Utiliser la touche End pour faire défiler jusqu'en bas
    print("Scrolling...")
    for i in range(nb_scroll):
        print(f"{i+1} ", end="", flush=True)
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.END)
        time.sleep(1)  # Attendre pour permettre le chargement du contenu
    print("")


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
    driver = webdriver.Chrome(options=chrome_options)

    url = base_url + pilote
    driver.get(url)

    # Faire défiler jusqu'en bas de la page
    scroll_to_bottom(driver)

    images_igcfiles = driver.find_elements(
        By.XPATH, "//img[contains(@src, 'igcfiles')]"
    )

    list_img_names = []
    # Afficher les images contenant "igcfiles"
    for image in images_igcfiles:
        src = image.get_attribute("src")
        list_img_names.append(src)

    # Fermer le navigateur Selenium
    driver.quit()

    resultats = []

    # Parcours chaque URL et récupère le nom du fichier sans extension
    for img_name in list_img_names:
        nom_fichier = get_filename_without_extension(img_name)
        resultats.append(nom_fichier)

    final_list = list(set(resultats) - set(known_traces))
    print(f"{len(final_list)} nouvelles traces trouvées.")

    return final_list


def get_zip_adresses(
    pilote: str, trace: str, base_url: str = "https://www.syride.com/fr/pilotes/"
) -> str:
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

    # Fermer le navigateur Selenium
    driver.quit()

    return liens_download_zip[0]


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

    new_navs = get_all_navs(pilote=pilot, known_traces=list_of_known_traces)

    if len(new_navs) > 0:
        print(f"Réupération des liens (total {len(new_navs)})...")
        dict_links = {}
        for i, nav in enumerate(new_navs):
            print(f"{i+1} ", end="", flush=True)
            dict_links[nav] = get_zip_adresses(pilote=pilot, trace=nav)

        print("")
        print(f"Téléchargement des traces (total {len(dict_links)})...")
        for i, dict_item in enumerate(dict_links.items()):
            nav = dict_item[0]
            link = dict_item[1]
            print(f"{i+1} ", end="", flush=True)
            download_traces(main_repertoire=repertoire_pilote, nav=nav, link=link)
    else:
        print("Pas de nouvelles traces a telecharger.")
