"""
Graphiques SVG du rapport HTML, générés en Python (aucune bibliothèque externe, aucun JavaScript).

Les couleurs ne sont PAS écrites ici : chaque forme porte une classe CSS (définie dans
report_html.py), ce qui permet le thème clair/sombre sans toucher aux graphiques.

Classes utilisées :
    séries d'années          : sk0 sk1 sk2 (trait), fl0 fl1 fl2 (remplissage) ; 0 = année du rapport
    disciplines (calendrier) : cal-p1..4 (parapente), cal-m1..4 (paramoteur), cal-b1..4 (les deux)
    texte et axes            : t, t-val, t-axis, gridl, axisl
Chaque élément de données contient un <title> : c'est l'infobulle native du navigateur ; report.js
le recopie dans data-tip / aria-label au chargement (un seul texte dans le HTML).
Exception : les cases de jour des calendriers n'ont pas de <title> (poids) : report.js calcule leur
infobulle depuis #flights-data.
Calendriers : une seule case focalisable (tabindex="0"), report.js gère les flèches (« roving tabindex »).
Courbe de cumul : chaque élément d'une année porte la classe cy-<année> (le JS masque les années non choisies).
"""

import datetime as dt
import html
import json
import math
import os
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from .report_format import (
        DAYS_SHORT, MONTHS_LONG, MONTHS_SHORT, NBSP, fmt_date, fmt_date_short, fmt_duration, fmt_hours, fmt_int, fmt_num, plural,
    )
except ImportError:
    from report_format import (
        DAYS_SHORT, MONTHS_LONG, MONTHS_SHORT, NBSP, fmt_date, fmt_date_short, fmt_duration, fmt_hours, fmt_int, fmt_num, plural,
    )

# Seuils de durée (minutes) des 4 niveaux d'intensité du calendrier
CALENDAR_LEVELS = (30, 75, 150)
_HERE = os.path.dirname(os.path.abspath(__file__))
_LAND_FEATURES = None


# Motifs de remplissage des barres des années de comparaison (hachures, points). Posés une seule fois
# dans la page, hors de tout bloc masqué (un <pattern> situé dans un élément `display: none` ne s'affiche
# pas). Les couleurs viennent du CSS (classes pat-*), pas d'ici.
PATTERN_DEFS = (
    '<svg class="pattern-defs" width="0" height="0" aria-hidden="true" focusable="false" '
    'xmlns="http://www.w3.org/2000/svg"><defs>'
    '<pattern id="pat-y1" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    '<rect class="pat-bg1" width="7" height="7"/><rect class="pat-fg1" width="3" height="7"/></pattern>'
    '<pattern id="pat-y2" width="6" height="6" patternUnits="userSpaceOnUse">'
    '<rect class="pat-bg2" width="6" height="6"/><circle class="pat-fg2" cx="3" cy="3" r="1.5"/></pattern>'
    '<rect id="cal-cell" width="13" height="13" rx="3"/>'   # case de calendrier, réutilisée par <use>
    '</defs></svg>'
)
CALENDAR_CELL = 13   # taille de #cal-cell ci-dessus


def _e(text) -> str:
    return html.escape(str(text), quote=True)


def _n(value: float) -> str:
    """Nombre compact pour les coordonnées SVG."""
    text = f"{value:.1f}"
    return text[:-2] if text.endswith(".0") else text


def _land_features() -> list:
    """Charge les polygones Natural Earth livrés avec le rapport (aucun accès réseau)."""
    global _LAND_FEATURES
    if _LAND_FEATURES is None:
        path = os.path.join(_HERE, "map_data.geojson")
        try:
            with open(path, encoding="utf-8") as fp:
                _LAND_FEATURES = json.load(fp).get("features", [])
        except (OSError, ValueError):
            _LAND_FEATURES = []
    return _LAND_FEATURES


def nice_ticks(vmax: float, target: int = 4, integer: bool = False) -> Tuple[List[float], float]:
    """Graduations « rondes » : retourne (liste des graduations, valeur max de l'axe)."""
    if vmax <= 0:
        return [0.0, 1.0], 1.0
    raw = vmax / target
    magnitude = 10 ** math.floor(math.log10(raw))
    step = magnitude
    for factor in (1, 2, 2.5, 5, 10):
        step = factor * magnitude
        if step >= raw:
            break
    if integer:
        step = max(1.0, math.ceil(step))
    top = math.ceil(vmax / step - 1e-9) * step
    return [i * step for i in range(int(round(top / step)) + 1)], top


def _svg(width: int, height: int, label: str, body: str, extra_class: str = "", attrs: str = "") -> str:
    return (
        f'<svg class="chart {extra_class}"{attrs} width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="{_e(label)}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'
    )


def empty_chart(message: str, width: int = 760, height: int = 160) -> str:
    """Graphique vide : un message centré."""
    body = f'<text class="t" x="{width // 2}" y="{height // 2}" text-anchor="middle">{_e(message)}</text>'
    return _svg(width, height, message, body)


def _spread_labels(positions: List[float], min_gap: float = 15.0) -> List[float]:
    """Écarte des étiquettes verticales trop proches (ordre conservé)."""
    order = sorted(range(len(positions)), key=lambda i: positions[i])
    result = list(positions)
    for a, b in zip(order, order[1:]):
        if result[b] - result[a] < min_gap:
            result[b] = result[a] + min_gap
    return result


# ============================================================================
# 1. Courbe des heures cumulées
# ============================================================================


def _value_at(steps: Sequence[Tuple[float, float]], x: float) -> float:
    """Valeur cumulée à la position x (courbe en escalier)."""
    value = 0.0
    for sx, sh in steps:
        if sx <= x + 1e-9:
            value = sh
        else:
            break
    return value


def cumulative_key(series: List[dict], visible_years: Optional[Sequence[int]] = None) -> str:
    """Légende HTML de la courbe de cumul (un item par année, classe cy-<année> comme les séries)."""
    shown = None if visible_years is None else set(visible_years)
    items = []
    for s in sorted(series, key=lambda s: s["style"]):
        hidden = "" if shown is None or s["year"] in shown else " hidden"
        items.append(
            f'<span class="cy-{s["year"]}"{hidden}><svg viewBox="0 0 22 8" aria-hidden="true">'
            f'<line class="sk{s["style"]}" x1="2" x2="20" y1="4" y2="4"/></svg>{s["year"]}</span>'
        )
    return f'<div class="cum-key">{"".join(items)}</div>'


