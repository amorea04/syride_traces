"""
Script used to scrap syride website to
download traces of a list of pilot.

For each pilotes, the script generates a folder containing
all the traces.
"""

# Imports
import python_functions
import params_scrap_syride

# Parameters
pilotes = params_scrap_syride.pilots
main_path = params_scrap_syride.main_path

# Lancement du script
if __name__ == "__main__":
    for pilot in pilotes:
        print(pilot)
        python_functions.get_syride_traces(path=main_path, pilot=pilot)
