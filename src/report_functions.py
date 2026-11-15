"""
Fonctions de génération du rapport PDF annuel d'un pilote (generate_pdf_report).

Les colonnes `flight_url` et `heure_decolage`, absentes du pkl, sont créées au début de
generate_pdf_report par rapport.report_data.prepare_report_df (même préparation que le
rapport HTML).
"""

# %% imports

import pandas as pd
import numpy as np
import plotly.express as px

import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.patches import Patch

from fpdf import FPDF
from fpdf.enums import XPos, YPos, Align
import io

from math import ceil

from rapport.report_data import prepare_report_df

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
            - print_speed : les vitesses moyennes et max
            - mean_max_flight_duration_tot_str : la durée moyenne et max de vol
            - mean_max_flight_distance_tot : le distance moyenne et max de vol
            - mean_max_flight_ceiling_tot : le plafond moyen et max de vol
            - mean_max_flight_vario_tot : le vario max moyen et maximum
            - mean_max_flight_g_tot : le facteur g moyen et maximum

    """

    # Nb tot vols
    nb_tot_vols = str(df.shape[0])

    min_date = (df["date"].min()).strftime("%d-%m-%Y")
    max_date = (df["date"].max()).strftime("%d-%m-%Y")

    nb_vols_total = df.shape[0]
    nb_vols_parapente = df[df["type_vol"] == "parapente"].shape[0]
    percent_vols_parapente = round((nb_vols_parapente * 100 / nb_vols_total), 1)
    nb_vols_paramoteur = df[df["type_vol"] == "paramoteur"].shape[0]
    percent_vols_paramoteur = round((nb_vols_paramoteur * 100 / nb_vols_total), 1)

    # heures tot de vol
    nb_tot_minutes = int(round(df["duree_vol_minutes"].sum(), 0))
    nb_tot_heures_pleines = nb_tot_minutes // 60
    nb_tot_minutes_pleines = nb_tot_minutes % 60
    tot_heures_vol = f"{nb_tot_heures_pleines} h et {nb_tot_minutes_pleines} min"

    nb_minutes_parapente = int(
        round(df[df["type_vol"] == "parapente"]["duree_vol_minutes"].sum(), 0)
    )
    percent_temps_parapente = round((nb_minutes_parapente * 100 / nb_tot_minutes), 1)
    nb_minutes_paramoteur = int(
        round(df[df["type_vol"] == "paramoteur"]["duree_vol_minutes"].sum(), 0)
    )
    percent_temps_paramoteur = round((nb_minutes_paramoteur * 100 / nb_tot_minutes), 1)

    nb_parapente_heures_pleines = nb_minutes_parapente // 60
    nb_parapente_minutes_pleines = nb_minutes_parapente % 60
    parapente_heures_vol = (
        f"{nb_parapente_heures_pleines} h et {nb_parapente_minutes_pleines} min"
    )

    nb_paramoteur_heures_pleines = nb_minutes_paramoteur // 60
    nb_paramoteur_minutes_pleines = nb_minutes_paramoteur % 60
    paramoteur_heures_vol = (
        f"{nb_paramoteur_heures_pleines} h et {nb_paramoteur_minutes_pleines} min"
    )

    # Nb sites de vol
    nb_tot_sites = str(len(df["site"].unique()))
    liste_sites_vol = list(set(df["site"]))

    # Nb de pilotes
    nb_tot_pilots = str(len(df["pilote"].unique()))
    liste_tot_pilots = list(set(df["pilote"]))

    # vitesses de vol
    mean_mean_flight_speed = round(
        df[df["vitesse_moyenne"] > 0]["vitesse_moyenne"].mean(), 1
    )
    mean_max_flight_speed = round(df[df["vitesse_max"] > 0]["vitesse_max"].mean(), 1)
    max_mean_flight_speed = round(
        df[df["vitesse_moyenne"] > 0]["vitesse_moyenne"].max(), 1
    )
    max_max_flight_speed = round(df[df["vitesse_max"] > 0]["vitesse_max"].max(), 1)

    # durée de vol
    mean_flight_duration = int(round(df["duree_vol_minutes"].mean(), 0))
    max_flight_duration = int(round(df["duree_vol_minutes"].max(), 0))

    # distance (affichée par Syride sur la page des vols : distance de référence)
    total_flight_distance = round(
        df[df["distance"] > 0]["distance"].sum(), 1
    )

    mean_flight_distance = round(
        df[df["distance"] > 0]["distance"].mean(), 1
    )
    max_flight_distance = round(
        df[df["distance"] > 0]["distance"].max(), 1
    )

    # Plafond moyen (max)
    mean_flight_ceiling_tot = int(round(df[df["plafond"] > 0]["plafond"].mean(), 0))
    max_flight_ceiling_tot = int(round(df[df["plafond"] > 0]["plafond"].max(), 0))

    # vario_max moyen
    mean_flight_vario_tot = round(df[df["vario_max"] > 0]["vario_max"].mean(), 1)
    max_flight_vario_tot = round(df[df["vario_max"] > 0]["vario_max"].max(), 1)

    # g_max moyen
    mean_flight_g_tot = round(df[df["g_max"] > 0]["g_max"].mean(), 1)
    max_flight_g_tot = round(df[df["g_max"] > 0]["g_max"].max(), 1)

    # Construction du dictionnaire final
    flight_params = {}
    flight_params["nb_tot_vols"] = nb_tot_vols
    flight_params["nb_vols_parapente"] = nb_vols_parapente
    flight_params["percent_vols_parapente"] = percent_vols_parapente
    flight_params["date_premier_vol"] = min_date
    flight_params["date_dernier_vol"] = max_date
    flight_params["nb_vols_paramoteur"] = nb_vols_paramoteur
    flight_params["percent_vols_paramoteur"] = percent_vols_paramoteur
    flight_params["tot_heures_vol"] = tot_heures_vol
    flight_params["parapente_heures_vol"] = parapente_heures_vol
    flight_params["percent_temps_parapente"] = percent_temps_parapente
    flight_params["paramoteur_heures_vol"] = paramoteur_heures_vol
    flight_params["percent_temps_paramoteur"] = percent_temps_paramoteur
    flight_params["nb_tot_sites"] = nb_tot_sites
    flight_params["liste_sites"] = liste_sites_vol
    flight_params["nb_tot_pilots"] = nb_tot_pilots
    flight_params["pilots"] = liste_tot_pilots
    flight_params["moy_vitesse_moyenne"] = mean_mean_flight_speed
    flight_params["max_vitesse_moyenne"] = max_mean_flight_speed
    flight_params["moy_vitesse_max"] = mean_max_flight_speed
    flight_params["max_vitesse_max"] = max_max_flight_speed
    flight_params["mean_flight_duration"] = mean_flight_duration
    flight_params["max_flight_duration"] = max_flight_duration
    flight_params["total_distance_cumulee"] = total_flight_distance
    flight_params["moy_distance_cumulee"] = mean_flight_distance
    flight_params["max_distance_cumulee"] = max_flight_distance
    flight_params["moy_plafond"] = mean_flight_ceiling_tot
    flight_params["max_plafond"] = max_flight_ceiling_tot
    flight_params["moy_vario"] = mean_flight_vario_tot
    flight_params["max_vario"] = max_flight_vario_tot
    flight_params["moy_g"] = mean_flight_g_tot
    flight_params["max_g"] = max_flight_g_tot

    # Valeurs entières par nature (colonnes décimales depuis que les inconnues sont NaN) :
    # « 53 km » plutôt que « 53.0 km »
    for key in ("total_distance_cumulee", "max_distance_cumulee", "max_vitesse_max"):
        value = flight_params[key]
        if pd.notna(value) and float(value).is_integer():
            flight_params[key] = int(value)

    return flight_params


################################################################
################################################################


class PDF(FPDF):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.report_params = {}

    def header(self):
        self.image(
            "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/src/logo0.jpg",
            x=10,
            y=8,
            w=20,
        )
        title = self.report_params["title"]
        pilot = f"""Pilote : [{self.report_params["pilot"]}]({self.report_params["syride_pilote_url"]})"""
        # pilot = self.report_params["pilot"]
        self.set_font(family="helvetica", style="B", size=20)
        title_w = self.get_string_width(title) + 6
        doc_w = self.w
        self.set_x((doc_w - title_w) / 2)
        self.cell(
            w=title_w,
            h=10,
            text=title,
            border=False,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            center=True,
            align="C",
        )
        self.ln(4)
        self.set_font(family="helvetica", size=16)
        self.cell(
            w=0,
            h=10,
            text=pilot,
            border=False,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            center=True,
            align="C",
            markdown=True,
        )
        self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", style="I", size=8)
        self.set_text_color(169, 169, 169)
        self.cell(
            w=0,
            h=10,
            text=f"Page {self.page_no()}/{{nb}}",
            border=0,
            new_x=XPos.RMARGIN,
            new_y=YPos.NEXT,
            align="R",
        )

    def chapter_title(self, chap_num, chap_title, link):
        self.set_link(link)
        self.set_font(family="helvetica", style="B", size=14)
        self.set_fill_color(200, 220, 255)
        chapter_title = f"{chap_num}. {chap_title}"
        self.line(
            x1=15,
            y1=self.get_y(),
            x2=195,
            y2=self.get_y(),
        )
        self.cell(
            w=0,
            h=10,
            text=chapter_title,
            new_x=XPos.RMARGIN,
            new_y=YPos.NEXT,
            fill=True,
        )
        self.line(
            x1=15,
            y1=self.get_y(),
            x2=195,
            y2=self.get_y(),
        )
        self.ln(5)

    def print_chapter(self, chap_num, chap_title, link):
        self.add_page()
        self.chapter_title(chap_num, chap_title, link)

    def general_stats(self, df, flight_params_dict):
        self.set_font("helvetica", size=11)
        self.cell(
            w=80,
            h=8,
            text=f"Nombre total de vols : {flight_params_dict['nb_tot_vols']}",
        )

        self.cell(
            w=80,
            h=8,
            text=f"Temps total de vol : {flight_params_dict['tot_heures_vol']}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Date du premier vol : {flight_params_dict['date_premier_vol']}",
        )

        self.cell(
            w=80,
            h=8,
            text=f"Date du dernier vol : {flight_params_dict['date_dernier_vol']}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Nombre vols paramoteur: {flight_params_dict['nb_vols_paramoteur']} ({flight_params_dict['percent_vols_paramoteur']}%)",
        )

        self.cell(
            w=80,
            h=8,
            text=f"Temps de vol paramoteur : {flight_params_dict['paramoteur_heures_vol']} ({flight_params_dict['percent_temps_paramoteur']}%)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Nombre vols parapente: {flight_params_dict['nb_vols_parapente']} ({flight_params_dict['percent_vols_parapente']}%)",
        )

        self.cell(
            w=80,
            h=8,
            text=f"Temps de vol parapente : {flight_params_dict['parapente_heures_vol']} ({flight_params_dict['percent_temps_parapente']}%)",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        self.ln(5)
        self.cell(
            w=80,
            h=8,
            text=f"Distance totale parcourue : {flight_params_dict['total_distance_cumulee']} km",
        )

        self.cell(
            w=80,
            h=8,
            text=f"Distance moyenne parcourue : {flight_params_dict['moy_distance_cumulee']} km",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        url_dist_max = df[
            df["distance"] == flight_params_dict["max_distance_cumulee"]
        ]["flight_url"].iloc[0]
        self.multi_cell(
            w=0,
            h=8,
            text=f"Distance maximale parcourue : [{flight_params_dict['max_distance_cumulee']} km]({url_dist_max})",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            markdown=True,
        )

        self.ln(5)
        self.cell(
            w=80,
            h=8,
            text=f"Vitesse moyenne : {flight_params_dict['moy_vitesse_moyenne']} km/h",
        )

        url_vit_max = df[df["vitesse_max"] == df["vitesse_max"].max()][
            "flight_url"
        ].iloc[0]
        self.multi_cell(
            w=0,
            h=8,
            text=f"Vitesse maximale : [{flight_params_dict['max_vitesse_max']} km/h]({url_vit_max})",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            markdown=True,
        )

        url_vit_moy = df[df["vitesse_moyenne"] == df["vitesse_moyenne"].max()][
            "flight_url"
        ].iloc[0]
        self.cell(
            w=80,
            h=8,
            text=f"Vitesse moyenne maximale : [{flight_params_dict['max_vitesse_moyenne']} km/h]({url_vit_moy})",
            markdown=True,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Moyenne de la vitesse maximale : {flight_params_dict['moy_vitesse_max']} km/h",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        self.ln(5)
        self.cell(
            w=80,
            h=8,
            text=f"Plafond moyen : {flight_params_dict['moy_plafond']} m",
        )

        url_plaf_max = df[df["plafond"] == df["plafond"].max()]["flight_url"].iloc[0]
        self.cell(
            w=80,
            h=8,
            text=f"Plafond max : [{flight_params_dict['max_plafond']} m]({url_plaf_max})",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            markdown=True,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Vario max moyen : {flight_params_dict['moy_vario']} m/s",
            # new_x = XPos.LMARGIN,
            # new_y = YPos.NEXT,
        )

        url_vario_max = df[df["vario_max"] == df["vario_max"].max()]["flight_url"].iloc[
            0
        ]
        self.cell(
            w=80,
            h=8,
            text=f"Vario max : [{flight_params_dict['max_vario']} m/s]({url_vario_max})",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            markdown=True,
        )

        self.cell(
            w=80,
            h=8,
            text=f"Moyenne des g max : {flight_params_dict['moy_g']}g",
            # new_x = XPos.LMARGIN,
            # new_y = YPos.NEXT,
        )

        url_g_max = df[df["g_max"] == df["g_max"].max()]["flight_url"].iloc[0]
        self.multi_cell(
            w=0,
            h=8,
            text=f"""g max : [{flight_params_dict['max_g']}g]({url_g_max})""",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            markdown=True,
            link=url_g_max,
        )

        self.ln(5)
        self.cell(
            w=80,
            h=8,
            text=f"Nombre de sites visités : {flight_params_dict['nb_tot_sites']}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        # self.multi_cell(
        #     w=0,
        #     h=8,
        #     text=f"Sites visités : {flight_params_dict['liste_sites']}",
        #     new_x=XPos.LMARGIN,
        #     new_y=YPos.NEXT,
        # )
        self.ln(5)

    def create_table(self, data, table_title):
        self.set_font("helvetica", size=11)
        self.cell(
            w=80,
            h=8,
            text=table_title,
            markdown=True,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_font("helvetica", size=9)
        self.set_fill_color(255, 255, 255)
        with self.table(
            borders_layout="SINGLE_TOP_LINE",
            align=Align.L,
            cell_fill_color=200,
            cell_fill_mode="ROWS",
            line_height=self.font_size * 1.8,
            text_align="CENTER",
            width=180,
        ) as table:
            for data_row in data:
                row = table.row()
                for datum in data_row:
                    row.cell(datum)
        self.ln(5)


################################################################
################################################################

## fonctions


def initialize_pdf(report_params):
    pdf = PDF(orientation="P", unit="mm", format="A4")
    pdf.report_params = report_params
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(left=15, top=10, right=15)
    pdf.set_title(report_params["title"])
    pdf.set_author("Adrien MOREAU")
    pdf.add_page()
    return pdf


def table_matieres(pdf, chapters_dict):
    links_dict = {}
    # Cells
    couverture_rapport = "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/src/couverture_rapports_pdf.jpeg"
    pdf.image(name=couverture_rapport, x=0, w=pdf.w, keep_aspect_ratio=True)
    pdf.set_font(family="helvetica", style="B", size=14)
    for num_chapter, chapter_title in chapters_dict.items():
        links_dict[num_chapter] = pdf.add_link()
        pdf.cell(
            w=0,
            h=10,
            text=f"""{num_chapter}. {chapter_title}""",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
            link=links_dict[num_chapter],
        )
    return links_dict, pdf


def create_plots(df: pd.DataFrame, plot_param: dict):
    if plot_param["y_title"] is None:
        plot_param["y_title"] = plot_param["num_feature"]
    if plot_param["x_title"] is None:
        plot_param["x_title"] = plot_param["cat_feature"]

    fig = px.bar(
        data_frame=df,
        x=plot_param["cat_feature"],
        y=plot_param["num_feature"],
        text=plot_param["text"],
    )
    fig.update_traces(marker_color="orange")
    fig.update_traces(textposition="outside")
    fig.update_layout(
        showlegend=False,
        yaxis=dict(title=dict(text=plot_param["y_title"])),
        xaxis=dict(title=dict(text=plot_param["x_title"])),
        margin=dict(l=5, r=5, t=0, b=0),
    )
    return fig


def get_dfs(df: pd.DataFrame, pilot: str, year: int) -> pd.DataFrame:
    """
    Fonction utilisée pour obtenir les donnees de travail
    """
    df_year = df[df["annee"] == year]

    df_year_pilot = df_year[df_year["pilote"] == pilot]

    df_year_pilot_parapente = df_year_pilot[df_year_pilot["type_vol"] == "parapente"]
    df_year_pilot_paramoteur = df_year_pilot[df_year_pilot["type_vol"] == "paramoteur"]

    return df_year, df_year_pilot, df_year_pilot_parapente, df_year_pilot_paramoteur


def create_main_data(df: pd.DataFrame, pilot: str, year: int):
    """
    Fonction qui crée les données principales pour le rapport
    """
    report_params = {}
    report_params["pilot"] = pilot
    report_params["year_interest"] = year

    df_year, df_year_pilot, df_year_pilot_parapente, df_year_pilot_paramoteur = get_dfs(
        df=df, pilot=report_params["pilot"], year=report_params["year_interest"]
    )

    return (
        report_params,
        df_year,
        df_year_pilot,
        df_year_pilot_parapente,
        df_year_pilot_paramoteur,
    )


def get_flight_time(serie):
    nb_tot_minutes = int(round(serie.sum(), 0))
    nb_tot_heures_pleines = nb_tot_minutes // 60
    nb_tot_minutes_pleines = nb_tot_minutes % 60
    tot_heures_vol = f"{nb_tot_heures_pleines} h et {nb_tot_minutes_pleines} min"
    return tot_heures_vol


def get_mean_param(serie):
    return round(serie[serie > 0].mean(), 1)


def get_max_param(serie):
    return round(serie[serie > 0].max(), 1)


def get_group(df: pd.DataFrame, col: str, sort_values: list = ["moyenne_duree_vol", "total_duree_vol"]):
    df_group = (
        df.groupby(col, as_index=False)
        .agg(
            nb_vols=(col, "count"),
            total_duree_vol=("duree_vol_minutes", get_flight_time),
            moyenne_duree_vol=("duree_vol_minutes", get_mean_param),
            max_duree_vol=("duree_vol_minutes", get_max_param),
            moyenne_vitesse_moyenne=("vitesse_moyenne", get_mean_param),
            max_vitesse_moyenne=("vitesse_moyenne", get_max_param),
            moyenne_vitesse_max=("vitesse_max", get_mean_param),
            max_vitesse_max=("vitesse_max", get_max_param),
            moyenne_gain=("gain", get_mean_param),
            max_gain=("gain", get_max_param),
            moyenne_vario_max=("vario_max", get_mean_param),
            max_vario_max=("vario_max", get_max_param),
            moyenne_g_max=("g_max", get_mean_param),
            max_g_max=("g_max", get_max_param),
            nb_pilotes=("pilote", "nunique"),
            nb_tot_minutes=("duree_vol_minutes", "sum"),
        )
        .sort_values(sort_values, ascending=False)
        .reset_index(drop=True)
    )
    return df_group



def create_data_for_tables(df_init: pd.DataFrame):
    df_stat_sites = get_group(df=df_init, col="site")
    df_sites = (
        df_stat_sites[
            [
                "site",
                "nb_vols",
                "total_duree_vol",
                "moyenne_duree_vol",
                "moyenne_vitesse_moyenne",
            ]
        ]
    ).applymap(str)
    data_cols_sites = [
        [
            "Site",
            "Nombre de vols",
            "Durée totale de vol",
            "Durée moy. de vol",
            "Vitesse moyenne",
        ]
    ]
    data_rows_sites = df_sites.values.tolist()
    data_sites = data_cols_sites + data_rows_sites
    

    df_stat_voile = get_group(df=df_init, col="voile", sort_values=["total_duree_vol", "moyenne_duree_vol"])
    df_voiles = (
        df_stat_voile[
            [
                "voile",
                "nb_vols",
                "total_duree_vol",
                "moyenne_duree_vol",
                "moyenne_vitesse_moyenne",
                "max_gain",
                "max_vario_max",
                "max_g_max",
            ]
        ]
    ).applymap(str)
    data_cols_voiles = [
        [
            "Voile",
            "Nombre de vols",
            "Durée totale de vol",
            "Durée moy. de vol",
            "Vitesse moyenne",
            "gain max",
            "vario max",
            "g max",
        ]
    ]
    data_rows_voiles = df_voiles.values.tolist()
    data_voiles = data_cols_voiles + data_rows_voiles

    return data_sites, data_voiles

def create_images(df: pd.DataFrame):
    df_stat_mois_vol = get_group(df=df, col="mois")
    ordre_mois = {
        "janvier": 1,
        "fevrier": 2,
        "mars": 3,
        "avril": 4,
        "mai": 5,
        "juin": 6,
        "juillet": 7,
        "aout": 8,
        "septembre": 9,
        "octobre": 10,
        "novembre": 11,
        "decembre": 12,
    }
    df_stat_mois_vol["ordre"] = df_stat_mois_vol["mois"].map(ordre_mois)
    df_stat_mois_vol = (
        df_stat_mois_vol.sort_values(by="ordre")
        .drop(columns=["ordre"])
        .reset_index(drop=True)
    )

    df_stat_jour_vol = get_group(df=df, col="jour_semaine")
    ordre_jours = {
        "lundi": 1,
        "mardi": 2,
        "mercredi": 3,
        "jeudi": 4,
        "vendredi": 5,
        "samedi": 6,
        "dimanche": 7,
    }
    df_stat_jour_vol["ordre"] = df_stat_jour_vol["jour_semaine"].map(ordre_jours)
    df_stat_jour_vol = (
        df_stat_jour_vol.sort_values(by="ordre")
        .drop(columns=["ordre"])
        .reset_index(drop=True)
    )

    df_stat_heure_vol = get_group(df=df, col="heure_decolage")
    df_stat_heure_vol = df_stat_heure_vol.sort_values("heure_decolage").reset_index(
        drop=True
    )

    plot_mois_dict = {
        "cat_feature": "mois",
        "num_feature": "nb_vols",
        "text": "total_duree_vol",
        "y_title": "Nombre de vols",
        "x_title": None,
    }

    plot_jour_dict = {
        "cat_feature": "jour_semaine",
        "num_feature": "nb_vols",
        "text": "total_duree_vol",
        "y_title": "Nombre de vols",
        "x_title": "Jour de la semaine",
    }

    plot_heure_dict = {
        "cat_feature": "heure_decolage",
        "num_feature": "nb_vols",
        "text": "total_duree_vol",
        "y_title": "Nombre de vols",
        "x_title": "Heure de décolage",
    }
    fig_mois = create_plots(df_stat_mois_vol, plot_param=plot_mois_dict)
    fig_jour = create_plots(df_stat_jour_vol, plot_param=plot_jour_dict)
    fig_heure = create_plots(df_stat_heure_vol, plot_param=plot_heure_dict)

    image_fig_mois = fig_mois.to_image(format="png", engine="kaleido", scale=5)
    image_fig_jour = fig_jour.to_image(format="png", engine="kaleido", scale=5)
    image_fig_heure = fig_heure.to_image(format="png", engine="kaleido", scale=5)

    image_mois = io.BytesIO(image_fig_mois)
    image_jour = io.BytesIO(image_fig_jour)
    image_heure = io.BytesIO(image_fig_heure)

    return image_mois, image_jour, image_heure

def plot_cumulative_flights(
    df_init: pd.DataFrame, 
    value_col: str = "duree_vol_minutes",
    year: int = 2025
    ):

    daily = (
        df_init
        .groupby('date', as_index=False, observed=False)
        .agg(
            duree_vol_minutes= ("duree_vol_minutes", lambda x: round(x.sum(), 0)),
        )
    )

    annee = daily['date'].dt.year.mode()[0]

    # Générer toutes les dates de l’année pour garantir une grille complète
    calendar_index = pd.date_range(start=f"{annee}-01-01", end=f"{annee}-12-31")

    df = pd.DataFrame({"date": calendar_index})
    df = df.merge(daily, on="date", how="left")
    df['duree_vol_minutes'] = df['duree_vol_minutes'].fillna(0)

    df['cumsum'] = df[value_col].cumsum()
    df['cumsum_hours'] = df['cumsum'] / 60
    
    fig_cumul_flights = plt.figure(figsize=(14, 7))
    sns.set_style("white")
    ax = sns.lineplot(data=df, x='date', y='cumsum_hours', color='#1f77b4', linewidth=2)
    
    # Fill under the line
    plt.fill_between(df['date'], df['cumsum_hours'], color='#1f77b4', alpha=0.1)
    
    # Remove spines
    sns.despine()
    
    # Add annotation at the end
    annotation_offset = min(15, len(df))  # Prendre 4 ou le nombre de lignes si moins
    if annotation_offset > 0:
        last_date = df['date'].iloc[-annotation_offset]
        cumsum_hours = df['cumsum_hours'].iloc[-1]
        last_val = cumsum_hours*1.03
        plt.text(last_date, last_val, f"{cumsum_hours:.1f} h", 
            color='#1f77b4', fontweight='bold', ha='left', va='center'
        )
    
    plt.title(f"Durée cumulée de vol - {year}", fontsize=14, fontweight='bold')
    plt.xlabel(None)
    plt.ylabel("Durée cumulée (heures)", fontsize=12)
    
    image_cumul_flights = io.BytesIO()
    fig_cumul_flights.savefig(image_cumul_flights, format='png', dpi=300, bbox_inches='tight')
    image_cumul_flights.seek(0)
    plt.close(fig_cumul_flights)
    
    return image_cumul_flights

def plot_calendar_flights(
    df_init: pd.DataFrame, 
    value_col: str = "duree_vol_minutes",
    start_month: int = 1, 
    end_month: int = 12, 
    year: int = 2025
    ):
    

    df_init['date'] = pd.to_datetime(df_init['date'])

    # Regrouper au cas où il y aurait plusieurs vols par jour
    daily = (
        df_init
        .groupby('date', as_index=False, observed=False)
        .agg(
            duree_vol_minutes= ("duree_vol_minutes", lambda x: round(x.sum(), 0)),
            type_vol = ("type_vol", "unique"), # set des types de vols dans la journée
        )
    )
    # display(daily.head())

    # Année que vous voulez afficher (modifiable selon vos besoins)
    annee = daily['date'].dt.year.mode()[0]

    # Générer toutes les dates de l’année pour garantir une grille complète
    calendar_index = pd.date_range(start=f"{annee}-01-01", end=f"{annee}-12-31")

    df = pd.DataFrame({"date": calendar_index})
    df = df.merge(daily, on="date", how="left")
    df['duree_vol_minutes'] = df['duree_vol_minutes'].fillna(0)

    # df = df_init.copy()
    df = df[
        (df['date'].dt.year == year)
        & (df['date'].dt.month >= start_month) 
        & (df['date'].dt.month <= end_month)
    ]
    df['month']=df['date'].dt.month
    vmax=df[value_col].max()

    nb_jour_vol = len(df[df["duree_vol_minutes"]>0])
    temps_vol_moyen = round(df[df["duree_vol_minutes"]>0]["duree_vol_minutes"].mean(), 0)
    
    months = sorted(df['month'].unique())
    cols = 3; 
    rows = ceil(len(months)/cols)


    fig, axes = plt.subplots(rows, cols, figsize=(4*cols, 3.2*rows))
    axes = np.array(axes).reshape(rows, cols)
    mois_noms = {
        1:'Jan', 2:'Fév', 3:'Mar', 4:'Avr', 5:'Mai', 
        6:"Jun", 7:'Jul', 8:'Aout', 9:"Sep", 10:'Oct', 
        11:'Nov', 12: 'Déc'
    }
    
    for i,m in enumerate(months):
        ax = axes[i//cols, i%cols]
        sub = df[df['month']==m].set_index('date')
        first = pd.Timestamp(year=year, month=m, day=1)
        last = first + pd.offsets.MonthEnd(0)
        
        rng = pd.date_range(first, last, freq='D')
        tmp = pd.DataFrame(index=rng)

        tmp[value_col] = sub[value_col]
        tmp['type_vol'] = sub['type_vol']
        
        val_param, val_para, val_both = [], [], []
        for _, row in tmp.iterrows():
            v = row[value_col]
            t = row['type_vol']
            is_param = False
            is_para = False
            if pd.notna(v) and v > 0 and isinstance(t, (list, np.ndarray)):
                if 'paramoteur' in t: is_param = True
                if 'parapente' in t: is_para = True
            
            if is_param and is_para:
                val_both.append(v)
                val_param.append(np.nan)
                val_para.append(np.nan)
            elif is_param:
                val_both.append(np.nan)
                val_param.append(v)
                val_para.append(np.nan)
            elif is_para:
                val_both.append(np.nan)
                val_param.append(np.nan)
                val_para.append(v)
            else:
                val_both.append(np.nan)
                val_param.append(np.nan)
                val_para.append(np.nan)

        tmp['val_param'] = val_param
        tmp['val_para'] = val_para
        tmp['val_both'] = val_both

        tmp['dow']= tmp.index.weekday
        tmp['week']= tmp.index.isocalendar().week
        if tmp["week"].min()> 50:
            tmp["week"] -= tmp["week"].min()
            
        p_param = tmp.pivot(index='week', columns='dow', values='val_param').astype(float)
        p_para = tmp.pivot(index='week', columns='dow', values='val_para').astype(float)
        p_both = tmp.pivot(index='week', columns='dow', values='val_both').astype(float)
        
        sns.heatmap(p_param, ax=ax, cmap='Greens', cbar=False, vmin=0, vmax=vmax, linewidths=.5, linecolor='white', annot=True, fmt=".0f")
        sns.heatmap(p_para, ax=ax, cmap='Reds', cbar=False, vmin=0, vmax=vmax, linewidths=.5, linecolor='white', annot=True, fmt=".0f")
        sns.heatmap(p_both, ax=ax, cmap='Purples', cbar=False, vmin=0, vmax=vmax, linewidths=.5, linecolor='white', annot=True, fmt=".0f")

        ax.set_title(f"{mois_noms[m]} {year}")
        ax.set_xticks([0.5,1.5,2.5,3.5,4.5,5.5,6.5])
        ax.set_xticklabels(['Lun','Mar','Mer','Jeu', 'Ven','Sam','Dim'], rotation=0, fontsize=8)
        ax.set_ylabel('Sem.')
        ax.set_xlabel(None)
    
    for j in range(i+1, rows*cols): 
        fig.delaxes(axes[j//cols, j%cols])
    
    
    legend_elements = [
        Patch(facecolor='green', label='Vol paramoteur'),
        Patch(facecolor='red', label='Vol parapente'),
        Patch(facecolor='purple', label='Vol parapente et paramoteur'),
    ]
    fig.legend(handles=legend_elements, loc='lower center', bbox_to_anchor=(0.5, -0.025), ncol=3, fontsize=10)
    fig.suptitle(f"Calendrier des vols - {year}, {nb_jour_vol} jours avec vols , {temps_vol_moyen} minutes de vol par jour en moyenne", fontsize=14, fontweight='bold', ha='center')
    
    plt.tight_layout()
    
    image_calendrier_flights = io.BytesIO()
    fig.savefig(image_calendrier_flights, format='png', dpi=300, bbox_inches='tight')
    image_calendrier_flights.seek(0)
    plt.close(fig)
    
    return image_calendrier_flights


def generate_pdf_report(
    df: pd.DataFrame,
    pilot: str,
    year: int,
    folder_name: str = "/Users/Adrien/Documents/paramoteur/syride/analyze_traces/syride_traces/pdf_reports/",
):
    file_name = f"{pilot}_stats_vol_{year}.pdf"
    final_file_name = folder_name + file_name
    # Colonnes flight_url et heure_decolage (absentes du pkl), dates et durées normalisées
    df = prepare_report_df(df)
    (
        report_params,
        _,
        df_year_pilot,
        df_year_pilot_parapente,
        df_year_pilot_paramoteur,
    ) = create_main_data(df=df, pilot=pilot, year=year)

    report_params["syride_pilote_url"] = f"https://www.syride.com/fr/pilotes/{pilot}"

    if df_year_pilot.shape[0] > 0:
        report_params["title"] = (
            f"""Statistiques des vols pour l'année {report_params["year_interest"]}"""
        )
        chapters_dict = {
            "1": "Statistiques générales",
            "2": "Statistiques parapente",
            "3": "Statistiques paramoteur",
        }
        tables_dict = {
            "table_1_title": "Sites pratiqués :",
            "table_2_title": "Voiles utilisées :",
        }

        # Creation du rapport PDF
        pdf = initialize_pdf(report_params=report_params)
        links_dict, pdf = table_matieres(pdf=pdf, chapters_dict=chapters_dict)

        # Chapter 1: Global
        # Variables
        global_flight_params = get_flight_params(df=df_year_pilot)
        data_sites, data_voiles = create_data_for_tables(df_init=df_year_pilot)
        image_mois, image_jour, image_heure = create_images(df=df_year_pilot)
        image_cumul_flights = plot_cumulative_flights(df_init=df_year_pilot, year=year)
        image_calendrier_flights = plot_calendar_flights(df_init=df_year_pilot, year=year)

        pdf.print_chapter(
            chap_num=1, chap_title=chapters_dict["1"], link=links_dict["1"]
        )
        pdf.general_stats(df=df_year_pilot, flight_params_dict=global_flight_params)
        pdf.ln(10)
        pdf.image(name=image_cumul_flights, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=image_calendrier_flights, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.ln(10)
        pdf.create_table(data=data_sites, table_title=tables_dict["table_1_title"])
        pdf.ln(5)
        pdf.create_table(data=data_voiles, table_title=tables_dict["table_2_title"])
        pdf.image(name=image_mois, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=image_jour, x=30, w=pdf.w - 60, keep_aspect_ratio=True)
        pdf.image(name=image_heure, x=20, w=pdf.w - 50, keep_aspect_ratio=True)

        # Chapter 2: parapente
        pdf.print_chapter(
            chap_num=2, chap_title=chapters_dict["2"], link=links_dict["2"]
        )
        if df_year_pilot_parapente.shape[0] > 0:
            # variables
            parapente_flight_params = get_flight_params(df=df_year_pilot_parapente)
            data_sites_parapente, data_voiles_parapente = create_data_for_tables(
                df_init=df_year_pilot_parapente
            )
            image_mois_parapente, image_jour_parapente, image_heure_parapente = (
                create_images(df=df_year_pilot_parapente)
            )
            image_cumul_flights_parapente = plot_cumulative_flights(df_init=df_year_pilot_parapente, year=year)
            image_calendrier_flights_parapente = plot_calendar_flights(df_init=df_year_pilot_parapente, year=year)

            # pdf
            pdf.general_stats(
                df=df_year_pilot_parapente, flight_params_dict=parapente_flight_params
            )
            pdf.ln(10)
            pdf.image(name=image_cumul_flights_parapente, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
            pdf.image(name=image_calendrier_flights_parapente, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
            pdf.ln(10)
            pdf.create_table(
                data=data_sites_parapente, table_title=tables_dict["table_1_title"]
            )
            pdf.ln(5)
            pdf.create_table(
                data=data_voiles_parapente, table_title=tables_dict["table_2_title"]
            )
            pdf.image(
                name=image_mois_parapente, x=20, w=pdf.w - 30, keep_aspect_ratio=True
            )
            pdf.image(
                name=image_jour_parapente, x=30, w=pdf.w - 60, keep_aspect_ratio=True
            )
            pdf.image(
                name=image_heure_parapente, x=20, w=pdf.w - 50, keep_aspect_ratio=True
            )
        else:
            pdf.set_font("helvetica", size=11)
            pdf.cell(
                w=0,
                h=5,
                text="Aucune activité parapente connue",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

        # Chapter 3: paramoteur
        pdf.print_chapter(
            chap_num=3, chap_title=chapters_dict["3"], link=links_dict["3"]
        )
        if df_year_pilot_paramoteur.shape[0] > 0:
            # Variables
            paramoteur_flight_params = get_flight_params(df=df_year_pilot_paramoteur)
            data_sites_paramoteur, data_voiles_paramoteur = create_data_for_tables(
                df_init=df_year_pilot_paramoteur
            )
            image_mois_paramoteur, image_jour_paramoteur, image_heure_paramoteur = (
                create_images(df=df_year_pilot_paramoteur)
            )
            image_cumul_flights_paramoteur = plot_cumulative_flights(df_init=df_year_pilot_paramoteur, year=year)
            image_calendrier_flights_paramoteur = plot_calendar_flights(df_init=df_year_pilot_paramoteur, year=year)

            # pdf
            pdf.general_stats(
                df=df_year_pilot_paramoteur, flight_params_dict=paramoteur_flight_params
            )
            pdf.ln(10)
            pdf.image(name=image_cumul_flights_paramoteur, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
            pdf.image(name=image_calendrier_flights_paramoteur, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
            pdf.ln(10)
            pdf.create_table(
                data=data_sites_paramoteur, table_title=tables_dict["table_1_title"]
            )
            pdf.ln(5)
            pdf.create_table(
                data=data_voiles_paramoteur, table_title=tables_dict["table_2_title"]
            )
            pdf.image(
                name=image_mois_paramoteur, x=20, w=pdf.w - 30, keep_aspect_ratio=True
            )
            pdf.image(
                name=image_jour_paramoteur, x=30, w=pdf.w - 60, keep_aspect_ratio=True
            )
            pdf.image(
                name=image_heure_paramoteur, x=20, w=pdf.w - 50, keep_aspect_ratio=True
            )
        else:
            pdf.set_font("helvetica", size=11)
            pdf.cell(
                w=0,
                h=5,
                text="Aucune activité paramoteur connue",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

        pdf.output(final_file_name)
        print(f"Rapport PDF généré : {file_name}")
    else:
        print(f"Aucune données pour le pilote {pilot}")


# %%