def chart_cumulative(series: List[dict], cutoff_x: Optional[float] = None,
                     cutoff_label: str = "", width: int = 780, height: int = 340,
                     visible_years: Optional[Sequence[int]] = None, gap: Optional[dict] = None) -> str:
    """
    Heures de vol cumulées au fil de l'année, une courbe en escalier par année.

    series : [{"year": 2026, "style": 0, "steps": [(x, heures_cumulées), ...], "end_x": 0.86}, ...]
             style 0 = année du rapport (courbe pleine avec aire), 1 et 2 = années de comparaison.
    cutoff_x : position de « aujourd'hui » (trait vertical) quand l'année est en cours.
    visible_years : années affichées par défaut (sans JavaScript) ; les autres portent l'attribut `hidden`
             et report.js les montre à la demande. Toutes les années ont la classe `cy-<année>`.
             L'axe vertical est calé sur le maximum de toutes les années fournies.
    gap : {"year": année de comparaison, "label": "+10 h sur 2025 entière", "status": "avance" | "retard"} : accolade entre la
             courbe de l'année et le TOTAL de `year` (ligne pointillée), collée au trait « aujourd'hui » (nécessite cutoff_x). Elle porte
             la classe cy-<year> et disparaît donc si cette année est masquée.
    """
    left, right, top, bottom = 54, 84, 40, 34
    pw, ph = width - left - right, height - top - bottom
    finals = [s["steps"][-1][1] if s["steps"] else 0.0 for s in series]
    ticks, ymax = nice_ticks(max(finals + [1.0]), target=4)

    def px(x): return left + x * pw
    def py(h): return top + ph * (1 - h / ymax)

    parts = []
    for t in ticks:  # grille horizontale + graduations
        parts.append(f'<line class="gridl" x1="{left}" x2="{left + pw}" y1="{_n(py(t))}" y2="{_n(py(t))}"/>')
        parts.append(f'<text class="t t-axis" x="{left - 8}" y="{_n(py(t) + 4)}" text-anchor="end">{fmt_int(t)}{NBSP}h</text>')
    for i, name in enumerate(MONTHS_SHORT):  # mois
        x0 = px(i / 12)
        parts.append(f'<line class="gridl gridl-v" x1="{_n(x0)}" x2="{_n(x0)}" y1="{top}" y2="{top + ph}"/>')
        parts.append(f'<text class="t t-axis" x="{_n(px((i + 0.5) / 12))}" y="{height - 12}" text-anchor="middle">{name}</text>')

    if cutoff_x is not None:
        xc = px(cutoff_x)
        parts.append(f'<line class="today" x1="{_n(xc)}" x2="{_n(xc)}" y1="{top - 6}" y2="{top + ph}"/>')
        parts.append(f'<text class="t t-today" x="{_n(xc)}" y="{top - 12}" text-anchor="middle">{_e(cutoff_label)}</text>')

    shown = None if visible_years is None else set(visible_years)

    def cy(year: int) -> str:
        """Fin de l'attribut class (guillemet fermant inclus) : `cy-<année>"`, suivi de `hidden` si l'année
        n'est pas affichée par défaut. À utiliser en dernière position dans class="…"."""
        hidden = shown is not None and year not in shown
        return f'cy-{year}"' + (' hidden' if hidden else '')

    ordered = sorted(series, key=lambda s: -s["style"])  # années de comparaison d'abord (au fond)
    end_labels = []
    for s in ordered:
        if not s["steps"]:
            continue
        style, steps, end_x = s["style"], s["steps"], s["end_x"]
        d = f"M{_n(px(0))},{_n(py(0))}"
        for x, h in steps:
            d += f" H{_n(px(x))} V{_n(py(h))}"
        last_h = steps[-1][1]
        d += f" H{_n(px(end_x))}"
        if style == 0:
            parts.append(f'<path class="area fl0 {cy(s["year"])} d="{d} V{_n(py(0))} H{_n(px(0))} Z"/>')
        parts.append(f'<path class="line sk{style} {cy(s["year"])} d="{d}" fill="none"/>')
        end_labels.append((py(last_h), f"{fmt_num(last_h, 1)}{NBSP}h", style, end_x, s["year"]))
        if style == 0:  # points « fin de mois » avec infobulle
            for m in range(1, 13):
                xm = m / 12
                if xm <= end_x + 1e-9:
                    hm = _value_at(steps, xm)
                    parts.append(
                        f'<circle class="dot fl0 {cy(s["year"])} cx="{_n(px(xm))}" cy="{_n(py(hm))}" r="3.5">'
                        f'<title>Fin {_e(MONTHS_SHORT[m - 1])} {s["year"]} : {_e(fmt_hours(hm * 60))}</title></circle>'
                    )

    if gap and cutoff_x is not None and gap.get("status") in ("avance", "retard"):
        cur = next((s for s in series if s["style"] == 0 and s["steps"]), None)
        ref = next((s for s in series if s["year"] == gap["year"] and s["steps"]), None)
        if cur and ref:
            xb = px(cutoff_x) - 7
            # écart avec le TOTAL de l'année de référence (sa courbe entière), pas avec sa valeur à cette date
            y_cur, y_ref = py(_value_at(cur["steps"], cutoff_x)), py(ref["steps"][-1][1])
            y_a, y_b = min(y_cur, y_ref), max(y_cur, y_ref)
            label = gap["label"]
            text_w = 7 * len(label) + 6   # largeur approximative du texte
            on_left = xb - 8 - text_w > left
            tx = xb - 8 if on_left else px(cutoff_x) + 8
            parts.append(
                f'<g class="gap gap-{gap["status"]} {cy(gap["year"])}>'
                f'<line class="gap-ref" x1="{_n(xb)}" x2="{_n(px(1.0))}" y1="{_n(y_ref)}" y2="{_n(y_ref)}"/>'
                f'<path class="gap-br" d="M{_n(xb - 4)},{_n(y_a)} H{_n(xb)} V{_n(y_b)} H{_n(xb - 4)}" fill="none"/>'
                f'<text class="t t-gap" x="{_n(tx)}" y="{_n((y_a + y_b) / 2 + 4)}" '
                f'text-anchor="{"end" if on_left else "start"}">{_e(label)}</text></g>')

    ys = _spread_labels([y for y, *_ in end_labels])
    for (y_raw, text, style, end_x, year), y in zip(end_labels, ys):
        parts.append(f'<text class="t t-end tf{style} {cy(year)} x="{_n(px(end_x) + 8)}" y="{_n(y + 4)}">{text}</text>')

    summary = " ; ".join(f'{s["year"]} : {fmt_hours(f * 60)}' for s, f in zip(series, finals))
    # data-cum : géométrie du tracé (px) pour que report.js convertisse pixels et (fraction d'année, heures)
    geometry = f' data-cum="{left},{pw},{top},{ph},{_n(ymax)}"'
    return _svg(width, height, f"Heures de vol cumulées au fil de l'année. {summary}", "".join(parts),
                extra_class="chart-cum", attrs=geometry)


# ============================================================================
# 2. Barres groupées (mois, jours de la semaine, heures de décollage)
# ============================================================================


