"""
Functions for the app
"""

# %% imports

import pandas as pd
import plotly.express as px

# %% functions


def get_flight_params(df: pd.DataFrame) -> dict:
    """
    Function used to get all the flight parameters
    from a dataframe

    arguments:
        df: a pandas.DataFrame containing flight parameters

    retrurns:
        a dict containing:
            - nb_tot_vols : le nombre total de vols
            - tot_heures_vol : le nombre total d'heures de vol
            - nb_tot_sites : le nombre de sites visités
            - print_speed_tot : les vitesses moyennes et max
            - mean_max_flight_duration_tot_str : la durée moyenne et max de vol
            - mean_max_flight_distance_tot_str : le distance moyenne et max de vol
            - mean_max_flight_ceiling_tot_str : le plafond moyen et max de vol
            - mean_max_flight_vario_tot_str : le vario max moyen et maximum
            - mean_max_flight_g_tot_str : le facteur g moyen et maximum

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

    # g_max moyen / mingcute:download-3-fill
    mean_flight_g_tot = str(round(df[df["g_max"] > 0]["g_max"].mean(), 1))
    max_flight_g_tot = str(round(df[df["g_max"] > 0]["g_max"].max(), 1))
    mean_max_flight_g_tot_str = f"{mean_flight_g_tot} ({max_flight_g_tot}) g."

    # Construction du dictionnaire final
    flight_params = {}
    flight_params["nb_tot_vols"] = nb_tot_vols
    flight_params["tot_heures_vol"] = tot_heures_vol
    flight_params["nb_tot_sites"] = nb_tot_sites
    flight_params["nb_tot_pilots"] = nb_tot_pilots
    flight_params["print_speed_tot"] = print_speed_tot
    flight_params["mean_max_flight_duration_tot_str"] = mean_max_flight_duration_tot_str
    flight_params["mean_max_flight_distance_tot_str"] = mean_max_flight_distance_tot_str
    flight_params["mean_max_flight_ceiling_tot_str"] = mean_max_flight_ceiling_tot_str
    flight_params["mean_max_flight_vario_tot_str"] = mean_max_flight_vario_tot_str
    flight_params["mean_max_flight_g_tot_str"] = mean_max_flight_g_tot_str

    return flight_params


def get_selected_df(df: pd.DataFrame, dict_parameters: dict) -> pd.DataFrame:
    """
    Fonction permettant de sélectionner les données
    souhaitées dans un dataframe à partir du dataframe initial

    arguments :
        - df:pd.DataFrame
            * dataframe complète initiale contenant toutes les données de vol,
        - dict_parameters: dict
            * dictoinnaire contenant les données nécessaire à filtrer la dataframe
            selon les données des reseignées dans les dorpdown de la navbar.
                * pilots_list -> liste de pilotes,
                * activity_list -> liste d'activités,
                * year_list -> liste d'années sélectionnées,
                * year_possibilities -> liste des années possibles,
                * wing_list -> liste de voiles sélectionnées,
                * site_list -> liste de sites sélectionnés

    returns :
        df_selected:pd.DataFrame
            * données sélectionnées selon les critères précédemment indiqués.

    """
    if (len(dict_parameters["pilots_list"]) == 0) or (
        "Tous les pilotes" in dict_parameters["pilots_list"]
    ):
        dict_parameters["pilots_list"] = list(df["pilote"].unique())

    type_list = []
    type_list.append(dict_parameters["activity_list"])
    if "Toutes" in type_list:
        type_list = ["paramoteur", "parapente"]

    year_list = [int(x) for x in dict_parameters["year_list"]]
    if len(year_list) == 0:
        year_list = [int(x) for x in dict_parameters["year_possibilities"]]

    wing_list = dict_parameters["wing_list"].copy()
    if len(wing_list) == 0:
        wing_list = list(df["voile"].unique())
        wing_list.sort()

    site_list = dict_parameters["site_list"].copy()
    if len(site_list) == 0:
        site_list = list(df["site"].unique())
        site_list.sort()

    # create the filtered df
    df_selected = df[
        df["pilote"].isin(dict_parameters["pilots_list"])
        & df["type_vol"].isin(type_list)
        & df["annee"].isin(year_list)
        & df["voile"].isin(wing_list)
        & df["site"].isin(site_list)
    ]
    return df_selected


def create_grouped_df(df: pd.DataFrame, group_var: list[str]):
    """
    Fonction utilisée afin de créer les df specifiques pour
    la creation des graphiques
    """
    var_name = group_var[0]

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
    if var_name == "jour_semaine":
        sorter = [
            "lundi",
            "mardi",
            "mercredi",
            "jeudi",
            "vendredi",
            "samedi",
            "dimanche",
        ]
        df_grouped = df_grouped.sort_values(
            by=var_name, key=lambda column: column.map(lambda e: sorter.index(e))
        )
    elif var_name == "mois":
        sorter = [
            "janvier",
            "fevrier",
            "mars",
            "avril",
            "mai",
            "juin",
            "juillet",
            "aout",
            "septembre",
            "octobre",
            "novembre",
            "decembre",
        ]
        df_grouped = df_grouped.sort_values(
            by=var_name, key=lambda column: column.map(lambda e: sorter.index(e))
        )
    elif var_name == "saison":
        sorter = ["hiver", "printemps", "été", "automne"]
        df_grouped = df_grouped.sort_values(
            by=var_name, key=lambda column: column.map(lambda e: sorter.index(e))
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
    """
    Creation du graphique
    """
    fig = px.bar(data_frame=df, x=group_variable, y=count_variable)
    fig.update_traces(marker_color=color)
    fig.update_layout(showlegend=False)
    return fig


def create_all_plots(
    df_for_group: pd.DataFrame, dict_variables: dict, dict_color: dict
):
    """
    Fonction utilisee pour créer l'ensemble des graphiques
    """

    dict_figures = {}
    for variable, variable_graph in dict_variables.items():
        globals()[f"df_{variable}"] = create_grouped_df(
            df=df_for_group, group_var=[variable]
        )
        fig = create_graph(
            df=globals()[f"df_{variable}"],
            group_variable=variable,
            count_variable=variable_graph,
            color=dict_color[f"color_{variable}"][1],
        )
        dict_figures[f"fig_{variable}"] = fig

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
    # map_sites.update_traces(marker={"size": 20})
    dict_figures["fig_map_sites"] = map_sites

    return dict_figures
