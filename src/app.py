"""
Application Dash de statistiques de vol (traces Syride).

Lit le pkl produit par create_global_pkl.py et affiche :
  - des cartes de chiffres clés (résumé et caractéristiques de vol),
  - des graphiques par pilote / année / mois / voile / jour / saison / site,
  - la carte des sites de vol.

Lancement local : python app.py
En ligne (PythonAnywhere) : le fichier WSGI importe `server` (voir plus bas).
"""

import pickle

import dash_mantine_components as dmc
from dash import Dash, Input, Output, dcc, html
from dash_iconify import DashIconify

import app_functions
import params_scrap_syride as params

# ============================================================================
# Données
# ============================================================================

pkl_path = params.pkl_path_online if params.online == 1 else params.pkl_path
with open(pkl_path, "rb") as pkl_file:
    df = pickle.load(pkl_file)

pilot_list = ["Tous les pilotes"] + list(df["pilote"].unique())
years_list = [str(x) for x in sorted(df["annee"].unique(), reverse=True)]
wing_list_tot = sorted(df["voile"].unique())
sites_list = sorted(df["site"].unique())
activity_list_tot = ["paramoteur", "parapente", "Toutes"]

MONTHS_FR = {
    1: "janvier", 2: "fevrier", 3: "mars", 4: "avril", 5: "mai", 6: "juin",
    7: "juillet", 8: "aout", 9: "septembre", 10: "octobre", 11: "novembre", 12: "decembre",
}
last_update = df["date_update"].iloc[0]
date_update = f"{last_update.day:02d} {MONTHS_FR[last_update.month]} {last_update.year}"

# Statistiques proposées dans les menus des graphiques
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

# Couleurs des graphiques : [nom Mantine, code hexadécimal]
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

# ============================================================================
# Description de l'interface (les composants sont générés à partir de ces tables)
# ============================================================================

# Cartes de chiffres clés : (id du texte, icône, titre, clé dans get_flight_params)
SUMMARY_CARDS = [
    ("nbtotvol", "mdi:flight", "NOMBRE DE VOLS", "nb_tot_vols"),
    ("nbtothours", "icon-park-outline:in-flight", "HEURES DE VOL", "tot_heures_vol"),
    ("nbtotsites", "game-icons:france", "NOMBRE DE SITES VISITES", "nb_tot_sites"),
    ("nbtotpilotes", "mdi:account-pilot", "NOMBRE DE PILOTES", "nb_tot_pilots"),
]
FEATURE_CARDS_1 = [
    ("speedmeanmax", "bi:speedometer2", "- - VITESSE MOY. - - | - - VITESSE MAX - -",
     "print_speed_tot"),
    ("filghtduration", "game-icons:duration", "DUREE DE VOL - MOY. (MAX)",
     "mean_max_flight_duration_tot_str"),
    ("distancecumulee", "game-icons:path-distance", "DISTANCE CUMULEE - MOY. (MAX)",
     "mean_max_flight_distance_tot_str"),
]
FEATURE_CARDS_2 = [
    ("flightceiling", "carbon:vegetation-height", "PLAFOND - MOY. (MAX)",
     "mean_max_flight_ceiling_tot_str"),
    ("variomax", "tabler:exchange", "VARIO MAX - MOY. (MAX)",
     "mean_max_flight_vario_tot_str"),
    ("gmax", "mingcute:download-3-fill", "ACCELERATION MAX - FACTEUR G",
     "mean_max_flight_g_tot_str"),
]
ALL_CARDS = SUMMARY_CARDS + FEATURE_CARDS_1 + FEATURE_CARDS_2

# Graphiques par catégorie, dans l'ordre des onglets :
# (variable du DataFrame, titre de l'onglet, titre du panneau, id du menu, id du graphique)
GRAPHS = [
    ("pilote", "Pilotes", "Analyse par pilote", "graph_pilote_select", "compare_pilote_graph"),
    ("annee", "Années", "Analyse par année", "graph_year_select", "compare_years_graph"),
    ("mois", "Mois", "Analyse par mois", "graph_mois_select", "compare_mois_graph"),
    ("voile", "Voile", "Analyse par voile", "graph_voile_select", "compare_voile_graph"),
    ("jour_semaine", "Jour de la semaine", "Analyse par jour de la semaine",
     "graph_jour_select", "compare_jour_graph"),
    ("saison", "Saison", "Analyse par saison", "graph_saison_select", "compare_saison_graph"),
    ("site", "Site", "Analyse par site de vol", "graph_site_select", "compare_site_graph"),
]

# ============================================================================
# Fabriques de composants
# ============================================================================