def _seg_path(x: float, y: float, w: float, h: float, r: float, top: bool, bottom: bool) -> str:
    """Rectangle dont seuls le haut et / ou le bas sont arrondis (jonction plate entre deux segments empilés)."""
    rt, rb = (min(r, w / 2, h / 2) if top else 0), (min(r, w / 2, h / 2) if bottom else 0)

    def arc(rx, dx, dy): return f'a{_n(rx)} {_n(rx)} 0 0 1 {_n(dx)} {_n(dy)}' if rx else ""
    return (f'M{_n(x)} {_n(y + rt)}{arc(rt, rt, -rt)}h{_n(w - 2 * rt)}{arc(rt, rt, rt)}v{_n(h - rt - rb)}'
            f'{arc(rb, -rb, rb)}h-{_n(w - 2 * rb)}{arc(rb, -rb, -rb)}z')


def chart_bars(categories: List[str], series: List[dict], y_title: str = "Nombre de vols",
               width: int = 780, height: int = 320, label_values: bool = True,
               metric: str = "flights", month_filter: bool = False,
               stack: Optional[dict] = None, max_note: str = "") -> str:
    """
    Barres groupées par année et catégorie. `metric` choisit le nombre de vols ou les heures.

    series : [{"year": 2026, "style": 0, "flights": [...], "minutes": [...], "details": [rang ou None, ...]}, ...]
    (details : rang du texte complémentaire dans #tip-details, recollé à l'infobulle par report.js)

    max_note : si non vide, la barre la plus haute de l'année du rapport (series[0]) est repérée : valeur en gras
    et couleur or (t-max) et mention dans l'infobulle ; en cas d'égalité, toutes les barres à égalité le sont.

    stack : une seule série, deux segments empilés (parapente en bas, paramoteur au-dessus), sinon None :
    {"p": {"flights", "minutes", "details"}, "m": {...}, "total_label": "Total du mois"}. Les deux segments de
    chaque catégorie existent toujours (même à zéro) : report.js se déplace par colonne (2 segments par colonne).
    """
    left, right, top, bottom = 54, 16, 34, 36
    pw, ph = width - left - right, height - top - bottom
    n_cat, n_ser = len(categories), len(series)

    def scale(v, m): return float(v) if metric == "flights" else float(m) / 60
    values = [[scale(v, m) for v, m in zip(s["flights"], s["minutes"])] for s in series]
    vmax = max([max(vs) for vs in values] + [1])
    ticks, ymax = nice_ticks(vmax, target=4, integer=True)
    top_value = max(values[0] + [0])
    is_top = [bool(max_note) and top_value > 0 and v == top_value for v in values[0]]

    def py(v): return top + ph * (1 - v / ymax)

    group_w = pw / max(n_cat, 1)
    bar_w = min(34.0, group_w * 0.78 / n_ser)
    parts = []
    for t in ticks:
        parts.append(f'<line class="gridl" x1="{left}" x2="{left + pw}" y1="{_n(py(t))}" y2="{_n(py(t))}"/>')
        tick_label = fmt_int(t) if metric == "flights" else f"{fmt_num(t, 1)} h"
        parts.append(f'<text class="t t-axis" x="{left - 8}" y="{_n(py(t) + 4)}" text-anchor="end">{tick_label}</text>')
    for ci, cat in enumerate(categories):
        gx = left + ci * group_w
        parts.append(f'<text class="t t-axis" x="{_n(gx + group_w / 2)}" y="{height - 14}" text-anchor="middle">{_e(cat)}</text>')
        start = gx + (group_w - bar_w * n_ser) / 2
        for si, s in enumerate(series):
            v = values[si][ci]
            n_flights = s["flights"][ci]
            minutes = s["minutes"][ci]
            x = start + si * bar_w
            h = ph * v / ymax
            value_label = plural(n_flights, "vol") if metric == "flights" else f'{fmt_num(v, 1)} h'
            marked = si == 0 and is_top[ci]
            note = f' · {max_note}' if marked else ""
            filter_attr = f' data-filter-month="{ci + 1}"' if month_filter and s["style"] == 0 else ""
            if stack:
                # Deux segments : « Avril 2026 : parapente · 5 vols · 3 h 10 · Total du mois : 8 vols, 5 h 00 · Mois le plus actif »
                # (même convention que les autres infobulles : report.js en tire pastille de discipline et lignes)
                total_text = f'{stack["total_label"]} : {value_label}, {fmt_duration(minutes)}'
                base_y, below = py(0), 0.0
                for key, disc, cls in (("p", "parapente", "seg-p"), ("m", "paramoteur", "seg-m")):
                    sg = stack[key]
                    sv = scale(sg["flights"][ci], sg["minutes"][ci])
                    sh = ph * sv / ymax
                    sy = base_y - ph * below / ymax - sh
                    seg_label = plural(sg["flights"][ci], "vol") if metric == "flights" else f'{fmt_num(sv, 1)} h'
                    tip = f'{cat} {s["year"]} : {disc} · {seg_label} · {fmt_duration(sg["minutes"][ci])} · {total_text}{note}'
                    attrs = filter_attr
                    if sg.get("details") and sg["details"][ci] is not None:
                        attrs += f' data-det="{sg["details"][ci]}"'
                    path = _seg_path(x + 1, sy, max(bar_w - 2, 1), sh, 3, top=(key == "m" or not stack["m"]["flights"][ci]),
                                      bottom=(key == "p" or not stack["p"]["flights"][ci]))
                    parts.append(f'<path class="bar {cls}" d="{path}" tabindex="0"{attrs}><title>{_e(tip)}</title></path>')
                    below += sv
            else:
                tip = f'{cat} {s["year"]} : {value_label} · {fmt_duration(minutes)}{note}'
                detail = s["details"][ci] if s.get("details") else None
                if detail is not None:    # rang dans #tip-details : report.js ajoute « Sites : … · Voiles : … » à l'infobulle
                    filter_attr += f' data-det="{detail}"'
                parts.append(
                    f'<rect class="bar fl{s["style"]}" x="{_n(x + 1)}" y="{_n(py(v))}" width="{_n(max(bar_w - 2, 1))}" '
                    f'height="{_n(h)}" rx="3" tabindex="0"{filter_attr}>'
                    f'<title>{_e(tip)}</title></rect>'
                )
            # Valeur au-dessus de la barre ; la barre maximale a toujours la sienne (en gras, couleur or)
            if v and ((label_values and n_ser == 1) or marked):
                label = str(n_flights) if metric == "flights" else fmt_num(v, 1)
                parts.append(f'<text class="t t-val{" t-max" if marked else ""}" x="{_n(x + bar_w / 2)}" y="{_n(py(v) - 5)}" '
                             f'text-anchor="middle">{label}</text>')

    if stack:
        legend = [("seg-p", "Parapente", 82), ("seg-m", "Paramoteur", 96)]
        lx = max(float(left), (width + left - right - sum(w for *_, w in legend) - 14) / 2)
        for cls, name, w in legend:
            parts.append(f'<rect class="{cls}" x="{_n(lx)}" y="{top - 26}" width="12" height="12" rx="3"/>')
            parts.append(f'<text class="t t-legend" x="{_n(lx + 18)}" y="{top - 16}">{name}</text>')
            lx += w + 14
    elif n_ser > 1:
        widths = [34 + len(str(s["year"])) * 7.2 for s in series]
        total_width = sum(widths) + 14 * (len(widths) - 1)
        lx = max(float(left), (width + left - right - total_width) / 2)
        for i, s in enumerate(series):
            item_x = lx
            parts.append(f'<rect class="fl{s["style"]}" x="{_n(item_x)}" y="{top - 26}" width="12" height="12" rx="3"/>')
            parts.append(f'<text class="t t-legend" x="{_n(item_x + 18)}" y="{top - 16}">{s["year"]}</text>')
            lx += widths[i] + 14

    summary = " ; ".join(f'{s["year"]} : {sum(s["flights"])} vols' for s in series)
    if stack:
        summary += f' (parapente {sum(stack["p"]["flights"])}, paramoteur {sum(stack["m"]["flights"])})'
    return _svg(width, height, f"{y_title} par catégorie. {summary}", "".join(parts), "chart-stack" if stack else "")


