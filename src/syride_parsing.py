"""
Lecture (parsing) des pages Syride : fonctions PURES, sans Selenium ni réseau.

Elles prennent du texte ou du HTML et retournent des données : on peut donc les tester
directement sur des pages enregistrées.

  - page liste d'un pilote : extract_flight_data, get_nav_infos_bs
  - fiche de vol (iframe)  : extract_flight_data2, parse_flight_sheet
  - messages de limite     : detect_limit (fiches), detect_download_limit (téléchargements)
"""

import json
import re
import traceback
from urllib.parse import urljoin

from bs4 import BeautifulSoup

# Messages affichés par Syride dans la fiche quand une limite est atteinte
RATE_LIMIT_MARKER = "trop de fiches de vol"   # limite « par minute » : attendre puis reprendre
DAILY_LIMIT_MARKER = "limite quotidienne"     # limite quotidienne : inutile de réessayer aujourd'hui

# Message affiché par Syride à la place du fichier quand le TÉLÉCHARGEMENT est limité
# (page blanche avec un simple texte, ex. « DOWNLOAD LIMIT REACHED »). Toute limite de
# téléchargement est traitée pareil : inutile d'insister, on se contente de compléter les
# JSON avec les fiches. Autre formulation : l'ajouter ici (minuscules, « contient »).
DOWNLOAD_LIMIT_MARKERS = ("download limit", "limite de téléchargement", "limite de telechargement")

# Champs ajoutés à chaque vol à partir de la fiche de vol
FLIGHT_SHEET_FIELDS = [
    "date_activite", "site_activite", "distance_activite", "distance_cumulee",
    "vitesse_max", "vitesse_moyenne", "plafond", "gain", "duree_vol",
    "vario_max", "g_max", "adresse_zip",
]


def detect_limit(text: str):
    """
    Repère le message de limite de Syride dans un texte.
    Retourne "daily" (limite quotidienne), "rate" (trop de fiches consultées) ou None.
    """
    lowered = (text or "").lower()
    if DAILY_LIMIT_MARKER in lowered:
        return "daily"
    if RATE_LIMIT_MARKER in lowered:
        return "rate"
    return None


def detect_download_limit(text: str) -> bool:
    """
    Vrai si le texte d'une page est un message de limite de TÉLÉCHARGEMENT de Syride.
    Seul un texte COURT est examiné (les messages de limite sont de simples phrases), pour
    ne pas confondre avec une vraie page de contenu.
    """
    lowered = (text or "").strip().lower()
    if not lowered or len(lowered) > 300:
        return False
    return any(marker in lowered for marker in DOWNLOAD_LIMIT_MARKERS)


# ------------------------ Page liste d'un pilote ------------------------


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


# ------------------------ Fiche de vol (iframe) ------------------------


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


# ------------------------ Fiche de vol : nouvelle mise en page (fv-) ------------------------
#
# Depuis novembre 2026, la fiche (iframe ficheVol.php) n'a plus d'éléments .volTexte :
#   - bandeau .fv-metrics : <div class="fv-metric"><span class="fv-metric-label">Plafond</span>
#                           <strong>629 m</strong></div>   (Distance, Temps de vol, Plafond,
#                           Vario max, Vario min.)
#   - onglet « Le vol »    : <dl class="fv-info"><div><dt>Vitesse max :</dt><dd>61 km/h</dd></div>
#                           (Décollage, Voile, Instrument, Distance cumulée, Vitesse moyenne,
#                           Vitesse max, G max) — certaines lignes peuvent être absentes
#   - <time datetime="2026-11-07T11:12"> : date du vol
#   - <script id="fv-config" type="application/json"> : points de la trace
#     [lat, lon, altitude, vitesse, vario, g, ...] ; sert à recalculer le « Gain »,
#     qui n'est plus affiché (gain = altitude max - altitude au décollage).

# Libellé affiché (minuscules, sans « : ») -> champ du JSON
_NEW_SHEET_LABELS = {
    "distance": "distance_activite",
    "temps de vol": "duree_vol",
    "plafond": "plafond",
    "vario max": "vario_max",
    "distance cumulée": "distance_cumulee",
    "vitesse moyenne": "vitesse_moyenne",
    "vitesse max": "vitesse_max",
    "g max": "g_max",
}
# Champs convertis en entier par analyze_functions (astype(int)) : on arrondit ici
_INT_SHEET_FIELDS = ("distance_activite", "distance_cumulee", "vitesse_max", "plafond", "gain")


def is_new_flight_sheet(soup: BeautifulSoup) -> bool:
    """Vrai si la fiche utilise la nouvelle mise en page (fv-metrics / fv-info / fv-config)."""
    return bool(
        soup.find(class_="fv-metrics") or soup.find("dl", class_="fv-info") or soup.find(id="fv-config")
    )


