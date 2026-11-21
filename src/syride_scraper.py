"""
Accès à Syride avec Selenium : connexion, page d'un pilote, fiche de vol, téléchargements.

Le parsing du HTML est dans syride_parsing.py ; l'enchaînement des étapes (3 phases,
Cloudflare, limites) est dans browser_session.py.

Points d'attention :
  - les liens de téléchargement (GPX / IGC) sont signés et expirent vite : à utiliser
    immédiatement après la lecture de la fiche ;
  - Syride limite le nombre de fiches consultées (par minute, puis par jour).
"""

import glob
import gzip
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime

from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from syride_parsing import (
    detect_download_limit,
    detect_limit,
    is_turnstile_gate,
    parse_activities_response,
    parse_flight_sheet_full,
    parse_id_rider,
)


class RateLimitError(Exception):
    """Syride refuse d'afficher la fiche : trop de fiches consultées (limite par minute)."""


class DailyLimitError(Exception):
    """Syride a atteint la limite quotidienne de fiches de vol (ex. 50 par jour)."""


class LinkExpiredError(Exception):
    """Le lien de téléchargement signé a expiré (page « EXPIRED »)."""


class DownloadLimitError(Exception):
    """
    Limite de TÉLÉCHARGEMENT (ex. « DOWNLOAD LIMIT REACHED ») : inutile de télécharger
    d'autres fichiers pour l'instant. Les fiches, elles, restent consultables.
    """


_debug_saved = False


# ------------------------ Cloudflare ------------------------


def is_cloudflare_challenge(driver) -> bool:
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


def wait_for_cloudflare(driver, poll: float = 2.0) -> None:
    """Bloque tant qu'un défi Cloudflare est affiché dans la fenêtre."""
    if not is_cloudflare_challenge(driver):
        return

    print("\n" + "!" * 60)
    print("Vérification Cloudflare détectée.")
    print("Valide-la dans la fenêtre Chrome : le script reprendra seul.")
    print("!" * 60, flush=True)

    waited = 0.0
    next_reminder = 60.0
    while is_cloudflare_challenge(driver):
        time.sleep(poll)
        waited += poll
        if waited >= next_reminder:
            print(f"  ... toujours en attente ({int(waited)} s)", flush=True)
            next_reminder += 60.0

    time.sleep(2)
    print("Vérification validée, reprise.\n", flush=True)


def _parent_has_turnstile_gate(driver) -> bool:
    """Vrai si la page PARENTE (hors iframe) affiche un défi Turnstile à valider."""
    try:
        driver.switch_to.default_content()
        return is_turnstile_gate(driver.page_source)
    except Exception:
        return False


def wait_for_turnstile(driver, poll: float = 2.0) -> None:
    """
    Bloque tant que la page du vol affiche un défi Turnstile : c'est à l'HUMAIN de le valider
    dans la fenêtre Chrome. Le code ne résout, ne contourne et ne simule jamais ce défi.
    """
    if not _parent_has_turnstile_gate(driver):
        return

    print("\n" + "!" * 60)
    print("Vérification Turnstile de Syride détectée sur la page du vol.")
    print("Valide-la dans la fenêtre Chrome : le script reprendra seul.")
    print("!" * 60, flush=True)

    waited = 0.0
    next_reminder = 60.0
    while _parent_has_turnstile_gate(driver):
        time.sleep(poll)
        waited += poll
        if waited >= next_reminder:
            print(f"  ... toujours en attente ({int(waited)} s)", flush=True)
            next_reminder += 60.0

    time.sleep(2)
    print("Vérification validée, reprise.\n", flush=True)


# ------------------------ Connexion et page d'un pilote ------------------------


def _login_form_visible(driver) -> bool:
    """Vrai si le formulaire de connexion (champ #login2) est affiché."""
    try:
        return any(e.is_displayed() for e in driver.find_elements(By.ID, "login2"))
    except Exception:
        return False


