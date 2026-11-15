"""
Session navigateur unique pour scraper tous les pilotes Syride, en 3 phases :

  1. IDENTIFICATION  : nouvelles traces de tous les pilotes ; enregistrement des informations de
                       la page liste (date, temps de vol, voile, distance, altitude max,
                       instrument...) dans <pilote>/traces/<num>/<num>.json. Aucune fiche.
  2. COMPLÉTION      : lecture des dossiers ; pour chaque vol à qui il manque des informations
                       ou des fichiers, consultation de la fiche (informations propres à la
                       fiche) puis téléchargement IMMÉDIAT du GPX et de l'IGC (liens signés qui
                       expirent vite).
  3. INDEX           : mise à jour de la base SQLite (le pkl est généré ensuite).

Rien n'est jamais supprimé. Gestion des limites de Syride (stratégie « dégradée ») :

  - « Trop de fiches de vol consultées » : attente (2 min) puis reprise ;
  - TÉLÉCHARGEMENT limité (« DOWNLOAD LIMIT REACHED ») : on cesse de télécharger
    (inutile d'insister), mais on continue à parcourir les fiches pour compléter les JSON ;
    les vols à qui il ne manque que des fichiers sont ignorés (aucun gain, aucune fiche
    consommée) ;
  - « Limite quotidienne de 50 fiches » : la phase 2 s'arrête, on passe à la phase 3.

La phase 1 a déjà enregistré les informations de la liste, et le lancement suivant complète
ce qui manque (fichiers GPX/IGC compris).

Autres points : une seule fenêtre Chrome, pause automatique en cas de vérification
Cloudflare (voir syride_scraper), profil Chrome persistant (_chrome_profile).
"""

import os
import random
import shutil
import tempfile
import time
import traceback

import undetected_chromedriver as uc

import flights_db
import params_scrap_syride as params
import syride_scraper as scraper
from syride_parsing import FLIGHT_SHEET_FIELDS
from syride_scraper import wait_for_cloudflare

SYRIDE_LOGIN_URL = "https://www.syride.com/fr/moncompte"
PILOT_BASE_URL = "https://www.syride.com/fr/pilotes/"

# Pause (en secondes) entre deux fiches de vol, multipliée automatiquement après une limite
# « par minute » de Syride.
SHEET_DELAY = (6, 10)
MAX_DELAY_SCALE = 4.0
MAX_DOWNLOAD_ATTEMPTS = 3


class SheetBudgetReached(Exception):
    """Nombre maximum de fiches (--max-sheets) atteint pour cette exécution."""


class _Budget:
    """Compte les fiches de vol consultées (la limite quotidienne de Syride porte dessus)."""

    def __init__(self, max_sheets=None):
        self.max = max_sheets
        self.used = 0

    def consume(self):
        if self.max is not None and self.used >= self.max:
            raise SheetBudgetReached()
        self.used += 1






# ------------------------ Driver ------------------------


def create_driver(download_dir: str, profile_dir: str, private: bool = False):
    """
    Lance Chrome. private=True : fenêtre de navigation privée (--incognito) ; profile_dir doit
    alors être un dossier temporaire jetable (aucun cookie ni session conservés).
    """
    options = uc.ChromeOptions()
    if private:
        options.add_argument("--incognito")
    prefs = {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)

    driver = uc.Chrome(options=options, user_data_dir=profile_dir, headless=False)

    try:
        driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": download_dir},
        )
    except Exception as e:
        print(f"Attention : impossible de configurer le dossier de téléchargement ({e}).")

    return driver


def open_site_and_login(driver) -> bool:
    """
    Ouvre Syride, attend la validation Cloudflare, puis se connecte.
    Retourne True si la connexion est confirmée.
    """
    driver.get(SYRIDE_LOGIN_URL)
    wait_for_cloudflare(driver)
    logged_in = scraper.login_to_syride(driver, params.syride_email, params.syride_password)
    wait_for_cloudflare(driver)
    if not logged_in:
        print("\n" + "!" * 60)
        print("Connexion à Syride NON confirmée.")
        print("Les fiches de vol ne seront pas consultées : sans connexion, Syride peut ne pas")
        print("proposer les liens GPX et les vols seraient marqués à tort « sans lien ».")
        print("!" * 60 + "\n", flush=True)
    return logged_in


