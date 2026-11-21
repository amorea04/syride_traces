"""
Compare les statistiques tirées de la trace `fv-config` d'une fiche brute à celles du GPX du même vol.

    python src/migration/compare_track_vs_gpx.py --pilot AdrienM [--limit 50] [--path <main_path>]

Pour chaque vol ayant à la fois `<num>.sheet.html.gz` (ou `<num>.sheet.html`) et `<num>.gpx`
dans `<path>/<pilote>/traces/<num>/`, affiche un tableau et un bilan des écarts.
Tolérances : durée +-2 s, plafond +-2 m, gain +-3 m, vitesse max +-10 %.
Lecture seule. Sans vol comparable, le dit et sort avec le code 0.
"""

import argparse
import gzip
import json
import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from track_stats import compute_gpx_stats, compute_track_stats  # noqa: E402

TOL_DUREE_S = 2
TOL_PLAFOND_M = 2
TOL_GAIN_M = 3
TOL_VITESSE = 0.10


def default_main_path():
    try:
        import params_scrap_syride
        return str(params_scrap_syride.main_path)
    except Exception:
        return str(SRC_DIR.parent)


def read_sheet(folder, num):
    """HTML de la fiche brute (gz ou non), ou None."""
    gz = folder / "{}.sheet.html.gz".format(num)
    plain = folder / "{}.sheet.html".format(num)
    if gz.exists():
        with gzip.open(str(gz), "rt", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    if plain.exists():
        return plain.read_text(encoding="utf-8", errors="replace")
    return None


def extract_fv_config(html):
    """Dict décodé de `<script id="fv-config">`, ou None."""
    from bs4 import BeautifulSoup
    tag = BeautifulSoup(html, "html.parser").find("script", id="fv-config")
    if tag is None:
        return None
    try:
        data = json.loads(tag.string or tag.get_text())
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def hms_to_s(text):
    h, m, s = (int(x) for x in text.split(":"))
    return h * 3600 + m * 60 + s


def compare_stats(track_stats, gpx_stats):
    """Écarts et verdicts (dict) entre les deux jeux de statistiques."""
    d_duree = hms_to_s(track_stats["duree_vol"]) - hms_to_s(gpx_stats["duree_vol"])
    d_plafond = track_stats["plafond"] - gpx_stats["plafond"]
    d_gain = track_stats["gain"] - gpx_stats["gain"]
    vt, vg = track_stats["vitesse_max"], gpx_stats["vitesse_max"]
    if vt is None or vg is None:
        d_vit, ok_vit = None, vt == vg
    else:
        d_vit = (vt - vg) / vg if vg else 0.0
        ok_vit = abs(d_vit) <= TOL_VITESSE
    return {
        "d_duree": d_duree, "d_plafond": d_plafond, "d_gain": d_gain, "d_vitesse": d_vit,
        "ok_duree": abs(d_duree) <= TOL_DUREE_S, "ok_plafond": abs(d_plafond) <= TOL_PLAFOND_M,
        "ok_gain": abs(d_gain) <= TOL_GAIN_M, "ok_vitesse": ok_vit,
    }


def candidate_flights(pilot_dir):
    """Numéros de vols ayant fiche brute et GPX, triés du plus récent (numéro le plus grand)."""
    traces = pilot_dir / "traces"
    if not traces.is_dir():
        return []
    found = []
    for folder in traces.iterdir():
        if not folder.is_dir():
            continue
        num = folder.name
        has_sheet = (folder / "{}.sheet.html.gz".format(num)).exists() or (folder / "{}.sheet.html".format(num)).exists()
        if has_sheet and (folder / "{}.gpx".format(num)).exists():
            found.append(num)
    return sorted(found, key=lambda n: (len(n), n), reverse=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pilot", required=True, help="pseudo du pilote (nom du dossier)")
    parser.add_argument("--limit", type=int, default=50, help="nombre maximal de vols comparés (défaut 50)")
    parser.add_argument("--path", default=None, help="dossier principal des données (défaut : params_scrap_syride)")
    args = parser.parse_args(argv)

    pilot_dir = Path(args.path or default_main_path()) / args.pilot
    nums = candidate_flights(pilot_dir)[:args.limit]
    if not nums:
        print("Aucun vol de {} n'a à la fois une fiche brute (.sheet.html[.gz]) et un GPX dans {} : rien à comparer."
              .format(args.pilot, pilot_dir / "traces"))
        return 0

    header = "{:>9}  {:>9} {:>9}  {:>6} {:>6}  {:>5} {:>5}  {:>5} {:>5}  {}".format(
        "vol", "durée fv", "durée gpx", "plaf.f", "plaf.g", "gain f", "gain g", "vit f", "vit g", "verdict")
    print(header)
    bilan = {"ok": 0, "hors": 0, "ignores": 0}
    ecarts = {"duree": [], "plafond": [], "gain": [], "vitesse": []}
    hors_tolerance = {"duree": 0, "plafond": 0, "gain": 0, "vitesse": 0}
    for num in nums:
        folder = pilot_dir / "traces" / num
        html = read_sheet(folder, num)
        config = extract_fv_config(html) if html else None
        ts = compute_track_stats(config) if config else None
        gs = compute_gpx_stats(str(folder / "{}.gpx".format(num)))
        if ts is None or gs is None:
            bilan["ignores"] += 1
            print("{:>9}  ignoré ({})".format(num, "fv-config inexploitable" if ts is None else "GPX inexploitable"))
            continue
        c = compare_stats(ts, gs)
        bad = [k for k in ("duree", "plafond", "gain", "vitesse") if not c["ok_" + k]]
        for k in bad:
            hors_tolerance[k] += 1
        bilan["hors" if bad else "ok"] += 1
        ecarts["duree"].append(abs(c["d_duree"]))
        ecarts["plafond"].append(abs(c["d_plafond"]))
        ecarts["gain"].append(abs(c["d_gain"]))
        if c["d_vitesse"] is not None:
            ecarts["vitesse"].append(abs(c["d_vitesse"]))
        print("{:>9}  {:>9} {:>9}  {:>6} {:>6}  {:>5} {:>5}  {:>5} {:>5}  {}".format(
            num, ts["duree_vol"], gs["duree_vol"], ts["plafond"], gs["plafond"], ts["gain"], gs["gain"],
            ts["vitesse_max"] if ts["vitesse_max"] is not None else "-",
            gs["vitesse_max"] if gs["vitesse_max"] is not None else "-",
            "ok" if not bad else "HORS : " + ", ".join(bad)))

    total = bilan["ok"] + bilan["hors"]
    print()
    print("Bilan : {} vols comparés, {} dans les tolérances, {} hors tolérance, {} ignorés."
          .format(total, bilan["ok"], bilan["hors"], bilan["ignores"]))
    print("Tolérances : durée +-{} s, plafond +-{} m, gain +-{} m, vitesse max +-{:.0f} %."
          .format(TOL_DUREE_S, TOL_PLAFOND_M, TOL_GAIN_M, TOL_VITESSE * 100))
    for key, label, unit, scale in (("duree", "durée", "s", 1), ("plafond", "plafond", "m", 1),
                                    ("gain", "gain", "m", 1), ("vitesse", "vitesse max", "%", 100)):
        values = ecarts[key]
        if values:
            values = sorted(values)
            print("  {:<12} hors tolérance : {:>3} ; écart absolu médian {:.1f} {}, max {:.1f} {}".format(
                label, hors_tolerance[key], values[len(values) // 2] * scale, unit, values[-1] * scale, unit))
    return 0


if __name__ == "__main__":
    sys.exit(main())