def login_to_syride(driver, email: str, password: str, timeout: int = 20) -> bool:
    """
    Se connecte à Syride avec les identifiants fournis (voir params_scrap_syride).

    Retourne True si la connexion est CONFIRMÉE (formulaire absent : déjà connecté grâce au
    profil Chrome, ou disparu après validation), False sinon.
    """
    if "moncompte" not in (driver.current_url or ""):
        driver.get("https://www.syride.com/fr/moncompte")
    driver.implicitly_wait(0)  # find_elements ne doit pas attendre si le formulaire est absent

    # Fermer le bandeau de cookies s'il est affiché
    for btn in driver.find_elements(By.ID, "tarteaucitronAllDenied"):
        try:
            if btn.is_displayed():
                btn.click()
                time.sleep(1)
        except Exception:
            pass

    if not _login_form_visible(driver):
        print("Déjà connecté à Syride (session du profil Chrome).")
        return True

    if not email or not password:
        print("Identifiants Syride non configurés (SYRIDE_EMAIL / SYRIDE_PASSWORD dans .env) "
              "et aucune session ouverte.")
        return False

    try:
        print("Connexion à Syride...")
        login_elem = driver.find_element(By.ID, "login2")
        login_elem.click()
        login_elem.clear()
        login_elem.send_keys(email)

        password_elem = driver.find_element(By.ID, "password")
        password_elem.click()
        password_elem.clear()
        password_elem.send_keys(password)

        driver.find_element(By.XPATH, "//div[@class='bouton' and text()='Valider']").click()
    except Exception as e:
        print(f"Erreur lors de la saisie des identifiants Syride : {e}")
        return False

    try:
        WebDriverWait(driver, timeout).until(lambda d: not _login_form_visible(d))
    except TimeoutException:
        print("Le formulaire de connexion est toujours affiché : identifiants refusés ?")
        return False
    print("Connexion à Syride confirmée.")
    return True


# ------------------------ Liste des vols d'un pilote (HTTP simple) ------------------------

SITE_URL = "https://www.syride.com/"
PILOT_BASE_URL = "https://www.syride.com/fr/pilotes/"
ACTIVITIES_URL = "https://www.syride.com/ajax/pilotes/activites.php"
GENERIC_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
LIST_LIMIT = 5000       # activités demandées d'un coup
LIST_PAGE_SIZE = 1000   # taille des pages de repli (beforeId)
LIST_MAX_PAGES = 50     # garde-fou de la pagination


class PilotPageError(Exception):
    """La page ou la liste du pilote ne contient aucune activité lisible (mise en page changée ?)."""


class HttpTransport:
    """
    Transport HTTP minimal (urllib, bibliothèque standard) pour la liste des vols : cette
    liste est publique mais exige un en-tête Referer (voir src/migration/SYRIDE_API.md).
    Aucun cookie, aucune information personnelle : un User-Agent générique.
    """

    def __init__(self, user_agent: str = GENERIC_USER_AGENT, timeout: float = 60):
        self.user_agent = user_agent
        self.timeout = timeout

    def get_text(self, url: str, referer: str) -> str:
        request = urllib.request.Request(url, headers={
            "Referer": referer,
            "User-Agent": self.user_agent,
            "Accept-Language": "fr",
            "Accept-Encoding": "gzip",
        })
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read()
                encoding = (response.headers.get("Content-Encoding") or "").lower()
                charset = response.headers.get_content_charset() or "utf-8"
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Erreur HTTP {e.code} pour {url}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Requête impossible pour {url} : {e.reason}") from e
        if encoding == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        return body.decode(charset, errors="replace")


