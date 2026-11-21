#!/usr/bin/env python
"""
Anonymisation de captures Syride pour en faire des fixtures de test.

Usage :
    uv run python src/migration/anonymize_fixture.py <entrée.html> <sortie.html> --kind list|sheet
        [--max-points 200] [--max-flights 5] [--name PSEUDO ...] [--site NOM ...]

  --kind list   réponse de /ajax/pilotes/activites.php (liste de vols d'un pilote)
  --kind sheet  fiche de vol /ficheVol.php (contient <script id="fv-config">)

Ce que fait le script (la structure HTML lue par les parsers est conservée) :
  - pseudo / noms de pilote -> « PiloteTest » (pseudos détectés dans la fiche + options --name) ;
  - noms de site -> « SiteTest<n> » (détectés dans les liens /fr/sites/... + options --site) ;
  - noms de vol libres -> « VolTest<n> » (les noms qui sont une date jj-mm-aaaa sont conservés) ;
  - coordonnées décalées d'un vecteur ALÉATOIRE tiré à chaque exécution et jamais enregistré
    (entre 3° et 8° en latitude et en longitude, signe aléatoire), donc non réversible, partout :
    points, distance, extrema, paramètres d'URL et attributs data-lat / data-lon ;
  - jetons, clés et empreintes hexadécimales (32 caractères ou plus) -> « x » de même longueur ;
  - identifiants de pilote (idRider, /images/riders/<id>_...) -> 99999 ;
  - avatars et photos -> chemins neutres ;
  - fiche : tableaux points / times / terrain tronqués à --max-points éléments ;
  - liste : au plus --max-flights vols, dont un vol non Syride s'il en existe un ;
    les activités qui ne sont pas des vols (photos, etc.) sont retirées ;
  - scripts de suivi (Google, Facebook) supprimés.

bs4 seulement. Aucune lecture du réseau ni de la base : entrée et sortie sont des fichiers.
Les captures brutes ne doivent JAMAIS être commitées ; seule la sortie de ce script peut l'être,
après vérification à la main (grep des pseudos, sites et coordonnées réels).
"""

import argparse
import json
import random
import re
import sys
from urllib.parse import quote, unquote

from bs4 import BeautifulSoup

# Décalage des coordonnées (degrés) : tiré au hasard à chaque exécution, jamais écrit nulle part,
# pour qu'on ne puisse pas retrouver les vraies positions en le soustrayant.
_rng = random.SystemRandom()
LAT_SHIFT = _rng.choice((-1, 1)) * _rng.uniform(3, 8)
LON_SHIFT = _rng.choice((-1, 1)) * _rng.uniform(3, 8)

PILOT_PLACEHOLDER = "PiloteTest"
SITE_PLACEHOLDER = "SiteTest{}"
FLIGHT_NAME_PLACEHOLDER = "VolTest{}"
RIDER_ID_PLACEHOLDER = "99999"
NEUTRAL_AVATAR = "/images/riders/99999_profile.jpg"
NEUTRAL_PHOTO = "/images/neutre.jpg"

DATE_NAME = re.compile(r"^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$")
LONG_HEX = re.compile(r"(?<![0-9A-Za-z])[0-9a-fA-F]{32,}(?![0-9A-Za-z])")
TRACKING_MARKERS = (
    "googletagmanager", "google-analytics", "gtag(", "fbq(", "facebook.net",
    "facebook.com/tr", "connect.facebook", "dataLayer", "googlesyndication",
    "doubleclick", "tarteaucitron",
)

ACTIVITY_START = re.compile(r"<div\s+id=['\"]activite\d+['\"]")
SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.S | re.I)
NOSCRIPT_RE = re.compile(r"<noscript\b[^>]*>.*?</noscript\s*>", re.S | re.I)
FV_CONFIG_RE = re.compile(r'(<script\b[^>]*\bid=["\']fv-config["\'][^>]*>)(.*?)(</script\s*>)', re.S | re.I)


# ---------------------------------------------------------------------------
# Coordonnées
# ---------------------------------------------------------------------------

def _shift_lat(value):
    return round(float(value) + LAT_SHIFT, 6)


def _shift_lon(value):
    return round(float(value) + LON_SHIFT, 6)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def shift_pair(pair):
    """[lat, lon, ...] -> même liste avec lat et lon décalés."""
    if isinstance(pair, list) and len(pair) >= 2 and _is_number(pair[0]) and _is_number(pair[1]):
        return [_shift_lat(pair[0]), _shift_lon(pair[1])] + pair[2:]
    return pair


