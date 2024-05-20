"""
Script permettant d'exposer l'app dash
de l'analyse des traces syride.
"""

########## IMPORTS ##########
import pickle

import dash

# import dash_bootstrap_components as dbc
import dash_mantine_components as dmc
import pandas as pd
import params_scrap_syride as params

from dash import (
    ALL,
    MATCH,
    Dash,
    Input,
    Output,
    State,
    callback,
    ctx,
    dash_table,
    html,
    dcc,
)
from dash_iconify import DashIconify
import plotly.express as px

import app_functions

########## APP ##########

# Load pkl file
online = params.online

if online == 1:
    pkl_path = "/home/amoreau/mysite/docs/global_flights_data.pkl"
else:
    pkl_path = params.pkl_path
with open(pkl_path, "rb") as pkl_file:
    df = pickle.load(pkl_file)

# Pilotes
pilot_list = list(df["pilote"].unique())
pilot_list.insert(0, "Tous les pilotes")

# Années
years_list = list(df["annee"].unique())
years_list.sort(reverse=True)
years_list = [str(x) for x in years_list]

# Voiles
wing_list_tot = list(df["voile"].unique())
wing_list_tot.sort()

# sites
sites_list = list(df["site"].unique())
sites_list.sort()

# Activies
activity_list_tot = ["paramoteur", "parapente", "Toutes"]

# Obtention de la date de mise à jour des données
date_update = df["date_update"].iloc[0].strftime("%d %m %Y")
month_replace = {
    " 01 ": " janvier ",
    " 02 ": " fevrier ",
    " 03 ": " mars ",
    " 04 ": " avril ",
    " 05 ": " mai ",
    " 06 ": " juin ",
    " 07 ": " juillet ",
    " 08 ": " aout ",
    " 09 ": " septembre ",
    " 10 ": " octobre ",
    " 11 ": " novembre ",
    " 12 ": " decembre ",
}
for key, value in month_replace.items():
    date_update = date_update.replace(key, value)
date_update_full = f"Date de mise à jour des données : {date_update}"

# Valeurs pour les selections pour les graphiques
list_values_graph = [
    {"value": "nb_vols", "label": "Nombre de vols"},
    {"value": "cumul_duree_vol", "label": "Nombre d'heures de vol"},
    {"value": "nb_pilotes", "label": "Nombre de pilotes"},
    {"value": "nb_sites_visites", "label": "Nombre de sites visités"},
    {"value": "nb_voiles_utilisees", "label": "Nombre de voiles utilisées"},
    {"value": "moyenne_vitesse_moyenne", "label": "Moyenne de la vitesse moyenne"},
    {"value": "max_vitesse_moyenne", "label": "Max de la vitesse moyenne"},
    {"value": "moyenne_vitesse_max", "label": "Moyenne de la vitesse max"},
    {"value": "max_vitesse_max", "label": "Max de la vitesse max"},
    {"value": "moyenne_distance_cumulee", "label": "Moyenne de la distance cumulée"},
    {"value": "max_distance_cumulee", "label": "Max de la distance cumulée"},
    {"value": "moyenne_duree_vol", "label": "Moyenne de la durée de vol"},
    {"value": "max_duree_vol", "label": "Max de la durée de vol"},
    {"value": "moyenne_vario_max", "label": "Moyenne du vario max"},
    {"value": "max_vario_max", "label": "Max du vario max"},
    {"value": "moyenne_g_max", "label": "Moyenne de g max"},
    {"value": "max_g_max", "label": "max de g max"},
    {"value": "moyenne_plafond", "label": "Moyenne du plafond"},
    {"value": "max_plafond", "label": "Max du plafond"},
]

# Valeurs couleurs pour les graphs
dict_color = {
    "color_annee": ["blue", "#1f77b4"],
    "color_pilote": ["orange", "#ff7f0e"],
    "color_mois": ["lime", "#2ca02c"],
    "color_voile": ["pink", "#e377c2"],
    "color_jour_semaine": ["red", "#d62728"],
    "color_saison": ["grape", "#9467bd"],
    "color_site": ["indigo", "#546ded"],
    "map_site": ["yellow"],
}

############# init values #########

# df init = valeurs à l'initialisation
df_init = df[df["type_vol"] == "paramoteur"]

