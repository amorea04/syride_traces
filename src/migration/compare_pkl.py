"""
Compare deux pkl produits sur les mêmes données (recette A/B, scène 11 du plan de migration).

    uv run python src/migration/compare_pkl.py --a pkl_A.pkl --b pkl_B.pkl [--pilot AdrienM]

A = ancien code, B = nouveau code. Le script (lecture seule, sans réseau) vérifie :

  1. les ensembles de vols `(pilote, num_activite)` : identiques attendus ;
  2. les colonnes : seules nouveautés permises dans B : `syride_status`, `vario_min`,
     `hauteur_sol_max`, `heure_plafond` ;
  3. pour chaque colonne commune, le nombre d'écarts (tolérance flottante 1e-6) et 5 exemples ;
  4. pour les colonnes de statistiques (`duree_vol`, `plafond`, `gain`, `vitesse_max`...), un écart
     n'est permis que pour les vols dont `source_stats` diffère, et dans les tolérances de la scène 3
     (durée +-2 s, plafond +-2 m, gain +-3 m, vitesse +-10 %) ;
  5. `date_update` est ignorée.

Code de sortie : 0 si tout est conforme, 1 s'il reste des écarts inattendus, 2 en cas d'erreur de lecture.
"""

import argparse
import sys

import numpy as np
import pandas as pd

KEY = ["pilote", "num_activite"]
NEW_COLUMNS = ("syride_status", "vario_min", "hauteur_sol_max", "heure_plafond")
IGNORED_COLUMNS = ("date_update",)
FLOAT_TOL = 1e-6

# Colonnes de statistiques dont la valeur peut changer quand la source (gpx -> trace...) change :
# colonne -> (tolérance absolue, tolérance relative). Durées en secondes, plafond/gain en mètres.
STATS_TOLERANCES = {
    "duree_vol": (2.0, 0.0),
    "duree_vol_minutes": (2.0 / 60.0 + 1e-9, 0.0),
    "plafond": (2.0, 0.0),
    "gain": (3.0, 0.0),
    "vitesse_max": (0.0, 0.10),
    # dérivée de la durée de la trace : 2 s sur un vol de quelques minutes = ~1 %
    "vitesse_moyenne": (0.1, 0.02),
}
SOURCE_COLUMN = "source_stats"
N_EXAMPLES = 5


def _is_timedelta(series):
    return pd.api.types.is_timedelta64_dtype(series)


def _is_number(series):
    return pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series)


def _as_float(series):
    """Série numérique en float (durées en secondes)."""
    if _is_timedelta(series):
        return series.dt.total_seconds()
    return pd.to_numeric(series, errors="coerce")


def _to_none(value):
    try:
        return None if pd.isna(value) else value
    except (TypeError, ValueError):
        return value


def value_differs(a_series, b_series, abs_tol=FLOAT_TOL, rel_tol=0.0):
    """
    Masque booléen (aligné sur l'index) des lignes où a et b diffèrent.
    Deux valeurs manquantes sont égales ; une valeur manquante contre une valeur présente diffère.
    Numérique : écart > abs_tol + rel_tol * |a|.
    """
    a_null = a_series.isna()
    b_null = b_series.isna()
    if (_is_number(a_series) or _is_timedelta(a_series)) and (_is_number(b_series) or _is_timedelta(b_series)):
        a = _as_float(a_series)
        b = _as_float(b_series)
        gap = (a - b).abs()
        limit = abs_tol + rel_tol * a.abs()
        differs = gap > limit
        differs = differs.where(~(a_null | b_null), False)
    else:
        differs = pd.Series(
            [_to_none(x) != _to_none(y) for x, y in zip(a_series.tolist(), b_series.tolist())],
            index=a_series.index, dtype=bool)
        differs = differs.where(~(a_null & b_null), False)
    return differs | (a_null ^ b_null)


def _prepare(df, pilot):
    missing = [c for c in KEY if c not in df.columns]
    if missing:
        raise ValueError("colonnes de clé absentes : {}".format(missing))
    if pilot is not None:
        df = df[df["pilote"] == pilot]
    df = df.copy()
    # Doublons de clé (ne devraient pas exister) : on les distingue par leur rang pour apparier
    df["_rang"] = df.groupby(KEY).cumcount()
    return df


