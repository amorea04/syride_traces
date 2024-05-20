import datetime as dt
import os
import pandas as pd
import numpy as np
import json
from fastkml import kml

# from datetime import datetime, timedelta


def log_func(f):
    def wrapper(df, *args, **kwargs):
        tic = dt.datetime.now()
        result = f(df, *args, **kwargs)
        toc = dt.datetime.now()
        print(f"{f.__name__} took {toc - tic}, shape={result.shape}")
        return result

    return wrapper


@log_func
def start_pipeline(df: pd.DataFrame) -> pd.DataFrame:
    return df.copy()


def get_json_files(directory: str):
    json_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".json") and file[:-5].isdigit():
                json_files.append(os.path.join(root, file))
    return json_files


def get_kml_files(directory: str) -> dict:
    """
    Fonction qui itère l'ensemble des dossiers
    dans le dossier d'un pilote et qui recherhe tous les
    fichiers .kml

    arguments:
        directory: str = chemin du dossier dans lequel
        se trouvent les traces.

    return:
        dict de toutes les traces kml pour un pilote donné, avec :
            * key = le numéro de la trace
            * value = le chemin de la trace

    """
    kml_files = {}
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".kml") and file[:-5].isdigit():
                kml_files[file[:-4]] = os.path.join(root, file)
    return kml_files


def extract_json_data(json_file):
    with open(json_file, "r") as file:
        data = json.load(file)
    return data


def get_first_coordinates(kml_file_path: str) -> list:
    """
    Fonction permettant l'ouverture des fichiers kml et de l'extraction
    des premières coordonnées longitude/latitude.

    arguments:
        kml_file_path: str = chemin du dossier d'un fichier kml.

    return:
        liste des premières coordonnées longitude/latitude de la trace.

    """
    # Ouverture du fichier KML et lecture du contenu
    with open(kml_file_path, "rb") as kml_file:
        kml_document = kml_file.read()
        k = kml.KML()
        k.from_string(kml_document)

        for feature0 in k.features():
            for feature in feature0.features():
                if isinstance(feature, kml.Placemark):
                    geometry = feature.geometry
                    if geometry:
                        coords = list(geometry.coords)
                    else:
                        coords = [(0, 0, 0)]

    longitude = coords[0][0]
    latitude = coords[0][1]

    return [longitude, latitude]


def create_dataframe_from_json(directory: str) -> pd.DataFrame:
    json_files = get_json_files(directory=directory)
    data_list = [extract_json_data(json_file=file) for file in json_files]
    df = pd.DataFrame(data_list)
    return df


def create_dataframe_from_all_kml(directory: str) -> pd.DataFrame:
    """
    Fonction permettant de créer une dataframe avec l'ensemble des coordonnées
    longitude, latitude pour toutes les traces kml contenues dans le dossier d'un pilote.

    arguments:
        directory:str = le chemin du dossier contenant tous les dossiers / traces kml.


    return:
        df contenant pour chaque trace les longitudes, latitude du premier point.

    """
    dict_kml_files = get_kml_files(directory=directory)

    dict_first_coordinates = {
        flight: get_first_coordinates(kml_file_path)
        for flight, kml_file_path in dict_kml_files.items()
    }

    df = pd.DataFrame(dict_first_coordinates)
    df = df.transpose()
    df = df.reset_index(drop=False)
    df.columns = ["num_activite", "longitude", "latitude"]

    return df


@log_func
def valeurs_manquantes(df: pd.DataFrame) -> pd.DataFrame:
    df = df.replace("None", np.nan)

    col_fillna_00 = [
        "heure",
    ]
    df[col_fillna_00] = df[col_fillna_00].fillna("00:00:00")

    col_fillna_01 = [
        "distance",
        "distance_activite",
        "distance_cumulee",
        "vitesse_max",
        "vitesse_moyenne",
        "plafond",
        "gain",
        "duree_vol",
        "vario_max",
        "g_max",
    ]
    df[col_fillna_01] = df[col_fillna_01].fillna(0)

    col_fillna_02 = [
        "instrument",
        "site_activite",
        "adresse_zip",
        "types",
        "site",
    ]
    df[col_fillna_02] = df[col_fillna_02].fillna("None")

    col_fillna_03 = [
        "date_activite",
        "date",
    ]
    df[col_fillna_03] = df[col_fillna_03].fillna("01/01/2000")

    return df