flight_params_tot = app_functions.get_flight_params(df=df_init)

# %% Init app
app = Dash(
    __name__,
    # external_stylesheets=[dbc.themes.UNITED],
    suppress_callback_exceptions=True,
    title="Statistiques de vol",
    meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
)

# %% Components

div_header = html.Div(
    dmc.Header(
        height=70,
        # fixed=False,
        pl=0,
        pr=0,
        pt=0,
        zIndex=0,
        style={
            "background-color": "orange",
            "color": "orange",
        },
        children=[
            dmc.Container(
                fluid=True,
                px=20,
                py=20,
                children=[
                    dmc.Group(
                        position="apart",
                        align="flex-start",
                        spacing=0,
                        children=[
                            dmc.Badge(
                                children="Analyse Traces de vol",
                                variant="outline",
                                color="black",
                                size="xl",
                            ),
                            dmc.Group(
                                position="apart",
                                align="flex-start",
                                spacing=0,
                                children=[
                                    dmc.Text(
                                        children="Date de mise à jour des données :   ",
                                        color="black",
                                    ),
                                    dmc.Text(
                                        children=f" {date_update}",
                                        color="blue",
                                        weight="bold",
                                    ),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
        ],
    ),
)

navbar = dmc.Navbar(
    fixed=True,
    width={"base": "300px"},
    pl="xs",
    pr="xs",
    pt="xs",
    zIndex=1,
    position={"top": "70px"},
    children=[
        dmc.ScrollArea(
            offsetScrollbars=True,
            type="scroll",
            children=[
                dmc.Group(
                    align="center",
                    position="center",
                    spacing="xs",
                    children=[
                        dmc.Text(
                            "Créée par : Adrien Moreau",
                            style={"font-family": "IntegralCF-RegularOblique"},
                            size="sm",
                        ),
                    ],
                ),
                dmc.Divider(
                    label="Paramètres",
                    style={"marginBottom": 10, "marginTop": 10},
                ),
                dmc.MultiSelect(
                    label="Pilotes",
                    dropdownPosition="bottom",
                    placeholder="Sélectionne un pilote",
                    searchable=True,
                    clearable=True,
                    id="pilots-select",
                    value=["Tous les pilotes"],
                    data=pilot_list,
                    # maxDropdownHeight=80,
                    style={"width": 250, "margin": "auto"},
                ),
                dmc.Divider(
                    variant="dashed",
                    style={"marginBottom": 5, "marginTop": 10},
                ),
                dmc.Select(
                    label="Type activité",
                    dropdownPosition="bottom",
                    placeholder="Sélectionne une activité",
                    searchable=True,
                    id="activity-select",
                    value="paramoteur",
                    data=activity_list_tot,
                    # maxDropdownHeight=80,
                    style={"width": 250, "margin": "auto"},
                ),
                dmc.Divider(
                    variant="dashed",
                    style={"marginBottom": 5, "marginTop": 10},
                ),
                dmc.MultiSelect(
                    label="Années",
                    dropdownPosition="bottom",
                    placeholder="Sélectionne les années",
                    searchable=True,
                    id="year-select",
                    value=[],
                    data=years_list,
                    # maxDropdownHeight=80,
                    style={"width": 250, "margin": "auto"},
                ),
                dmc.Divider(
                    variant="dashed",
                    style={"marginBottom": 5, "marginTop": 10},
                ),
                dmc.MultiSelect(
                    label="Voiles",
                    dropdownPosition="bottom",
                    placeholder="Sélectionne les voiles",
                    searchable=True,
                    id="wing-select",
                    value=[],
                    data=wing_list_tot,
                    # maxDropdownHeight=80,
                    style={"width": 250, "margin": "auto"},
                ),
                dmc.Divider(
                    variant="dashed",
                    style={"marginBottom": 5, "marginTop": 10},
                ),
                dmc.MultiSelect(
                    label="Sites",
                    dropdownPosition="bottom",
                    placeholder="Sélectionne les sites",
                    searchable=True,
                    id="sites-select",
                    value=[],
                    data=sites_list,
                    # maxDropdownHeight=80,
                    style={"width": 250, "margin": "auto", "marginBottom": 250},
                ),
            ],
        )
    ],
)

divider_resume = dmc.Divider(
    style={"marginBottom": "10px"},
    label="Résumé",
    labelPosition="center",
    size="md",
)

group_resume = dmc.Group(
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="mdi:flight",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["NOMBRE DE VOLS"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="nbtotvol",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["nb_tot_vols"]],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="icon-park-outline:in-flight",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["HEURES DE VOL"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="nbtothours",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["tot_heures_vol"]],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="game-icons:france",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["NOMBRE DE SITES VISITES"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="nbtotsites",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["nb_tot_sites"]],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="mdi:account-pilot",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["NOMBRE DE PILOTES"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="nbtotpilotes",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["nb_tot_pilots"]],
                        )
                    ],
                ),
            ],
        ),
    ],
)

