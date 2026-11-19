"""Phrases du rapport pour un vol sans site : la partie « à {site} » disparaît proprement."""

import datetime as dt

from rapport.report_html import ReportBuilder, load_texts, render_md


def _render(key, ctx):
    return render_md(load_texts()[key], ctx, block=False)


def test_phrase_record_plafond_sans_site():
    ctx = {"plafond": "3 000 m", "date_plafond": "12 mai", "site_plafond": ""}
    assert _render("phrase_record_plafond", ctx).endswith("le 12 mai.")
    assert "à Annecy" in _render("phrase_record_plafond", dict(ctx, site_plafond="Annecy"))


def test_recap_record_sans_site():
    assert _render("recap_record", {"date": "12 mai", "site": ""}) == "Ton vol le plus long : le 12 mai."
    assert _render("recap_record", {"date": "12 mai", "site": "Annecy"}).endswith("à Annecy.")


def test_journee_type_sans_site():
    out = _render("phrase_journee_type", {"jour": "samedi", "heure": "", "site": "", "voile": "Alpha"})
    assert "à **" not in out and "à <strong>" not in out and " à " not in out


def _builder():
    b = ReportBuilder.__new__(ReportBuilder)
    b.texts = load_texts()
    return b


def _flight(site):
    return {"date": dt.date(2025, 5, 12), "site": site, "voile": "Alpha", "minutes": 90.0, "url": "", "time": None}


def test_jalon_sans_site():
    b = _builder()
    for kind in ("nth_flight", "comeback"):
        m = {"type": kind, "n": 10, "gap": 30, "flight": _flight("")}
        _, detail = b._milestone_text(m)
        assert "à " not in detail and detail.strip() and not detail.startswith(" ·")
    _, detail = b._milestone_text({"type": "record", "metrics": [("duree", 5400.0)], "flight": _flight("")})
    assert "à " not in detail
    _, detail = b._milestone_text({"type": "nth_flight", "n": 10, "flight": _flight("Annecy")})
    assert detail.startswith("à Annecy")
