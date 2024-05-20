"""
Script used to scrap syride website to
download traces of a list of pilot.

For each pilotes, the script generates a folder containing
all the traces.
"""

# Imports
import python_functions
from create_global_pkl import create_gobal_flight_data
import params_scrap_syride as params
import argparse

# Parameters
pilotes = params.pilots
main_path = params.main_path
dict_filenames = params.dict_pilotes

# Arguments
parser = argparse.ArgumentParser(
    description="""Script dont l'objectif est de 
    récupérer sur le site de syrde l'ensemble des traces d'un pilote donné."""
)
parser.add_argument(
    "--scroll",
    type=int,
    default=-1,
    help="Nombre de scroll nécessaire dans le scaping.",
)
parser.add_argument(
    "--pkl",
    type=int,
    default=1,
    help="Construction du fichier pkl : 1=oui (defaut), 0=non",
)

args = parser.parse_args()

# Lancement du script
if __name__ == "__main__":
    for pilot in pilotes:
        print(pilot)
        python_functions.get_syride_traces(
            path=main_path, pilot=pilot, scroll=args.scroll
        )
        print("\n\n")
    print("Tous les fichiers ont été téléchargés", "\n")

    if args.pkl == 1:
        create_gobal_flight_data(
            common_filename=main_path, dict_filenames=dict_filenames
        )
