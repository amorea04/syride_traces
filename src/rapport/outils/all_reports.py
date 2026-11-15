"""Génère les rapports de tous les pilotes pour les années récentes (out/all/) : erreurs, rapports > 1 Mo, les 3 plus lourds.

Usage : python3 all_reports.py [année ...]   (par défaut : 2025 et 2026)
"""
import os, pickle, sys, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))   # dossier src/
import params_scrap_syride as params
from rapport.report_html import build_report
YEARS = [int(a) for a in sys.argv[1:]] or [2025, 2026]
df = pickle.load(open(params.pkl_path, "rb")).reset_index(drop=True)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "all"); os.makedirs(out, exist_ok=True)
n, big, err = 0, [], []
for p in sorted(df["pilote"].unique()):
    for y in sorted(set(df[df["pilote"] == p]["date"].dt.year.unique()) & set(YEARS)):
        try:
            h = build_report(df=df, pilot=p, year=int(y), output=os.path.join(out, f"{p}_{y}.html"))
            n += 1
            if len(h.encode()) > 1_000_000: big.append((p, y, len(h.encode())))
        except Exception as e:
            err.append((p, y, repr(e)[:200]))
print(n, "rapports", YEARS, "; > 1 Mo :", big, "; erreurs :", err)
import glob
s = sorted((os.path.getsize(f),f) for y in YEARS for f in glob.glob(out+f"/*_{y}.html"))   # années demandées seulement
print("max :", [(round(a/1e3), os.path.basename(b)) for a,b in s[-3:]])