def stat_card(text_id: str, icon: str, title: str, value: str):
    """Carte « icône / titre / valeur » ; le texte de la valeur est mis à jour par le callback."""
    return dmc.Paper(
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
                    children=[DashIconify(icon=icon, width=30)],
                )
            ),
            dmc.Center(
                style={"marginTop": "10px"},
                children=[dmc.Text(size="xl", color="dimmed", children=[title])],
            ),
            dmc.Center(
                style={"marginTop": "10px"},
                children=[dmc.Text(id=text_id, size="xl", color="black", children=[value])],
            ),
        ],
    )


def cards_group(cards: list, bottom_margin: bool = False):
    """Rangée de cartes de même largeur."""
    kwargs = {"style": {"marginBottom": "10px"}} if bottom_margin else {}
    return dmc.Group(grow=True, children=cards, **kwargs)


def section_divider(label: str, style: dict):
    return dmc.Divider(style=style, label=label, labelPosition="center", size="md")


def graph_panel(title: str, color: str, graph_id: str, select_id: str = None):
    """Panneau : badge de titre, menu de choix de la statistique (optionnel) et graphique."""
    children = [
        dmc.Group(
            style={"padding": 20},
            grow=True,
            children=[dmc.Badge(title, color=color, variant="filled", size="lg")],
        )
    ]
    if select_id is not None:
        children.append(
            dmc.Center(
                dmc.Select(
                    dropdownPosition="bottom",
                    placeholder="Sélectionne une variable",
                    searchable=True,
                    id=select_id,
                    value="nb_vols",
                    data=list_values_graph,
                    style={"width": 500, "margin": "auto"},
                ),
            )
        )
    children.append(dcc.Graph(id=graph_id))
    return dmc.Group(
        style={"marginBottom": "10px"},
        grow=True,
        children=[
            dmc.Paper(withBorder=True, shadow="lg", radius="md", p="md", children=children)
        ],
    )


def nav_divider():
    return dmc.Divider(variant="dashed", style={"marginBottom": 5, "marginTop": 10})


def nav_select(component, label: str, placeholder: str, select_id: str, value, data,
               clearable: bool = False, extra_style: dict = None):
    """Menu déroulant de la barre latérale."""
    kwargs = {"clearable": True} if clearable else {}
    return component(
        label=label,
        dropdownPosition="bottom",
        placeholder=placeholder,
        searchable=True,
        id=select_id,
        value=value,
        data=data,
        style={"width": 250, "margin": "auto", **(extra_style or {})},
        **kwargs,
    )


# ============================================================================
# Valeurs initiales (paramoteur uniquement, comme avant)
# ============================================================================

df_init = df[df["type_vol"] == "paramoteur"]
flight_params_tot = app_functions.get_flight_params(df=df_init)

# ============================================================================
# Application
# ============================================================================

app = Dash(
    __name__,
    suppress_callback_exceptions=True,
    title="Statistiques de vol",
    meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
)
# Objet WSGI : sur PythonAnywhere, le fichier WSGI fait `from app import server as application`
server = app.server

div_header = html.Div(
    dmc.Header(
        height=70,
        pl=0,
        pr=0,
        pt=0,
        zIndex=0,
        style={"background-color": "orange", "color": "orange"},
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
                dmc.Divider(label="Paramètres", style={"marginBottom": 10, "marginTop": 10}),
                nav_select(dmc.MultiSelect, "Pilotes", "Sélectionne un pilote", "pilots-select",
                           ["Tous les pilotes"], pilot_list, clearable=True),
                nav_divider(),
                nav_select(dmc.Select, "Type activité", "Sélectionne une activité",
                           "activity-select", "paramoteur", activity_list_tot),
                nav_divider(),
                nav_select(dmc.MultiSelect, "Années", "Sélectionne les années", "year-select",
                           [], years_list),
                nav_divider(),
                nav_select(dmc.MultiSelect, "Voiles", "Sélectionne les voiles", "wing-select",
                           [], wing_list_tot),
                nav_divider(),
                nav_select(dmc.MultiSelect, "Sites", "Sélectionne les sites", "sites-select",
                           [], sites_list, extra_style={"marginBottom": 250}),
            ],
        )
    ],
)

group_resume = cards_group(
    [stat_card(i, icon, title, flight_params_tot[key]) for i, icon, title, key in SUMMARY_CARDS]
)
group_caracteristiques01 = cards_group(
    [stat_card(i, icon, title, flight_params_tot[key]) for i, icon, title, key in FEATURE_CARDS_1],
    bottom_margin=True,
)
group_caracteristiques02 = cards_group(
    [stat_card(i, icon, title, flight_params_tot[key]) for i, icon, title, key in FEATURE_CARDS_2],
    bottom_margin=True,
)