# ------------------------ Identification des nouvelles traces ------------------------


def identify_new_traces(driver, path: str, pilot: str, scroll: int) -> int:
    """
    Parcourt la page du pilote (avec scroll), repère les traces absentes du disque et
    enregistre immédiatement leurs informations (JSON). Retourne leur nombre.
    """
    repertoire_pilote = os.path.join(path, pilot)
    known = scraper.initiate_search(main_repertoire=repertoire_pilote)

    # Pré-chargement de la page du pilote pour laisser passer un éventuel défi Cloudflare
    driver.get(PILOT_BASE_URL + pilot)
    wait_for_cloudflare(driver)

    new_navs, dict_navs = scraper.get_all_navs(
        pilote=pilot, known_traces=known, scroll=scroll, driver=driver
    )

    for nav, data_nav in dict_navs.items():
        # Même format que les anciens JSON : les champs de la fiche sont présents, vides
        for field in FLIGHT_SHEET_FIELDS:
            if field != "adresse_zip":
                data_nav.setdefault(field, None)
        scraper.save_flight_data(main_repertoire=repertoire_pilote, flight_data=data_nav)

    print(f"{len(dict_navs)} nouvelle(s) trace(s) enregistrée(s) (informations de la liste).")
    return len(dict_navs)


# ------------------------ Complétion d'un vol ------------------------


def _read_sheet(driver, pilot, nav, budget):
    budget.consume()
    return scraper.read_flight_sheet(driver, pilot, nav)


def _download_one(driver, repertoire_pilote, pilot, nav, link, download_dir, ext, budget,
                  reread_on_expiry) -> bool:
    """
    Télécharge un fichier (gpx ou igc). Si le lien a expiré et que reread_on_expiry est
    vrai, relit la fiche pour obtenir un lien neuf. Retourne True si le fichier est enregistré.

    Limite de téléchargement : lève scraper.DownloadLimitError (inutile d'insister).
    """
    attempt = 0
    while attempt < MAX_DOWNLOAD_ATTEMPTS:
        try:
            scraper.download_trace_via_browser(
                driver=driver,
                main_repertoire=repertoire_pilote,
                nav=nav,
                link=link,
                download_dir=download_dir,
                expected_ext=ext,
            )
            return True
        except scraper.DownloadLimitError:
            raise
        except scraper.LinkExpiredError:
            attempt += 1
            if not reread_on_expiry:
                print(f"\n[Trace {nav}] Lien {ext.upper()} expiré, fichier ignoré.", flush=True)
                return False
            print(f"\n[Trace {nav}] Lien expiré, relecture de la fiche pour un lien neuf...", flush=True)
            sheet, links, _ = _read_sheet(driver, pilot, nav, budget)
            link = links.get(ext) or (sheet["adresse_zip"] if ext == "gpx" else None)
            if link is None:
                return False
        except Exception as e:
            print(f"\n[Trace {nav}] Échec du téléchargement {ext.upper()} ({e}).", flush=True)
            wait_for_cloudflare(driver)
            if attempt < MAX_DOWNLOAD_ATTEMPTS - 1:
                time.sleep(10 * (attempt + 1))
            attempt += 1
    return False