def chart_duration_hist(labels: List[str], counts: List[int], median_bin: Optional[int], median_text: str,
                        bar_class: str = "fl0", width: int = 420, height: int = 240) -> str:
    """
    Histogramme vertical des durées de vol par tranche (F7). La tranche du vol médian est cerclée (cur-frame)
    et porte l'étiquette « vol médian : 52 min » reliée par un trait : le repérage ne dépend pas de la couleur.
    bar_class : fl0 (toutes disciplines), seg-p (parapente) ou seg-m (paramoteur).
    """
    left, right, top, bottom = 34, 12, 46, 30
    pw, ph = width - left - right, height - top - bottom
    total = max(sum(counts), 1)
    ticks, ymax = nice_ticks(max(counts + [1]), target=2, integer=True)

    def py(v): return top + ph * (1 - v / ymax)

    group_w = pw / len(counts)
    bar_w = min(64.0, group_w * 0.7)
    parts = []
    for t in ticks:
        parts.append(f'<line class="gridl" x1="{left}" x2="{left + pw}" y1="{_n(py(t))}" y2="{_n(py(t))}"/>')
        parts.append(f'<text class="t t-axis" x="{left - 8}" y="{_n(py(t) + 4)}" text-anchor="end">{fmt_int(t)}</text>')
    for i, (label, n) in enumerate(zip(labels, counts)):
        cx = left + (i + 0.5) * group_w
        x, h = cx - bar_w / 2, ph * n / ymax
        parts.append(f'<text class="t t-axis" x="{_n(cx)}" y="{height - 10}" text-anchor="middle">{_e(label)}</text>')
        tip = f'{label} : {plural(n, "vol")} ({round(100 * n / total)}{NBSP}%)' + (" · vol médian" if i == median_bin else "")
        if n:
            parts.append(f'<rect class="bar {bar_class}" x="{_n(x)}" y="{_n(py(n))}" width="{_n(bar_w)}" height="{_n(h)}" rx="3" '
                         f'tabindex="0"><title>{_e(tip)}</title></rect>')
            parts.append(f'<text class="t t-val" x="{_n(cx)}" y="{_n(py(n) - 5)}" text-anchor="middle">{n}</text>')
        if i == median_bin:
            if n:
                parts.append(f'<rect class="cur-frame" x="{_n(x - 3)}" y="{_n(py(n) - 3)}" width="{_n(bar_w + 6)}" '
                             f'height="{_n(h + 3)}" rx="5" fill="none"/>')
            anchor = "start" if i == 0 else ("end" if i == len(counts) - 1 else "middle")
            tx = cx - bar_w / 2 if anchor == "start" else (cx + bar_w / 2 if anchor == "end" else cx)
            # Étiquette sur une rangée fixe en haut (une barre voisine plus haute ne la recouvre pas), reliée à la barre
            parts.append(f'<line class="cur-frame" x1="{_n(cx)}" x2="{_n(cx)}" y1="22" y2="{_n(py(n) - 17)}"/>'
                         f'<text class="t t-legend" x="{_n(tx)}" y="14" text-anchor="{anchor}">{_e(median_text)}</text>')
    # Libellé court : le détail de chaque tranche est dans l'infobulle (<title>) de sa barre
    return _svg(width, height, f"Durée des vols par tranche, {plural(sum(counts), 'vol')} ; {median_text}", "".join(parts), "chart-hist")


def chart_career(years: List[dict], metric: str, report_year: int, best_year: int, ongoing: bool,
                 height: int = 300) -> str:
    """
    Barres empilées parapente (bas) / paramoteur (haut), une par année de carrière (F16).

    years : [{"year", "p_min", "m_min", "p_n", "m_n"}, ...] du plus ancien au plus récent.
    metric : "hours" ou "flights". L'année du rapport est cerclée et son étiquette en gras ; l'année record
    porte une étoile (classe t-crown) ; « à ce jour » sous l'année en cours si `ongoing`.
    """
    n = len(years)
    left, right, top, bottom = 40, 8, 44, 44
    width = max(400, left + right + 62 * n)
    pw, ph = width - left - right, height - top - bottom
    hours = metric == "hours"

    def val(y, code):
        return y[code + "_min"] / 60 if hours else float(y[code + "_n"])

    totals = [val(y, "p") + val(y, "m") for y in years]
    ticks, ymax = nice_ticks(max(totals + [1]), target=4, integer=True)

    def py(v): return top + ph * (1 - v / ymax)

    group_w = pw / n
    bar_w = min(44.0, group_w * 0.7)
    parts = []
    for t in ticks:
        parts.append(f'<line class="gridl" x1="{left}" x2="{left + pw}" y1="{_n(py(t))}" y2="{_n(py(t))}"/>')
        parts.append(f'<text class="t t-axis" x="{left - 6}" y="{_n(py(t) + 4)}" text-anchor="end">{fmt_int(t)}</text>')
    for i, y in enumerate(years):
        cx = left + (i + 0.5) * group_w
        x, base = cx - bar_w / 2, 0.0
        label = f'{y["year"]}'
        cur = y["year"] == report_year
        cls = "t t-axis t-cur" if cur else "t t-axis"
        parts.append(f'<text class="{cls}" x="{_n(cx)}" y="{height - 24}" text-anchor="middle">{label}</text>')
        if cur and ongoing:
            parts.append(f'<text class="t t-axis t-small" x="{_n(cx)}" y="{height - 8}" text-anchor="middle">à ce jour</text>')
        for code, name in (("p", "parapente"), ("m", "paramoteur")):
            v = val(y, code)
            if v <= 0:
                continue
            h = ph * v / ymax
            top_y = py(base + v)
            tip = (f'{y["year"]} · {name} : {fmt_hours(y[code + "_min"], 0 if y[code + "_min"] >= 6000 else 1)} · '
                   f'{plural(y[code + "_n"], "vol")}')
            parts.append(f'<rect class="seg-{code}" x="{_n(x)}" y="{_n(top_y)}" width="{_n(bar_w)}" height="{_n(h)}" '
                         f'rx="2" tabindex="0"><title>{_e(tip)}</title></rect>')
            base += v
        total = totals[i]
        if total > 0:
            text = (fmt_int(total) if total >= 10 else fmt_num(total, 1)) + (f"{NBSP}h" if hours else "")
            ty = py(total) - 6
            parts.append(f'<text class="t t-val" x="{_n(cx)}" y="{_n(ty)}" text-anchor="middle">{text}</text>')
            if cur:
                parts.append(f'<rect class="cur-frame" x="{_n(x - 2)}" y="{_n(py(total) - 2)}" width="{_n(bar_w + 4)}" '
                             f'height="{_n(ph * total / ymax + 2)}" rx="4" fill="none"/>')
            if y["year"] == best_year:
                parts.append(f'<text class="t-crown" x="{_n(cx)}" y="{_n(ty - 15)}" text-anchor="middle">★</text>')
    # Légende : seulement les disciplines pratiquées
    legend, lx = [], float(left)
    for code, name in (("p", "parapente"), ("m", "paramoteur")):
        if any(y[code + "_n"] for y in years):
            legend.append(f'<rect class="seg-{code}" x="{_n(lx)}" y="10" width="12" height="12" rx="3"/>'
                          f'<text class="t t-legend" x="{_n(lx + 17)}" y="20">{name}</text>')
            lx += 36 + len(name) * 6.6
    legend.append(f'<text class="t-crown" x="{_n(lx)}" y="21">★</text><text class="t t-legend" x="{_n(lx + 17)}" y="20">année record</text>')
    summary = ", ".join(f'{y["year"]} : {fmt_hours(y["p_min"] + y["m_min"], 0)}, {plural(y["p_n"] + y["m_n"], "vol")}' for y in years)
    label = ("Heures de vol" if hours else "Nombre de vols") + " par année, parapente et paramoteur. " + summary
    return _svg(width, height, label, "".join(legend) + "".join(parts), "chart-career")


