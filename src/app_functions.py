"""
Fonctions de l'application Dash (statistiques de vol) :
  - get_flight_params   : chiffres clés affichés dans les cartes
  - get_selected_df     : filtrage selon les menus de la barre latérale
  - create_grouped_df   : agrégations par année / pilote / mois / voile / jour / saison / site
  - create_graph, create_all_plots : graphiques
"""

import numpy as np
import pandas as pd
import plotly.express as px

# Statistiques issues de la fiche de vol : inconnues (vides dans le pkl) pour un vol « incomplet »
FICHE_STATS = [
    "vitesse_moyenne", "vitesse_max", "distance_cumulee",
    "vario_max", "g_max", "plafond",
]

# Ordre d'affichage des catégories (le tri alphabétique n'aurait pas de sens)
CATEGORY_ORDERS = {
    "jour_semaine": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    "mois": [
        "janvier", "fevrier", "mars", "avril", "mai", "juin",
        "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
    ],
    "saison": ["hiver", "printemps", "été", "automne"],
}


def get_flight_params(df: pd.DataFrame) -> dict:
    """
    Calcule les chiffres clés d'un ensemble de vols.

    arguments:
        df: DataFrame de vols (format du pkl)

    retourne un dict de textes prêts à afficher :
        - nb_tot_vols                      : nombre total de vols
        - tot_heures_vol                   : nombre total d'heures de vol
        - nb_tot_sites                     : nombre de sites visités
        - nb_tot_pilots                    : nombre de pilotes
        - print_speed_tot                  : vitesses moyennes et max
        - mean_max_flight_duration_tot_str : durée moyenne et max de vol
        - mean_max_flight_distance_tot_str : distance moyenne et max de vol
        - mean_max_flight_ceiling_tot_str  : plafond moyen et max de vol
        - mean_max_flight_vario_tot_str    : vario max moyen et maximum
        - mean_max_flight_g_tot_str        : facteur g moyen et maximum
    """

    # Nb tot vols
    nb_tot_vols = str(df.shape[0])

    # heures tot de vol
    nb_tot_minutes = int(round(df["duree_vol_minutes"].sum(), 0))
    nb_tot_heures_pleines = nb_tot_minutes // 60
    nb_tot_minutes_pleines = nb_tot_minutes % 60
    tot_heures_vol = (
        f"{nb_tot_heures_pleines} heures et {nb_tot_minutes_pleines} minutes"
    )

    # Nb sites de vol
    nb_tot_sites = str(len(df["site"].unique()))

    # Nb de pilotes
    nb_tot_pilots = str(len(df["pilote"].unique()))

    # vitesses de vol
    mean_mean_flight_speed_tot = str(
        round(df[df["vitesse_moyenne"] > 0]["vitesse_moyenne"].mean(), 1)
    )
    mean_max_flight_speed_tot = str(
        round(df[df["vitesse_max"] > 0]["vitesse_max"].mean(), 1)
    )
    max_mean_flight_speed_tot = str(
        round(df[df["vitesse_moyenne"] > 0]["vitesse_moyenne"].max(), 1)
    )
    max_max_flight_speed_tot = str(
        round(df[df["vitesse_max"] > 0]["vitesse_max"].max(), 1)
    )
    print_speed_tot = f"""
        - - {mean_mean_flight_speed_tot} ({max_mean_flight_speed_tot}) - - | - - {mean_max_flight_speed_tot} ({max_max_flight_speed_tot}) - -
    """

    # durée de vol
    mean_flight_duration_tot = str(int(round(df["duree_vol_minutes"].mean(), 0)))
    max_flight_duration_tot = str(int(round(df["duree_vol_minutes"].max(), 0)))
    mean_max_flight_duration_tot_str = (
        f"{mean_flight_duration_tot} ({max_flight_duration_tot}) minutes."
    )

    # distance cumulee moyenne
    mean_flight_distance_tot = str(
        round(df[df["distance_cumulee"] > 0]["distance_cumulee"].mean(), 1)
    )
    max_flight_distance_tot = str(
        round(df[df["distance_cumulee"] > 0]["distance_cumulee"].max(), 1)
    )
    mean_max_flight_distance_tot_str = (
        f"{mean_flight_distance_tot} ({max_flight_distance_tot}) km."
    )

    # Plafond moyen (max)
    mean_flight_ceiling_tot = str(
        int(round(df[df["plafond"] > 0]["plafond"].mean(), 0))
    )
    max_flight_ceiling_tot = str(int(round(df[df["plafond"] > 0]["plafond"].max(), 0)))
    mean_max_flight_ceiling_tot_str = (
        f"{mean_flight_ceiling_tot} ({max_flight_ceiling_tot}) m."
    )

    # vario_max moyen
    mean_flight_vario_tot = str(round(df[df["vario_max"] > 0]["vario_max"].mean(), 1))
    max_flight_vario_tot = str(round(df[df["vario_max"] > 0]["vario_max"].max(), 1))
    mean_max_flight_vario_tot_str = (
        f"{mean_flight_vario_tot} ({max_flight_vario_tot}) m/s."
    )

    # g_max moyen
    mean_flight_g_tot = str(round(df[df["g_max"] > 0]["g_max"].mean(), 1))
    max_flight_g_tot = str(round(df[df["g_max"] > 0]["g_max"].max(), 1))
    mean_max_flight_g_tot_str = f"{mean_flight_g_tot} ({max_flight_g_tot}) g."

    return {
        "nb_tot_vols": nb_tot_vols,
        "tot_heures_vol": tot_heures_vol,
        "nb_tot_sites": nb_tot_sites,
        "nb_tot_pilots": nb_tot_pilots,
        "print_speed_tot": print_speed_tot,
        "mean_max_flight_duration_tot_str": mean_max_flight_duration_tot_str,
        "mean_max_flight_distance_tot_str": mean_max_flight_distance_tot_str,
        "mean_max_flight_ceiling_tot_str": mean_max_flight_ceiling_tot_str,
        "mean_max_flight_vario_tot_str": mean_max_flight_vario_tot_str,
        "mean_max_flight_g_tot_str": mean_max_flight_g_tot_str,
    }