divider_caracteristiques = dmc.Divider(
    style={"marginTop": "20px", "marginBottom": "10px"},
    label="Caractéristiques de vol",
    labelPosition="center",
    size="md",
)

group_caracteristiques01 = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="bi:speedometer2",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["- - VITESSE MOY. - - | - - VITESSE MAX - -"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="speedmeanmax",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["print_speed_tot"]],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="game-icons:duration",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["DUREE DE VOL - MOY. (MAX)"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="filghtduration",
                            size="xl",
                            color="black",
                            children=[
                                flight_params_tot["mean_max_flight_duration_tot_str"]
                            ],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="game-icons:path-distance",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["DISTANCE CUMULEE - MOY. (MAX)"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="distancecumulee",
                            size="xl",
                            color="black",
                            children=[
                                flight_params_tot["mean_max_flight_distance_tot_str"]
                            ],
                        )
                    ],
                ),
            ],
        ),
    ],
)

group_caracteristiques02 = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="carbon:vegetation-height",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["PLAFOND - MOY. (MAX)"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="flightceiling",
                            size="xl",
                            color="black",
                            children=[
                                flight_params_tot["mean_max_flight_ceiling_tot_str"]
                            ],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="tabler:exchange",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["VARIO MAX - MOY. (MAX)"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="variomax",
                            size="xl",
                            color="black",
                            children=[
                                flight_params_tot["mean_max_flight_vario_tot_str"]
                            ],
                        )
                    ],
                ),
            ],
        ),
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Center(
                    dmc.ThemeIcon(
                        size=50,
                        radius="xl",
                        color="orange",
                        variant="light",
                        children=[
                            DashIconify(
                                icon="mingcute:download-3-fill",
                                width=30,
                            )
                        ],
                    )
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            size="xl",
                            color="dimmed",
                            children=["ACCELERATION MAX - FACTEUR G"],
                        )
                    ],
                ),
                dmc.Center(
                    style={"marginTop": "10px"},
                    children=[
                        dmc.Text(
                            id="gmax",
                            size="xl",
                            color="black",
                            children=[flight_params_tot["mean_max_flight_g_tot_str"]],
                        )
                    ],
                ),
            ],
        ),
    ],
)

divider_graph = dmc.Divider(
    style={"marginTop": "10px", "marginBottom": "10px"},
    label="Graphiques",
    labelPosition="center",
    size="md",
)

group_graph_year = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par année",
                            color=dict_color["color_annee"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une année",
                        searchable=True,
                        id="graph_year_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_years_graph"),
            ],
        ),
    ],
)

group_graph_pilote = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par pilote",
                            color=dict_color["color_pilote"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une année",
                        searchable=True,
                        id="graph_pilote_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_pilote_graph"),
            ],
        ),
    ],
)

group_graph_mois = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par mois",
                            color=dict_color["color_mois"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne un mois",
                        searchable=True,
                        id="graph_mois_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_mois_graph"),
            ],
        ),
    ],
)

group_graph_voile = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par voile",
                            color=dict_color["color_voile"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une voile",
                        searchable=True,
                        id="graph_voile_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_voile_graph"),
            ],
        ),
    ],
)

group_graph_jour = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par jour de la semaine",
                            color=dict_color["color_jour_semaine"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une variable",
                        searchable=True,
                        id="graph_jour_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_jour_graph"),
            ],
        ),
    ],
)

group_graph_saison = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par saison",
                            color=dict_color["color_saison"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une variable",
                        searchable=True,
                        id="graph_saison_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_saison_graph"),
            ],
        ),
    ],
)

