"""
Script used to scrap syride website to
download traces of a list of pilot.

Une seule fenêtre Chrome est ouverte pour tous les pilotes.
Si Cloudflare affiche une vérification, le script se met en pause
jusqu'à ce qu'elle soit validée dans la fenêtre.

Déroulement en 3 phases :
  1. identification des nouvelles traces de TOUS les pilotes + enregistrement des informations
     de la page liste (aucune fiche consultée)
  2. lecture des dossiers, puis consultation des fiches des vols à compléter (informations
     propres à la fiche + téléchargement des GPX et IGC manquants)
  3. mise à jour de la base SQLite, puis génération du pkl

Modes :
  python main.py                    les 3 phases
  python main.py --scrape 0         saute la phase 1 : on complète seulement les vols déjà
                                    présents sur le disque
  python main.py --max-sheets 45    s'arrête après 45 fiches consultées (Syride limite le
                                    nombre de fiches par jour)
  python main.py --fill-igc 1       complète aussi l'IGC des vols qui ont déjà leur GPX
                                    (attention : une fiche consultée par vol)
  python main.py --regen-sites 1    recrée entièrement le dictionnaire des coordonnées des sites
  python main.py --dry-run 1        SIMULATION : lit les dossiers et liste ce qui serait fait,
                                    sans ouvrir Chrome, sans fiche, sans téléchargement, sans pkl
"""

# Imports
import argparse
import sys

import params_scrap_syride as params
from browser_session import process_pilots
from create_global_pkl import PklBuildError, create_gobal_flight_data


def main():
    parser = argparse.ArgumentParser(
        description="""Script dont l'objectif est de
        récupérer sur le site de syride l'ensemble des traces d'un pilote donné."""
    )
    parser.add_argument(
        "--scroll",
        type=int,
        default=-1,
        help="Nombre MAXIMUM de défilements de la page d'un pilote (-1 = automatique, 60). "
        "Le défilement s'arrête dès qu'une trace déjà connue est chargée, ou en bas de page.",
    )
    parser.add_argument(
        "--scrape",
        type=int,
        default=1,
        help="Scraping des pages pilotes : 1=oui (defaut), 0=non (compléter seulement "
        "les traces déjà présentes sur le disque mais sans GPX)",
    )
    parser.add_argument(
        "--fill-igc",
        type=int,
        default=0,
        help="1 = compléter aussi l'IGC des vols qui ont déjà leur GPX mais pas d'IGC "
        "(une fiche consultée par vol : consomme le quota quotidien). 0 par défaut.",
    )
    parser.add_argument(
        "--dry-run",
        type=int,
        default=0,
        help="1 = simulation : liste les vols à compléter (dossiers lus, GPX/infos manquants) "
        "sans ouvrir Chrome ni consulter de fiche, et sans générer le pkl.",
    )
    parser.add_argument(
        "--max-sheets",
        type=int,
        default=0,
        help="Nombre maximum de fiches de vol consultées pendant l'exécution "
        "(0 = pas de plafond ; le script s'arrête de toute façon si Syride bloque).",
    )
    parser.add_argument(
        "--pkl",
        type=int,
        default=1,
        help="Construction du fichier pkl : 1=oui (defaut), 0=non",
    )
    parser.add_argument(
        "--regen-sites",
        type=int,
        default=0,
        help="1 = recréer entièrement le dictionnaire des coordonnées des sites "
        "(sites_coordinates.json). 0 par défaut : mise à jour incrémentale.",
    )
    parser.add_argument(
        "--pilots",
        type=str,
        default=None,
        help="Liste de pilotes séparés par des virgules (écrase params.pilots pour le scraping).",
    )
    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="Chemin de base pour enregistrer les traces (écrase les paramètres importés).",
    )

    args = parser.parse_args()

    main_path = args.path if args.path is not None else params.main_path

    if args.pilots:
        pilotes = [p.strip() for p in args.pilots.split(",")]
    else:
        pilotes = params.pilots

    # Le pkl est toujours construit à partir de TOUS les pilotes connus
    # (sinon un run avec --pilots écraserait le pkl global avec ces seuls pilotes).
    dict_filenames = dict(params.dict_pilotes)
    known_folders = set(dict_filenames.values())
    for p in pilotes:
        if p not in known_folders:
            dict_filenames[p.lower()] = p

    # Scraping / complétion : une seule fenêtre pour tous les pilotes
    result = process_pilots(
        path=main_path,
        pilots=pilotes,
        scroll=args.scroll,
        do_scrape=bool(args.scrape),
        max_sheets=args.max_sheets if args.max_sheets > 0 else None,
        fill_igc=bool(args.fill_igc),
        dry_run=bool(args.dry_run),
    )

    print(f"Fiches de vol consultées : {result['sheets_used']}")
    if result["pending"]:
        print(f"Vols restant à compléter : {result['pending']}")
    if result["failed_pilots"]:
        print(f"Pilotes en échec : {', '.join(result['failed_pilots'])}")

    if args.dry_run:
        return

    # Le pkl est généré même si Syride a limité les téléchargements : il contient tous
    # les vols dont la fiche a été lue.
    if args.pkl == 1:
        print("Génération du fichier global flight data...")
        try:
            create_gobal_flight_data(
                common_filename=main_path,
                dict_filenames=dict_filenames,
                regenerate_sites=bool(args.regen_sites),
            )
        except PklBuildError as e:
            print(f"\nERREUR pkl : {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()
