"""
Validation des fichiers exportés contre `schema.json` (JSON Schema 2020-12, ROADMAP_WEBAPP.md §4).
jsonschema.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import best_match

SCHEMA_PATH = Path(__file__).with_name("schema.json")
KINDS = ("MetaFile", "FlightsFile", "SitesFile", "InsightsFile")
MAX_ERRORS = 5          # erreurs détaillées dans le message
MAX_MESSAGE_LEN = 240   # troncature d'un message d'erreur individuel
_DATE_TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$")

_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
_validators: Dict[str, Draft202012Validator] = {}


class SchemaValidationError(ValueError):
    """Fichier non conforme au contrat de données."""


def _is_date_time(value: Any) -> bool:
    """Contrôle `format: date-time` (RFC 3339) sans dépendance supplémentaire."""
    if not isinstance(value, str):
        return True
    if not _DATE_TIME_RE.match(value):
        return False
    try:
        datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return False
    return True


def _format_checker() -> FormatChecker:
    checker = FormatChecker()
    checker.checks("date-time")(_is_date_time)
    return checker


def _validator(kind: str) -> Draft202012Validator:
    if kind not in KINDS:
        raise ValueError("type de fichier inconnu : {!r} (attendu : {})".format(kind, ", ".join(KINDS)))
    if kind not in _validators:
        wrapper = dict(_SCHEMA)
        wrapper["$ref"] = "#/$defs/" + kind
        _validators[kind] = Draft202012Validator(wrapper, format_checker=_format_checker())
    return _validators[kind]


def _path(error) -> str:
    return "/".join(str(p) for p in error.absolute_path) or "(racine)"


def validate(obj: Any, kind: str) -> None:
    """Lève SchemaValidationError (chemin + message, 5 erreurs au plus) si `obj` ne respecte pas `kind`."""
    errors = sorted(_validator(kind).iter_errors(obj), key=lambda e: list(map(str, e.absolute_path)))
    if not errors:
        return
    lines = []
    for err in errors[:MAX_ERRORS]:
        msg = best_match([err]).message
        lines.append("  - {} : {}".format(_path(err), msg[:MAX_MESSAGE_LEN]))
    more = len(errors) - MAX_ERRORS
    if more > 0:
        lines.append("  … et {} autre(s) erreur(s)".format(more))
    raise SchemaValidationError("{} invalide :\n{}".format(kind, "\n".join(lines)))