group_graph_site = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Analyse par site de vol",
                            color=dict_color["color_site"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dmc.Center(
                    dmc.Select(
                        dropdownPosition="bottom",
                        placeholder="Sélectionne une variable",
                        searchable=True,
                        id="graph_site_select",
                        value="nb_vols",
                        data=list_values_graph,
                        style={"width": 500, "margin": "auto"},
                    ),
                ),
                dcc.Graph(id="compare_site_graph"),
            ],
        ),
    ],
)

group_graph_map = dmc.Group(
    style={"marginBottom": "10px"},
    grow=True,
    children=[
        dmc.Paper(
            withBorder=True,
            shadow="lg",
            radius="md",
            p="md",
            children=[
                dmc.Group(
                    style={"padding": 20},
                    grow=True,
                    children=[
                        dmc.Badge(
                            "Carte des sites de vol",
                            color=dict_color["map_site"][0],
                            variant="filled",
                            size="lg",
                        ),
                    ],
                ),
                dcc.Graph(id="map_site_graph"),
            ],
        ),
    ],
)

group_graph_tabs = dmc.Tabs(
    style={"marginBottom": "10px"},
    # grow=True,
    children=[
        dmc.TabsList(
            children=[
                dmc.Tab("Pilotes", value="1"),
                dmc.Tab("Années", value="2"),
                dmc.Tab("Mois", value="3"),
                dmc.Tab("Voile", value="4"),
                dmc.Tab("Jour de la semaine", value="5"),
                dmc.Tab("Saison", value="6"),
                dmc.Tab("Site", value="7"),
            ],
            grow=True,
        ),
        dmc.TabsPanel(group_graph_pilote, value="1"),
        dmc.TabsPanel(group_graph_year, value="2"),
        dmc.TabsPanel(group_graph_mois, value="3"),
        dmc.TabsPanel(group_graph_voile, value="4"),
        dmc.TabsPanel(group_graph_jour, value="5"),
        dmc.TabsPanel(group_graph_saison, value="6"),
        dmc.TabsPanel(group_graph_site, value="7"),
    ],
    value="1",
)


body_page01 = html.Div(
    style={"marginLeft": "300px", "padding": "10px"},
    children=[
        divider_resume,
        group_resume,
        divider_caracteristiques,
        group_caracteristiques01,
        group_caracteristiques02,
        divider_graph,
        # group_graph_pilote,
        # group_graph_year,
        # group_graph_mois,
        # group_graph_voile,
        # group_graph_jour,
        # group_graph_saison,
        # group_graph_site,
        group_graph_tabs,
        group_graph_map,
    ],
)

# %% Layout
app.layout = dmc.MantineProvider(
    id="dark-moder",
    withGlobalStyles=True,
    children=[
        html.Div(
            children=[
                div_header,
                html.Div(
                    children=[
                        navbar,
                        body_page01,
                    ],
                ),
            ],
        ),
    ],
)


@app.callback(
    Output("year-select", "data"),
    Output("wing-select", "data"),
    Output("sites-select", "data"),
    Input("pilots-select", "value"),
    Input("activity-select", "value"),
)
def update_year_list(pilots_list, activity_list):
    """
    Callback permettant de mettre à jour la liste des années
    en fonction des pilotes et de l'activité choisie
    """
    if (len(pilots_list) == 0) or ("Tous les pilotes" in pilots_list):
        pilots_list = list(df["pilote"].unique())

    type_list = []
    type_list.append(activity_list)
    if "Toutes" in type_list:
        type_list = ["paramoteur", "parapente"]

    df_temp = df[df["pilote"].isin(pilots_list) & df["type_vol"].isin(type_list)]

    unique_years = list(df_temp["annee"].unique())
    unique_years.sort(reverse=True)
    unique_years = [str(x) for x in unique_years]

    unique_wings = list(df_temp["voile"].unique())
    unique_wings.sort()

    unique_sites = list(df_temp["site"].unique())
    unique_sites.sort()

    return unique_years, unique_wings, unique_sites


