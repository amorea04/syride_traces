"""
Diagnostic : ouvre la page d'un vol Syride dans Chrome (même profil que main.py,
donc connexion/Cloudflare déjà gérés) et enregistre ce qu'elle contient réellement.

Usage (depuis le dossier des scripts, comme main.py) :
    python src/debug_flight_page.py --pilot AdrienM --trace 3766574

Résultat : un dossier _debug_flight_<trace>/ dans main_path contenant
    - summary.txt   : résumé (iframes, liens, cookies [noms seulement])
    - parent.html   : HTML de la page du vol
    - page.png      : capture d'écran
    - iframe_<n>.html : contenu de chaque iframe, lue DANS le contexte de la page

ATTENTION : parent.html peut contenir des informations personnelles
(ex. ton adresse e-mail de connexion). Vérifie avant de partager.
"""

import argparse
import os
import time

from selenium.webdriver.common.by import By

import params_scrap_syride as params
from browser_session import create_driver, open_site_and_login, wait_for_cloudflare

KEYWORDS = ("download", "gpx", "zip", "kml", "fichevol")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", required=True, help="Nom du pilote (dossier), ex. AdrienM")
    parser.add_argument("--trace", required=True, help="Numéro de la trace, ex. 3766574")
    parser.add_argument("--path", default=None, help="Chemin de base (défaut : params.main_path)")
    parser.add_argument("--wait", type=int, default=8, help="Secondes d'attente après chargement")
    args = parser.parse_args()

    path = args.path if args.path is not None else params.main_path
    out_dir = os.path.join(path, f"_debug_flight_{args.trace}")
    os.makedirs(out_dir, exist_ok=True)

    download_dir = os.path.abspath(os.path.join(path, "_tmp_downloads_debug"))
    profile_dir = os.path.abspath(os.path.join(path, "_chrome_profile"))
    os.makedirs(download_dir, exist_ok=True)

    lines = []

    def log(msg=""):
        print(msg, flush=True)
        lines.append(str(msg))

    driver = None
    try:
        driver = create_driver(download_dir=download_dir, profile_dir=profile_dir)
        open_site_and_login(driver)

        url = f"https://www.syride.com/fr/pilotes/{args.pilot}/{args.trace}"
        log(f"URL demandée : {url}")
        driver.get(url)
        wait_for_cloudflare(driver)
        time.sleep(args.wait)

        log(f"URL finale   : {driver.current_url}")
        log(f"Titre        : {driver.title!r}")

        with open(os.path.join(out_dir, "parent.html"), "w", encoding="utf-8") as fp:
            fp.write(driver.page_source)
        driver.save_screenshot(os.path.join(out_dir, "page.png"))

        # Cookies : noms uniquement (pas les valeurs)
        names = sorted({c["name"] for c in driver.get_cookies()})
        log(f"Cookies (noms) : {names}")

        # Liens intéressants dans la page parente
        log("\n--- Liens <a> de la page contenant un mot-clé ---")
        found = 0
        for a in driver.find_elements(By.TAG_NAME, "a"):
            href = a.get_attribute("href") or ""
            if any(k in href.lower() for k in KEYWORDS):
                log(f"  {href}")
                found += 1
        if found == 0:
            log("  (aucun)")

        # Iframes
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        log(f"\n--- {len(iframes)} iframe(s) dans la page ---")
        for idx, fr in enumerate(iframes):
            log(
                f"  [{idx}] id={fr.get_attribute('id')!r} name={fr.get_attribute('name')!r} "
                f"src={fr.get_attribute('src')!r}"
            )

        # Contenu de chaque iframe, lu dans le contexte de la page
        for idx in range(len(iframes)):
            try:
                driver.switch_to.default_content()
                frames_now = driver.find_elements(By.TAG_NAME, "iframe")
                driver.switch_to.frame(frames_now[idx])
                time.sleep(2)
                html = driver.page_source
                with open(os.path.join(out_dir, f"iframe_{idx}.html"), "w", encoding="utf-8") as fp:
                    fp.write(html)
                log(f"\n  iframe [{idx}] : {len(html)} caractères")
                for a in driver.find_elements(By.TAG_NAME, "a"):
                    href = a.get_attribute("href") or ""
                    if any(k in href.lower() for k in KEYWORDS):
                        log(f"    lien : {href}")
                log(f"    éléments .volTexte (ancienne fiche) : "
                    f"{len(driver.find_elements(By.CLASS_NAME, 'volTexte'))}")
                log(f"    éléments .fv-metric (fiche actuelle) : "
                    f"{len(driver.find_elements(By.CLASS_NAME, 'fv-metric'))}")
            except Exception as e:
                log(f"  iframe [{idx}] : erreur de lecture ({e})")
            finally:
                driver.switch_to.default_content()

        log(f"\nFichiers enregistrés dans : {out_dir}")
    finally:
        if driver is not None:
            driver.quit()
        with open(os.path.join(out_dir, "summary.txt"), "w", encoding="utf-8") as fp:
            fp.write("\n".join(lines))


if __name__ == "__main__":
    main()