def shift_config(cfg, max_points):
    """Décale les coordonnées de fv-config, anonymise les champs d'identité et tronque les tableaux."""
    for key in ("points", "times", "terrain"):
        if isinstance(cfg.get(key), list):
            cfg[key] = cfg[key][:max_points]
    if isinstance(cfg.get("points"), list):
        cfg["points"] = [shift_pair(p) for p in cfg["points"]]
    if isinstance(cfg.get("distance"), list):
        cfg["distance"] = [shift_pair(p) for p in cfg["distance"]]
    if isinstance(cfg.get("extrema"), list):
        for extremum in cfg["extrema"]:
            if isinstance(extremum, dict) and "position" in extremum:
                extremum["position"] = shift_pair(extremum["position"])
    # Autres clés de coordonnées éventuelles (nouveau format de Syride)
    for key, value in list(cfg.items()):
        low = key.lower()
        if low in ("lat", "latitude") and _is_number(value):
            cfg[key] = _shift_lat(value)
        elif low in ("lon", "lng", "longitude") and _is_number(value):
            cfg[key] = _shift_lon(value)
        elif low in ("start", "takeoff", "landing", "center") and isinstance(value, list):
            cfg[key] = shift_pair(value)
    return cfg


COORD_ATTR = re.compile(
    r"""(?P<head>\b(?:data-)?(?P<kind>lat|latitude|lon|lng|longitude)\b\s*[=:]\s*["']?)(?P<val>-?\d+\.\d+)""",
    re.I,
)


def shift_coordinate_params(text):
    """Décale lat=…, lon=…, data-lat="…" dans le HTML et les URL (cartes, liens)."""
    def repl(match):
        kind = match.group("kind").lower()
        value = float(match.group("val"))
        shifted = _shift_lat(value) if kind.startswith("lat") else _shift_lon(value)
        return match.group("head") + repr(shifted)
    return COORD_ATTR.sub(repl, text)


# ---------------------------------------------------------------------------
# Remplacement de textes
# ---------------------------------------------------------------------------

def _variants(name):
    """Variantes d'écriture d'un nom : brut, encodé en URL, avec espaces/underscores, HTML."""
    forms = {name, quote(name), quote(name, safe=""), name.replace(" ", "_"), name.replace("_", " "),
             name.replace(" ", "%20"), name.replace("&", "&amp;")}
    return sorted((f for f in forms if f), key=len, reverse=True)


def replace_names(text, names, placeholder_for):
    """Remplace chaque nom (et ses variantes) par son substitut, du plus long au plus court."""
    ordered = sorted({n for n in names if n and len(n) >= 2}, key=len, reverse=True)
    for name in ordered:
        replacement = placeholder_for(name)
        for form in _variants(name):
            text = text.replace(form, replacement)
    return text


def collect_pilot_names(soup, text, extra):
    names = set(extra)
    cfg_tag = soup.find("script", id="fv-config")
    if cfg_tag is not None:
        try:
            cfg = json.loads(cfg_tag.string or cfg_tag.get_text() or "{}")
            if cfg.get("pilot"):
                names.add(str(cfg["pilot"]))
        except ValueError:
            pass
    for strong in soup.select(".fv-heading-meta strong"):
        names.add(strong.get_text(strip=True))
    for tag in soup.find_all("a", href=re.compile(r"^/fr/pilotes/[^/?#]+")):
        match = re.match(r"^/fr/pilotes/([^/?#]+)", tag["href"])
        if match:
            names.add(match.group(1))
    for match in re.finditer(r"/fr/pilotes/([^/'\"?#\s]+)", text):
        names.add(match.group(1))
    return {n for n in names if n}


def collect_site_names(soup, extra):
    names = list(extra)
    for tag in soup.find_all("a", href=re.compile(r"^/fr/sites/")):
        slug = tag["href"].split("/fr/sites/", 1)[1].split("?")[0]
        if slug:
            names.append(slug)
        label = re.sub(r"^\s*à\s+", "", tag.get_text(" ", strip=True))
        if label:
            names.append(label)
    for tag in soup.find_all(attrs={"data-flight-value": "takeoff"}):
        label = tag.get_text(" ", strip=True)
        if label:
            names.append(label)
    for tag in soup.find_all(id=re.compile(r"^site\d+$")):
        # Vols non Syride : le nom du site est du texte brut dans <font id="site...">
        label = tag.get_text(" ", strip=True)
        label = re.sub(r"^\s*à\s+", "", label)
        label = re.sub(r"\s*\(.*$", "", label)
        if label and tag.name == "font":
            names.append(label)
    ordered = []
    for name in names:
        if name and name not in ordered:
            ordered.append(name)
    return ordered


def mask_hex(text):
    return LONG_HEX.sub(lambda m: "x" * len(m.group(0)), text)


def neutralize_media(text):
    text = re.sub(r"/images/riders/\d+_[A-Za-z0-9_.\-]+", NEUTRAL_AVATAR, text)
    text = re.sub(r"/images/riders/[^\s\"'<>)]+", NEUTRAL_AVATAR, text)
    text = re.sub(r"(?:/[A-Za-z0-9_\-]+)*/(?:photos?|photosVols|uploads)/[^\s\"'<>)]+", NEUTRAL_PHOTO, text)
    text = re.sub(r"(idRider(?:To)?(?:=|\"\s*value=|\s+value=))\d+", r"\g<1>" + RIDER_ID_PLACEHOLDER, text)
    text = re.sub(r"(name=[\"']?idRider[\"']?\s+value=[\"']?)\d+", r"\g<1>" + RIDER_ID_PLACEHOLDER, text)
    return text