# ============================================================================
# 3. Calendrier annuel (une case par jour)
# ============================================================================


def calendar_level(minutes: float) -> int:
    """Niveau d'intensité (1 à 4) d'une journée de vol selon sa durée."""
    for level, threshold in enumerate(CALENDAR_LEVELS, start=1):
        if minutes <= threshold:
            return level
    return 4


def _calendar_class(day: dt.date, info: Optional[dict], cutoff_date: Optional[dt.date]) -> str:
    """Classe CSS d'une case de calendrier (discipline + intensité ; jour sans vol ou à venir)."""
    if not info:
        return "cal-future" if (cutoff_date and day > cutoff_date) else "cal-empty"
    discs = set(info["disciplines"])
    kind = "b" if len(discs) > 1 else ("m" if "paramoteur" in discs else "p")
    return f'cal-{kind}{calendar_level(info["minutes"])}'


def _calendar_kinds(daily: Dict[dt.date, dict]) -> List[Tuple[str, str]]:
    """Disciplines présentes dans le calendrier, dans l'ordre de la légende : [(code, libellé), ...]."""
    present = set()
    for info in daily.values():
        present.update(info["disciplines"])
        if len(info["disciplines"]) > 1:
            present.add("both")
    items = [("p", "parapente", "parapente"), ("m", "paramoteur", "paramoteur"),
             ("b", "les deux le même jour", "both")]
    return [(kind, name) for kind, name, key in items if key in present]


def _calendar_cell(x: float, y: float, cls: str, focus: bool) -> str:
    """Une case de jour : <use> de #cal-cell (moins lourd qu'un <rect> complet).
    Aucune infobulle dans le HTML (poids) : report.js la calcule depuis #flights-data (calendarTip).
    Jour sans vol : pas de classe (couleur par défaut .days > use) ; jour de vol : classe d'intensité.
    report.js déduit la date de la position et pose data-date sur les jours de vol (poids)."""
    attrs = "" if cls == "cal-empty" else f' class="{cls}"'
    attrs += f' x="{x}" y="{y}"'
    if focus:
        attrs += ' tabindex="0"'
    return f'<use href="#cal-cell"{attrs}/>'


def _calendar_focus_day(daily: Dict[dt.date, dict], year: int) -> dt.date:
    """Case qui reçoit l'unique arrêt de tabulation du calendrier (les flèches font le reste, report.js) :
    le premier jour de vol, sinon le 1er janvier."""
    days = sorted(d for d in daily if d.year == year)
    return days[0] if days else dt.date(year, 1, 1)


CALENDAR_LEVEL_LABELS = ["≤ 30 min", "≤ 1 h 15", "≤ 2 h 30", "> 2 h 30"]
CALENDAR_LEGEND_NOTE = "plus la case est foncée, plus la journée est longue"


def chart_calendar(daily: Dict[dt.date, dict], year: int, cutoff: Optional[Tuple[int, int]] = None,
                   cell: int = CALENDAR_CELL, gap: int = 3) -> str:
    """
    Calendrier annuel : une case par jour, de janvier à décembre (semaines en colonnes, lundi en haut).

    daily : {date: {"n": nb_vols, "minutes": durée, "disciplines": ["parapente", ...]}}
    La couleur indique la discipline (parapente, paramoteur ou les deux le même jour) et
    l'intensité la durée de vol. Les jours à venir (année en cours) sont en pointillés.
    Les cases des jours (<use> de #cal-cell, voir PATTERN_DEFS) sont dans <g class="days">, dans l'ordre
    des dates ; report.js pose data-date="AAAA-MM-JJ" sur les jours de vol ; aucune case n'a d'infobulle <title> (poids) : report.js la
    calcule depuis #flights-data, et donne la date aux jours sans vol (position). Une seule case a tabindex="0" : report.js gère les flèches (tabindex mobile).
    """
    left, top, step = 34, 26, cell + gap
    jan1, dec31 = dt.date(year, 1, 1), dt.date(year, 12, 31)
    start = jan1 - dt.timedelta(days=jan1.weekday())
    n_weeks = (dec31 - start).days // 7 + 1
    width = left + n_weeks * step + 8
    legend_y = top + 7 * step + 14
    height = legend_y + 26
    cutoff_date = dt.date(year, cutoff[0], cutoff[1]) if cutoff else None
    focus_day = _calendar_focus_day(daily, year)

    parts = []
    for row, label in ((0, DAYS_SHORT[0]), (2, DAYS_SHORT[2]), (4, DAYS_SHORT[4]), (6, DAYS_SHORT[6])):
        parts.append(f'<text class="t t-axis" x="{left - 6}" y="{top + row * step + cell - 2}" text-anchor="end">{label}</text>')
    for m in range(1, 13):
        col = (dt.date(year, m, 1) - start).days // 7
        parts.append(f'<text class="t t-axis" x="{left + col * step}" y="{top - 9}">{MONTHS_SHORT[m - 1]}</text>')

    parts.append('<g class="days">')
    day = jan1
    while day <= dec31:
        col, row = (day - start).days // 7, day.weekday()
        x, y = left + col * step, top + row * step
        info = daily.get(day)
        cls = _calendar_class(day, info, cutoff_date)
        parts.append(_calendar_cell(x, y, cls, day == focus_day))
        day += dt.timedelta(days=1)
    parts.append('</g>')

    # Légende : une rangée d'intensités par discipline présente
    lx = left
    for kind, name in _calendar_kinds(daily):
        parts.append(f'<text class="t t-legend" x="{lx}" y="{legend_y + 11}">{_e(name)}</text>')
        sx = lx + len(name) * 6.6 + 10
        for level in range(1, 5):
            parts.append(f'<rect class="cal-{kind}{level}" x="{_n(sx + (level - 1) * 17)}" y="{legend_y}" width="14" height="14" rx="3">'
                         f'<title>{CALENDAR_LEVEL_LABELS[level - 1]}</title></rect>')
        lx = sx + 4 * 17 + 22
    parts.append(f'<text class="t t-legend" x="{_n(lx)}" y="{legend_y + 11}">{CALENDAR_LEGEND_NOTE}</text>')

    label = f"Calendrier des vols {year} : une case par jour de vol"
    parts.insert(0, f"<title>{_e(label)}</title>")   # seule infobulle native (sans JavaScript) ; report.js la retire
    return _svg(int(width), int(height), label, "".join(parts), "chart-calendar")


