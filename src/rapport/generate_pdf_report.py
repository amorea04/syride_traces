"""
generate_pdf_report.py
=======================

Rapport PDF amélioré utilisant le même moteur de données (report_data.py) que le rapport HTML.

Objectifs :
  - Utiliser la même préparation des données que le HTML (colonnes flight_url/heure_decolage).
  - Maintenir la mise en forme PDF actuelle (format A4, couverture, tables, etc.).
  - Garder la navigation et la structure existantes (chapitres 1-3).
  - Ajouter la possibilité de générer une table des matières (optionnelle).

Se connecte aux fonctions existantes de report_functions.py, mais réutilise
system.FlightDataFrame pour garantir la cohérence des chiffres entre PDF et HTML.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pandas as pd

# Importer les fonctions partagées de report_data
from rapport.report_data import (
    load_flights,
    prepare_df,
    get_pilot_year_data,
    compute_indicators,
)

# Importer les fonctions PDF originales (elles restent inchangées)
try:
    from report_functions import (
        get_flight_params,
        create_data_for_tables,
        create_images,
        plot_cumulative_flights,
        plot_calendar_flights,
        initialize_pdf,
        table_matieres,
        PDF,
    )
except ImportError as exc:
    raise ImportError(
        "report_functions.py doit être importable depuis src/. "
        "Assurez-vous que le module est dans le chemin d'importation."
    ) from exc

# ---------------------------------------------------------------------------
# Configuration / chemins (doit correspondre à params_scrap_syride.py)
# ---------------------------------------------------------------------------

def get_pdf_folder(pilote: str, annee: int, base_folder: str | Path) -> Path:
    """Retourne le dossier de sortie (base_folder/pilote/)."""
    base = Path(base_folder)
    folder = base / pilote / str(annee)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def get_couverture_path(base_folder: str | Path) -> Path:
    """Retourne le chemin du logo de couverture."""
    return Path(base_folder) / "couverture_rapports_pdf.jpeg"


def get_logo_path() -> Path:
    """Retourne le chemin du logo (haut de page)."""
    return Path(__file__).resolve().parent.parent / "logo0.jpg"


# ---------------------------------------------------------------------------
# Noyau de génération du PDF (basé sur l'existant, mais réutilise report_data)
# ---------------------------------------------------------------------------

def _build_pdf_content(
    pdf: PDF,
    df: pd.DataFrame,
    pilot: str,
    year: int,
    couverture_path: str | Path,
    logo_path: str | Path,
) -> None:
    """Construit le contenu du PDF en utilisant les mêmes données que l'HTML."""
    # Identifier le jeu de données courant
    df_year = get_pilot_year_data(df, pilot, year)
    df_year_pilot = df_year
    df_year_pilot_parapente = df_year[df_year["type_vol"] == "parapente"]
    df_year_pilot_paramoteur = df_year[df_year["type_vol"] == "paramoteur"]

    if df_year_pilot.empty:
        pdf.set_font("helvetica", size=11)
        pdf.cell(w=0, h=10, text=f"Aucune donnée pour le pilote {pilot}, l'année {year}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
        return

    # Paramètres de base (identiques à report_functions.generate_pdf_report)
    title = f"Statistiques des vols pour l'année {year}"
    syride_pilote_url = f"https://www.syride.com/fr/pilotes/{pilot}"

    # Indicateurs (utilisent report_data.compute_indicators)
    global_params = compute_indicators(df_year_pilot)
    para_params = compute_indicators(df_year_pilot_parapente) if not df_year_pilot_parapente.empty else None
    param_params = compute_indicators(df_year_pilot_paramoteur) if not df_year_pilot_paramoteur.empty else None

    # Chapitres
    chapters_dict = {
        "1": "Statistiques générales",
        "2": "Statistiques parapente",
        "3": "Statistiques paramoteur",
    }

    # Couverture (si présente)
    if Path(couverture_path).exists():
        pdf.image(name=str(couverture_path), x=0, w=pdf.w, keep_aspect_ratio=True)
        pdf.ln(12)

    # --- CHAPITRE 1 : GÉNÉRAL (identique à report_functions, mais avec report_data) ---
    pdf.print_chapter(chap_num=1, chap_title=chapters_dict["1"], link=pdf.add_link())

    # Ligne d'information
    pdf.set_font("helvetica", size=11)
    pdf.cell(w=80, h=8, text=f"Pilote : {pilot}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.cell(w=80, h=8, text=f"Année : {year}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.cell(w=80, h=8, text=f"Date de génération : {dt.datetime.now().strftime('%d/%m/%Y')}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.ln(5)

    # Statistiques générales (utilisent les champs de global_params)
    # Cas par cas pour correspondre à l'existant (avec quelques ajustements)
    pdf.set_font("helvetica", size=11)

    pdf.cell(w=80, h=8, text=f"Nombre total de vols : {global_params['nb_vols']}")
    pdf.cell(w=80, h=8, text=f"Temps total de vol : {global_params['total_duration_str']}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.cell(w=80, h=8, text=f"Date du premier vol : {global_params['first_date_str']}")
    pdf.cell(w=80, h=8, text=f"Date du dernier vol : {global_params['last_date_str']}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.cell(w=80, h=8, text=f"Nombre vols paramoteur: {global_params['nb_param']} ({global_params['pct_param']}%)")
    pdf.cell(w=80, h=8, text=f"Temps de vol paramoteur : {global_params['param_duration_str']} ({global_params['pct_param']}%)", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
    pdf.cell(w=80, h=8, text=f"Nombre vols parapente: {global_params['nb_para']} ({global_params['pct_para']}%)")
    pdf.cell(w=80, h=8, text=f"Temps de vol parapente : {global_params['para_duration_str']} ({global_params['pct_para']}%)", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)

    pdf.ln(5)
    pdf.cell(w=80, h=8, text=f"Distance totale parcourue : {global_params['total_dist']} km")
    pdf.cell(w=80, h=8, text=f"Distance moyenne parcourue : {global_params['mean_dist']} km", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)

    url_dist_max = df_year_pilot.loc[df_year_pilot["distance"] == global_params["max_dist"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["distance"] == global_params["max_dist"]].empty else ""
    pdf.multi_cell(w=0, h=8, text=f"Distance maximale parcourue : [{global_params['max_dist']} km]({url_dist_max})", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT, markdown=True)

    pdf.ln(5)
    pdf.cell(w=80, h=8, text=f"Vitesse moyenne : {global_params['mean_speed_moy']} km/h")

    url_vit_max = df_year_pilot.loc[df_year_pilot["vitesse_max"] == global_params["max_speed_max"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["vitesse_max"] == global_params["max_speed_max"]].empty else ""
    pdf.multi_cell(w=0, h=8, text=f"Vitesse maximale : [{global_params['max_speed_max']} km/h]({url_vit_max})", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT, markdown=True)

    url_vit_moy = df_year_pilot.loc[df_year_pilot["vitesse_moyenne"] == global_params["max_speed_moy"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["vitesse_moyenne"] == global_params["max_speed_moy"]].empty else ""
    pdf.cell(w=80, h=8, text=f"Vitesse moyenne maximale : [{global_params['max_speed_moy']} km/h]({url_vit_moy})", markdown=True)
    pdf.cell(w=80, h=8, text=f"Moyenne de la vitesse maximale : {global_params['mean_speed_max']} km/h", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)

    pdf.ln(5)
    pdf.cell(w=80, h=8, text=f"Plafond moyen : {global_params['mean_ceil']} m")

    url_plaf_max = df_year_pilot.loc[df_year_pilot["plafond"] == global_params["max_ceil"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["plafond"] == global_params["max_ceil"]].empty else ""
    pdf.cell(w=80, h=8, text=f"Plafond max : [{global_params['max_ceil']} m]({url_plaf_max})", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT, markdown=True)

    url_vario_max = df_year_pilot.loc[df_year_pilot["vario_max"] == global_params["max_vario"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["vario_max"] == global_params["max_vario"]].empty else ""
    pdf.cell(w=80, h=8, text=f"Vario max : [{global_params['max_vario']} m/s]({url_vario_max})", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT, markdown=True)

    url_g_max = df_year_pilot.loc[df_year_pilot["g_max"] == global_params["max_g"], "flight_url"].iloc[0] if not df_year_pilot.loc[df_year_pilot["g_max"] == global_params["max_g"]].empty else ""
    pdf.multi_cell(w=0, h=8, text=f"g max : [{global_params['max_g']}g]({url_g_max})", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT, markdown=True, link=url_g_max)

    pdf.ln(5)
    pdf.cell(w=80, h=8, text=f"Nombre de sites visités : {global_params['nb_sites']}")
    pdf.ln(5)

    # Tableaux (utilisent les données des sites et voiles)
    # Préparer les données selon le même schéma que create_data_for_tables de report_functions
    data_sites, data_voiles = create_data_for_tables(df_init=df_year_pilot)

    pdf.create_table(data=data_sites, table_title="Sites pratiqués :")
    pdf.ln(5)
    pdf.create_table(data=data_voiles, table_title="Voiles utilisées :")

    # Graphiques (utilisent les fonctions existantes create_images et plot_cumulative_flights/plot_calendar_flights)
    image_mois, image_jour, image_heure = create_images(df=df_year_pilot)
    image_cumul = plot_cumulative_flights(df_init=df_year_pilot, year=year)
    image_calendrier = plot_calendar_flights(df_init=df_year_pilot, year=year)

    pdf.image(name=image_cumul, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
    pdf.image(name=image_calendrier, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
    pdf.ln(10)

    pdf.image(name=image_mois, x=20, w=pdf.w - 30, keep_aspect_ratio=True)
    pdf.image(name=image_jour, x=30, w=pdf.w - 60, keep_aspect_ratio=True)
    pdf.image(name=image_heure, x=20, w=pdf.w - 50, keep_aspect_ratio=True)

    # --- CHAPITRE 2 : PARAPENTE ---
    pdf.print_chapter(chap_num=2, chap_title=chapters_dict["2"], link=pdf.add_link())
    if not df_year_pilot_parapente.empty:
        pdf.set_font("helvetica", size=11)
        pdf.cell(w=80, h=8, text=f"Nombre total de vols : {para_params['nb_vols']}")
        pdf.cell(w=80, h=8, text=f"Temps total de vol : {para_params['total_duration_str']}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
        pdf.ln(5)
        pdf.image(name=plot_cumulative_flights(df_init=df_year_pilot_parapente, year=year), x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=plot_calendar_flights(df_init=df_year_pilot_parapente, year=year), x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.ln(10)
        pdf.create_table(data=create_data_for_tables(df_init=df_year_pilot_parapente)[0], table_title="Sites pratiqués :")
        pdf.ln(5)
        pdf.create_table(data=create_data_for_tables(df_init=df_year_pilot_parapente)[1], table_title="Voiles utilisées :")
        pdf.image(name=create_images(df=df_year_pilot_parapente)[0], x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=create_images(df=df_year_pilot_parapente)[1], x=30, w=pdf.w - 60, keep_aspect_ratio=True)
        pdf.image(name=create_images(df=df_year_pilot_parapente)[2], x=20, w=pdf.w - 50, keep_aspect_ratio=True)
    else:
        pdf.set_font("helvetica", size=11)
        pdf.cell(w=0, h=5, text="Aucune activité parapente connue", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)

    # --- CHAPITRE 3 : PARAMOTEUR ---
    pdf.print_chapter(chap_num=3, chap_title=chapters_dict["3"], link=pdf.add_link())
    if not df_year_pilot_paramoteur.empty:
        pdf.set_font("helvetica", size=11)
        pdf.cell(w=80, h=8, text=f"Nombre total de vols : {param_params['nb_vols']}")
        pdf.cell(w=80, h=8, text=f"Temps total de vol : {param_params['total_duration_str']}", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)
        pdf.ln(5)
        pdf.image(name=plot_cumulative_flights(df_init=df_year_pilot_paramoteur, year=year), x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=plot_calendar_flights(df_init=df_year_pilot_paramoteur, year=year), x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.ln(10)
        pdf.create_table(data=create_data_for_tables(df_init=df_year_pilot_paramoteur)[0], table_title="Sites pratiqués :")
        pdf.ln(5)
        pdf.create_table(data=create_data_for_tables(df_init=df_year_pilot_paramoteur)[1], table_title="Voiles utilisées :")
        pdf.image(name=create_images(df=df_year_pilot_paramoteur)[0], x=20, w=pdf.w - 30, keep_aspect_ratio=True)
        pdf.image(name=create_images(df=df_year_pilot_paramoteur)[1], x=30, w=pdf.w - 60, keep_aspect_ratio=True)
        pdf.image(name=create_images(df=df_year_pilot_paramoteur)[2], x=20, w=pdf.w - 50, keep_aspect_ratio=True)
    else:
        pdf.set_font("helvetica", size=11)
        pdf.cell(w=0, h=5, text="Aucune activité paramoteur connue", new_x=PDF.XPos.LMARGIN, new_y=PDF.YPos.NEXT)


def generate_improved_pdf_report(
    df: pd.DataFrame,
    pilot: str,
    year: int,
    folder_name: str = "./pdf_reports/",
    couverture_filename: str = "couverture_rapports_pdf.jpeg",
) -> Path:
    """
    Génère le rapport PDF amélioré et cohérent avec le HTML.

    Se connecte au pkl original (params_scrap_syride.pkl_path) si df est vide.
    Utilise les mêmes indicateurs que le rapport HTML (report_data.compute_indicators).
    """
    # Préparation des données en une seule fois (réutilisable pour PDF et HTML)
    df = prepare_df(df)

    df_year = get_pilot_year_data(df, pilot, year)
    if df_year.empty:
        print(f"Aucune donnée pour le pilote {pilot}, l'année {year}.")
        return Path("")

    # Paramètres du rapport (identiques à report_functions.generate_pdf_report)
    report_params = {}
    report_params["pilot"] = pilot
    report_params["year_interest"] = year
    report_params["title"] = f"Statistiques des vols pour l'année {year}"
    report_params["syride_pilote_url"] = f"https://www.syride.com/fr/pilotes/{pilot}"

    chapters_dict = {
        "1": "Statistiques générales",
        "2": "Statistiques parapente",
        "3": "Statistiques paramoteur",
    }

    # Initialiser le PDF
    pdf = initialize_pdf(report_params=report_params)
    links_dict, pdf = table_matieres(pdf=pdf, chapters_dict=chapters_dict)

    # Construire le contenu (en utilisant l'implémentation ci-dessus)
    couverture_path = Path(__file__).resolve().parent / ".." / "src" / couverture_filename
    logo_path = get_logo_path()

    _build_pdf_content(pdf, df, pilot, year, couverture_path, logo_path)

    # Sauvegarder
    folder = get_pdf_folder(pilot, year, folder_name)
    file_name = f"{pilot}_stats_vol_{year}.pdf"
    final_path = folder / file_name

    pdf.output(str(final_path))
    print(f"Rapport PDF amélioré généré : {final_path}")
    return final_path


def generate_improved_pdf_report_from_pkl(
    pkl_path: str | Path,
    pilot: str,
    year: int,
    folder_name: str = "./pdf_reports/",
    couverture_filename: str = "couverture_rapports_pdf.jpeg",
) -> Path:
    """
    Variante qui charge le pkl avant de générer le rapport.
    """
    df = load_flights(pkl_path)
    return generate_improved_pdf_report(
        df=df,
        pilot=pilot,
        year=year,
        folder_name=folder_name,
        couverture_filename=couverture_filename,
    )
