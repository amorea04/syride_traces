"""Régénère les rapports 2026 de trois pilotes de contrôle et affiche poids, sections et garde-fous.

Usage : python3 check_reports.py [pilote ...]
Sortie HTML : dossier out/ à côté de ce script (fichiers générés, à ne pas conserver).
"""
import os
import pickle
import re
import subprocess
import sys
import time
import warnings

warnings.filterwarnings("ignore")
SRC = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # dossier src/
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
sys.path.insert(0, SRC)
os.makedirs(OUT, exist_ok=True)

import params_scrap_syride as params  # noqa: E402
from rapport.report_html import build_report  # noqa: E402

FORBIDDEN = [r"<link\b(?![^>]*href=\"data:)", r'src="https?:', r"url\(\s*['\"]?https?:", r"@import", r"\bfetch\(", r"XMLHttpRequest", r"\bimport\("]

df = pickle.load(open(params.pkl_path, "rb")).reset_index(drop=True)
pilots = sys.argv[1:] or ["AdrienM", "j2f", "LiLi06", "Au_Phil_du_vent"]
ok = True
for p in pilots:
    t = time.time()
    path = os.path.join(OUT, f"{p}_2026.html")
    h = build_report(df=df, pilot=p, year=2026, output=path)
    size = len(h.encode())
    n_tab = h.count('tabindex="0"')
    print(f"{p}: {size / 1e3:.0f} ko, {time.time() - t:.1f} s, tabindex=0 : {n_tab}  -> {path}")
    for m in re.finditer(r'<section class="sec[^"]*" id="([\w-]+)">(.*?)</section>', h, re.S):
        print(f"   {m.group(1):<14}{len(m.group(2).encode()) / 1e3:6.0f} ko  ({100 * len(m.group(2).encode()) / size:.0f} %)")
    bad = [pat for pat in FORBIDDEN if re.search(pat, h)]
    if bad:
        ok = False
        print("   !! ressources externes possibles :", bad)
    hosts = set(re.findall(r'href="https?://([^"/]+)', h))
    print("   liens externes (href) :", hosts)
    scripts = re.findall(r"<script>(.*?)</script>", h, re.S)
    for i, js in enumerate(scripts):
        jp = os.path.join(OUT, f"_{p}_{i}.js")
        open(jp, "w").write(js)
        r = subprocess.run(["node", "--check", jp], capture_output=True, text=True)
        if r.returncode:
            ok = False
            print("   !! erreur de syntaxe JS :", r.stderr[:400])
print("OK" if ok else "ÉCHEC")