def process_flight(driver, download_dir, path, pilot, nav, data_nav, budget,
                   need_gpx=True, need_igc=True, need_info=True, allow_download=True):
    """
    Consulte la fiche d'UN vol Syride et complète ce qui manque :
      - need_info / need_gpx : JSON enrichi avec les informations propres à la fiche ;
      - need_gpx             : téléchargement du GPX ;
      - need_igc             : téléchargement de l'IGC (même fiche, donc sans fiche en plus).

    allow_download=False : mode « informations seules » (limite quotidienne de téléchargement
    atteinte) : la fiche est lue et le JSON enregistré, mais aucun fichier n'est téléchargé.

    Retourne (statut, nb_limites_par_minute) avec statut parmi :
      "ok"                : tout ce qui était demandé est fait ;
      "nolink"            : la fiche n'offre aucun GPX (ne plus retenter) ;
      "failed"            : échec de téléchargement ;
      "info_only"         : JSON complété, fichiers non téléchargés (mode informations seules) ;
      "download_blocked"  : la limite quotidienne de téléchargement vient d'être atteinte
                            (le JSON est déjà enregistré) ; le fichier reste à télécharger.
    """
    repertoire_pilote = os.path.join(path, pilot)

    sheet, links, n_limits = _read_sheet(driver, pilot, nav, budget)

    if need_info or need_gpx:
        # La fiche est lue : on enregistre tout de suite ses informations, même si le
        # téléchargement échoue ensuite.
        # adresse_zip = lien signé qui expire vite : utilisé ci-dessous, pas enregistré
        data_nav.update({k: v for k, v in sheet.items() if k != "adresse_zip"})
        data_nav.pop("adresse_zip", None)
        scraper.save_flight_data(main_repertoire=repertoire_pilote, flight_data=data_nav)

    # Absence de lien GPX : information fournie par la fiche, indépendante des téléchargements
    if need_gpx and sheet["adresse_zip"] is None:
        return "nolink", n_limits

    # Limite quotidienne de téléchargement déjà atteinte : la fiche a servi à compléter le JSON
    if not allow_download:
        return "info_only", n_limits

    # Téléchargements IMMÉDIATS : les liens signés expirent vite
    try:
        if need_gpx:
            if not _download_one(driver, repertoire_pilote, pilot, nav, sheet["adresse_zip"],
                                 download_dir, "gpx", budget, reread_on_expiry=True):
                return "failed", n_limits

        if need_igc:
            if links.get("igc"):
                time.sleep(random.uniform(1, 2))
                if not _download_one(driver, repertoire_pilote, pilot, nav, links["igc"],
                                     download_dir, "igc", budget, reread_on_expiry=False):
                    print(f"[Trace {nav}] IGC non téléchargé.", flush=True)
            else:
                print(f"[Trace {nav}] Pas de lien IGC dans la fiche.", flush=True)
                if not (need_gpx or need_info):
                    return "nolink", n_limits  # travail « IGC seul » impossible : on ne retente plus
    except scraper.DownloadLimitError as e_dl:
        print(f"\n[Trace {nav}] Limite de téléchargement atteinte ({e_dl}).", flush=True)
        return "download_blocked", n_limits

    return "ok", n_limits


# ------------------------ Orchestration en 3 phases ------------------------


def _blocked_reason(exc, budget) -> str:
    """Message expliquant pourquoi la consultation des fiches est arrêtée."""
    if isinstance(exc, scraper.DailyLimitError):
        return "Limite QUOTIDIENNE de fiches de Syride atteinte."
    if isinstance(exc, SheetBudgetReached):
        return f"Nombre maximum de fiches atteint ({budget.max})."
    return "La limite par minute de Syride persiste malgré les pauses."


def _tasks_label(item) -> str:
    tasks = []
    if item["need_info"]:
        tasks.append("infos")
    if item["need_gpx"]:
        tasks.append("GPX")
    if item["need_igc"]:
        tasks.append("IGC")
    return " + ".join(tasks)