@log_func
def remove_too_low_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    Supression des vols dont le pladond est inferieur à 50 metres
    """

    df["plafond"] = df["plafond"].astype(int)

    df = df[df["plafond"] > 50]

    return df


@log_func
def assign_data_types(df: pd.DataFrame) -> pd.DataFrame:
    str_features = [
        "pilote",
        "types",
        "site",
        "voile",
        "instrument",
        "site_activite",
        "adresse_zip",
    ]

    int_features = [
        "num_activite",
        "distance",
        "distance_activite",
        "distance_cumulee",
        "vitesse_max",
        "plafond",
        "gain",
    ]

    flt_features = [
        "vitesse_moyenne",
        "vario_max",
        "g_max",
    ]

    date_features = ["date", "date_activite"]
    hour_features = ["heure"]

    duration_features = ["flight_time", "duree_vol"]

    df = df.fillna("-1")
    df[str_features] = df[str_features].astype(str)
    df[int_features] = df[int_features].astype(int)
    df[flt_features] = df[flt_features].astype(float)
    for col in date_features:
        df[col] = pd.to_datetime(df[col], format="%d/%m/%Y")
    for col in hour_features:
        df[col] = pd.to_datetime(df[col], format="%Hh%M", errors="coerce").dt.time
    for col in duration_features:
        df[col] = pd.to_timedelta(df[col])

    df["duree_vol_minutes"] = df["flight_time"].dt.total_seconds() / 60

    return df


@log_func
def remove_biplan_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    Supression des vols réalisés en biplan
    """

    df = df[~(df["voile"] == "biplan celebri")]
    df = df.reset_index(drop=True)

    return df


@log_func
def flight_type(df: pd.DataFrame) -> pd.DataFrame:
    df["type_vol"] = np.where(df["types"] == "Vol moteur", "paramoteur", "parapente")
    df.loc[
        df["voile"].isin(["piper", "piper tandem"]),
        "type_vol",
    ] = "paramoteur"
    df.loc[
        df["voile"].isin(["savage", "leaf 2", "leaf 3 light", "taska", "artik"]),
        "type_vol",
    ] = "parapente"

    return df


@log_func
def transform_dates(df: pd.DataFrame) -> pd.DataFrame:
    df["annee"] = df["date"].dt.year
    df["mois"] = df["date"].dt.month
    df["jour_semaine"] = df["date"].dt.day_name()
    return df


@log_func
def get_season(df: pd.DataFrame) -> pd.DataFrame:
    df.loc[df["mois"].isin([12, 1, 2]), "saison"] = "hiver"
    df.loc[df["mois"].isin([3, 4, 5]), "saison"] = "printemps"
    df.loc[df["mois"].isin([6, 7, 8]), "saison"] = "été"
    df.loc[df["mois"].isin([9, 10, 11]), "saison"] = "automne"
    return df


@log_func
def replace_values(
    df: pd.DataFrame, dict_values: dict, var_interest: str = "jour_semaine"
):
    """
    Fonction permettant de remplacer des valeurs en fonction d'un dictionnaire.
    """
    df[var_interest] = df[var_interest].astype(str)
    for key, value in dict_values.items():
        df.loc[df[var_interest] == key, var_interest] = value
    return df


