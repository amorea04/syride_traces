"""
Fonctions de lecture et de préparation des données de vol (pipeline appliqué avant le pkl).

  - lecture des fichiers d'un vol : get_json_files, extract_json_data, get_first_coordinates
  - étapes du pipeline pandas      : valeurs_manquantes ... get_mean_site_coordinates
  - analyses annexes               : get_data_by_wing, prepare_data
"""

import datetime as dt
import json
import os
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd
from fastkml import kml


# Détail de chaque étape du pipeline (durée, taille) : SYRIDE_DEBUG=1 pour l'afficher
VERBOSE = os.getenv("SYRIDE_DEBUG", "0") == "1"


def log_func(f):
    def wrapper(df, *args, **kwargs):
        tic = dt.datetime.now()
        result = f(df, *args, **kwargs)
        toc = dt.datetime.now()
        if VERBOSE:
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




def extract_json_data(json_file):
    with open(json_file, "r") as file:
        data = json.load(file)
    return data


def get_first_coordinates(kml_file_path: str) -> list:
    """
    Fonction permettant l'ouverture des fichiers kml/gpx et de l'extraction
    des premières coordonnées longitude/latitude.

    arguments:
       kml_file_path: str = chemin du dossier d'un fichier kml/gpx.

    return:
       liste des premières coordonnées longitude/latitude de la trace.

    """
    if kml_file_path.lower().endswith(".gpx"):
        try:
            tree = ET.parse(kml_file_path)
            root = tree.getroot()
            for elem in root.iter():
                if elem.tag.endswith('trkpt') or elem.tag.endswith('wpt'):
                    lat = float(elem.attrib.get('lat', 0.0))
                    lon = float(elem.attrib.get('lon', 0.0))
                    return [lon, lat]
        except Exception as e:
            print(f"Erreur lors de la lecture du fichier GPX {kml_file_path}: {e}")
        return [0.0, 0.0]

    # Ouverture du fichier KML et lecture du contenu
    try:
        with open(kml_file_path, "rb") as kml_file:
            kml_document = kml_file.read()
            k = kml.KML()
            k.from_string(kml_document)

            coords = None
            for feature0 in k.features():
                for feature in feature0.features():
                    if isinstance(feature, kml.Placemark):
                        geometry = feature.geometry
                        if geometry and hasattr(geometry, 'coords'):
                            coords = list(geometry.coords)
                            break
                if coords:
                    break

            if coords and len(coords) > 0:
                longitude = coords[0][0]
                latitude = coords[0][1]
                return [longitude, latitude]
    except Exception as e:
        print(f"Erreur lors de la lecture du fichier KML {kml_file_path}: {e}")

    return [0.0, 0.0]






# Statistiques numériques d'un vol. Valeur inconnue = NaN (et non plus 0) : elle est
# ignorée automatiquement par les moyennes, maxima et filtres « > 0 » de l'app.
NUMERIC_STATS = [
    "distance",
    "distance_activite",
    "distance_cumulee",
    "vitesse_max",
    "vitesse_moyenne",
    "plafond",
    "gain",
    "vario_max",
    "g_max",
    # Colonnes optionnelles issues de la trace fv-config (vides sans fiche brute)
    "vario_min",
    "hauteur_sol_max",
    "heure_plafond",
]


@log_func
def valeurs_manquantes(df: pd.DataFrame) -> pd.DataFrame:
    df = df.replace("None", np.nan)

    col_fillna_00 = [
        "heure",
    ]
    df[col_fillna_00] = df[col_fillna_00].fillna("00:00:00")

    # Statistiques numériques et duree_vol : laissées vides (NaN / NaT) si inconnues.

    col_fillna_02 = [
        "instrument",
        "site_activite",
        "types",
        "site",
    ]
    df[col_fillna_02] = df[col_fillna_02].fillna("None")

    # date (page liste) est toujours connue ; date_activite (fiche) reste vide (NaT) si
    # inconnue, au lieu d'un faux 01/01/2000.
    df["date"] = df["date"].fillna("01/01/2000")

    return df