def compare(a, b, pilot=None):
    """Compare deux DataFrame ; renvoie un dict de résultats (voir format_report)."""
    a = _prepare(a, pilot)
    b = _prepare(b, pilot)
    res = {"pilot": pilot, "n_a": len(a), "n_b": len(b)}

    keys_a = set(map(tuple, a[KEY + ["_rang"]].values.tolist()))
    keys_b = set(map(tuple, b[KEY + ["_rang"]].values.tolist()))
    res["only_a"] = sorted(keys_a - keys_b)
    res["only_b"] = sorted(keys_b - keys_a)
    res["dup_a"] = int((a["_rang"] > 0).sum())
    res["dup_b"] = int((b["_rang"] > 0).sum())

    cols_a = [c for c in a.columns if c != "_rang"]
    cols_b = [c for c in b.columns if c != "_rang"]
    res["cols_only_a"] = [c for c in cols_a if c not in cols_b]
    res["cols_only_b"] = [c for c in cols_b if c not in cols_a]
    res["cols_new_allowed"] = [c for c in res["cols_only_b"] if c in NEW_COLUMNS]
    res["cols_new_unexpected"] = [c for c in res["cols_only_b"] if c not in NEW_COLUMNS]
    res["cols_missing_in_b"] = res["cols_only_a"]

    common = [c for c in cols_a if c in cols_b and c not in KEY and c not in IGNORED_COLUMNS]
    merged = a[KEY + ["_rang"] + common].merge(
        b[KEY + ["_rang"] + common], on=KEY + ["_rang"], how="inner", suffixes=("_a", "_b"))
    res["n_common"] = len(merged)

    # Transitions de source_stats (information) et masque « source différente »
    src_diff = pd.Series(False, index=merged.index)
    res["source_transitions"] = {}
    if SOURCE_COLUMN in common:
        src_diff = value_differs(merged[SOURCE_COLUMN + "_a"], merged[SOURCE_COLUMN + "_b"])
        pairs = merged.loc[src_diff, [SOURCE_COLUMN + "_a", SOURCE_COLUMN + "_b"]]
        for (x, y), n in pairs.fillna("None").groupby(
                [SOURCE_COLUMN + "_a", SOURCE_COLUMN + "_b"]).size().items():
            res["source_transitions"][(x, y)] = int(n)
    res["n_source_diff"] = int(src_diff.sum())

    columns = {}
    for col in common:
        sa, sb = merged[col + "_a"], merged[col + "_b"]
        differs = value_differs(sa, sb)
        n_diff = int(differs.sum())
        info = {"n_diff": n_diff, "examples": [], "allowed": 0, "unexpected": 0, "unexpected_examples": []}
        if n_diff:
            info["examples"] = _examples(merged, differs, col)
        if col in STATS_TOLERANCES:
            abs_tol, rel_tol = STATS_TOLERANCES[col]
            beyond = value_differs(sa, sb, abs_tol=abs_tol, rel_tol=rel_tol)
            # écart permis : source différente ET dans la tolérance
            allowed = differs & src_diff & ~beyond
            unexpected = differs & ~allowed
        elif col == SOURCE_COLUMN:
            # la transition de source est le sujet même de la comparaison : décrite à part
            allowed = differs
            unexpected = differs & False
        else:
            allowed = differs & False
            unexpected = differs
        info["allowed"] = int(allowed.sum())
        info["unexpected"] = int(unexpected.sum())
        if info["unexpected"]:
            info["unexpected_examples"] = _examples(merged, unexpected, col)
        columns[col] = info
    res["columns"] = columns
    res["n_unexpected"] = (
        len(res["only_a"]) + len(res["only_b"]) + len(res["cols_missing_in_b"])
        + len(res["cols_new_unexpected"]) + sum(c["unexpected"] for c in columns.values()))
    return res


def _examples(merged, mask, col):
    out = []
    for _, row in merged[mask].head(N_EXAMPLES).iterrows():
        out.append((row["pilote"], int(row["num_activite"]), row[col + "_a"], row[col + "_b"]))
    return out


def format_report(res):
    lines = []
    add = lines.append
    add("Comparaison A/B{}".format(" (pilote {})".format(res["pilot"]) if res["pilot"] else ""))
    add("  vols A : {}   vols B : {}   appariés : {}".format(res["n_a"], res["n_b"], res["n_common"]))
    if res["dup_a"] or res["dup_b"]:
        add("  clés (pilote, num_activite) en double : A {}, B {}".format(res["dup_a"], res["dup_b"]))

    add("")
    add("1. Ensembles de vols")
    if not res["only_a"] and not res["only_b"]:
        add("  identiques")
    for label, key in (("seulement dans A", "only_a"), ("seulement dans B", "only_b")):
        if res[key]:
            add("  {} : {}".format(label, len(res[key])))
            for k in res[key][:20]:
                add("    {} {}".format(k[0], k[1]))
            if len(res[key]) > 20:
                add("    ... ({} de plus)".format(len(res[key]) - 20))

    add("")
    add("2. Colonnes")
    add("  nouvelles dans B, permises : {}".format(", ".join(res["cols_new_allowed"]) or "aucune"))
    add("  nouvelles dans B, NON permises : {}".format(", ".join(res["cols_new_unexpected"]) or "aucune"))
    add("  absentes de B : {}".format(", ".join(res["cols_missing_in_b"]) or "aucune"))

    add("")
    add("3. Valeurs par colonne commune ({} vols appariés)".format(res["n_common"]))
    add("  vols dont source_stats diffère : {}".format(res["n_source_diff"]))
    for (x, y), n in sorted(res["source_transitions"].items()):
        add("    {} -> {} : {}".format(x, y, n))
    any_diff = False
    for col, info in res["columns"].items():
        if not info["n_diff"]:
            continue
        any_diff = True
        add("  {} : {} écart(s), dont {} permis, {} inattendu(s)".format(
            col, info["n_diff"], info["allowed"], info["unexpected"]))
        shown = info["unexpected_examples"] or info["examples"]
        label = "inattendus" if info["unexpected_examples"] else "exemples"
        for p, n, va, vb in shown:
            add("    {} {} ({}) : A={!r}  B={!r}".format(p, n, label, va, vb))
    if not any_diff:
        add("  aucun écart")

    add("")
    if res["n_unexpected"] == 0:
        add("Verdict : CONFORME (aucun écart inattendu).")
    else:
        add("Verdict : {} écart(s) inattendu(s) à expliquer.".format(res["n_unexpected"]))
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--a", required=True, help="pkl A (ancien code)")
    parser.add_argument("--b", required=True, help="pkl B (nouveau code)")
    parser.add_argument("--pilot", default=None, help="limite la comparaison à un pilote (nom court du pkl)")
    args = parser.parse_args(argv)
    try:
        a = pd.read_pickle(args.a)
        b = pd.read_pickle(args.b)
        res = compare(a, b, pilot=args.pilot)
    except (OSError, ValueError) as exc:
        print("Erreur : {}".format(exc), file=sys.stderr)
        return 2
    print(format_report(res))
    return 0 if res["n_unexpected"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