def _first_number(text):
    """« 34.5 km/h » -> « 34.5 » ; « -3,5 m/s » -> « -3.5 » ; rien -> None."""
    if text is None:
        return None
    cleaned = re.sub(r"(?<=\d)[\s  ](?=\d)", "", str(text))  # « 1 234 m »
    match = re.search(r"-?\d+(?:[.,]\d+)?", cleaned)
    return match.group(0).replace(",", ".") if match else None


def _duration_to_hms(text):
    """« 1 h 6 min » / « 45 min » / « 2 h » / « 1h 06min 12s » -> « 01:06:00 » (format du pkl)."""
    if not text:
        return None
    if re.fullmatch(r"\s*\d{1,2}:\d{2}(:\d{2})?\s*", text):
        return text.strip()
    hours = re.search(r"(\d+)\s*h", text)
    minutes = re.search(r"(\d+)\s*min", text)
    seconds = re.search(r"(\d+)\s*s\b", text)
    if not (hours or minutes or seconds):
        return None
    h = int(hours.group(1)) if hours else 0
    m = int(minutes.group(1)) if minutes else 0
    s = int(seconds.group(1)) if seconds else 0
    return f"{h:02d}:{m:02d}:{s:02d}"


def _gain_from_config(soup: BeautifulSoup):
    """Gain d'altitude = altitude max - altitude du premier point (JSON fv-config)."""
    tag = soup.find("script", id="fv-config")
    if tag is None or not tag.string:
        return None
    try:
        points = json.loads(tag.string).get("points") or []
        altitudes = [p[2] for p in points if isinstance(p, (list, tuple)) and len(p) > 2 and p[2] is not None]
        if not altitudes:
            return None
        return str(int(round(max(altitudes) - altitudes[0])))
    except Exception:
        print("", "\n", traceback.format_exc())
        return None


def parse_new_flight_sheet(soup: BeautifulSoup) -> dict:
    """Statistiques d'une fiche « fv- » (sans les liens), aux formats attendus par le pipeline."""
    raw = {}

    # Bandeau de métriques
    for metric in soup.find_all(class_="fv-metric"):
        label = metric.find(class_="fv-metric-label")
        value = metric.find("strong")
        if label and value:
            raw.setdefault(label.get_text(strip=True).lower(), value.get_text(" ", strip=True))

    # Onglet « Le vol » (dl/dt/dd)
    for dl in soup.find_all("dl", class_="fv-info"):
        for dt in dl.find_all("dt"):
            dd = dt.find_next_sibling("dd")
            if dd is not None:
                label = dt.get_text(strip=True).rstrip(":").strip().lower()
                raw.setdefault(label, dd.get_text(" ", strip=True))

    sheet = {field: None for field in FLIGHT_SHEET_FIELDS if field != "adresse_zip"}
    for label, field in _NEW_SHEET_LABELS.items():
        if label not in raw:
            continue
        if field == "duree_vol":
            sheet[field] = _duration_to_hms(raw[label])
        else:
            sheet[field] = _first_number(raw[label])

    # Date : <time datetime="2026-11-07T11:12">, sinon le texte « 07/11/2026 · 11:12 »
    time_tag = soup.find("time")
    if time_tag is not None:
        iso = time_tag.get("datetime") or ""
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
        if m:
            sheet["date_activite"] = f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
        else:
            m = re.search(r"\d{2}/\d{2}/\d{4}", time_tag.get_text())
            sheet["date_activite"] = m.group(0) if m else None

    # Site de décollage
    takeoff = soup.find(attrs={"data-flight-value": "takeoff"})
    if takeoff is not None and takeoff.get_text(strip=True):
        sheet["site_activite"] = takeoff.get_text(" ", strip=True)
    elif "décollage" in raw:
        sheet["site_activite"] = raw["décollage"].split("(")[0].strip() or None

    sheet["gain"] = _gain_from_config(soup)

    for field in _INT_SHEET_FIELDS:
        if sheet.get(field) is not None:
            try:
                sheet[field] = str(int(round(float(sheet[field]))))
            except ValueError:
                sheet[field] = None
    return sheet


def parse_fv_config(html: str):
    """
    Trace de la fiche : contenu JSON de `<script id="fv-config">` (points, times, terrain,
    extrema, ...), ou None si le bloc est absent ou illisible. Aucune validation ici.
    """
    try:
        tag = BeautifulSoup(html, "html.parser").find("script", id="fv-config")
        if tag is None:
            return None
        config = json.loads(tag.string or tag.get_text())
    except Exception:
        return None
    return config if isinstance(config, dict) else None


def parse_flight_sheet(html: str):
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

    if is_new_flight_sheet(soup):
        # Fiche « fv- » (nouvelle mise en page Syride, novembre 2026)
        sheet = parse_new_flight_sheet(soup)
    else:
        # Ancienne fiche : éléments .volTexte « Libellé : valeur »
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