@log_func
def remove_too_low_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    Supression des vols dont le plafond est inferieur à 50 metres.
    Les vols « incomplets » (fiche non lue) sont conservés : leur plafond est inconnu,
    ils seront filtrés normalement une fois la fiche récupérée.
    """

    df["plafond"] = pd.to_numeric(df["plafond"], errors="coerce")

    # Plafond inconnu (NaN) : vol conservé
    df = df[(df["plafond"] > 50) | df["plafond"].isna()]

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
        "source_stats",
    ]

    int_features = ["num_activite"]

    date_features = ["date", "date_activite"]
    hour_features = ["heure"]

    duration_features = ["flight_time", "duree_vol"]

    # Les coordonnées restent NaN quand elles sont inconnues (vol sans GPX, ex. vol incomplet) :
    # un "-1" fausserait les moyennes par site.
    # Les statistiques numériques, date_activite et duree_vol restent vides si inconnues.
    keep_empty = {"longitude", "latitude", "date_activite", "duree_vol", *NUMERIC_STATS}
    df = df.fillna({col: "-1" for col in df.columns if col not in keep_empty})
    df[str_features] = df[str_features].astype(str)
    df[int_features] = df[int_features].astype(int)
    for col in NUMERIC_STATS:
        # Nombres décimaux : un entier ne peut pas contenir de valeur vide (NaN)
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(float)
    for col in date_features:
        df[col] = pd.to_datetime(df[col], format="%d/%m/%Y", errors="coerce")
    for col in hour_features:
        df[col] = pd.to_datetime(df[col], format="%Hh%M", errors="coerce").dt.time
    for col in duration_features:
        df[col] = pd.to_timedelta(df[col], errors="coerce")

    df["duree_vol_minutes"] = df["flight_time"].dt.total_seconds() / 60

    return df


def load_uniformisation(path: str) -> dict:
    """Règles d'uniformisation (uniformisation.json : voiles, sites, type de vol forcé,
    voiles exclues)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(
            f"Fichier de règles d'uniformisation introuvable : {path}"
        ) from None


def _variants_to_target(groups: dict) -> dict:
    """{"nom retenu": [variantes]} -> {variante: nom retenu}"""
    return {variant: target for target, variants in groups.items() for variant in variants}


@log_func
def remove_plane_flights(df: pd.DataFrame, rules: dict) -> pd.DataFrame:
    """
    Supression des vols autres que parapente / paramoteur (voiles_exclues des règles)
    """

    df = df[~(df["voile"].isin(rules.get("voiles_exclues", [])))]
    df = df.reset_index(drop=True)

    return df


@log_func
def flight_type(df: pd.DataFrame, rules: dict = None) -> pd.DataFrame:
    # « moteur » dans le type de vol Syride -> paramoteur, sinon parapente ;
    # puis type forcé pour certaines voiles (type_vol_force des règles)
    df["type_vol"] = np.where(df["types"].str.lower().str.contains("moteur", na=False), "paramoteur", "parapente")
    for type_vol, voiles in (rules or {}).get("type_vol_force", {}).items():
        df.loc[df["voile"].isin(voiles), "type_vol"] = type_vol

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
    df[var_interest] = df[var_interest].astype(str).replace(dict_values)
    return df


@log_func
def delete_zero_min_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    fonction permettant de supprimer les vols dont la durée est nulle.
    """
    df = df[~((df["duree_vol_minutes"] == 0) & (df["is_syride"] == True))]
    return df


# Colonnes qui définissent un vol « strictement identique » (même vol importé deux fois sur Syride).
# La voile n'en fait pas partie : 9 des 24 groupes de doublons ont la même trace sous deux voiles.
DUPLICATE_KEY = ["date", "heure", "site", "types", "duree_vol_minutes",
                 "distance", "plafond", "gain", "vitesse_max"]


@log_func
def remove_duplicate_flights(df: pd.DataFrame) -> pd.DataFrame:
    """
    Supprime les doublons strictement identiques d'un pilote (mêmes date, heure, site, type,
    durée et mesures, voile comprise ou non) ; garde le plus petit num_activite (le premier publié). Décision d'Adrien du 15/11/2026.
    """
    key = [c for c in DUPLICATE_KEY if c in df.columns]
    df = df.sort_values("num_activite")
    df = df[~df.duplicated(subset=key, keep="first")]
    return df.reset_index(drop=True)


@log_func
def uniformize_data(df: pd.DataFrame, rules: dict) -> pd.DataFrame:
    """
    Uniformise les noms de voiles (en minuscules) et de sites selon les règles
    (uniformisation.json).
    """
    df.loc[:, "voile"] = df["voile"].str.lower()
    df.loc[:, "voile"] = df["voile"].replace(_variants_to_target(rules.get("voile", {})))
    df.loc[:, "site"] = df["site"].replace(_variants_to_target(rules.get("site", {})))
    return df


@log_func
def get_mean_site_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fonction qui, à partir d'un dataframe contenant une colonne "site"
    et des colonnes longitude/latitude, calcule les longitudes/latitudes
    moyennes pour chaque sites.
    """

    # Coordonnées inconnues (vol sans GPX) : NaN, ignorées par la moyenne.
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")

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


def prepare_data(df: pd.DataFrame, rules: dict = None) -> pd.DataFrame:
    df_prep = (
        df.pipe(start_pipeline)
        .pipe(assign_data_types)
        .pipe(flight_type, rules=rules)
        .pipe(transform_dates)
        .pipe(get_season)
    )
    return df_prep
