"""
Fichier de paramètres du projet.

Utilisé par : main.py, browser_session.py, create_global_pkl.py, fix_truncated_names.py, app.py
"""

import os

from dotenv import load_dotenv

load_dotenv()

# ------------------------ Chemins ------------------------

# Dossier racine : un sous-dossier par pilote, contenant traces/<numéro>/<numéro>.json|gpx|igc
main_path = "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/"

# pkl utilisé par l'application (en local, puis en ligne sur PythonAnywhere)
pkl_path = os.path.join(main_path, "global_flights_data.pkl")
pkl_path_online = "/home/amoreau/mysite/docs/global_flights_data.pkl"

# 1 = application déployée en ligne, 0 = en local
online = 0

# ------------------------ Pilotes ------------------------

# LISTE UNIQUE des pilotes : nom court -> (nom du dossier = pseudo Syride, à scraper ?)
#   - tous les pilotes de cette liste sont inclus dans le pkl ;
#   - seuls ceux marqués True sont scrapés par défaut (sinon : --pilots en ligne de commande).
# Pour ajouter un pilote : une ligne ici, c'est tout.
PILOTES = {
    "amo": ("AdrienM", True),
    "j2f": ("j2f", True),
    "thomas": ("Thomas16", True),
    "Philippe": ("Au_Phil_du_vent", False),
    "David": ("DavidParatrucs79", True),
    "Alban": ("ToriVsUke", True),
    "florent": ("Florent_Essar", True),
    "lili": ("LiLi06", True),
    "yanis": ("yanis", True),
    "Rui": ("chami", True),
    "tof_torsac": ("Tof Torsac", True),
    "jean_jacques": ("JJvole", True),
    "jean_louis": ("jeanlouisksu", True),
    "jerome": ("Jerome A", False),
    "augry": ("AUGRY", False),
    "souille": ("Souille", False),
    "fabrice": ("fabrice_f", False),
    "remy": ("Rémydu24", False),
    "julien": ("Julien16", False),
    "Kams16": ("Kams16", False),
    "william": ("WIL24", False),
    "arp": ("air race pro", False),
    "nico": ("Nico16", False),
    # "francois_s": ("Fran&ccedil;ois%20S", False),
}

# Pilotes dont on télécharge aussi les fichiers Syride (sinon : trace lue dans la fiche).
# Valeurs possibles par pilote : ("gpx",) ou ("gpx", "igc") (le KML n'est pas téléchargé).
# La clé est le dossier du pilote. La fiche brute (trace complète `fv-config`) est enregistrée
# pour TOUS les pilotes ; un pilote absent d'ici n'a aucun téléchargement.
FICHIERS_PAR_PILOTE = {"AdrienM": ("gpx", "igc")}

# Dérivés (ne pas modifier : utilisés par main.py et create_global_pkl.py)
# Pilotes scrapés par défaut (nom du dossier)
pilots = [folder for folder, scrape in PILOTES.values() if scrape]
# Tous les pilotes connus {nom court: dossier} : le pkl est construit à partir de ceux-ci
dict_pilotes = {name: folder for name, (folder, _) in PILOTES.items()}

# Coordonnées de sites saisies à la main {site: (longitude, latitude)}, utilisées seulement
# pour les sites dont AUCUN vol n'a de fichier GPX/KML (les coordonnées des fichiers priment).
# Le nom doit correspondre à la colonne "site" du pkl (après uniformisation).
known_site_coordinates = {
    # "Idikel": (-0.1234, 43.5678),
}

# ------------------------ Identifiants Syride ------------------------

# Chargés depuis le fichier .env (SYRIDE_EMAIL, SYRIDE_PASSWORD) : ne jamais les écrire ici.
syride_email = os.getenv("SYRIDE_EMAIL", "")
syride_password = os.getenv("SYRIDE_PASSWORD", "")

# Plusieurs comptes Syride (ex. un compte parapente et un compte paramoteur).
# Dans .env :
#   SYRIDE_EMAIL=...            SYRIDE_PASSWORD=...          <- compte « default » (historique)
#   SYRIDE_ACCOUNTS=parapente,paramoteur                     <- noms des comptes supplémentaires
#   SYRIDE_EMAIL_PARAPENTE=...  SYRIDE_PASSWORD_PARAPENTE=...
#   SYRIDE_EMAIL_PARAMOTEUR=... SYRIDE_PASSWORD_PARAMOTEUR=...
# Utilisation : python main.py --accounts parapente | parapente,paramoteur | all
# {nom du compte: (email, mot de passe)}, dans l'ordre : default d'abord, puis la liste.
syride_accounts = {}
if syride_email:
    syride_accounts["default"] = (syride_email, syride_password)
for _name in [n.strip() for n in os.getenv("SYRIDE_ACCOUNTS", "").split(",") if n.strip()]:
    _suffix = _name.upper().replace("-", "_").replace(" ", "_")
    _email = os.getenv(f"SYRIDE_EMAIL_{_suffix}", "")
    if _email:
        syride_accounts[_name] = (_email, os.getenv(f"SYRIDE_PASSWORD_{_suffix}", ""))
