"""
Script used to scrap syride website to
download traces of a list of pilot.

La liste des vols de chaque pilote est lue par HTTP simple (sans Chrome). Une seule fenêtre
Chrome est ouverte pour tous les pilotes, seulement s'il y a des fiches de vol à lire. Si
Cloudflare ou Turnstile affiche une vérification, le script se met en pause jusqu'à ce qu'elle
soit validée dans la fenêtre.

Déroulement en 3 phases :
  1. liste des vols de TOUS les pilotes (HTTP, sans Chrome) et réconciliation avec le disque :
     vols nouveaux, modifiés, absents de Syride, réapparus ; rapport des doublons probables
  2. lecture des dossiers, puis consultation des fiches des vols à compléter : enregistrement
     de la fiche brute (qui contient la trace), informations propres à la fiche, et
     téléchargement des GPX / IGC pour les seuls pilotes dont le profil le prévoit
     (params_scrap_syride.FICHIERS_PAR_PILOTE)
  3. mise à jour de la base SQLite, puis génération du pkl

Modes :
  python main.py                    les 3 phases
  python main.py --scrape 0         saute la phase 1 : on complète seulement les vols déjà
                                    présents sur le disque
  python main.py --max-sheets 45    s'arrête après 45 fiches consultées (Syride limite le
                                    nombre de fiches par jour)
  python main.py --files auto|none|gpx|gpx,igc
                                    fichiers téléchargés : auto (défaut) = profils de
                                    FICHIERS_PAR_PILOTE ; sinon la valeur s'applique à tous
                                    les pilotes de l'exécution
  python main.py --fill-igc 1       complète aussi l'IGC des vols qui ont déjà leur GPX, pour
                                    les seuls pilotes dont les fichiers incluent igc
                                    (attention : une fiche consultée par vol)
  python main.py --backfill-raw 0   ne repasse pas par les vols à qui il ne manque que la
                                    fiche brute (1 par défaut : rattrapage progressif)
  python main.py --reparse 1        remplace les phases 1 et 2 par la réanalyse hors ligne des
                                    fiches brutes (ni réseau, ni Chrome), puis phase 3 et pkl
  python main.py --regen-sites 1    recrée entièrement le dictionnaire des coordonnées des sites
  python main.py --publish 1        après le pkl, publie la webapp (src/publish.py : export, build,
                                    contrôles, déploiement Cloudflare Pages) ; fonctionne aussi
                                    avec --pkl 0 (le pkl existant est alors publié) ; ignoré en
                                    --dry-run
  python main.py --db <chemin>      base SQLite (défaut : <chemin des données>/flights.db) ;
                                    avec une valeur personnalisée, exige --pkl 0 ou --dry-run 1
  python main.py --dry-run 1        SIMULATION : la phase 1 lit les listes sur Syride mais
                                    n'écrit rien ; la phase 2 liste ce qui serait fait, sans
                                    ouvrir Chrome, sans fiche, sans téléchargement, sans pkl
                                    (sans --db, l'index est lu sur une copie temporaire de la base : rien n'est modifié ;
                                    avec --db, ce fichier est mis à jour : utiliser une copie)
  --scroll                          obsolète (la liste n'est plus lue par défilement), sans effet
"""

# Imports
import argparse
import sys

import params_scrap_syride as params

VALID_FILE_EXTENSIONS = ("gpx", "igc")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="""Script dont l'objectif est de
        récupérer sur le site de syride l'ensemble des traces d'un pilote donné."""
    )
    parser.add_argument(
        "--scroll",
        type=int,
        default=None,
        help="OBSOLÈTE, sans effet : la liste des vols n'est plus lue par défilement de page.",
    )
    parser.add_argument(
        "--scrape",
        type=int,
        default=1,
        help="Lecture de la liste des vols des pilotes (phase 1) : 1=oui (defaut), 0=non "
        "(compléter seulement les traces déjà présentes sur le disque)",
    )
    parser.add_argument(
        "--files",
        type=str,
        default="auto",
        help="Fichiers téléchargés : auto (défaut) = profils de FICHIERS_PAR_PILOTE ; none, gpx "
        "ou gpx,igc = valeur appliquée à tous les pilotes de l'exécution.",
    )
    parser.add_argument(
        "--fill-igc",
        type=int,
        default=0,
        help="1 = compléter aussi l'IGC des vols qui ont déjà leur GPX mais pas d'IGC, pour les "
        "pilotes dont les fichiers incluent igc (une fiche consultée par vol : consomme le "
        "quota quotidien). 0 par défaut.",
    )
    parser.add_argument(
        "--backfill-raw",
        type=int,
        choices=(0, 1),
        default=1,
        help="1 (défaut) = rattraper aussi les fiches brutes manquantes des vols déjà connus ; "
        "0 = ne lire que les fiches utiles aux informations et aux fichiers.",
    )
    parser.add_argument(
        "--reparse",
        type=int,
        default=0,
        help="1 = réanalyse hors ligne des fiches brutes (ni réseau, ni Chrome) à la place des "
        "phases 1 et 2 ; puis phase 3 et pkl comme d'habitude.",
    )
    parser.add_argument(
        "--dry-run",
        type=int,
        default=0,
        help="1 = simulation : la liste des vols est lue sur Syride mais rien n'est écrit ; "
        "liste les vols à compléter sans ouvrir Chrome ni consulter de fiche, sans pkl.",
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
        "--publish",
        type=int,
        default=0,
        help="1 = après la génération du pkl (ou avec --pkl 0, à partir du pkl existant), "
        "publier la webapp avec src/publish.py. 0 par défaut. Ignoré avec --dry-run 1.",
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
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Chemin de la base SQLite flights.db (défaut : <chemin des données>/flights.db). "
        "Une base personnalisée exige --pkl 0 ou --dry-run 1 (le pkl lit la base par défaut).",
    )
    return parser