@log_func
def delete_zero_min_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    fonction permettant de supprimer les vols dont la durée est nulle.
    """
    df = df[~((df["duree_vol_minutes"] == 0) & (df["is_syride"] == True))]
    return df


@log_func
def uniformize_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fonction pour uniformiser les données.
    """
    # transform variable "voile"
    df.loc[:, "voile"] = df["voile"].str.lower()
    df.loc[df["voile"].isin(["boxer", "boxer j mou", "boxer pascal"]), "voile"] = (
        "boxer"
    )
    df.loc[df["voile"].isin(["boxer gt", "boxer gt 16um"]), "voile"] = "boxer gt"
    df.loc[df["voile"].isin(["buldog", "bulldog bi 16wl", "bulld"]), "voile"] = "buldog"
    df.loc[df["voile"].isin(["daytona", "daytona yellow airrace"]), "voile"] = "daytona"
    df.loc[df["voile"].isin(["démo", "non renseig"]), "voile"] = "inconnue"
    df.loc[df["voile"].isin(["piper", "pipper"]), "voile"] = "piper"
    df.loc[df["voile"].isin(["dolpo 3 katia"]), "voile"] = "dolpo 3"

    # Uniformisation site
    df.loc[df["site"].isin(["Idikel", "Idikl"]), "site"] = "Idikel"
    df.loc[df["site"].isin(["Fayard", "Fayards"]), "site"] = "Fayards"
    df.loc[
        df["site"].isin(
            ["Magnac Lavalette Paramoteur", "Magnac Lavalette Treuil", "Magnac"]
        ),
        "site",
    ] = "Magnac Lavalette"
    df.loc[df["site"].isin(["Accous - 500", "Accous-500", "Accous 500"]), "site"] = (
        "Accous-500"
    )

    return df


@log_func
def get_mean_site_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fonction qui, à partir d'un dataframe contenant une colonne "site"
    et des colonnes longitude/latitude, calcule les longitudes/latitudes
    moyennes pour chaque sites.
    """

    df_long_lat_by_site = (
        df[["site", "longitude", "latitude"]].groupby("site", as_index=False).mean()
    )

    dict_mean_long_by_site = {
        site: longitude
        for site, longitude in zip(
            df_long_lat_by_site["site"], df_long_lat_by_site["longitude"]
        )
    }
    dict_mean_lat_by_site = {
        site: latitude
        for site, latitude in zip(
            df_long_lat_by_site["site"], df_long_lat_by_site["latitude"]
        )
    }

    df["mean_longitude"] = df["site"].map(dict_mean_long_by_site)
    df["mean_latitude"] = df["site"].map(dict_mean_lat_by_site)

    return df


def get_data_by_wing(df: pd.DataFrame, spec_feat: list) -> pd.DataFrame:
    """
    returns :
        * données moyennes par voile (df_wing_moy),
        * données max par voile (df_wing_max)
    """
    const_feats = [
        "pilote",
        "distance_cumulee",
        "vitesse_max",
        "plafond",
        "gain",
        "vitesse_moyenne",
        "vario_max",
        "g_max",
        "duree_vol_minutes",
    ]
    all_feats = spec_feat + const_feats
    agg_feats = ["pilote"] + spec_feat
    df_wing_moy = (
        df[all_feats]
        .groupby(agg_feats, as_index=False)
        .agg(
            nombre_vol=(spec_feat[0], "count"),
            distance_moyenne=("distance_cumulee", "mean"),
            vitesse_max_moyenne=("vitesse_max", "mean"),
            plafond_moyenne=("plafond", "mean"),
            gain_moyenne=("gain", "mean"),
            vitesse_moy_moyenne=("vitesse_moyenne", "mean"),
            vario_max_moyenne=("vario_max", "mean"),
            g_max_moyenne=("g_max", "mean"),
            duree_vol_moyenne=("duree_vol_minutes", "mean"),
        )
    )

    df_wing_max = (
        df[all_feats]
        .groupby(agg_feats, as_index=False)
        .agg(
            nombre_vol=(spec_feat[0], "count"),
            distance_max=("distance_cumulee", "max"),
            vitesse_max_max=("vitesse_max", "max"),
            plafond_max=("plafond", "max"),
            gain_max=("gain", "max"),
            vitesse_moy_max=("vitesse_moyenne", "max"),
            vario_max_max=("vario_max", "max"),
            g_max_max=("g_max", "max"),
            duree_vol_max=("duree_vol_minutes", "max"),
        )
    )
    return df_wing_moy, df_wing_max


def prepare_data(df: pd.DataFrame) -> pd.DataFrame:
    df_prep = (
        df.pipe(start_pipeline)
        .pipe(assign_data_types)
        .pipe(flight_type)
        .pipe(transform_dates)
        .pipe(get_season)
    )
    return df_prep
