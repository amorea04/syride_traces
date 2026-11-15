"""
Script used to create a uniformed pkl grouping all flights
from all pilots indicated in the param file.

Les données sont lues depuis l'index SQLite (flights_db), mis à jour à chaque lancement en
parcourant les dossiers : les coordonnées de départ (lecture des GPX/KML) ne sont plus
recalculées pour tous les vols à chaque fois. Le DataFrame produit est identique à celui de
l'ancienne version, donc le pkl a le même format.
"""

###########  IMPORTS  ################

import os
import pickle
import traceback
import pandas as pd
import datetime

import analyze_functions
import flights_db
import sites_coordinates
import params_scrap_syride as params

################  CONSTANTS  ################

JOURS_REPLACE = {
    "Monday": "lundi",
    "Tuesday": "mardi",
    "Wednesday": "mercredi",
    "Thursday": "jeudi",
    "Friday": "vendredi",
    "Saturday": "samedi",
    "Sunday": "dimanche",
}

MOIS_REPLACE = {
    "1": "janvier",
    "2": "fevrier",
    "3": "mars",
    "4": "avril",
    "5": "mai",
    "6": "juin",
    "7": "juillet",
    "8": "aout",
    "9": "septembre",
    "10": "octobre",
    "11": "novembre",
    "12": "decembre",
}

################  SCRIPT  ################


UNIFORMISATION_NAME = "uniformisation.json"
PKL_NAME = "global_flights_data.pkl"


class PklBuildError(Exception):
    """Au moins un pilote n'a pas pu être traité : le pkl existant n'est pas écrasé."""


def _save_pickle_atomic(obj, path: str) -> None:
    """Écrit dans un fichier temporaire puis le renomme : un plantage pendant l'écriture
    laisse l'ancien pkl intact (l'app ne lit jamais un pkl à moitié écrit)."""
    tmp_path = path + ".tmp"
    with open(tmp_path, "wb") as f:
        pickle.dump(obj, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def create_gobal_flight_data(
    common_filename: str, dict_filenames: dict, regenerate_sites: bool = False,
    allow_partial: bool = False,
) -> None:
    """
    Construit le pkl de tous les pilotes de dict_filenames ({nom court: dossier}).

    Si un pilote ayant des vols ne peut pas être lu ou traité, le pkl existant n'est PAS
    écrasé (PklBuildError), pour ne pas publier un pkl où ce pilote aurait disparu.
    allow_partial=True : écrit quand même le pkl, sans les pilotes en échec.
    """
    rules = analyze_functions.load_uniformisation(
        os.path.join(common_filename, UNIFORMISATION_NAME)
    )

    dfs_raw = {}
    failures = {}   # nom -> message
    empty = []      # pilotes sans aucun vol (dossier absent ou vide) : pas une erreur

    db_path = os.path.join(common_filename, flights_db.DB_NAME)
    conn = flights_db.connect(db_path)

    # Une df par pilote, depuis l'index (mis à jour d'abord depuis les dossiers)
    try:
        for name, foldername in dict_filenames.items():
            print(f"Collecting data for {name}...")
            try:
                nb = flights_db.sync_pilot(conn, common_filename, foldername)
                df_data, df_long_lat = flights_db.load_pilot_frames(conn, foldername)

                if df_data.empty:
                    print(f"Warning: No flight data found for {name} ({nb} vol(s) dans le dossier)")
                    empty.append(name)
                    continue

                df = pd.merge(df_data, df_long_lat, on="num_activite", how="left")
                dfs_raw[name] = df.copy()
            except Exception as e:
                print(traceback.format_exc())
                failures[name] = f"lecture : {e}"
    finally:
        conn.close()

    list_dfs = []
    counts = {}

    # Modification des dfs
    for name, df_raw in dfs_raw.items():
        try:
            df = (
                df_raw
                .pipe(analyze_functions.start_pipeline)
                .pipe(analyze_functions.valeurs_manquantes)
                .pipe(analyze_functions.remove_too_low_flights)
                .pipe(analyze_functions.assign_data_types)
                .pipe(analyze_functions.remove_plane_flights, rules=rules)
                .pipe(analyze_functions.uniformize_data, rules=rules)
                .pipe(analyze_functions.flight_type, rules=rules)
                .pipe(analyze_functions.transform_dates)
                .pipe(analyze_functions.get_season)
                .pipe(analyze_functions.delete_zero_min_flights)
                .pipe(analyze_functions.replace_values, dict_values=JOURS_REPLACE)
                .pipe(
                    analyze_functions.replace_values,
                    dict_values=MOIS_REPLACE,
                    var_interest="mois",
                )
            )
            list_dfs.append(df)
            counts[name] = len(df)
        except Exception as e:
            print(traceback.format_exc())
            failures[name] = f"traitement : {e}"

    # Bilan
    print("\nBilan du pkl :")
    for name, n in counts.items():
        print(f"  {name:15s} {n:5d} vol(s)")
    if empty:
        print(f"  Sans vol : {', '.join(empty)}")
    if failures:
        print("  EN ÉCHEC :")
        for name, msg in failures.items():
            print(f"    {name} ({dict_filenames[name]}) : {msg}")

    if not list_dfs:
        raise PklBuildError("Aucun pilote n'a pu être traité : pkl non généré.")
    if failures and not allow_partial:
        raise PklBuildError(
            f"{len(failures)} pilote(s) en échec ({', '.join(failures)}) : le pkl existant "
            f"n'est PAS écrasé. Corrige l'erreur ci-dessus, ou relance avec "
            f"allow_partial=True pour l'écrire sans ces pilotes."
        )

    df_tot = pd.concat(list_dfs)

    # Coordonnées uniques par site (tous pilotes confondus), depuis le dictionnaire
    sites_path = os.path.join(common_filename, sites_coordinates.SITES_COORDS_NAME)
    sites_coords = sites_coordinates.update_sites_coordinates(
        df_tot, sites_path, regenerate=regenerate_sites
    )
    df_tot = sites_coordinates.apply_sites_coordinates(df_tot, sites_coords)

    df_tot["date_update"] = datetime.datetime.today()

    # Sauvegarde du pkl
    full_pickle_name = os.path.join(common_filename, PKL_NAME)
    _save_pickle_atomic(df_tot, full_pickle_name)
    print(f"\n{PKL_NAME} sauvegardé : {len(df_tot)} vols, {len(counts)} pilote(s).\n")


if __name__ == "__main__":
    common_filename = params.main_path
    dict_filenames = params.dict_pilotes

    create_gobal_flight_data(
        common_filename=common_filename, dict_filenames=dict_filenames
    )