def chart_calendar_months(daily: Dict[dt.date, dict], year: int, cutoff: Optional[Tuple[int, int]] = None,
                          cell: int = CALENDAR_CELL, gap: int = 3) -> str:
    """
    Même calendrier que chart_calendar, découpé en 12 mini-mois (pour les écrans étroits) : HTML.

    Chaque mois est un petit SVG (7 colonnes du lundi au dimanche, une ligne par semaine) précédé de son
    nom ; la disposition (3, 4 ou 6 mois par ligne) est faite en CSS (.cal-mini-grid). Mêmes classes de
    couleur et même tabindex mobile que chart_calendar ; infobulles calculées par report.js.
    La légende est en HTML sous la grille.
    """
    step = cell + gap
    width, height = 7 * step - gap, 6 * step - gap   # taille fixe (6 semaines) : mois alignés
    cutoff_date = dt.date(year, cutoff[0], cutoff[1]) if cutoff else None
    focus_day = _calendar_focus_day(daily, year)

    months = []
    for m in range(1, 13):
        first = dt.date(year, m, 1)
        offset = first.weekday()
        cells = []
        day = first
        while day.month == m:
            index = offset + day.day - 1
            x, y = (index % 7) * step, (index // 7) * step
            info = daily.get(day)
            cls = _calendar_class(day, info, cutoff_date)
            cells.append(_calendar_cell(x, y, cls, day == focus_day))
            day += dt.timedelta(days=1)
        name = MONTHS_LONG[m - 1]
        months.append(
            f'<figure class="cal-mo"><figcaption>{name}</figcaption>'
            f'<svg class="chart chart-mini" viewBox="0 0 {width} {height}" role="group" aria-label="{name} {year}" '
            f'xmlns="http://www.w3.org/2000/svg"><g class="days">{"".join(cells)}</g></svg></figure>'
        )

    legend = []
    for kind, name in _calendar_kinds(daily):
        swatches = "".join(
            f'<rect class="cal-{kind}{level}" x="{(level - 1) * 17}" y="0" width="14" height="14" rx="3"/>' for level in range(1, 5))   # svg aria-hidden : le titre ne servirait à personne
        legend.append(f'<span class="cal-key-item">{_e(name)} <svg class="chart chart-key" viewBox="0 0 65 14" width="65" '
                      f'height="14" aria-hidden="true">{swatches}</svg></span>')
    legend.append(f'<span class="cal-key-note">{CALENDAR_LEGEND_NOTE}</span>')
    return (
        f'<div class="cal-mini" role="group" aria-label="Calendrier des vols {year}, mois par mois : une case par jour">'
        f'<div class="cal-mini-grid">{"".join(months)}</div><div class="cal-key">{"".join(legend)}</div></div>'
    )


# ============================================================================
# 4. Carte des sites, par vues (T46) : vue d'ensemble des zones et vues zoomées par zone
# ============================================================================
# Une vue = un SVG cadré sur ses repères (sites ou zones). Fond Natural Earth découpé à l'emprise de la vue
# et arrondi au pixel (quelques centaines d'octets par vue). Rayons, étiquettes, couleurs et infobulles sont
# recalculés par report.js selon la discipline et la mesure (vols / heures) : le rendu Python est l'état
# par défaut (toutes disciplines, vols), seul visible sans JavaScript.

MAP_R_MIN, MAP_R_MAX = 5.0, 24.0   # rayon des cercles (unités SVG) : plus petit et plus grand repère de la vue
MAP_MAX_AREA = 0.10                # les cercles couvrent au plus 10 % de la vue (sinon le rayon max diminue)
MAP_GAP = 2.0                      # écart minimal entre deux cercles après écartement
MAP_MIN_SPAN_KM = 40.0             # emprise minimale d'une vue (un site isolé n'est pas zoomé à l'extrême)
MAP_LABEL_FS = 13.0                # taille des étiquettes (unités SVG) ; report.js l'agrandit sur petit écran
MAP_HALO_PAD = 7.0                 # halo de zone (vue d'ensemble) : marge autour des sites de la zone
MAP_RING_GAP = 4.0                 # anneau or (site découvert cette année) : écart entre le cercle et l'anneau


def _nice_km(target: float) -> float:
    for k in (1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500):
        if k >= target:
            return float(k)
    return 1000.0


def _clip_ring(ring: List[Tuple[float, float]], x0: float, y0: float, x1: float, y1: float) -> List[Tuple[float, float]]:
    """Découpe d'un polygone par un rectangle (Sutherland-Hodgman) : seule l'emprise de la vue est gardée."""
    def cut(points, inside, cross):
        out = []
        for i, cur in enumerate(points):
            prev = points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out

    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    pts = ring
    for inside, cross in ((lambda p: p[0] >= x0, at_x(x0)), (lambda p: p[0] <= x1, at_x(x1)),
                          (lambda p: p[1] >= y0, at_y(y0)), (lambda p: p[1] <= y1, at_y(y1))):
        if not pts:
            break
        pts = cut(pts, inside, cross)
    return pts


def _path_int(points: List[Tuple[float, float]], min_step: float = 1.5) -> str:
    """Chemin SVG compact : coordonnées entières relatives (« l3-2 4 1 »), points à moins de min_step px fondus."""
    kept = []
    for x, y in points:
        xi, yi = int(round(x)), int(round(y))
        if kept and abs(xi - kept[-1][0]) < min_step and abs(yi - kept[-1][1]) < min_step:
            continue
        kept.append((xi, yi))
    if len(kept) < 3:
        return ""
    out = [f"M{kept[0][0]} {kept[0][1]}l"]
    for (ax, ay), (bx, by) in zip(kept, kept[1:]):
        for v in (bx - ax, by - ay):
            out.append(str(v) if v < 0 or out[-1].endswith("l") else f" {v}")
    return "".join(out) + "z"


def _land_layer(project, width: int, height: int, lon_lat_box: Tuple[float, float, float, float]) -> str:
    """Terres de la vue : polygones Natural Earth qui touchent l'emprise, découpés et arrondis (un seul <path>)."""
    lon_min, lon_max, lat_min, lat_max = lon_lat_box
    margin = 6
    paths = []
    for feature in _land_features():
        geometry = feature.get("geometry") or {}
        kind, coords = geometry.get("type"), geometry.get("coordinates", [])
        polygons = [coords] if kind == "Polygon" else (coords if kind == "MultiPolygon" else [])
        for polygon in polygons:
            if not polygon or not polygon[0]:
                continue
            outer = polygon[0]
            if (max(p[0] for p in outer) < lon_min or min(p[0] for p in outer) > lon_max
                    or max(p[1] for p in outer) < lat_min or min(p[1] for p in outer) > lat_max):
                continue
            for ring in polygon:
                clipped = _clip_ring([project(lon, lat) for lon, lat in ring], -margin, -margin, width + margin, height + margin)
                d = _path_int(clipped)
                if d:
                    paths.append(d)
    return f'<path class="map-land" d="{"".join(paths)}" fill-rule="evenodd"/>' if paths else ""


def _relax(pos: List[List[float]], radii: List[float], width: int, height: int, rounds: int = 80) -> None:
    """Écarte les cercles qui se chevauchent (déplacement minimal, au plus quelques pixels en zone dense)."""
    n = len(pos)
    for _ in range(rounds):
        moved = False
        for i in range(n):
            for j in range(i + 1, n):
                dx, dy = pos[j][0] - pos[i][0], pos[j][1] - pos[i][1]
                dist = math.hypot(dx, dy)
                need = radii[i] + radii[j] + MAP_GAP
                if dist >= need:
                    continue
                if dist < 1e-6:   # même position : écart déterministe
                    dx, dy, dist = math.cos(i + j), math.sin(i + j), 1.0
                push = (need - dist) / 2 + 0.01
                ux, uy = dx / dist, dy / dist
                pos[i][0] -= ux * push; pos[i][1] -= uy * push
                pos[j][0] += ux * push; pos[j][1] += uy * push
                moved = True
        for i in range(n):
            r = radii[i] + 4
            pos[i][0] = min(max(pos[i][0], r), width - r)
            pos[i][1] = min(max(pos[i][1], r), height - r)
        if not moved:
            break


def _place_labels(pos, radii, labels, order, width, height, max_labels):
    """Étiquettes (sans JavaScript) : 4 positions essayées autour du cercle, sans chevaucher une autre
    étiquette ni un autre cercle. labels[i] = (ligne 1, ligne 2 ou "")."""
    placed: List[Tuple[float, float, float, float]] = []
    circles = [(pos[i][0] - radii[i], pos[i][1] - radii[i], pos[i][0] + radii[i], pos[i][1] + radii[i]) for i in range(len(pos))]
    out = []
    fs = MAP_LABEL_FS
    for i in order[:max_labels]:
        line1, line2 = labels[i]
        x, y, r = pos[i][0], pos[i][1], radii[i]
        w = max(len(line1), len(line2) * 0.85) * fs * 0.56 + 6
        h = fs * (2.25 if line2 else 1.2)
        for dx, dy, anchor in ((r + 5, 4 - (h - fs * 1.2) / 2, "start"), (-(r + 5), 4 - (h - fs * 1.2) / 2, "end"),
                               (0, -(r + 6) - (h - fs * 1.2), "middle"), (0, r + fs + 3, "middle")):
            lx, ly = x + dx, y + dy
            x0 = lx if anchor == "start" else (lx - w if anchor == "end" else lx - w / 2)
            box = (x0, ly - fs, x0 + w, ly - fs + h)
            inside = box[0] > 4 and box[2] < width - 4 and box[1] > 4 and box[3] < height - 4
            free = all(box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3] for b in placed)
            clear = all(box[2] < c[0] or box[0] > c[2] or box[3] < c[1] or box[1] > c[3]
                        for k, c in enumerate(circles) if k != i)
            if inside and free and clear:
                placed.append(box)
                sub = (f'<tspan class="map-sub" x="{_n(lx)}" dy="1.1em">{_e(line2)}</tspan>' if line2 else "")
                out.append(f'<text class="t map-label" x="{_n(lx)}" y="{_n(ly)}" text-anchor="{anchor}">'
                           f'{_e(line1)}{sub}</text>')
                break
    return out


