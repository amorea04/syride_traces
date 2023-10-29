import datetime as dt
import os
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta


def log_func(f):
    def wrapper(df, *args, **kwargs):
        tic = dt.datetime.now()
        result = f(df, *args, **kwargs)
        toc = dt.datetime.now()
        print(f"{f.__name__} took {toc - tic}, shape={df.shape}")
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


def extract_json_data(json_file):
    with open(json_file, "r") as file:
        data = json.load(file)
    return data


def create_dataframe_from_json(directory: str) -> pd.DataFrame:
    json_files = get_json_files(directory)
    data_list = [extract_json_data(file) for file in json_files]
    df = pd.DataFrame(data_list)
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

    df["duree_vol_minutes"] = df["duree_vol"].dt.total_seconds() / 60

    return df


@log_func
def flight_type(df: pd.DataFrame) -> pd.DataFrame:
    df["type_vol"] = np.where(df["types"] == "Vol moteur", "paramoteur", "parapente")
    df["type_vol"] = np.where(df["voile"] == "PIPER", "paramoteur", df["type_vol"])
    df["type_vol"] = np.where(df["voile"] == "savage", "parapente", df["type_vol"])
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