def process_pilots(path: str, pilots: list, scroll: int, do_scrape: bool = True,
                   max_sheets=None, fill_igc: bool = False, db_path: str = None,
                   tasks: str = "all", private: bool = False,
                   dry_run: bool = False) -> dict:
    """
    Traite les pilotes en 3 phases, avec UNE seule fenêtre Chrome (ouverte seulement si
    nécessaire) :

      PHASE 1 (si do_scrape) : identification des nouvelles traces de TOUS les pilotes et
          enregistrement des informations de la page liste. Aucune fiche n'est consultée,
          donc aucune limite de Syride ne peut interrompre cette phase.
      PHASE 2 : lecture des dossiers de tous les pilotes, liste des vols à qui il manque des
          informations ou des fichiers, puis consultation des fiches (plus récents d'abord)
          pour compléter les JSON et télécharger GPX + IGC.
          - limite « trop de fiches consultées » : attente puis reprise ;
          - limite de TÉLÉCHARGEMENT : on cesse de télécharger mais on continue à
            parcourir les fiches pour compléter les JSON (les vols à qui il ne manque que des
            fichiers sont ignorés : aucun gain) ;
          - limite quotidienne de FICHES, ou max_sheets atteint : la phase s'arrête, le reste
            attendra le prochain lancement.
      PHASE 3 : mise à jour de l'index SQLite (le pkl est généré ensuite par main.py).

    tasks    : "all" (défaut) = compléter les JSON ET télécharger les fichiers ;
               "info"  = compléter seulement les JSON incomplets (aucun téléchargement) ;
               "files" = télécharger seulement les fichiers des vols dont le JSON est complet.
    fill_igc : inclut aussi les vols qui ont déjà leur GPX mais pas d'IGC (une fiche par vol).
    private  : lance Chrome en navigation privée, avec un profil temporaire supprimé à la fin :
               pas de cookies ni de session conservés (reconnexion et éventuel défi Cloudflare
               à chaque lancement). Le profil persistant _chrome_profile n'est pas utilisé.
    dry_run  : simulation. Aucune page n'est ouverte (pas de Chrome), aucune fiche consultée,
               aucun fichier téléchargé : le script lit les dossiers et affiche seulement ce
               qu'il ferait.

    Retourne {"failed_pilots": [...], "stopped": message ou None, "sheets_used": n,
              "pending": nombre de vols restant à compléter (fiches),
              "downloads_blocked": True si la limite quotidienne de téléchargement a été atteinte,
              "pending_downloads": nombre de vols dont il reste des fichiers à télécharger}.
    """
    os.makedirs(path, exist_ok=True)
    db_path = db_path or os.path.join(path, flights_db.DB_NAME)
    conn = flights_db.connect(db_path)

    download_dir = os.path.abspath(os.path.join(path, "_tmp_downloads"))
    if private:
        profile_dir = None if dry_run else tempfile.mkdtemp(prefix="syride_private_")
    else:
        profile_dir = os.path.abspath(os.path.join(path, "_chrome_profile"))
    os.makedirs(download_dir, exist_ok=True)

    ctx = {"driver": None, "logged_in": False}

    def get_driver():
        if ctx["driver"] is None:
            ctx["driver"] = create_driver(download_dir=download_dir, profile_dir=profile_dir,
                                         private=private)
            ctx["logged_in"] = open_site_and_login(ctx["driver"])
        return ctx["driver"]

    def sync_all():
        print("Mise à jour de l'index des vols (lecture des dossiers)...", flush=True)
        t0 = time.time()
        for pilot in pilots:
            st = {}
            try:
                flights_db.sync_pilot(conn, path, pilot, stats=st, verbose=True)
            except Exception as e_sync:
                print(f"Warning : mise à jour de l'index impossible pour {pilot} ({e_sync})")
                continue
            # Détail affiché seulement quand il y a eu du travail notable (premier passage...)
            if st.get("json_read") or st.get("gpx_stats") or st.get("seconds", 0) >= 2:
                print(f"   {pilot} : {st['json_read']} JSON relu(s), "
                      f"{st['gpx_stats']} stats GPX calculée(s), "
                      f"{st['coords']} coordonnée(s) de départ ({st['seconds']:.1f} s)",
                      flush=True)
        print(f"Index à jour en {time.time() - t0:.1f} s.\n", flush=True)

    budget = _Budget(max_sheets)
    failed_pilots = []
    blocked = None
    pending = 0
    downloads_blocked = False   # limite quotidienne de téléchargement atteinte
    pending_downloads = 0       # vols dont des fichiers restent à télécharger
    sep = "=" * 60

    try:
        # ---------------- PHASE 1 ----------------
        print(f"\n{sep}\nPHASE 1/3 : identification des nouvelles traces\n{sep}")
        if do_scrape and not dry_run:
            for pilot in pilots:
                print(f"--- Pilote : {pilot} ---")
                try:
                    identify_new_traces(get_driver(), path, pilot, scroll)
                except Exception:
                    print(traceback.format_exc())
                    print(f"Échec de l'identification pour {pilot}, passage au suivant.")
                    failed_pilots.append(pilot)
        else:
            print("Ignorée (--scrape 0)." if not dry_run else "Ignorée (simulation --dry-run).")

        # ---------------- PHASE 2 ----------------
        print(f"\n{sep}\nPHASE 2/3 : compléter les informations et télécharger les fichiers\n{sep}")
        sync_all()

        # Bilan de ce qui a été lu sur le disque, pilote par pilote
        for pilot in pilots:
            st = flights_db.summary(conn, path, pilot)
            print(f"{pilot} : {st['total']} dossier(s) de vol lu(s), {st['syride']} vol(s) Syride | "
                  f"sans GPX : {st['no_gpx']} | sans infos de fiche : {st['no_sheet']} | "
                  f"sans IGC : {st['no_igc']}{'' if fill_igc else ' (non traités sans --fill-igc)'} | "
                  f"sans lien, ignorés : {st['no_link']}")
            if st["orphans"]:
                print(f"   Attention : {len(st['orphans'])} dossier(s) sans JSON ignoré(s) "
                      f"(ex. {', '.join(sorted(st['orphans'])[:5])}). Un lancement avec scraping "
                      f"(sans --scrape 0) les repère à nouveau s'ils sont vides.")

        queue = flights_db.get_global_queue(conn, pilots, fill_igc=fill_igc, tasks=tasks)

        if not queue:
            print("Rien à compléter : toutes les traces sont à jour.")
        else:
            per_pilot = {}
            for item in queue:
                per_pilot[item["pilot"]] = per_pilot.get(item["pilot"], 0) + 1
            print(f"{len(queue)} vol(s) à compléter : "
                  + ", ".join(f"{p} ({n})" for p, n in per_pilot.items()))
            kinds = {"info+files": 0, "info": 0, "files": 0}
            for item in queue:
                kinds[flights_db.flight_kind(item)] += 1
            print(f"  dont : {kinds['info+files']} avec JSON incomplet + fichiers manquants | "
                  f"{kinds['info']} avec JSON incomplet seulement | "
                  f"{kinds['files']} avec fichiers manquants seulement (JSON complet)"
                  f"   [mode --tasks {tasks}]")

            if dry_run:
                for item in queue:
                    print(f"  {item['pilot']} / trace {item['num']}  ({_tasks_label(item)})")
                print("\nMode simulation (--dry-run) : aucune fiche consultée, aucun fichier "
                      "téléchargé.")
                pending = len(queue)

            driver = None if dry_run else get_driver()
            if driver is not None:
                driver.implicitly_wait(0)  # attentes explicites utilisées pour lire les fiches
                if not ctx["logged_in"]:
                    blocked = ("Connexion à Syride non confirmée : aucune fiche consultée "
                               "(vérifie SYRIDE_EMAIL / SYRIDE_PASSWORD dans .env).")
                    pending = len(queue)
                    driver = None

            results = {}   # pilote -> [ok, échecs, sans lien, infos seules]
            delay_scale = 1.0
            n_sheet_calls = 0
            for i, item in enumerate([] if driver is None else queue):
                pilot, nav, data_nav = item["pilot"], item["num"], item["data"]

                # Téléchargements bloqués pour la journée : un vol à qui il ne manque que des
                # fichiers n'apporte rien (la fiche ne ferait que consommer le quota de fiches).
                if downloads_blocked and not item["need_info"]:
                    pending_downloads += 1
                    continue

                counts = results.setdefault(pilot, [0, 0, 0, 0])
                mode = " [infos seules : téléchargements bloqués]" if downloads_blocked else ""
                print(f"[{i+1}/{len(queue)}] {pilot} / trace {nav}  ({_tasks_label(item)}){mode}",
                      flush=True)
                if n_sheet_calls > 0:
                    time.sleep(random.uniform(*SHEET_DELAY) * delay_scale)
                n_sheet_calls += 1

                try:
                    status, n_limits = process_flight(
                        driver, download_dir, path, pilot, nav, data_nav, budget,
                        need_gpx=item["need_gpx"], need_igc=item["need_igc"],
                        need_info=item["need_info"], allow_download=not downloads_blocked,
                    )
                except (scraper.DailyLimitError, scraper.RateLimitError, SheetBudgetReached) as e_block:
                    blocked = _blocked_reason(e_block, budget)
                    pending = len(queue) - i
                    print(f"\n{blocked}\nArrêt de la consultation des fiches : "
                          f"{pending} vol(s) restent à compléter.", flush=True)
                    break
                except Exception:
                    print("", "\n", traceback.format_exc())
                    print(f"Trace {nav} non complétée (informations conservées).")
                    counts[1] += 1
                    continue

                if n_limits > 0:
                    delay_scale = min(delay_scale * 1.5, MAX_DELAY_SCALE)
                    print(f"  Rythme ralenti (x{delay_scale:.1f}).", flush=True)

                if status == "ok":
                    counts[0] += 1
                elif status == "nolink":
                    counts[2] += 1
                    flights_db.mark_no_link(conn, pilot, nav)
                elif status == "download_blocked":
                    counts[3] += 1
                    pending_downloads += 1
                    if not downloads_blocked:
                        downloads_blocked = True
                        print("\n" + "-" * 60
                              + "\nLimite de téléchargement atteinte : plus aucun fichier "
                                "ne sera téléchargé pour cette exécution.\nOn continue de parcourir les fiches "
                                "pour compléter les JSON (informations seules)."
                              + "\n" + "-" * 60, flush=True)
                elif status == "info_only":
                    counts[3] += 1
                    pending_downloads += 1
                else:
                    counts[1] += 1

            if results:
                print("\nBilan de la phase 2 :")
                for pilot, (ok, failed, nolink, info_only) in results.items():
                    extra = f", {info_only} en informations seules (fichiers à télécharger)" if info_only else ""
                    print(f"  {pilot} : {ok} complété(s), {failed} en échec, {nolink} sans lien{extra}")
            if downloads_blocked:
                print(f"  {pending_downloads} vol(s) attendent encore leurs fichiers (GPX/IGC).")
    finally:
        # ---------------- PHASE 3 ----------------
        print(f"\n{sep}\nPHASE 3/3 : mise à jour de l'index\n{sep}")
        try:
            sync_all()
        finally:
            if ctx["driver"] is not None:
                try:
                    ctx["driver"].quit()
                except Exception:
                    pass
            shutil.rmtree(download_dir, ignore_errors=True)
            if private and profile_dir:
                shutil.rmtree(profile_dir, ignore_errors=True)  # profil temporaire jetable
            conn.close()

    if blocked:
        print("\n" + sep)
        print(blocked)
        print(f"{pending} vol(s) attendent d'être complétés : relance le script plus tard "
              f"(avec --scrape 0 pour ne traiter que les traces manquantes).")
        print("Les données déjà récupérées sont conservées.")
        print(sep + "\n")

    if downloads_blocked:
        print("\n" + sep)
        print("Limite quotidienne de téléchargement atteinte pendant cette exécution.")
        print(f"{pending_downloads} vol(s) attendent encore leurs fichiers : relance le script "
              f"demain (avec --scrape 0 pour ne traiter que les traces manquantes).")
        print(sep + "\n")

    return {
        "failed_pilots": failed_pilots,
        "stopped": blocked,
        "sheets_used": budget.used,
        "pending": pending,
        "downloads_blocked": downloads_blocked,
        "pending_downloads": pending_downloads,
    }
