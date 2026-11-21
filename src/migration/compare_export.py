"""
Compare deux exports web (export_web.py) produits sur les mêmes données (recette de la migration Python 3.14).

    uv run python src/migration/compare_export.py --a export_old/ --b export_new/

Les fichiers sont appariés par nom sans le hash de contenu (`flights.<hash>.json` -> `flights.json`) ; dans
meta.json, les horodatages de génération sont ignorés et les noms hachés ramenés à leur forme sans hash.
Comparaison récursive des JSON, tolérance flottante 1e-9.

Code de sortie : 0 si identiques, 1 s'il reste des écarts, 2 en cas d'erreur de lecture.
"""

import argparse
import gzip
import json
import re
import sys
from pathlib import Path

HASH_RE = re.compile(r"\.[0-9a-f]{8,}(?=\.json)")
META_IGNORED = ("generated_at", "data_refreshed_at")
FLOAT_TOL = 1e-9
MAX_EXAMPLES = 5


def _unhash(name):
    return HASH_RE.sub("", name)


def _load(path):
    raw = path.read_bytes()
    if path.suffix == ".gz":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def _normalize_meta(obj):
    if isinstance(obj, dict):
        return {k: _normalize_meta(v) for k, v in obj.items() if k not in META_IGNORED}
    if isinstance(obj, list):
        return [_normalize_meta(v) for v in obj]
    if isinstance(obj, str):
        return _unhash(obj)
    return obj


def _index(root):
    if not root.is_dir():
        raise OSError("dossier introuvable : {}".format(root))
    out = {}
    for path in sorted(root.rglob("*.json*")):
        key = _unhash(path.relative_to(root).as_posix().replace(".json.gz", ".json"))
        out[key] = path
    return out


def _diff(a, b, path, found):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a or k not in b:
                found.append("{}.{} : présent dans {} seulement".format(path, k, "A" if k in a else "B"))
            else:
                _diff(a[k], b[k], "{}.{}".format(path, k), found)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            found.append("{} : {} éléments contre {}".format(path, len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(x, y, "{}[{}]".format(path, i), found)
    elif (isinstance(a, float) or isinstance(b, float)) and isinstance(a, (int, float)) \
            and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        if abs(a - b) > FLOAT_TOL:
            found.append("{} : {!r} contre {!r}".format(path, a, b))
    elif type(a) is not type(b) or a != b:
        found.append("{} : {!r} contre {!r}".format(path, a, b))


def compare(dir_a, dir_b):
    """Retourne {nom normalisé: [écarts]} pour chaque fichier qui diffère (vide si identiques)."""
    ia, ib = _index(Path(dir_a)), _index(Path(dir_b))
    report = {}
    for name in sorted(set(ia) | set(ib)):
        if name not in ia or name not in ib:
            report[name] = ["fichier présent dans {} seulement".format("A" if name in ia else "B")]
            continue
        a, b = _load(ia[name]), _load(ib[name])
        if name == "meta.json":
            a, b = _normalize_meta(a), _normalize_meta(b)
        found = []
        _diff(a, b, name.rsplit(".", 1)[0], found)
        if found:
            report[name] = found
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--a", required=True, help="export A (ancien environnement)")
    parser.add_argument("--b", required=True, help="export B (nouvel environnement)")
    args = parser.parse_args(argv)
    try:
        report = compare(args.a, args.b)
    except (OSError, ValueError) as exc:
        print("Erreur : {}".format(exc), file=sys.stderr)
        return 2
    if not report:
        print("Exports identiques.")
        return 0
    for name, found in report.items():
        print("{} : {} écart(s)".format(name, len(found)))
        for line in found[:MAX_EXAMPLES]:
            print("  " + line)
    return 1


if __name__ == "__main__":
    sys.exit(main())