@app.callback(
    Output("nbtotvol", "children"),
    Output("nbtothours", "children"),
    Output("nbtotsites", "children"),
    Output("nbtotpilotes", "children"),
    Output("speedmeanmax", "children"),
    Output("filghtduration", "children"),
    Output("distancecumulee", "children"),
    Output("flightceiling", "children"),
    Output("variomax", "children"),
    Output("gmax", "children"),
    Output("compare_pilote_graph", "figure"),
    Output("compare_years_graph", "figure"),
    Output("compare_mois_graph", "figure"),
    Output("compare_voile_graph", "figure"),
    Output("compare_jour_graph", "figure"),
    Output("compare_saison_graph", "figure"),
    Output("compare_site_graph", "figure"),
    Output("map_site_graph", "figure"),
    Input("pilots-select", "value"),
    Input("activity-select", "value"),
    Input("year-select", "value"),
    Input("year-select", "data"),
    Input("wing-select", "value"),
    Input("sites-select", "value"),
    Input("graph_pilote_select", "value"),
    Input("graph_year_select", "value"),
    Input("graph_mois_select", "value"),
    Input("graph_voile_select", "value"),
    Input("graph_jour_select", "value"),
    Input("graph_saison_select", "value"),
    Input("graph_site_select", "value"),
    prevent_initial_call=True,
)
def update_data_table(
    pilots_list,
    activity_list,
    year_list,
    year_possibilities,
    wing_list,
    site_list,
    var_graph_pilote,
    var_graph_year,
    var_graph_mois,
    var_graph_voile,
    var_graph_jour,
    var_graph_saison,
    var_graph_site,
):
    # Mise en forme des parametres
    dict_parameters = {}
    dict_parameters["pilots_list"] = pilots_list
    dict_parameters["activity_list"] = activity_list
    dict_parameters["year_list"] = year_list
    dict_parameters["year_possibilities"] = year_possibilities
    dict_parameters["wing_list"] = wing_list
    dict_parameters["site_list"] = site_list
    dict_parameters["var_graph_pilote"] = var_graph_pilote
    dict_parameters["var_graph_year"] = var_graph_year
    dict_parameters["var_graph_mois"] = var_graph_mois
    dict_parameters["var_graph_voile"] = var_graph_voile
    dict_parameters["var_graph_jour"] = var_graph_jour
    dict_parameters["var_graph_saison"] = var_graph_saison
    dict_parameters["var_graph_site"] = var_graph_site

    # create the filtered df
    df_selected = app_functions.get_selected_df(df=df, dict_parameters=dict_parameters)

    # get flight parameters
    flight_params = app_functions.get_flight_params(df=df_selected)

    # Creation des df pour les graphiques
    df_no_unknown = df_selected[df_selected["annee"] > 1901]

    dict_variables = {
        "annee": dict_parameters["var_graph_year"],
        "pilote": dict_parameters["var_graph_pilote"],
        "mois": dict_parameters["var_graph_mois"],
        "voile": dict_parameters["var_graph_voile"],
        "jour_semaine": dict_parameters["var_graph_jour"],
        "saison": dict_parameters["var_graph_saison"],
        "site": dict_parameters["var_graph_site"],
    }

    dict_figures = app_functions.create_all_plots(
        df_for_group=df_no_unknown, dict_variables=dict_variables, dict_color=dict_color
    )

    return (
        flight_params["nb_tot_vols"],
        flight_params["tot_heures_vol"],
        flight_params["nb_tot_sites"],
        flight_params["nb_tot_pilots"],
        flight_params["print_speed_tot"],
        flight_params["mean_max_flight_duration_tot_str"],
        flight_params["mean_max_flight_distance_tot_str"],
        flight_params["mean_max_flight_ceiling_tot_str"],
        flight_params["mean_max_flight_vario_tot_str"],
        flight_params["mean_max_flight_g_tot_str"],
        dict_figures["fig_pilote"],
        dict_figures["fig_annee"],
        dict_figures["fig_mois"],
        dict_figures["fig_voile"],
        dict_figures["fig_jour_semaine"],
        dict_figures["fig_saison"],
        dict_figures["fig_site"],
        dict_figures["fig_map_sites"],
    )


########## LANCEMENT ##########
if __name__ == "__main__":
    if online == 1:
        bool_debug = False
    else:
        bool_debug = True
    app.run_server(debug=bool_debug)
