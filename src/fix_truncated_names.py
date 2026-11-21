"""
Répare les noms de voiles / d'instruments TRONQUÉS dans les anciens JSON.

Contexte : l'ancienne extraction coupait le dernier caractère quand le nom n'avait pas de
parenthèse (« Evolution » -> « Evolutio », « Nav XL » -> « Nav X », « Non renseigné » ->
« Non renseig »). L'extraction est corrigée pour les nouveaux vols, mais les anciens JSON
contiennent encore les noms tronqués.

Le dernier caractère perdu ne peut pas être deviné : la réparation passe donc par un fichier
de correspondances que TU valides.

Étape 1 - lister les valeurs présentes et générer le fichier de correspondances :
    uv run python src/fix_truncated_names.py --scan

Étape 2 - ouvrir name_corrections.json (dans le dossier des traces) et, pour chaque valeur
    tronquée, écrire le nom complet dans "remplacer_par". Une valeur laissée vide n'est pas
    modifiée. La "suggestion" est seulement un indice (une autre valeur qui commence pareil
    avec un caractère de plus) : à vérifier, elle peut être fausse (ex. « Boxer » / « Boxer2 »).

Étape 3 - appliquer :
    uv run python src/fix_truncated_names.py --apply

Avant toute modification, chaque JSON modifié est sauvegardé dans _backup_json_noms/.
Le script est répétable : relancer --apply ne change plus rien une fois les noms corrigés.
Ensuite, un lancement normal de main.py met à jour la base et le pkl.
"""

import argparse
import json
import os

import params_scrap_syride as params

FIELDS = ("voile", "instrument")
CORRECTIONS_NAME = "name_corrections.json"
BACKUP_DIR = "_backup_json_noms"


def iter_json_files(main_path: str):
    """Itère (pilote, chemin) sur tous les <num>.json des dossiers de pilotes."""
    for pilot in sorted(os.listdir(main_path)):
        pilot_dir = os.path.join(main_path, pilot)
        if pilot.startswith("_") or not os.path.isdir(os.path.join(pilot_dir, "traces")):
            continue
        for root, _dirs, files in os.walk(pilot_dir):
            for f in files:
                if f.endswith(".json") and f[:-5].isdigit():
                    yield pilot, os.path.join(root, f)


def _load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fp:
        return json.load(fp)


def scan(main_path: str) -> None:
    counts = {field: {} for field in FIELDS}
    total = 0
    for _pilot, path in iter_json_files(main_path):
        try:
            data = _load(path)
        except Exception as e:
            print(f"Warning: JSON illisible ({path}) : {e}")
            continue
        total += 1
        for field in FIELDS:
            value = data.get(field)
            if isinstance(value, str) and value not in ("", "None"):
                counts[field][value] = counts[field].get(value, 0) + 1

    out_path = os.path.join(main_path, CORRECTIONS_NAME)
    previous = {}
    if os.path.exists(out_path):
        # Conserver ce qui a déjà été saisi lors d'un scan précédent
        try:
            old = _load(out_path)
            for field in FIELDS:
                for entry in old.get(field, []):
                    if entry.get("remplacer_par"):
                        previous[(field, entry["valeur"])] = entry["remplacer_par"]
        except Exception:
            pass

    result = {
        "_aide": "Pour chaque valeur tronquée, écris le nom complet dans 'remplacer_par'. "
                 "Vide = pas de changement. 'suggestion' n'est qu'un indice à vérifier.",
    }
    print(f"{total} JSON lus.\n")
    for field in FIELDS:
        values = counts[field]
        entries = []
        for value, n in sorted(values.items(), key=lambda kv: -kv[1]):
            candidates = sorted(
                w for w in values
                if w != value and len(w) == len(value) + 1 and w.lower().startswith(value.lower())
            )
            entries.append({
                "valeur": value,
                "vols": n,
                "suggestion": candidates[0] if len(candidates) == 1 else (candidates or ""),
                "remplacer_par": previous.get((field, value), ""),
            })
        result[field] = entries

        print(f"--- {field} : {len(values)} valeur(s) distincte(s) ---")
        for e in entries:
            hint = f"   (suggestion : {e['suggestion']})" if e["suggestion"] else ""
            print(f"  {e['vols']:5d} x {e['valeur']!r}{hint}")
        print()

    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    print(f"Fichier de correspondances écrit : {out_path}")
    print("Complète 'remplacer_par' pour les valeurs tronquées, puis lance --apply.")


def apply(main_path: str) -> None:
    corr_path = os.path.join(main_path, CORRECTIONS_NAME)
    if not os.path.exists(corr_path):
        print(f"{corr_path} introuvable : lance d'abord --scan.")
        return

    corrections = _load(corr_path)
    mapping = {
        field: {e["valeur"]: e["remplacer_par"] for e in corrections.get(field, [])
                if e.get("remplacer_par")}
        for field in FIELDS
    }
    nb_rules = sum(len(m) for m in mapping.values())
    if nb_rules == 0:
        print("Aucune correspondance renseignée ('remplacer_par' vide partout) : rien à faire.")
        return

    changed_files = 0
    replaced = {}
    backup_root = os.path.join(main_path, BACKUP_DIR)
    for pilot, path in iter_json_files(main_path):
        try:
            data = _load(path)
        except Exception as e:
            print(f"Warning: JSON illisible ({path}) : {e}")
            continue

        modified = False
        for field in FIELDS:
            value = data.get(field)
            if isinstance(value, str) and value in mapping[field]:
                replaced[(field, value)] = replaced.get((field, value), 0) + 1
                data[field] = mapping[field][value]
                modified = True

        if modified:
            backup_dir = os.path.join(backup_root, pilot)
            os.makedirs(backup_dir, exist_ok=True)
            backup_path = os.path.join(backup_dir, os.path.basename(path))
            if not os.path.exists(backup_path):  # ne jamais écraser la 1re sauvegarde
                with open(path, "r", encoding="utf-8") as src, \
                        open(backup_path, "w", encoding="utf-8") as dst:
                    dst.write(src.read())
            with open(path, "w", encoding="utf-8") as fp:
                json.dump(data, fp, ensure_ascii=False)
            changed_files += 1

    print(f"{changed_files} fichier(s) JSON modifié(s) (sauvegardes dans {backup_root}).")
    for (field, value), n in sorted(replaced.items(), key=lambda kv: -kv[1]):
        print(f"  {field}: {value!r} -> {mapping[field][value]!r}  ({n} vol(s))")
    print("\nLance maintenant main.py pour mettre à jour la base et le pkl.")


def main():
    parser = argparse.ArgumentParser(description="Répare les noms de voiles/instruments tronqués.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--scan", action="store_true", help="liste les valeurs et génère name_corrections.json")
    group.add_argument("--apply", action="store_true", help="applique name_corrections.json aux JSON")
    parser.add_argument("--path", default=None, help="Chemin de base (défaut : params.main_path)")
    args = parser.parse_args()

    main_path = args.path if args.path is not None else params.main_path
    if args.scan:
        scan(main_path)
    else:
        apply(main_path)


if __name__ == "__main__":
    main()