def strip_tracking(text):
    def drop_script(match):
        block = match.group(0)
        return "" if any(marker in block for marker in TRACKING_MARKERS) else block
    text = SCRIPT_RE.sub(drop_script, text)
    text = NOSCRIPT_RE.sub(lambda m: "" if any(k in m.group(0) for k in TRACKING_MARKERS) else m.group(0), text)
    text = re.sub(r"<img\b[^>]*facebook\.com/tr[^>]*>", "", text, flags=re.I)
    return text


def neutralize_flight_names(text):
    """Noms de vol libres -> VolTest<n> (les noms qui sont des dates sont conservés)."""
    counter = {"n": 0}

    def repl_list(match):
        value = match.group("val").strip()
        if DATE_NAME.match(value):
            return match.group(0)
        counter["n"] += 1
        return match.group("head") + FLIGHT_NAME_PLACEHOLDER.format(counter["n"]) + match.group("tail")

    text = re.sub(r"(?P<head><font\b[^>]*\bid=['\"]nom\d+['\"][^>]*>)(?P<val>[^<]*)(?P<tail></font>)", repl_list, text)
    text = re.sub(r"(?P<head><[^>]*data-flight-value=['\"]title['\"][^>]*>)(?P<val>[^<]*)(?P<tail></)", repl_list, text)
    return text


# ---------------------------------------------------------------------------
# Liste d'activités
# ---------------------------------------------------------------------------

def split_activities(text):
    starts = [m.start() for m in ACTIVITY_START.finditer(text)]
    if not starts:
        raise ValueError("Aucune activité trouvée : l'entrée n'est pas une réponse de activites.php")
    prefix = text[:starts[0]]
    blocks = [text[s:e] for s, e in zip(starts, starts[1:] + [len(text)])]
    return prefix, blocks


def classify(block):
    soup = BeautifulSoup(block, "html.parser")
    if soup.find(id=re.compile(r"^type\d+$")) is None:
        return "other"
    return "syride" if soup.find(class_="photoGps") is not None else "nosys"


def select_blocks(blocks, max_flights):
    kinds = [classify(b) for b in blocks]
    flights = [(b, k) for b, k in zip(blocks, kinds) if k in ("syride", "nosys")]
    syride = [b for b, k in flights if k == "syride"]
    nosys = [b for b, k in flights if k == "nosys"]
    if nosys and max_flights >= 2:
        return syride[:max_flights - 1] + [nosys[0]]
    return [b for b, _ in flights][:max_flights]


# ---------------------------------------------------------------------------
# Programme principal
# ---------------------------------------------------------------------------

def anonymize(text, kind, max_points=200, max_flights=5, extra_names=(), extra_sites=()):
    text = strip_tracking(text)

    if kind == "list":
        prefix, blocks = split_activities(text)
        text = prefix + "".join(select_blocks(blocks, max_flights))
    elif kind == "sheet":
        match = FV_CONFIG_RE.search(text)
        if match is None:
            raise ValueError("fv-config introuvable : l'entrée n'est pas une fiche de vol récente")
        cfg = json.loads(match.group(2))
        cfg = shift_config(cfg, max_points)
        new_json = json.dumps(cfg, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        text = text[:match.start(2)] + new_json + text[match.end(2):]
    else:
        raise ValueError("--kind doit valoir list ou sheet")

    soup = BeautifulSoup(text, "html.parser")
    pilots = collect_pilot_names(soup, text, extra_names)
    sites = collect_site_names(soup, extra_sites)
    # Un même site peut apparaître en slug (Nom_01), en libellé (Nom 01) ou encodé : une seule clé
    keys = {}
    for name in sites:
        keys.setdefault(unquote(name).replace("_", " ").strip().lower(), len(keys) + 1)
    site_index = {name: keys[unquote(name).replace("_", " ").strip().lower()] for name in sites}

    text = neutralize_flight_names(text)
    text = replace_names(text, sites, lambda n: SITE_PLACEHOLDER.format(site_index[n]))
    text = replace_names(text, pilots, lambda n: PILOT_PLACEHOLDER)
    text = shift_coordinate_params(text)
    text = mask_hex(text)
    text = neutralize_media(text)
    return text


def main(argv=None):
    parser = argparse.ArgumentParser(description="Anonymise une capture Syride (liste ou fiche) pour les tests.")
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--kind", required=True, choices=("list", "sheet"))
    parser.add_argument("--max-points", type=int, default=200)
    parser.add_argument("--max-flights", type=int, default=5)
    parser.add_argument("--name", action="append", default=[], help="pseudo à remplacer (répétable)")
    parser.add_argument("--site", action="append", default=[], help="nom de site à remplacer (répétable)")
    args = parser.parse_args(argv)

    with open(args.input, encoding="utf-8", errors="replace") as handle:
        text = handle.read()
    result = anonymize(text, args.kind, args.max_points, args.max_flights, args.name, args.site)
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(result)
    print("écrit : {} ({} octets)".format(args.output, len(result.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
