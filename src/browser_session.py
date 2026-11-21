"""
Session de scraping Syride pour tous les pilotes, en 3 phases :

  1. LISTE           : liste des vols de chaque pilote lue par HTTP simple (sans Chrome, sans
                       connexion) puis réconciliée avec le disque : vols nouveaux (JSON créé),
                       modifiés (champ de liste changé, historique conservé), absents de Syride
                       (marqués, jamais supprimés), réapparus ; doublons probables signalés
                       dans _rapport_doublons.txt. Aucune fiche. Tourne aussi en --dry-run.
  2. COMPLÉTION      : lecture des dossiers ; pour chaque vol à qui il manque des informations,
                       la fiche brute ou des fichiers, consultation de la fiche dans Chrome
                       (navigation vers la page du vol : la page de Syride ouvre elle-même la
                       fiche et exécute son widget Turnstile ; si un défi demande une action,
                       le script attend que l'humain le valide). La fiche brute (qui contient la
                       trace) est enregistrée tout de suite ; les GPX / IGC ne sont téléchargés
                       que pour les pilotes dont le profil le prévoit (FICHIERS_PAR_PILOTE).
                       Chrome n'est ouvert que s'il y a au moins une fiche à lire.
  3. INDEX           : mise à jour de la base SQLite (le pkl est généré ensuite).

Le code ne fait jamais d'appel direct à ficheVol.php ni à l'autorisation d'affichage.

Rien n'est jamais supprimé. Gestion des limites de Syride (stratégie « dégradée ») :

  - « Trop de fiches de vol consultées » : attente (2 min) puis reprise ;
  - TÉLÉCHARGEMENT limité (« DOWNLOAD LIMIT REACHED ») : on cesse de télécharger
    (inutile d'insister), mais on continue à parcourir les fiches pour compléter les JSON ;
    les vols à qui il ne manque que des fichiers sont ignorés (aucun gain, aucune fiche
    consommée) ;
  - « Limite quotidienne de 50 fiches » : la phase 2 s'arrête, on passe à la phase 3.

Le lancement suivant complète ce qui manque.

Autres points : une seule fenêtre Chrome, pause automatique en cas de vérification
Cloudflare ou Turnstile (voir syride_scraper), profil Chrome persistant (_chrome_profile).
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


def _installed_chrome_major():
    """
    Version majeure du Chrome installé (ex. 157), ou None si introuvable.
    Sans elle, undetected_chromedriver télécharge le ChromeDriver le plus récent, qui peut être
    en avance d'une version sur Chrome (« only supports Chrome version N »).
    """
    import re
    import subprocess

    try:
        binary = uc.find_chrome_executable()
        if not binary:
            return None
        out = subprocess.run([binary, "--version"], capture_output=True, text=True,
                             timeout=15).stdout
        match = re.search(r"(\d+)\.\d+\.\d+", out)
        return int(match.group(1)) if match else None
    except Exception:
        return None


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

    driver = uc.Chrome(options=options, user_data_dir=profile_dir, headless=False,
                       version_main=_installed_chrome_major())

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


# ------------------------ Phase 1 : liste des vols (HTTP, sans Chrome) ------------------------


def sync_pilot_list(conn, transport, path: str, pilot: str, dry_run: bool = False) -> dict:
    """
    Phase 1 pour UN pilote, sans navigateur : lit sa liste de vols sur Syride par HTTP
    (idRider mis en cache dans la base), garde un instantané de la liste (`_raw`), puis
    réconcilie la liste avec le disque (vols nouveaux, modifiés, absents, réapparus ; voir
    flights_db.reconcile_pilot). Affiche un bilan d'une ligne.

    dry_run : lecture seule. Rien n'est écrit (ni JSON, ni instantané, ni base, ni idRider) ;
    le bilan est celui qu'aurait donné une exécution réelle.

    Retourne {"pilot", "listed", "complete", "report"} (report : voir reconcile_pilot).
    Lève scraper.PilotPageError si la liste est illisible.
    """
    id_rider = flights_db.get_id_rider(conn, pilot)
    try:
        html, parsed = scraper.fetch_pilot_list(transport, pilot, id_rider)
    except scraper.PilotPageError:
        if id_rider is None:
            raise
        # idRider en cache devenu invalide (compte recréé ?) : on le relit sur la page
        html, parsed = scraper.fetch_pilot_list(transport, pilot, None)

    if not dry_run:
        if parsed["id_rider"] != id_rider:
            flights_db.set_id_rider(conn, pilot, parsed["id_rider"])
        scraper.save_list_snapshot(os.path.join(path, pilot), html)

    report = flights_db.reconcile_pilot(conn, path, pilot, parsed["flights"],
                                        complete=parsed["complete"], dry_run=dry_run)

    line = (f"{pilot} : {len(parsed['flights'])} vols sur Syride, {len(report['new'])} nouveaux, "
            f"{len(report['modified'])} modifiés, {len(report['absent'])} absents, "
            f"{len(report['reappeared'])} réapparus")
    if report["guard_triggered"]:
        line += ", garde-fou déclenché"
    if not parsed["complete"]:
        line += ", liste possiblement incomplète : aucun vol marqué absent"
    print(line, flush=True)
    if report["unreadable"]:
        print(f"   Attention : {len(report['unreadable'])} JSON illisible(s), laissé(s) intact(s) "
              f"(ex. {', '.join(report['unreadable'][:5])}).")
    return {"pilot": pilot, "listed": len(parsed["flights"]), "complete": parsed["complete"],
            "report": report}


# ------------------------ Phase 2 : complétion d'un vol ------------------------


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
            sheet, links, _track, _html, _ = _read_sheet(driver, pilot, nav, budget)
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
                   need_gpx=True, need_igc=True, need_info=True, allow_download=True,
                   need_raw=True, files=()):
    """
    Consulte la fiche d'UN vol Syride (par la navigation Chrome vers la page du vol : jamais
    d'appel direct à ficheVol.php ni à l'autorisation d'affichage) et complète ce qui manque :
      - la fiche brute est enregistrée TOUT DE SUITE (need_raw) : elle contient la trace ;
      - need_info / need_gpx : JSON enrichi avec les informations propres à la fiche ;
      - téléchargement du GPX (need_gpx) et de l'IGC (need_igc), SEULEMENT pour les extensions
        de `files` (profil du pilote, ex. ("gpx", "igc") ; () = pas de fichiers).

    allow_download=False : mode « informations seules » (limite quotidienne de téléchargement
    atteinte) : la fiche est lue et le JSON enregistré, mais aucun fichier n'est téléchargé.

    Retourne (statut, nb_limites_par_minute) avec statut parmi :
      "ok"                : tout ce qui était demandé est fait ;
      "nolink"            : ni trace dans la fiche ni GPX à télécharger (ne plus retenter) ;
      "failed"            : échec de téléchargement ;
      "info_only"         : JSON complété, fichiers non téléchargés (mode informations seules) ;
      "download_blocked"  : la limite quotidienne de téléchargement vient d'être atteinte
                            (le JSON est déjà enregistré) ; le fichier reste à télécharger.
    """
    repertoire_pilote = os.path.join(path, pilot)

    sheet, links, track, html, n_limits = _read_sheet(driver, pilot, nav, budget)

    if need_raw and html:
        scraper.save_sheet_raw(repertoire_pilote, nav, html)

    if need_info or need_gpx:
        # La fiche est lue : on enregistre tout de suite ses informations, même si le
        # téléchargement échoue ensuite.
        # adresse_zip = lien signé qui expire vite : utilisé ci-dessous, pas enregistré
        data_nav.update({k: v for k, v in sheet.items() if k != "adresse_zip"})
        data_nav.pop("adresse_zip", None)
        scraper.save_flight_data(main_repertoire=repertoire_pilote, flight_data=data_nav)

    # Ni trace dans la fiche ni lien GPX : rien à tirer de ce vol, on ne le retente plus.
    # Un GPX voulu mais sans lien n'est pas retenté non plus (comportement historique).
    no_gpx_link = sheet["adresse_zip"] is None
    if no_gpx_link and (track is None or need_gpx):
        return "nolink", n_limits

    want_gpx = need_gpx and "gpx" in files
    want_igc = need_igc and "igc" in files
    if not (want_gpx or want_igc):
        return "ok", n_limits

    # Limite quotidienne de téléchargement déjà atteinte : la fiche a servi à compléter le JSON
    if not allow_download:
        return "info_only", n_limits

    # Téléchargements IMMÉDIATS : les liens signés expirent vite
    try:
        if want_gpx:
            if not _download_one(driver, repertoire_pilote, pilot, nav, sheet["adresse_zip"],
                                 download_dir, "gpx", budget, reread_on_expiry=True):
                return "failed", n_limits

        if want_igc:
            if links.get("igc"):
                time.sleep(random.uniform(1, 2))
                if not _download_one(driver, repertoire_pilote, pilot, nav, links["igc"],
                                     download_dir, "igc", budget, reread_on_expiry=False):
                    print(f"[Trace {nav}] IGC non téléchargé.", flush=True)
            else:
                print(f"[Trace {nav}] Pas de lien IGC dans la fiche.", flush=True)
                if not (want_gpx or need_info):
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
    if item.get("need_raw"):
        tasks.append("fiche brute")
    return " + ".join(tasks)


PILOT_DELAY = 1.0   # pause (s) entre deux listes de pilotes, par politesse envers Syride


def process_pilots(path: str, pilots: list, scroll: int = -1, do_scrape: bool = True,
                   max_sheets=None, fill_igc: bool = False, db_path: str = None,
                   tasks: str = "all", private: bool = False,
                   dry_run: bool = False, files_by_pilot: dict = None,
                   backfill_raw: bool = True, files_override=None,
                   transport=None, reparse: bool = False) -> dict:
    """
    Traite les pilotes en 3 phases, avec UNE seule fenêtre Chrome (ouverte seulement si
    nécessaire, c'est-à-dire si la file de la phase 2 n'est pas vide) :

      PHASE 1 (si do_scrape) : liste des vols de TOUS les pilotes lue par HTTP (sans Chrome),
          réconciliée avec le disque : vols nouveaux, modifiés, absents, réapparus. Aucune
          fiche n'est consultée, donc aucune limite de Syride ne peut interrompre cette phase.
          Elle tourne aussi en simulation (lecture seule).
      PHASE 2 : lecture des dossiers de tous les pilotes, liste des vols à qui il manque des
          informations, des fichiers ou la fiche brute, puis consultation des fiches (plus
          récents d'abord) : enregistrement de la fiche brute, complétion des JSON, et
          téléchargement des GPX / IGC pour les seuls pilotes dont le profil le prévoit.
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
    dry_run  : simulation. Aucune page Chrome n'est ouverte, aucune fiche consultée, aucun
               fichier téléchargé ; la phase 1 (liste par HTTP) lit Syride mais n'écrit rien ;
               le script affiche seulement ce qu'il ferait. (L'index SQLite `db_path` est
               tout de même mis à jour : pointer `db_path` vers une copie pour un essai.)
    scroll   : OBSOLÈTE, ignoré (la liste n'est plus lue par défilement de page).
    files_by_pilot : {pilote: ("gpx", "igc")} = fichiers téléchargés par pilote (profils,
               voir params_scrap_syride.FICHIERS_PAR_PILOTE) ; un pilote absent n'a pas de
               fichiers (sa fiche est lue, pas de téléchargement). None = aucun profil.
    files_override : tuple d'extensions ; s'il est donné, il remplace les profils pour TOUS
               les pilotes de l'exécution (ex. () = aucun fichier).
    backfill_raw : met aussi en file les vols à qui il ne manque que la fiche brute.
    transport : transport HTTP de la liste (défaut : syride_scraper.HttpTransport) ; fourni
               par les tests.
    reparse  : remplace les phases 1 et 2 par la réanalyse hors ligne des fiches brutes
               (flights_db.reparse_pilot : ni réseau, ni Chrome) ; la phase 3 suit.

    Retourne {"failed_pilots": [...], "stopped": message ou None, "sheets_used": n,
              "pending": nombre de vols restant à compléter (fiches),
              "downloads_blocked": True si la limite quotidienne de téléchargement a été atteinte,
              "pending_downloads": nombre de vols dont il reste des fichiers à télécharger}.
    """
    db_path = db_path or os.path.join(path, flights_db.DB_NAME)
    if not dry_run:
        os.makedirs(path, exist_ok=True)
    conn = flights_db.connect(db_path)

    if files_override is not None:
        files_by_pilot = {p: tuple(files_override) for p in pilots}
    else:
        files_by_pilot = dict(files_by_pilot or {})

    download_dir = os.path.abspath(os.path.join(path, "_tmp_downloads"))
    if private:
        profile_dir = None if dry_run else tempfile.mkdtemp(prefix="syride_private_")
    else:
        profile_dir = os.path.abspath(os.path.join(path, "_chrome_profile"))

    ctx = {"driver": None, "logged_in": False}

    def get_driver():
        if ctx["driver"] is None:
            os.makedirs(download_dir, exist_ok=True)
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
        print(f"\n{sep}\nPHASE 1/3 : liste des vols de chaque pilote (HTTP, sans Chrome)\n{sep}")
        if reparse:
            print("Ignorée (--reparse 1 : réanalyse hors ligne des fiches brutes).")
        elif do_scrape:
            if dry_run:
                print("Simulation : les listes sont lues sur Syride, rien n'est écrit.")
            http = transport or scraper.HttpTransport()
            n_duplicates = 0
            for k, pilot in enumerate(pilots):
                if k > 0 and PILOT_DELAY:
                    time.sleep(PILOT_DELAY)
                try:
                    result = sync_pilot_list(conn, http, path, pilot, dry_run=dry_run)
                    n_duplicates += len(result["report"]["duplicates"])
                except Exception:
                    print(traceback.format_exc())
                    print(f"Échec de la lecture de la liste de {pilot}, passage au suivant.")
                    failed_pilots.append(pilot)
            if dry_run:
                print(f"{n_duplicates} doublon(s) probable(s) (simulation : rapport non écrit).")
            else:
                report_path = flights_db.write_duplicates_report(conn, path, pilots)
                marks = ",".join("?" for _ in pilots)
                n_duplicates = conn.execute(
                    f"SELECT COUNT(*) FROM flights WHERE duplicate_of IS NOT NULL "
                    f"AND pilot IN ({marks})", list(pilots)).fetchone()[0]
                print(f"{n_duplicates} doublon(s) probable(s), voir {report_path}")
        else:
            print("Ignorée (--scrape 0).")

        # ---------------- PHASE 2 ----------------
        print(f"\n{sep}\nPHASE 2/3 : fiches brutes, informations de fiche et fichiers\n{sep}")
        sync_all()
        if reparse:
            print("Réanalyse hors ligne des fiches brutes (ni réseau, ni Chrome) :")
            if dry_run:
                print("  Simulation (--dry-run) : réanalyse non exécutée (elle réécrit des JSON).")
            for pilot in ([] if dry_run else pilots):
                try:
                    res = flights_db.reparse_pilot(conn, path, pilot)
                except Exception:
                    print(traceback.format_exc())
                    failed_pilots.append(pilot)
                    continue
                print(f"  {pilot} : {res['read']} fiche(s) relue(s), {res['updated']} JSON mis à jour, "
                      f"{len(res['errors'])} erreur(s)")
                for num, message in res["errors"][:5]:
                    print(f"     {num} : {message}")

        # Bilan de ce qui a été lu sur le disque, pilote par pilote
        for pilot in pilots:
            st = flights_db.summary(conn, path, pilot)
            print(f"{pilot} : {st['total']} dossier(s) de vol lu(s), {st['syride']} vol(s) Syride | "
                  f"sans GPX : {st['no_gpx']} | sans infos de fiche : {st['no_sheet']} | "
                  f"sans IGC : {st['no_igc']}{'' if fill_igc else ' (non traités sans --fill-igc)'} | "
                  f"sans fiche brute : {st['no_raw']} | "
                  f"sans lien, ignorés : {st['no_link']}")
            if st["orphans"]:
                print(f"   Attention : {len(st['orphans'])} dossier(s) sans JSON ignoré(s) "
                      f"(ex. {', '.join(sorted(st['orphans'])[:5])}). Un lancement avec scraping "
                      f"(sans --scrape 0) recrée leur JSON si le vol est encore sur Syride.")

        queue = [] if reparse else flights_db.get_global_queue(
            conn, pilots, fill_igc=fill_igc, tasks=tasks,
            files_by_pilot=files_by_pilot, backfill_raw=backfill_raw)

        if reparse:
            pass
        elif not queue:
            print("Rien à compléter : toutes les traces sont à jour.")
        else:
            per_pilot = {}
            for item in queue:
                per_pilot[item["pilot"]] = per_pilot.get(item["pilot"], 0) + 1
            print(f"{len(queue)} vol(s) à compléter : "
                  + ", ".join(f"{p} ({n})" for p, n in per_pilot.items()))
            kinds = {"info+files": 0, "info": 0, "files": 0, "raw": 0}
            for item in queue:
                kinds[flights_db.flight_kind(item)] += 1
            print(f"  dont : {kinds['info+files']} avec JSON incomplet + fichiers manquants | "
                  f"{kinds['info']} avec JSON incomplet seulement | "
                  f"{kinds['files']} avec fichiers manquants seulement (JSON complet) | "
                  f"{kinds['raw']} avec fiche brute manquante seulement"
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
                if downloads_blocked and not item["need_info"] and not (
                        item["need_raw"] and backfill_raw):
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
                        need_raw=item["need_raw"], files=files_by_pilot.get(pilot) or (),
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
            no_raw = {}
            for pilot in pilots:
                n = flights_db.summary(conn, path, pilot)["no_raw"]
                if n:
                    no_raw[pilot] = n
            if no_raw:
                print("Vols sans fiche brute : " + ", ".join(f"{p} ({n})" for p, n in no_raw.items())
                      + f" (total {sum(no_raw.values())}).")
            else:
                print("Tous les vols Syride ont leur fiche brute.")
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