def get_selected_df(df: pd.DataFrame, dict_parameters: dict) -> pd.DataFrame:
    """
    Sélectionne les vols correspondant aux menus de la barre latérale.
    Un menu vide signifie « tout sélectionner ».

    arguments :
        - df : DataFrame complet de tous les vols
        - dict_parameters : dict contenant
            * pilots_list        -> pilotes sélectionnés (ou "Tous les pilotes"),
            * activity_list      -> activité : "paramoteur", "parapente" ou "Toutes",
            * year_list          -> années sélectionnées,
            * year_possibilities -> années possibles (utilisées si year_list est vide),
            * wing_list          -> voiles sélectionnées,
            * site_list          -> sites sélectionnés

    retourne le DataFrame filtré.
    """
    pilots = dict_parameters["pilots_list"]
    if len(pilots) == 0 or "Tous les pilotes" in pilots:
        pilots = list(df["pilote"].unique())

    activity = dict_parameters["activity_list"]
    activities = ["paramoteur", "parapente"] if activity == "Toutes" else [activity]

    years = [int(x) for x in dict_parameters["year_list"]]
    if len(years) == 0:
        years = [int(x) for x in dict_parameters["year_possibilities"]]

    wings = list(dict_parameters["wing_list"])
    if len(wings) == 0:
        wings = sorted(df["voile"].unique())

    sites = list(dict_parameters["site_list"])
    if len(sites) == 0:
        sites = sorted(df["site"].unique())

    return df[
        df["pilote"].isin(pilots)
        & df["type_vol"].isin(activities)
        & df["annee"].isin(years)
        & df["voile"].isin(wings)
        & df["site"].isin(sites)
    ]