def chart_map_view(items: List[dict], label: str, width: int = 780, max_labels: int = 10,
                   r_top: float = MAP_R_MAX, groups: Optional[List[dict]] = None, relax: bool = True) -> str:
    """
    Une vue de la carte : fond, un cercle par repère (site ou zone), étiquettes, échelle.
    items : [{"coords": (lon, lat), "n": vols, "minutes": float, "label": str, "sub": str (2e ligne ou ""),
              "cls": classes CSS du cercle, "attrs": attributs HTML déjà échappés, "tip": infobulle,
              "ring": True pour un anneau or (nouveau site), dessiné juste avant le cercle}]
    Le cadrage suit l'emprise des repères : hauteur 360 à 600, largeur réduite (480 au moins) pour une zone en hauteur. La surface des cercles est
    proportionnelle aux vols ; leur position est légèrement écartée si deux cercles se chevauchent.
    r_top : rayon du plus gros repère.
    groups : halos de zone (vue d'ensemble) [{"members": [indices dans items], "n", "label", "sub", "attrs", "tip"}] :
             un cercle en pointillés qui entoure les sites de la zone, étiqueté à la place de ses sites.
             Un repère avec "label": None n'est pas étiqueté.
    relax : écarter les cercles qui se chevauchent (False : positions exactes, vue d'ensemble).
    Le SVG porte data-r="rmin rmax vols_max minutes_max" : report.js recalcule les rayons (discipline, heures).
    """
    pts = [it for it in items if it.get("coords")]
    if not pts:
        return empty_chart("Positions des sites indisponibles (pas de trace GPX pour ces vols).", width, 140)
    lat_c = sum(it["coords"][1] for it in pts) / len(pts)
    kx = math.cos(math.radians(lat_c))
    xs = [it["coords"][0] * kx for it in pts]
    ys = [-it["coords"][1] for it in pts]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    min_span = MAP_MIN_SPAN_KM / 111.19
    span_x, span_y = max(max_x - min_x, min_span), max(max_y - min_y, min_span)
    aspect = span_y / span_x
    if aspect > 0.75:   # zone plus haute que large (ex. les Alpes) : cadre plus étroit, moins de vide sur les côtés
        width = int(min(width, max(480, 600 / aspect)))
    height = int(min(600, max(360, width * aspect)))
    pad = 34 + r_top
    scale = min((width - 2 * pad) / span_x, (height - 2 * pad) / span_y)
    cx0, cy0 = (min_x + max_x) / 2, (min_y + max_y) / 2

    def project(lon, lat):
        return width / 2 + (lon * kx - cx0) * scale, height / 2 + (-lat - cy0) * scale

    n_max = max(it["n"] for it in pts)
    m_max = max(it["minutes"] for it in pts) or 1.0
    r_max = r_top
    while r_max > MAP_R_MIN + 3:   # vue dense : rayon max réduit pour limiter les écartements
        area = sum(math.pi * (MAP_R_MIN + (r_max - MAP_R_MIN) * math.sqrt(max(it["n"] / n_max, it["minutes"] / m_max))) ** 2
                   for it in pts)
        if area <= MAP_MAX_AREA * width * height:
            break
        r_max -= 1

    def radius(value, vmax):
        return MAP_R_MIN + (r_max - MAP_R_MIN) * math.sqrt(value / vmax) if vmax else MAP_R_MIN

    r_n = [radius(it["n"], n_max) for it in pts]
    r_layout = [max(r_n[i], radius(it["minutes"], m_max)) + (MAP_RING_GAP + 1.5 if it.get("ring") else 0)
                for i, it in enumerate(pts)]
    index = {id(it): k for k, it in enumerate(pts)}
    members = [[index[id(items[i])] for i in g["members"] if id(items[i]) in index] for g in groups or []]

    def make_halos(pos):   # (cx, cy, r, groupe) : cercle qui entoure les sites de la zone
        out = []
        for g, mem in zip(groups or [], members):
            if not mem:
                continue
            xs_m, ys_m = [pos[k][0] for k in mem], [pos[k][1] for k in mem]
            hx, hy = (min(xs_m) + max(xs_m)) / 2, (min(ys_m) + max(ys_m)) / 2
            hr = max(math.hypot(pos[k][0] - hx, pos[k][1] - hy) + r_layout[k] for k in mem) + MAP_HALO_PAD
            out.append((hx, hy, hr, g))
        return out

    pos = [list(project(*it["coords"])) for it in pts]
    halos = make_halos(pos)
    for _ in range(20):   # halos entiers dans le cadre et au-dessus de l'échelle : on dézoome tant qu'ils dépassent
        if all(hr + 6 <= hx <= width - hr - 6 and hr + 6 <= hy <= height - hr - 44 for hx, hy, hr, _ in halos):
            break
        scale *= 0.93
        pos = [list(project(*it["coords"])) for it in pts]
        halos = make_halos(pos)
    if relax:
        _relax(pos, r_layout, width, height)

    view_lon, view_lat = width / (2 * scale * kx), height / (2 * scale)
    lon_c, lat_c2 = cx0 / kx, -cy0
    parts = [f'<rect class="map-bg" x="0" y="0" width="{width}" height="{height}" rx="14"/>',
             _land_layer(project, width, height, (lon_c - view_lon, lon_c + view_lon, lat_c2 - view_lat, lat_c2 + view_lat))]

    order = sorted(range(len(pts)), key=lambda i: (-pts[i]["n"], -pts[i]["minutes"]))
    zone_parts = []
    for hx, hy, hr, g in halos:   # sous les sites : un clic sur le halo (hors site) ouvre la vue de la zone
        zone_parts.append(f'<circle class="map-halo" cx="{_n(hx)}" cy="{_n(hy)}" r="{_n(hr)}" {g.get("attrs", "")}>'
                          f'<title>{_e(g["tip"])}</title></circle>')
    if zone_parts:
        parts.append(f'<g class="map-halos">{"".join(zone_parts)}</g>')
    dots = []
    for i in order:   # gros cercles d'abord (les petits restent cliquables au-dessus)
        it = pts[i]
        if it.get("ring"):   # anneau or séparé du cercle : distinct du contour de discipline (couleur de la discipline)
            dots.append(f'<circle class="map-ring" cx="{_n(pos[i][0])}" cy="{_n(pos[i][1])}" r="{_n(r_n[i] + MAP_RING_GAP)}"/>')
        dots.append(f'<circle class="{it.get("cls") or "map-dot"}" cx="{_n(pos[i][0])}" cy="{_n(pos[i][1])}" r="{_n(r_n[i])}" '
                    f'{it.get("attrs", "")} tabindex="0"><title>{_e(it["tip"])}</title></circle>')
    parts.append(f'<g class="map-dots">{"".join(dots)}</g>')
    # étiquettes : halos de zone et sites étiquetables, les plus volés d'abord
    l_pos = pos + [[hx, hy] for hx, hy, _, _ in halos]
    l_rad = r_layout + [hr for _, _, hr, _ in halos]
    labels = [(it["label"], it.get("sub", "")) for it in pts] + [(g["label"], g.get("sub", "")) for _, _, _, g in halos]
    weight = [it["n"] for it in pts] + [g["n"] for _, _, _, g in halos]
    l_order = sorted((i for i in range(len(labels)) if labels[i][0]), key=lambda i: -weight[i])
    parts.append('<g class="map-labels">' + "".join(_place_labels(l_pos, l_rad, labels, l_order, width, height, max_labels)) + "</g>")

    km_per_unit = 111.19                                   # km par degré de latitude
    bar_km = _nice_km((width * 0.18) / scale * km_per_unit)
    bar_px = bar_km / km_per_unit * scale
    by = height - 24
    parts.append(f'<path class="map-scale" d="M24,{by} h{_n(bar_px)} M24,{by - 5} v10 M{_n(24 + bar_px)},{by - 5} v10"/>')
    parts.append(f'<text class="t t-axis" x="{_n(24 + bar_px / 2)}" y="{by - 9}" text-anchor="middle">{fmt_int(bar_km)}{NBSP}km</text>')
    parts.append(f'<text class="t t-axis" x="{width - 24}" y="30" text-anchor="end">N ↑</text>')
    parts.append(f'<text class="t map-credit" x="{width - 12}" y="{height - 10}" text-anchor="end">Fond : Natural Earth</text>')
    svg = _svg(width, height, label, "".join(parts), "chart-map" + (" map-wide" if width >= 700 else ""))   # map-wide : glissable sur téléphone
    return svg.replace("<svg ", f'<svg data-r="{_n(MAP_R_MIN)} {_n(r_max)} {n_max} {int(round(m_max))}" ', 1)