def _save_debug_html(pilote: str, html: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", pilote)
    debug_path = os.path.abspath(f"_debug_pilot_page_{safe}.html")
    try:
        with open(debug_path, "w", encoding="utf-8") as fp:
            fp.write(html or "")
    except Exception:
        debug_path = "(enregistrement impossible)"
    return debug_path


def fetch_pilot_list(transport, pilote: str, id_rider=None):
    """
    Lit la liste complète des vols d'un pilote, sans navigateur.

    Retourne (html_brut, parsed) :
      - html_brut : les réponses de la liste concaténées (pour l'instantané `_raw`) ;
      - parsed    : sortie de parse_activities_response (flights dédoublonnés, activity_ids,
        end_of_list), plus `id_rider` (celui utilisé) et `complete` : vrai seulement si la
        dernière page reçue contient MOINS d'activités que la limite demandée. Le marqueur de
        fin de Syride n'est pas fiable : sans `complete`, aucun vol ne doit être marqué absent.

    `id_rider` absent : lu sur la page du pilote. Pagination de repli si la première réponse
    atteint la limite : `append=1&beforeId=<dernier id_activite>`, par pages de 1000, jusqu'à
    une page plus courte (garde-fou : 50 pages, `complete` reste alors faux).
    Lève PilotPageError (HTML enregistré pour diagnostic) si l'identifiant est introuvable ou
    si la réponse n'est pas lisible.
    """
    page_url = PILOT_BASE_URL + urllib.parse.quote(pilote, safe="")
    if id_rider is None:
        page = transport.get_text(page_url, referer=SITE_URL)
        id_rider = parse_id_rider(page)
        if id_rider is None:
            raise PilotPageError(
                f"idRider introuvable sur la page de {pilote} (mise en page de Syride changée ?). "
                f"HTML enregistré : {_save_debug_html(pilote, page)}"
            )

    base = f"{ACTIVITIES_URL}?limit={{limit}}&l=fr&idRider={id_rider}&apli=0"
    raw_parts, flights, activity_ids, seen = [], [], [], set()
    end_of_list = False
    complete = False
    limit = LIST_LIMIT
    url = base.format(limit=limit)

    for page_number in range(LIST_MAX_PAGES + 1):
        html = transport.get_text(url, referer=page_url)
        try:
            parsed = parse_activities_response(html, pilote)
        except ValueError as e:
            if page_number == 0:
                raise PilotPageError(f"{e} HTML enregistré : {_save_debug_html(pilote, html)}") from e
            raise PilotPageError(f"{e} (page {page_number + 1} de la liste)") from e
        raw_parts.append(html)
        activity_ids.extend(parsed["activity_ids"])
        end_of_list = parsed["end_of_list"]
        for flight in parsed["flights"]:
            num = str(flight.get("num_activite"))
            if num not in seen:
                seen.add(num)
                flights.append(flight)

        received = len(parsed["activity_ids"])
        if received < limit:
            complete = True
            break
        if end_of_list or page_number >= LIST_MAX_PAGES:
            break   # fin annoncée par le marqueur seul, ou garde-fou : liste jugée incomplète
        limit = LIST_PAGE_SIZE
        url = base.format(limit=limit) + f"&append=1&beforeId={parsed['activity_ids'][-1]}"

    return "\n".join(raw_parts), {
        "flights": flights, "end_of_list": end_of_list, "activity_ids": activity_ids,
        "id_rider": id_rider, "complete": complete,
    }


# ------------------------ Fiche de vol ------------------------


def _page_text(driver) -> str:
    """Texte visible de la page (ou de l'iframe courante). Chaîne vide si indisponible."""
    try:
        return driver.find_element(By.TAG_NAME, "body").text or ""
    except Exception:
        return ""


MAX_TURNSTILE_WAITS = 5


def _read_flight_iframe(driver, pilote: str, trace: str, base_url: str, timeout: int = 20) -> str:
    """
    Charge la page du vol (ex. .../pilotes/<pilote>/<trace>) puis lit le contenu de
    l'iframe #popupIframe DANS le contexte de la page (comme le fait un navigateur) : c'est la
    page de Syride qui ouvre elle-même la fiche et exécute son widget Turnstile. Si la page
    parente affiche un défi Turnstile, on attend que l'humain le valide (wait_for_turnstile).
    Retourne le HTML de l'iframe.
    Lève DailyLimitError (limite quotidienne) ou RateLimitError (trop de fiches consultées).
    """
    driver.get(f"{base_url}{pilote}/{trace}")
    wait_for_cloudflare(driver)
    gate_waits = 0
    try:
        while True:
            try:
                WebDriverWait(driver, timeout).until(
                    lambda d: d.find_elements(By.ID, "popupIframe")
                )
                driver.switch_to.frame(driver.find_element(By.ID, "popupIframe"))
                # Attendre soit le contenu de la fiche, soit un message de limite
                WebDriverWait(driver, timeout).until(
                    lambda d: d.find_elements(By.CLASS_NAME, "fv-metrics")    # fiche actuelle
                    or d.find_elements(By.CLASS_NAME, "volTexte")             # ancienne fiche
                    or detect_limit(_page_text(d))
                )
                break
            except TimeoutException:
                received = _page_text(driver)[:150]
                if gate_waits < MAX_TURNSTILE_WAITS and _parent_has_turnstile_gate(driver):
                    gate_waits += 1
                    wait_for_turnstile(driver)
                    continue
                raise RuntimeError(f"contenu de la fiche introuvable (texte reçu : {received!r})")
        text = _page_text(driver)
        limit = detect_limit(text)
        if limit == "daily":
            raise DailyLimitError(text[:150])
        if limit == "rate":
            raise RateLimitError(text[:150])
        return driver.page_source
    finally:
        driver.switch_to.default_content()


def read_flight_sheet(
    driver,
    pilote: str,
    trace: str,
    base_url: str = "https://www.syride.com/fr/pilotes/",
    rate_limit_waits=(120, 120, 300),
):
    """
    Lit la fiche d'UN vol et retourne (sheet, links, track, html, nb_limites_rencontrees) :
      - sheet : dict des champs de FLIGHT_SHEET_FIELDS (adresse_zip = lien GPX signé) ;
      - links : {"gpx": url|None, "igc": url|None, "kml": url|None}, liens signés à durée de
        vie courte (à utiliser tout de suite) ;
      - track : trace `fv-config` validée (parse_fv_config) ou None ;
      - html  : HTML brut de la fiche (à enregistrer tout de suite avec save_sheet_raw).

    La fiche n'est obtenue QUE par la navigation Chrome vers la page du vol (la page de Syride
    ouvre elle-même la fiche) : jamais d'appel direct à ficheVol.php ni à l'autorisation.

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

    sheet, links, track = parse_flight_sheet_full(html)

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

    return sheet, links, track, html, n_rate_limits


# ------------------------ Téléchargement et enregistrement ------------------------


def download_trace_via_browser(
    driver, main_repertoire: str, nav: str, link: str, download_dir: str, timeout: int = 45,
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
        page_text = _page_text(driver)
        # Lien signé expiré : Syride affiche une page « EXPIRED » au lieu du fichier
        if page_text.strip().upper().startswith("EXPIRED"):
            raise LinkExpiredError(f"Lien de téléchargement expiré pour la trace {nav}.")
        # Limite de téléchargement : échec immédiat (inutile d'attendre le timeout)
        if detect_download_limit(page_text):
            raise DownloadLimitError(page_text.strip()[:100])
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


def save_flight_data(main_repertoire: str, flight_data: dict, quiet: bool = False):
    num_act = flight_data["num_activite"]
    os.makedirs(main_repertoire + "/traces/" + f"{num_act}", exist_ok=True)
    file_name = main_repertoire + "/traces/" + f"{num_act}/" + f"{num_act}.json"
    # Écriture atomique : fichier temporaire puis renommage. Un plantage pendant l'écriture
    # laisse l'ancien JSON intact au lieu d'un fichier tronqué (illisible, donc ignoré).
    tmp_name = file_name + ".tmp"
    with open(tmp_name, "w", encoding="utf-8") as fp:
        json.dump(flight_data, fp, ensure_ascii=False)
        fp.flush()
        os.fsync(fp.fileno())
    os.replace(tmp_name, file_name)
    if not quiet:
        print(f"Données de vol {num_act} sauvegardées", flush=True)


def _write_gzip_atomic(path: str, text: str) -> None:
    """Écrit `text` compressé (gzip niveau 6) via un fichier temporaire puis renommage."""
    tmp_path = path + ".tmp"
    with gzip.open(tmp_path, "wb", compresslevel=6) as fp:
        fp.write(text.encode("utf-8"))
    with open(tmp_path, "rb") as fp:
        os.fsync(fp.fileno())
    os.replace(tmp_path, path)


def save_sheet_raw(main_repertoire: str, num: str, html: str) -> str:
    """
    Enregistre la fiche brute d'un vol : <main_repertoire>/traces/<num>/<num>.sheet.html.gz
    (contient la trace `fv-config`). Retourne le chemin du fichier.
    """
    folder = os.path.join(main_repertoire, "traces", str(num))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{num}.sheet.html.gz")
    _write_gzip_atomic(path, html)
    return path


def load_sheet_raw(folder: str, num: str):
    """
    Relit la fiche brute d'un vol depuis son dossier (<num>.sheet.html.gz, ou <num>.sheet.html
    non compressé). Retourne le HTML, ou None si absente ou illisible.
    """
    gz_path = os.path.join(folder, f"{num}.sheet.html.gz")
    plain_path = os.path.join(folder, f"{num}.sheet.html")
    try:
        if os.path.exists(gz_path):
            with gzip.open(gz_path, "rb") as fp:
                return fp.read().decode("utf-8")
        if os.path.exists(plain_path):
            with open(plain_path, "r", encoding="utf-8") as fp:
                return fp.read()
    except Exception as e:   # gzip tronqué, zlib.error, décodage... : jamais bloquant pour l'appelant
        print(f"Warning: fiche brute illisible du vol {num} ({type(e).__name__})", flush=True)
        return None
    return None


def save_list_snapshot(main_repertoire: str, html: str, keep: int = 5, now=None) -> str:
    """
    Enregistre l'instantané de la liste d'un pilote : <main_repertoire>/_raw/
    activites_<AAAAMMJJ-HHMMSS>.html.gz. Ne garde que les `keep` plus récents.
    Retourne le chemin écrit. (`now` : datetime, pour les tests.)
    """
    raw_dir = os.path.join(main_repertoire, "_raw")
    os.makedirs(raw_dir, exist_ok=True)
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    path = os.path.join(raw_dir, f"activites_{stamp}.html.gz")
    _write_gzip_atomic(path, html)
    snapshots = sorted(glob.glob(os.path.join(raw_dir, "activites_*.html.gz")))
    for old in snapshots[:-max(keep, 1)]:
        try:
            os.remove(old)
        except OSError:
            pass
    return path


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