def parse_files_option(value: str):
    """
    Valeur de --files. Retourne None pour « auto » (profils de FICHIERS_PAR_PILOTE), sinon le
    tuple d'extensions appliqué à tous les pilotes ((), ("gpx",), ("gpx", "igc")).
    Lève ValueError si la valeur n'est pas reconnue.
    """
    text = ("auto" if value is None else value).strip().lower()
    if text == "auto":
        return None
    if text == "none":
        return ()
    extensions = tuple(e.strip() for e in text.split(",") if e.strip())
    if not extensions or any(e not in VALID_FILE_EXTENSIONS for e in extensions):
        raise ValueError(
            f"--files : valeur {value!r} invalide (attendu : auto, none, gpx ou gpx,igc)")
    return extensions


def parse_args(argv=None):
    """
    Analyse la ligne de commande. Ajoute à l'objet retourné `files_override` (None = auto, sinon
    tuple d'extensions) et `scroll_obsolete` (vrai si l'option obsolète --scroll a été donnée).
    """
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.files_override = parse_files_option(args.files)
    except ValueError as e:
        parser.error(str(e))
    args.scroll_obsolete = args.scroll is not None
    if args.db and args.pkl == 1 and not args.dry_run:
        parser.error("--db personnalisé : ajouter --pkl 0 (ou --dry-run 1), car la génération "
                     "du pkl lit toujours <chemin des données>/flights.db")
    return args


def effective_files(pilotes, files_override, profiles=None) -> dict:
    """Fichiers téléchargés par pilote : {pilote: tuple d'extensions} (tuple vide = aucun)."""
    profiles = params.FICHIERS_PAR_PILOTE if profiles is None else profiles
    if files_override is not None:
        return {p: tuple(files_override) for p in pilotes}
    return {p: tuple(profiles.get(p, ())) for p in pilotes}


def main(argv=None):
    args = parse_args(argv)

    # Imports tardifs : browser_session charge Chrome (undetected_chromedriver), inutile pour
    # analyser la ligne de commande.
    from browser_session import process_pilots
    from create_global_pkl import PklBuildError, create_gobal_flight_data

    if args.scroll_obsolete:
        print("Option --scroll obsolète : la liste des vols n'est plus lue par défilement de "
              "page, l'option est sans effet.")

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

    fill_igc = bool(args.fill_igc)
    if fill_igc:
        run_files = effective_files(pilotes, args.files_override)
        excluded = [p for p, files in run_files.items() if "igc" not in files]
        if len(excluded) == len(run_files):
            print("--fill-igc ignoré : aucun pilote de cette exécution n'a l'IGC dans ses fichiers "
                  "(voir --files et FICHIERS_PAR_PILOTE).")
            fill_igc = False
        elif excluded:
            print("--fill-igc sans effet pour (pas d'IGC dans leur profil) : " + ", ".join(excluded))

    # Scraping / complétion : une seule fenêtre pour tous les pilotes
    result = process_pilots(
        path=main_path,
        pilots=pilotes,
        do_scrape=bool(args.scrape),
        max_sheets=args.max_sheets if args.max_sheets > 0 else None,
        fill_igc=fill_igc,
        db_path=args.db,
        dry_run=bool(args.dry_run),
        files_by_pilot=params.FICHIERS_PAR_PILOTE,
        files_override=args.files_override,
        backfill_raw=bool(args.backfill_raw),
        reparse=bool(args.reparse),
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

    if args.publish == 1:
        import publish

        sys.exit(publish.main([]))


if __name__ == "__main__":
    main()