def create_grouped_df(df: pd.DataFrame, group_var: list[str]):
    """
    Agrège les vols par la variable group_var[0] (année, pilote, mois, voile, jour, saison
    ou site) : une ligne par valeur, avec les statistiques utilisées par les graphiques.
    """
    var_name = group_var[0]

    # Les vols incomplets comptent (nb de vols, durée...) mais pas dans les moyennes / max
    # des statistiques de la fiche, qu'ils ne connaissent pas encore.
    if "incomplet" in df.columns and df["incomplet"].any():
        df = df.copy()
        df[FICHE_STATS] = df[FICHE_STATS].astype(float)
        df.loc[df["incomplet"].astype(bool), FICHE_STATS] = np.nan

    df_grouped = df.groupby(by=group_var, as_index=False).agg(
        nb_vols=(var_name, "count"),
        nb_pilotes=("pilote", "nunique"),
        nb_sites_visites=("site", "nunique"),
        nb_voiles_utilisees=("voile", "nunique"),
        moyenne_vitesse_moyenne=("vitesse_moyenne", "mean"),
        max_vitesse_moyenne=("vitesse_moyenne", "max"),
        moyenne_vitesse_max=("vitesse_max", "mean"),
        max_vitesse_max=("vitesse_max", "max"),
        moyenne_distance_cumulee=("distance_cumulee", "mean"),
        max_distance_cumulee=("distance_cumulee", "max"),
        cumul_duree_vol=("duree_vol_minutes", lambda x: x.sum() / 60),
        moyenne_duree_vol=("duree_vol_minutes", "mean"),
        max_duree_vol=("duree_vol_minutes", "max"),
        moyenne_vario_max=("vario_max", "mean"),
        max_vario_max=("vario_max", "max"),
        moyenne_g_max=("g_max", "mean"),
        max_g_max=("g_max", "max"),
        moyenne_plafond=("plafond", "mean"),
        max_plafond=("plafond", "max"),
    )

    if var_name in CATEGORY_ORDERS:
        order = CATEGORY_ORDERS[var_name]
        df_grouped = df_grouped.sort_values(
            by=var_name, key=lambda column: column.map(order.index)
        )
    elif var_name in ["pilote", "voile", "site"]:
        df_grouped = df_grouped.sort_values(by=var_name, ascending=True)
    else:
        df_grouped = df_grouped.sort_values(by=var_name, ascending=False)

    df_grouped = df_grouped.reset_index(drop=True)
    df_grouped[var_name] = df_grouped[var_name].astype(str)

    return df_grouped


def create_graph(
    df: pd.DataFrame, group_variable: str, count_variable: list[str], color: str
):
    """Diagramme en barres d'une statistique par catégorie."""
    fig = px.bar(data_frame=df, x=group_variable, y=count_variable)
    fig.update_traces(marker_color=color)
    fig.update_layout(showlegend=False)
    return fig


def create_all_plots(
    df_for_group: pd.DataFrame, dict_variables: dict, dict_color: dict
):
    """
    Crée l'ensemble des graphiques : un diagramme par variable de dict_variables
    ({variable: statistique à afficher}), plus la carte des sites de vol.
    Retourne {"fig_<variable>": figure, ..., "fig_map_sites": figure}.
    """
    dict_figures = {}
    for variable, statistic in dict_variables.items():
        df_grouped = create_grouped_df(df=df_for_group, group_var=[variable])
        dict_figures[f"fig_{variable}"] = create_graph(
            df=df_grouped,
            group_variable=variable,
            count_variable=statistic,
            color=dict_color[f"color_{variable}"][1],
        )

    df_coord_sites = (
        df_for_group[["site", "longitude", "latitude", "pilote"]]
        .groupby("site", as_index=False)
        .agg(
            nb_vols=("site", "count"),
            latitude=("latitude", "first"),
            longitude=("longitude", "first"),
            nb_pilotes=("pilote", "nunique"),
            pilotes=("pilote", "unique"),
        )
    )

    map_sites = px.scatter_mapbox(
        df_coord_sites,
        color_discrete_sequence=["red"],
        lat="latitude",
        lon="longitude",
        size_max=40,
        mapbox_style="open-street-map",
        center={"lat": 45.48, "lon": 0.25},
        zoom=4,
        height=800,
        hover_name="site",
        hover_data={
            "nb_vols": True,
            "latitude": False,
            "longitude": False,
            "nb_pilotes": True,
            "pilotes": True,
        },
    )
    map_sites.update_layout(margin={"r": 0, "t": 0, "l": 0, "b": 0})
    dict_figures["fig_map_sites"] = map_sites

    return dict_figures