group_graph_tabs = dmc.Tabs(
    style={"marginBottom": "10px"},
    children=[
        dmc.TabsList(
            children=[dmc.Tab(tab, value=str(n)) for n, (_, tab, *_rest) in enumerate(GRAPHS, 1)],
            grow=True,
        ),
        *[
            dmc.TabsPanel(
                graph_panel(title, dict_color[f"color_{variable}"][0], graph_id, select_id),
                value=str(n),
            )
            for n, (variable, _tab, title, select_id, graph_id) in enumerate(GRAPHS, 1)
        ],
    ],
    value="1",
)

group_graph_map = graph_panel("Carte des sites de vol", dict_color["map_site"][0], "map_site_graph")

body_page01 = html.Div(
    style={"marginLeft": "300px", "padding": "10px"},
    children=[
        section_divider("Résumé", {"marginBottom": "10px"}),
        group_resume,
        section_divider("Caractéristiques de vol",
                        {"marginTop": "20px", "marginBottom": "10px"}),
        group_caracteristiques01,
        group_caracteristiques02,
        section_divider("Graphiques", {"marginTop": "10px", "marginBottom": "10px"}),
        group_graph_tabs,
        group_graph_map,
    ],
)

app.layout = dmc.MantineProvider(
    id="dark-moder",
    withGlobalStyles=True,
    children=[
        html.Div(
            children=[
                div_header,
                html.Div(children=[navbar, body_page01]),
            ],
        ),
    ],
)

# ============================================================================
# Callbacks
# ============================================================================


def _filter_by_pilots_and_activity(pilots_list, activity):
    """Vols des pilotes et de l'activité choisis (« Tous les pilotes » / « Toutes » = tout)."""
    if len(pilots_list) == 0 or "Tous les pilotes" in pilots_list:
        pilots_list = list(df["pilote"].unique())
    activities = ["paramoteur", "parapente"] if activity == "Toutes" else [activity]
    return df[df["pilote"].isin(pilots_list) & df["type_vol"].isin(activities)]


@app.callback(
    Output("year-select", "data"),
    Output("wing-select", "data"),
    Output("sites-select", "data"),
    Input("pilots-select", "value"),
    Input("activity-select", "value"),
)
def update_filter_choices(pilots_list, activity_list):
    """Met à jour les années, voiles et sites proposés selon les pilotes et l'activité choisis."""
    df_temp = _filter_by_pilots_and_activity(pilots_list, activity_list)

    unique_years = [str(x) for x in sorted(df_temp["annee"].unique(), reverse=True)]
    unique_wings = sorted(df_temp["voile"].unique())
    unique_sites = sorted(df_temp["site"].unique())
    return unique_years, unique_wings, unique_sites


@app.callback(
    *[Output(text_id, "children") for text_id, *_ in ALL_CARDS],
    *[Output(graph_id, "figure") for *_, graph_id in GRAPHS],
    Output("map_site_graph", "figure"),
    Input("pilots-select", "value"),
    Input("activity-select", "value"),
    Input("year-select", "value"),
    Input("year-select", "data"),
    Input("wing-select", "value"),
    Input("sites-select", "value"),
    *[Input(select_id, "value") for *_, select_id, _graph_id in GRAPHS],
    prevent_initial_call=True,
)
def update_dashboard(
    pilots_list, activity_list, year_list, year_possibilities, wing_list, site_list,
    *graph_statistics,
):
    """
    Recalcule les cartes et tous les graphiques selon les filtres de la barre latérale.
    `graph_statistics` : statistique choisie dans le menu de chaque graphique (ordre de GRAPHS).
    """
    df_selected = app_functions.get_selected_df(
        df=df,
        dict_parameters={
            "pilots_list": pilots_list,
            "activity_list": activity_list,
            "year_list": year_list,
            "year_possibilities": year_possibilities,
            "wing_list": wing_list,
            "site_list": site_list,
        },
    )
    flight_params = app_functions.get_flight_params(df=df_selected)

    # Les années inconnues (1901 et avant) sont exclues des graphiques
    df_no_unknown = df_selected[df_selected["annee"] > 1901]
    dict_variables = {
        variable: statistic
        for (variable, *_), statistic in zip(GRAPHS, graph_statistics)
    }
    dict_figures = app_functions.create_all_plots(
        df_for_group=df_no_unknown, dict_variables=dict_variables, dict_color=dict_color
    )

    return (
        *[flight_params[key] for *_, key in ALL_CARDS],
        *[dict_figures[f"fig_{variable}"] for variable, *_ in GRAPHS],
        dict_figures["fig_map_sites"],
    )


# ============================================================================
# Lancement
# ============================================================================

if __name__ == "__main__":
    debug = params.online != 1
    # Dash 3 a supprimé run_server au profit de run
    run = app.run if hasattr(app, "run") else app.run_server
    run(debug=debug)
