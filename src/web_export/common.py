"""
Outils partagés de l'export web (ROADMAP_WEBAPP.md §4) : slug de pilote, clé de vol,
écriture JSON compacte avec hash de contenu. Bibliothèque standard uniquement.

Ce module fixe l'interface commune aux lots de la phase 1 (vols, sites, insights, meta) :
ne pas en changer les signatures sans mettre à jour tous les appelants.
"""

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, Iterable

SCHEMA_VERSION = 1
HASH_LEN = 10                      # caractères hexadécimaux du hash de contenu dans les noms de fichiers
SYRIDE_FLIGHT_URL = "https://www.syride.com/fr/pilotes/{pilot}/{num}"


def slugify(text: str) -> str:
    """« Rémydu24 » -> « remydu24 », « air race pro » -> « air-race-pro ». Lève ValueError si vide."""
    ascii_text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    if not slug:
        raise ValueError("slug vide pour {!r}".format(text))
    return slug


def pilot_slugs(pilots: Iterable[str]) -> Dict[str, str]:
    """{pseudo Syride: slug}. Lève ValueError si deux pilotes donnent le même slug."""
    out: Dict[str, str] = {}
    seen: Dict[str, str] = {}
    for pilot in pilots:
        slug = slugify(pilot)
        if slug in seen and seen[slug] != pilot:
            raise ValueError("collision de slug {!r} : {!r} et {!r}".format(slug, seen[slug], pilot))
        seen[slug] = pilot
        out[pilot] = slug
    return out


def flight_key(pilot_slug: str, num_activite: int) -> str:
    """Clé stable d'un vol (schema.json #/$defs/FlightKey) : « j2f-1234 »."""
    return "{}-{}".format(pilot_slug, int(num_activite))


def dumps_compact(obj: Any) -> bytes:
    """JSON compact UTF-8, déterministe (même objet -> mêmes octets -> même hash). NaN interdit."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:HASH_LEN]


def write_hashed_json(obj: Any, out_dir: Path, stem: str) -> str:
    """
    Écrit `obj` dans out_dir/<stem>.<hash>.json et retourne le nom relatif à out_dir
    (ex. « flights.3f9a1c02de.json », ou « insights/j2f-2025.ab12….json » si stem = « insights/j2f-2025 »).
    Ne purge rien : la purge des anciens fichiers hashés est faite par meta.py.
    """
    data = dumps_compact(obj)
    rel = "{}.{}.json".format(stem, content_hash(data))
    path = Path(out_dir) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)
    return rel
