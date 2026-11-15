"""
generate_reports.py
===================

Point d'entrée en ligne de commande pour générer les rapports :
  - PDF amélioré (via report_functions.generate_pdf_report)
  - HTML interactif et autonome (via rapport.report_html)

Exemples d'utilisation :

  # Rapport HTML uniquement
  python generate_reports.py --pilot AdrienM --year 2025 --format html

  # Rapport PDF uniquement
  python generate_reports.py --pilot AdrienM --year 2025 --format pdf

  # Les deux (PDF + HTML)
  python generate_reports.py --pilot AdrienM --year 2025 --format all

  # Avec comparaison automatique des 2 années précédentes
  python generate_reports.py --pilot AdrienM --year 2025 --format html --compare

  # Comparaison avec des années spécifiques
  python generate_reports.py --pilot AdrienM --year 2025 --format html --compare 2023 2024

  # Choisir le dossier de sortie
  python generate_reports.py --pilot AdrienM --year 2025 --format all --output ./rapports/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ajouter src/ au chemin pour les imports relatifs
# __file__ est dans src/rapport/, donc parent.parent = src/
SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import params_scrap_syride as params
import pickle
from rapport.report_data import prepare_report_df, compute_report
from rapport.report_html import build_report

try:
    from report_functions import generate_pdf_report
except ImportError:
    generate_pdf_report = None  # type: ignore


def load_flights(pkl_path: str) -> "pd.DataFrame":
    """Charge le DataFrame de vols depuis le fichier pkl."""
    import pandas as pd
    with open(pkl_path, "rb") as f:
        data = pickle.load(f)
    if isinstance(data, pd.DataFrame):
        return data
    # Certains pkl stockent un dict {pilote: df} → concaténer
    if isinstance(data, dict):
        return pd.concat(data.values(), ignore_index=True)
    raise ValueError(f"Format pkl non reconnu : {type(data)}")


def get_previous_years(df: "pd.DataFrame", pilot: str, year: int, max_count: int = 2) -> list:
    """Retourne jusqu'à `max_count` années précédentes où le pilote a volé."""
    import pandas as pd
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    years = sorted(
        df[(df["pilote"] == pilot) & (df["date"].dt.year < year)]["date"].dt.year.dropna().unique(),
        reverse=True,
    )
    return [int(y) for y in years[:max_count]]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Générer des rapports de vol (PDF et/ou HTML) pour un pilote."
    )
    parser.add_argument(
        "--pilot", "-p",
        required=True,
        help="Nom du pilote (ex: AdrienM, j2f, Nico16).",
    )
    parser.add_argument(
        "--year", "-y",
        type=int,
        required=True,
        help="Année du rapport (ex: 2025).",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["pdf", "html", "all"],
        default="all",
        help="Format de sortie (pdf, html, all). Défaut: all.",
    )
    parser.add_argument(
        "--output", "-o",
        default="./rapports/",
        help="Dossier de sortie (créé si nécessaire). Défaut: ./rapports/.",
    )
    parser.add_argument(
        "--compare",
        nargs="*",
        type=int,
        metavar="ANNEE",
        help="Années précédentes à comparer (max 2). Si omis, détection automatique.",
    )
    parser.add_argument(
        "--logo",
        default=None,
        help="Chemin vers le logo à inclure dans le rapport HTML.",
    )
    parser.add_argument(
        "--textes",
        default=str(SRC_DIR / "rapport" / "report_textes.md"),
        help="Chemin vers le fichier de textes éditables (HTML uniquement).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    pkl_path = params.pkl_path
    if not Path(pkl_path).exists():
        print(f"ERREUR : le fichier pkl est introuvable : {pkl_path}")
        return 1

    # Charger les données une seule fois
    print(f"Chargement des données depuis {pkl_path} ...")
    import pandas as pd
    df = load_flights(pkl_path)

    # Vérifier que le pilote existe
    pilots = df["pilote"].unique()
    if args.pilot not in pilots:
        print(f"ERREUR : le pilote '{args.pilot}' n'existe pas dans les données.")
        print(f"Pilotes disponibles : {', '.join(sorted(pilots))}")
        return 1

    # Déterminer les années de comparaison
    compare_years = args.compare
    if compare_years is None and args.format in ("html", "all"):
        compare_years = get_previous_years(df, args.pilot, args.year, max_count=2)
    if compare_years:
        compare_years = compare_years[:2]
        print(f"Comparaison avec les années : {compare_years}")
    else:
        compare_years = []

    logo_path = args.logo or str(SRC_DIR / "logo0.jpg")

    ok = True

    # --- PDF ---
    if args.format in ("pdf", "all"):
        if generate_pdf_report is None:
            print("ERREUR : report_functions.generate_pdf_report est indisponible.")
            ok = False
        else:
            pdf_name = f"{args.pilot}_stats_vol_{args.year}.pdf"
            pdf_path = output_dir / pdf_name
            print(f"Génération du PDF : {pdf_path} ...")
            try:
                generate_pdf_report(
                    df=df,
                    pilot=args.pilot,
                    year=args.year,
                    folder_name=str(output_dir) + "/",
                )
                print(f"  ✓ PDF généré : {pdf_path}")
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ Erreur lors de la génération PDF : {exc}")
                ok = False

    # --- HTML ---
    if args.format in ("html", "all"):
        html_name = f"{args.pilot}_rapport_vol_{args.year}.html"
        html_path = output_dir / html_name
        print(f"Génération du HTML : {html_path} ...")
        try:
            build_report(
                df=df,
                pilot=args.pilot,
                year=args.year,
                output=str(html_path),
                compare_years=compare_years if compare_years else "auto",
                texts_path=args.textes,
            )
            print(f"  ✓ HTML généré : {html_path}")
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ Erreur lors de la génération HTML : {exc}")
            ok = False

    if ok:
        print("\nTous les rapports ont été générés avec succès.")
        return 0
    else:
        print("\nCertains rapports n'ont pas pu être générés.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
