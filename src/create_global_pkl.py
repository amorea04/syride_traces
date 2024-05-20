"""
Script used to create a uniformed pkl grouping all flights
from all pilots indicated in the param file.
"""

###########  IMPORTS  ################

import pickle
import pandas as pd
import datetime

import analyze_functions
import params_scrap_syride as params


################  SCRIPT  ################


def create_gobal_flight_data(common_filename: str, dict_filenames: str) -> None:
    df_names_raw = []

    # Import d'une df par pilote
    for name, foldername in dict_filenames.items():
        full_filename = f"{common_filename}{foldername}/"
        print(f"Collecting data for {name}...")
        df_data = analyze_functions.create_dataframe_from_json(directory=full_filename)
        print(f"Data for {name} collected.")
        print(f"Collecting site coordinates for {name}...")
        df_long_lat = analyze_functions.create_dataframe_from_all_kml(
            directory=full_filename
        )
        print(f"Site coordinates for {name} collected.", "\n")
        df = pd.merge(df_data, df_long_lat, on="num_activite", how="left")
        globals()[f"df_{name}_raw"] = df.copy()
        df_names_raw.append(f"df_{name}_raw")

    df_names = []
    list_dfs = []

    jours_replace = {
        "Monday": "lundi",
        "Tuesday": "mardi",
        "Wednesday": "mercredi",
        "Thursday": "jeudi",
        "Friday": "vendredi",
        "Saturday": "samedi",
        "Sunday": "dimanche",
    }

    mois_replace = {
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

    # Modification des dfs
    for df_name in df_names_raw:
        print("")
        print(df_name)
        name_df = str(df_name[:-4])
        globals()[f"{name_df}"] = (
            globals()[f"{df_name}"]
            .pipe(analyze_functions.start_pipeline)
            .pipe(analyze_functions.valeurs_manquantes)
            .pipe(analyze_functions.remove_too_low_flights)
            .pipe(analyze_functions.assign_data_types)
            .pipe(analyze_functions.remove_biplan_flights)
            .pipe(analyze_functions.uniformize_data)
            .pipe(analyze_functions.flight_type)
            .pipe(analyze_functions.transform_dates)
            .pipe(analyze_functions.get_season)
            .pipe(analyze_functions.delete_zero_min_flights)
            .pipe(analyze_functions.replace_values, dict_values=jours_replace)
            .pipe(
                analyze_functions.replace_values,
                dict_values=mois_replace,
                var_interest="mois",
            )
            .pipe(analyze_functions.get_mean_site_coordinates)
        )

        globals()[f"{name_df}_paramot"] = globals()[f"{name_df}"][
            globals()[f"{name_df}"]["type_vol"] == "paramoteur"
        ]

        df_names.append(f"{name_df}")
        list_dfs.append(globals()[f"{name_df}"])

    df_tot = pd.concat(list_dfs)

    df_tot["date_update"] = datetime.datetime.today()

    # Sauvegarde du pkl
    pickle_name = "global_flights_data.pkl"
    full_pickle_name = common_filename + pickle_name
    with open(full_pickle_name, "wb") as pickle_file:
        pickle.dump(df_tot, pickle_file)
    print(f"\n{pickle_name} sauvegardé !\n")


if __name__ == "__main__":
    common_filename = params.main_path
    dict_filenames = params.dict_pilotes

    create_gobal_flight_data(
        common_filename=common_filename, dict_filenames=dict_filenames
    )
