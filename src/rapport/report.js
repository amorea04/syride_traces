/* Rapport de vol : interactions (intégré au fichier HTML à la génération).
   Aucune dépendance. Les graphiques et tableaux sont déjà dans la page : ce script
   affiche la bonne variante (discipline, années comparées), trie les tableaux et filtre les vols. */
(function () {
    "use strict";

    var cfg = JSON.parse(document.getElementById("cfg").textContent);
    var root = document.documentElement;
    var state = { disc: "all", cmp: cfg.default_cmp.slice(), monthMeasure: "flights", careerMeasure: "hours", scAxis: "c" };

    function q(selector, scope) {
        return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    }

    /* ---------- Socle de données : tous les vols de l'année (6.2) ----------
       Lu une seule fois depuis <script type="application/json" id="flights-data"> (report_html.flights_json).
       Un vol = objet à clés courtes, valeur absente = null (une mesure à 0 est absente) :
         d date « AAAA-MM-JJ », t heure « HH:MM », s site, w voile, k discipline ("p" / "m"), f façon de voler,
         mn minutes (décimales : on arrondit à l'affichage, jamais au stockage), km distance, c plafond (m), v vitesse max (km/h), z vario max (m/s), n numéro d'activité Syride.
       Ajouté ici : disc (« parapente » / « paramoteur », comme state.disc).
       À réutiliser par les modules interactifs (fiche du jour, puis fiche de site, filtres) :
         flightsByDate["2026-04-05"]  vols du jour, dans l'ordre des heures
         flightDates                  dates de vol triées (toutes disciplines)
         flightsOn(date, disc)        vols d'un jour pour une discipline ("all" ou absente = toutes)
         flightDatesFor(disc)         dates de vol d'une discipline, triées
         flightUrl(f)                 lien vers la fiche Syride du vol (null si inconnu) */
    var DISC_OF_CODE = { p: "parapente", m: "paramoteur" };
    var flightsData = (function () {
        var el = document.getElementById("flights-data");
        try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
    })() || { u: "", f: [] };
    var flightsByDate = {};
    var flightDates = [];
    flightsData.f.forEach(function (f) {
        f.disc = DISC_OF_CODE[f.k] || f.k;
        if (!flightsByDate[f.d]) { flightsByDate[f.d] = []; flightDates.push(f.d); }
        flightsByDate[f.d].push(f);
    });
    flightDates.sort();
    function flightsOn(date, disc) {
        return (flightsByDate[date] || []).filter(function (f) { return !disc || disc === "all" || f.disc === disc; });
    }
    function flightDatesFor(disc) {
        return flightDates.filter(function (d) { return flightsOn(d, disc).length > 0; });
    }
    function flightUrl(f) {
        return f.url || (f.n !== null && f.n !== undefined ? flightsData.u + f.n : null);
    }

    function setVisible(el, visible) {
        if (visible) {
            el.removeAttribute("hidden");
            el.style.display = "";
        } else {
            el.setAttribute("hidden", "");
            el.style.display = "none";
        }
    }

    /* Handle touchend directly for iOS Safari, then ignore its synthesized click
       so a tap cannot toggle the same control twice. */
    function bindButton(selector, action) {
        q(selector).forEach(function (button) {
            var lastTouch = 0;
            button.addEventListener("touchend", function (event) {
                lastTouch = Date.now();
                action.call(button, event);
            }, false);
            button.addEventListener("click", function (event) {
                if (Date.now() - lastTouch < 800) return;
                action.call(button, event);
            }, false);
        });
    }

    /* ---------- Variantes : discipline et années comparées ---------- */
    function cmpKey() {
        return cfg.compare.filter(function (y) { return state.cmp.indexOf(y) >= 0; }).join(",");
    }

    function applyState() {
        var key = cmpKey();
        q("[data-v-disc]").forEach(function (el) {
            var d = el.getAttribute("data-v-disc");
            var c = el.getAttribute("data-v-cmp");
            var okDisc = d === state.disc || d === "*";
            var okCmp = c === null || c === "*" || c === key;
            setVisible(el, okDisc && okCmp);
        });
        q("[data-set-disc]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-set-disc") === state.disc));
        });
        q("[data-toggle-cmp]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(state.cmp.indexOf(parseInt(b.getAttribute("data-toggle-cmp"), 10)) >= 0));
        });
        /* Courbe de cumul : un seul SVG par discipline, les séries d'années non choisies sont masquées */
        [cfg.year].concat(cfg.compare).forEach(function (y) {
            var on = y === cfg.year || state.cmp.indexOf(y) >= 0;
            q(".cy-" + y).forEach(function (el) { setVisible(el, on); });
        });
        updateFiltersSummary();
        q("[data-month-measure]").forEach(function (el) {
            setVisible(el, el.getAttribute("data-month-measure") === state.monthMeasure);
        });
        q("[data-month-toggle]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-month-toggle") === state.monthMeasure));
        });
        q("[data-career-measure]").forEach(function (el) {
            setVisible(el, el.getAttribute("data-career-measure") === state.careerMeasure);
        });
        q("[data-career-toggle]").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-career-toggle") === state.careerMeasure));
        });
        renderScatter();
        renderRibbon();
        filterFlights();
        applyHighlight();
        updateGo();
        updateScrollHints();
        if (hero && heroMain) hero.setAttribute("data-main", { parapente: "p", paramoteur: "m" }[state.disc] || heroMain);
        if (typeof renderMap === "function") renderMap();
        updateReplayButtons();
    }

    /* ---------- Hero : teinte du halo selon la discipline choisie (data-main) ---------- */
    var hero = document.getElementById("top");
    var heroMain = hero && hero.getAttribute("data-main");

    /* Texte du bouton « Filtres » (téléphone) : discipline, puis années comparées. Ex. « Tout · 2025 » */
    function updateFiltersSummary() {
        var sum = document.getElementById("filters-sum");
        if (!sum) return;
        var disc = q("[data-set-disc]").filter(function (b) { return b.getAttribute("data-set-disc") === state.disc; })[0];
        var parts = [disc ? disc.textContent : ""];
        cfg.compare.forEach(function (y) { if (state.cmp.indexOf(y) >= 0) parts.push(String(y)); });
        sum.textContent = parts.join(" · ");
    }

    bindButton("[data-set-disc]", function () {
        if (this.disabled) return;
        state.disc = this.getAttribute("data-set-disc");
        applyState();
    });

    bindButton("[data-toggle-cmp]", function () {
        var y = parseInt(this.getAttribute("data-toggle-cmp"), 10);
        var i = state.cmp.indexOf(y);
        if (i >= 0) state.cmp.splice(i, 1); else state.cmp.push(y);
        applyState();
    });

    bindButton("[data-month-toggle]", function () {
        state.monthMeasure = this.getAttribute("data-month-toggle");
        applyState();
    });

    bindButton("[data-career-toggle]", function () {
        state.careerMeasure = this.getAttribute("data-career-toggle");
        applyState();
    });

    /* ---------- Équivalences du hero : un bouton fait défiler les phrases (aucune rotation automatique) ---------- */
    q("[data-eq]").forEach(function (box) {
        var items = q(".eq-item", box);
        var button = box.querySelector("[data-eq-next]");
        if (!button || items.length < 2) return;
        button.hidden = false;
        button.__eqItems = items;
        button.__eqCurrent = 0;
    });
    /* Un seul jeu d'écouteurs pour tous les boutons d'équivalence (un par discipline) */
    bindButton("[data-eq-next]", function () {
        var items = this.__eqItems;
        if (!items) return;
        items[this.__eqCurrent].hidden = true;
        items[this.__eqCurrent].classList.remove("eq-in");
        this.__eqCurrent = (this.__eqCurrent + 1) % items.length;
        items[this.__eqCurrent].hidden = false;
        items[this.__eqCurrent].classList.add("eq-in");
    });

    /* ---------- Une seule infobulle par élément ----------
       Chaque forme SVG porte un <title> (infobulle native du navigateur, utile sans JavaScript).
       Avec JavaScript, l'infobulle personnalisée prend le relais : on retire les <title> pour éviter
       le doublon et on reporte le texte dans data-tip (survol) et aria-label (lecteurs d'écran). */
    var tipDetails = (function () {      /* textes complémentaires des barres de mois (« Sites : … · Voiles : … »), dédupliqués côté Python */
        var el = document.getElementById("tip-details");
        try { return el ? JSON.parse(el.textContent) : []; } catch (e) { return []; }
    })();
    q(".chart title").forEach(function (title) {
        var shape = title.parentNode;
        var text = title.textContent;
        if (shape.tagName.toLowerCase() === "svg") { shape.removeChild(title); return; }   /* titre global : aria-label le porte déjà */
        if (shape.classList.contains("dot") && shape.closest(".chart-cum")) {   /* cumul : le réticule remplace ces infobulles */
            shape.removeChild(title);
            shape.setAttribute("aria-hidden", "true");
            return;
        }
        if (shape.hasAttribute("data-det") && tipDetails[+shape.getAttribute("data-det")]) text += " · " + tipDetails[+shape.getAttribute("data-det")];
        if (!shape.getAttribute("data-tip")) shape.setAttribute("data-tip", text);
        if (!shape.hasAttribute("aria-label")) shape.setAttribute("aria-label", shape.getAttribute("data-tip"));
        if (shape.hasAttribute("tabindex") && !shape.hasAttribute("role")) shape.setAttribute("role", "img");
        shape.removeChild(title);
    });

    /* ---------- Infobulles enrichies des graphiques SVG ---------- */
    var chartTip = document.createElement("div");
    chartTip.className = "chart-tooltip";
    chartTip.setAttribute("role", "tooltip");
    chartTip.hidden = true;
    document.body.appendChild(chartTip);
    var activeTip = null;     /* élément dont l'infobulle est affichée */
    var pinnedTip = null;     /* au toucher : infobulle épinglée près de l'élément (un toucher ailleurs la ferme) */
    var lastPointer = "mouse";
    /* Contenu structuré : { title, pills: ["parapente", ...], rows: [[étiquette, valeur], ...], hint }.
       Graphiques : on découpe le texte du <title> (convention de report_charts.py) : « Titre : ligne · ligne · Étiquette : valeur ».
       Une dernière phrase après un point (« . Ouvre la vue de la zone. ») devient une aide en petit.
       Calendriers : calendarTip() le construit depuis #flights-data (aucun <title> par case dans le HTML). */
    function parseTip(text) {
        var out = { title: text, pills: [], rows: [], hint: "" };
        var cut = text.indexOf(" : ");
        var rest = "";
        if (cut > 0) { out.title = text.slice(0, cut); rest = text.slice(cut + 3); }
        else if (text.indexOf(" · ") > 0) { var first = text.split(" · "); out.title = first.shift(); rest = first.join(" · "); }
        var sentence = rest.search(/\.\s+(?=[A-ZÉÈÀ])/);
        if (sentence > 0) { out.hint = rest.slice(sentence + 1).trim(); rest = rest.slice(0, sentence); }
        if (rest) rest.split(" · ").forEach(function (part) {
            var kv = part.indexOf(" : ");
            if (kv > 0) out.rows.push([part.slice(0, kv), part.slice(kv + 3)]);
            else if (DISC_PILL_CLASS[part]) out.pills.push(part);
            else out.rows.push(labelled(part));
        });
        return out;
    }
    /* « 8 sites », « 13 vols (9 % ) », « 1 h 05 min » : on recolle l'étiquette qui manque */
    function labelled(part) {
        var m = part.match(/^(\d[\d\u00a0 ]*)\u00a0?(vols?|sites?)(?: (\(.*\)))?$/);
        if (m) return [m[2].charAt(0).toUpperCase() + m[2].replace(/s$/, "").slice(1) + "s", (m[1] + (m[3] ? " " + m[3] : "")).trim()];   /* étiquette toujours au pluriel : « Vols : 0 » */
        if (/^\d+(,\d+)?[\u00a0 ]h$/.test(part) || /^(\d+[\u00a0 ]h([\u00a0 ]\d+[\u00a0 ]min)?|\d+[\u00a0 ]min)$/.test(part)) return ["Durée", part];
        return ["", part];
    }
    var DISC_PILL_CLASS = { parapente: "pill-p", paramoteur: "pill-m" };
    function countList(flights, key) {       /* « Magnac Lavalette (3), Les Mottes (1) », du plus fréquent au moins fréquent */
        var counts = {}, names = [];
        flights.forEach(function (f) {
            if (!f[key]) return;
            if (!counts[f[key]]) { counts[f[key]] = 0; names.push(f[key]); }
            counts[f[key]]++;
        });
        names.sort(function (a, b) { return counts[b] - counts[a]; });
        return names.map(function (n) { return n + " (" + counts[n] + ")"; }).join(", ");
    }
    /* Infobulle d'une case de calendrier : discipline affichée (state.disc), vols du jour. */
    function calendarTip(el) {
        var iso = el.__iso, out = { title: longDate(iso), pills: [], rows: [], hint: "" };
        var flights = flightsOn(iso, state.disc);
        if (!flights.length) {
            if (!el.classList.contains("cal-future")) out.rows.push(["", "Pas de vol ce jour-là"]);
            return out;
        }
        var minutes = flights.reduce(function (sum, f) { return sum + (f.mn || 0); }, 0);
        ["parapente", "paramoteur"].forEach(function (d) {
            if (flights.some(function (f) { return f.disc === d; })) out.pills.push(d);
        });
        out.rows.push(["Vols", String(flights.length)]);
        if (minutes) out.rows.push(["Durée", fmtDuration(minutes)]);
        var sites = countList(flights, "s"), wings = countList(flights, "w");
        if (sites) out.rows.push([sites.indexOf(",") > 0 ? "Sites" : "Site", sites]);
        if (wings) out.rows.push([wings.indexOf(",") > 0 ? "Voiles" : "Voile", wings]);
        return out;
    }
    /* Nom accessible d'une case de calendrier (calculé au focus) : « Samedi 3 janvier 2026 : 2 vols · 1 h 05 min · parapente » */
    function calendarLabel(el) {
        var c = calendarTip(el), parts = [];
        c.rows.forEach(function (r) { parts.push(r[0] === "Vols" ? plural(+r[1], "vol") : r[0] === "Durée" ? r[1] : r[0] ? "" : r[1]); });
        return c.title + " : " + parts.concat(c.pills).filter(Boolean).join(" · ");
    }
    function tipContent(el) {
        if (el.__iso) return calendarTip(el);
        if (el.__mx) return slotTip(el);
        if (el.__fl) return scatterTip(el);
        if (el.__rb) return rbTip(el);
        var message = el.getAttribute("data-tip");
        return message ? parseTip(message) : null;
    }
    function fillTip(c) {
        chartTip.textContent = "";
        chartTip.appendChild(mk("div", "tip-title", c.title));
        if (c.pills.length) {
            var pills = mk("div", "tip-pills");
            c.pills.forEach(function (d) { pills.appendChild(mk("span", "pill " + (DISC_PILL_CLASS[d] || "pill-p"), d)); });
            chartTip.appendChild(pills);
        }
        c.rows.forEach(function (r) {
            var row = mk("div", r[0] ? "tip-row" : "tip-row tip-plain");
            if (r[0]) row.appendChild(mk("span", "tip-k", r[0]));
            row.appendChild(mk("span", "tip-v", r[1]));
            chartTip.appendChild(row);
        });
        if (c.hint) chartTip.appendChild(mk("div", "tip-hint", c.hint));
    }
    /* Affiche un contenu { title, pills, rows, hint } près du point (x, y) de la fenêtre, sans sortir de l'écran */
    function placeTip(content, x, y) {
        fillTip(content);
        chartTip.hidden = false;
        var pad = 12;
        var rect = chartTip.getBoundingClientRect();
        chartTip.style.left = Math.max(pad, Math.min(x + 14, window.innerWidth - rect.width - pad)) + "px";
        chartTip.style.top = Math.max(pad, Math.min(y + 14, window.innerHeight - rect.height - pad)) + "px";
    }
    function showChartTip(el, x, y) {
        var content = el && tipContent(el);
        if (!content) return;
        activeTip = el;
        placeTip(content, x, y);
    }
    function showTipNear(el) {
        var rect = el.getBoundingClientRect();
        showChartTip(el, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    function hideChartTip(el) {
        if (!el || activeTip === el) {
            var gone = activeTip;
            activeTip = null;
            pinnedTip = null;
            chartTip.hidden = true;
            if (gone && gone.__hide) gone.__hide();     /* élément à décor propre (cumul : réticule) */
        }
    }
    /* Souris : l'infobulle suit le pointeur. Toucher : rien au survol, voir le « click » plus bas (infobulle épinglée). */
    document.addEventListener("pointerdown", function (e) {
        lastPointer = e.pointerType || "mouse";
        if (lastPointer === "touch" && pinnedTip && !pinnedTip.contains(e.target)) hideChartTip(pinnedTip);
    }, true);
    document.addEventListener("pointerover", function (e) {
        if (e.pointerType === "touch") return;
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el) showChartTip(el, e.clientX, e.clientY);
    });
    document.addEventListener("pointermove", function (e) {
        if (activeTip && !pinnedTip && e.pointerType !== "touch") showChartTip(activeTip, e.clientX, e.clientY);
    });
    document.addEventListener("pointerout", function (e) {
        if (e.pointerType === "touch") return;
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el && !el.contains(e.relatedTarget)) hideChartTip(el);
    });
    document.addEventListener("focusin", function (e) {
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el && el !== pinnedTip) showTipNear(el);
    });
    document.addEventListener("focusout", function (e) {
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el) hideChartTip(el);
    });

    /* ---------- Tableaux triables ---------- */
    q("table.sortable th[data-sort]").forEach(function (th) {
        th.setAttribute("tabindex", "0");
        function sort() {
            var table = th.closest("table");
            var tbody = table.tBodies[0];
            var idx = th.cellIndex;
            var numeric = th.getAttribute("data-sort") === "num";
            var dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
            q("th", table).forEach(function (h) { h.removeAttribute("aria-sort"); });
            th.setAttribute("aria-sort", dir);
            var rows = Array.prototype.slice.call(tbody.rows);
            rows.sort(function (a, b) {
                var x = a.cells[idx].getAttribute("data-v") || "";
                var y = b.cells[idx].getAttribute("data-v") || "";
                var r;
                if (numeric) {
                    x = parseFloat(x); y = parseFloat(y);
                    x = isNaN(x) ? -Infinity : x; y = isNaN(y) ? -Infinity : y;
                    r = x === y ? 0 : (x < y ? -1 : 1);
                } else {
                    r = x.toLowerCase().localeCompare(y.toLowerCase(), "fr");
                }
                return dir === "ascending" ? r : -r;
            });
            rows.forEach(function (row) { tbody.appendChild(row); });
        }
        th.addEventListener("click", sort);
        th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
    });

    /* ---------- Barres intégrées (tableaux .bars) : « Vols » et « Temps de vol », proportionnelles au maximum de la colonne.
       La largeur (--w, entre 0 et 1) est portée par la cellule : elle reste juste après un tri. Couleur : voir report.css. */
    q("table.bars").forEach(function (table) {
        Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, i) {
            var label = th.textContent.trim();
            if (label !== "Vols" && label !== "Temps de vol") return;
            var cells = Array.prototype.map.call(table.tBodies[0].rows, function (r) { return r.cells[i]; });
            var max = 0;
            cells.forEach(function (c) { max = Math.max(max, parseFloat(c.getAttribute("data-v")) || 0); });
            if (max <= 0) return;
            cells.forEach(function (c) {
                var v = parseFloat(c.getAttribute("data-v")) || 0;
                c.classList.add("bar");
                c.style.setProperty("--w", (v / max).toFixed(3));
            });
        });
    });

    /* ---------- Liste des vols : filtre texte + discipline ---------- */
    var search = document.getElementById("q");
    var monthSelect = document.getElementById("flight-month");
    var resetFilters = document.getElementById("reset-flight-filters");
    var info = document.getElementById("flights-info");
    /* Les filtres croisés (site, voile, mois, jour, façon : objet xf, voir « Filtres croisés (T56) ») s'ajoutent à la
       discipline et à la recherche texte. Valeurs d'une ligne lues dans ses cellules (data-v) : rien de plus dans le HTML. */
    function rowValues(tr) {
        if (!tr.__xf) {
            var c = tr.cells, v = function (i) { return c[i].getAttribute("data-v") || ""; };
            tr.__xf = { site: v(3), wing: v(4) || XF_NO_WING, mode: v(2) === "None" ? "" : v(2), month: tr.getAttribute("data-month"), weekday: String((+v(0) - 1) % 7) };   /* ordinal Python : 1 = lundi */
        }
        return tr.__xf;
    }
    function filterFlights() {
        var rows = q("#flights tbody tr");
        if (!rows.length) return;
        var term = search ? search.value.trim().toLowerCase() : "";
        var shown = 0;
        rows.forEach(function (tr) {
            var okDisc = state.disc === "all" || tr.getAttribute("data-disc") === state.disc;
            var okText = !term || tr.getAttribute("data-text").indexOf(term) >= 0;
            tr.hidden = !(okDisc && okText && flightMatches(rowValues(tr)));
            if (!tr.hidden) shown++;
        });
        xfShown = shown;
        xfTotal = rows.length;
        if (info) info.textContent = shown + (shown > 1 ? " vols affichés" : " vol affiché") + " sur " + rows.length;
        renderChips();
    }
    var backToMonths = document.getElementById("back-to-months");
    /* Un clic sur une barre de mois pose (ou retire) le filtre du mois ; on défile jusqu'au tableau seulement quand il est posé. */
    function setMonthFilter(value, scroll) {
        var on = !!value && xf.month !== String(value);
        if (on) xf.month = String(value); else delete xf.month;
        xfRefresh();
        if (on && scroll) {
            var flights = document.getElementById("vols");
            if (flights) flights.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }
    if (search) search.addEventListener("input", filterFlights);
    if (monthSelect) monthSelect.addEventListener("change", function () {
        if (monthSelect.value) xf.month = monthSelect.value; else delete xf.month;
        xfRefresh();
    });
    /* « Effacer les filtres » : recherche texte et filtres croisés (la discipline choisie en haut de page reste) */
    if (resetFilters) resetFilters.addEventListener("click", function () {
        if (search) search.value = "";
        clearFilters();
    });
    /* Clic (souris ou toucher) dans les graphiques :
       - jour de vol du calendrier : fiche du jour (souris comme toucher, sans infobulle au toucher) ;
       - au toucher, autre élément à infobulle : infobulle épinglée ; sur une barre de mois, un second toucher
         sur la même barre applique le filtre du tableau ;
       - à la souris, barre de mois : filtre du tableau. */
    document.addEventListener("click", function (e) {
        if (!e.target.closest) return;
        var mapItem = mapBox && mapTarget(e);
        if (mapItem) {
            activateMapItem(mapItem);
            return;
        }
        var dot = e.target.closest(".sc-pt, .rb-c");
        if (dot) {
            scatterActivate(dot);
            return;
        }
        var day = e.target.closest(".days > [data-date]");
        if (day) {
            hideChartTip();
            openDaySheet(day.getAttribute("data-date"), day);
            return;
        }
        var tipEl = e.target.closest("[data-tip]");
        if (tipEl && lastPointer === "touch") {
            if (!(tipEl.hasAttribute("data-filter-month") && pinnedTip === tipEl)) {
                pinnedTip = null;
                showTipNear(tipEl);
                pinnedTip = tipEl;
                return;
            }
            hideChartTip(tipEl);
        }
        var bar = e.target.closest("[data-filter-month]");
        if (bar) setMonthFilter(bar.getAttribute("data-filter-month"), true);
    });
    /* iOS Safari n'envoie un « click » qu'aux éléments qui semblent cliquables : un écouteur vide sur chaque graphique suffit */
    q("svg.chart").forEach(function (svg) { svg.addEventListener("click", function () {}); });
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var dot = e.target.closest && e.target.closest(".sc-pt, .rb-c");
        if (dot) {
            e.preventDefault();
            scatterActivate(dot, true);
            return;
        }
        var day = e.target.closest && e.target.closest(".days > [data-date]");
        if (day) {
            e.preventDefault();
            hideChartTip();
            openDaySheet(day.getAttribute("data-date"), day);
            return;
        }
        var mapItem = e.target.closest && e.target.closest("[data-map] circle[data-site], [data-map] circle[data-zone]");
        if (mapItem) {
            e.preventDefault();
            activateMapItem(mapItem);
            return;
        }
        var bar = e.target.closest && e.target.closest("[data-filter-month]");
        if (!bar) return;
        e.preventDefault();
        setMonthFilter(bar.getAttribute("data-filter-month"), true);
    });

    /* ---------- Thème et impression ---------- */
    var themeBtn = document.getElementById("theme");
    if (themeBtn) {
        themeBtn.addEventListener("click", function () {
            var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            root.setAttribute("data-theme", next);
            try { localStorage.setItem("rapport-theme", next); } catch (e) { /* stockage indisponible */ }
            updateThemeLabel();
        });
        updateThemeLabel();
    }
    function updateThemeLabel() {
        if (themeBtn) themeBtn.textContent = root.getAttribute("data-theme") === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
    }
    /* ---------- Raccourcis clavier : 1 2 3 = discipline, t = thème, ? = liste des raccourcis ---------- */
    var SHORTCUTS = [["1", "Tout"], ["2", "Parapente"], ["3", "Paramoteur"], ["t", "Changer de thème clair / sombre"],
                     ["← →", "Naviguer dans le calendrier"], ["Échap", "Fermer un panneau"], ["?", "Afficher cette aide"]];
    var SHORTCUT_DISC = { "1": "all", "2": "parapente", "3": "paramoteur" };
    function renderHelp() {
        sheet.kicker.textContent = "Aide";
        sheet.nav.hidden = true;
        sheet.title.textContent = "Raccourcis clavier";
        sheet.summary.textContent = "";
        sheet.body.textContent = "";
        var dl = mk("dl", "kbd-list");
        SHORTCUTS.forEach(function (s) {
            dl.appendChild(mk("dt", "", "")).appendChild(mk("kbd", "", s[0]));
            dl.appendChild(mk("dd", "", s[1]));
        });
        sheet.body.appendChild(dl);
    }
    function openHelp(from) {
        openSheet(from);
        renderHelp();
        sheet.panel.focus();
    }
    document.addEventListener("keydown", function (e) {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target, tag = t && t.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
        if (sheet && !sheet.backdrop.hidden) return;      /* un panneau est ouvert : seul Échap agit (géré par le panneau) */
        if ((rp && !rp.el.hidden) || (rc && !rc.el.hidden)) return;      /* rejeu ou récap ouvert : il gère ses propres touches */
        var k = e.key;
        if (SHORTCUT_DISC.hasOwnProperty(k)) {
            var d = SHORTCUT_DISC[k];
            var btn = q("[data-set-disc]").filter(function (b) { return b.getAttribute("data-set-disc") === d; })[0];
            if (!btn || btn.disabled) return;
            state.disc = d;
            applyState();
        } else if (k === "t" || k === "T") {
            if (themeBtn) themeBtn.click();
        } else if (k === "?") {
            e.preventDefault();
            openHelp(document.activeElement);
        }
    });

    /* ---------- Barre et sommaire : hauteur réelle, volet « Filtres », menus, bouton Haut, section en cours ---------- */
    var bar = document.querySelector(".bar");
    var filtersBtn = document.getElementById("filters-btn");
    var filtersPanel = document.getElementById("bar-ctl");
    function updateBarHeight() {
        if (bar) root.style.setProperty("--bar-h", Math.round(bar.getBoundingClientRect().height) + "px");
    }
    updateBarHeight();
    if (bar && "ResizeObserver" in window) new ResizeObserver(updateBarHeight).observe(bar);
    else window.addEventListener("resize", updateBarHeight);

    function panelOpen() { return !!(bar && bar.classList.contains("open")); }
    function setPanel(open, returnFocus) {
        if (!bar || !filtersBtn) return;
        bar.classList.toggle("open", open);
        filtersBtn.setAttribute("aria-expanded", String(open));
        if (!open && returnFocus) filtersBtn.focus();
    }
    if (bar && filtersBtn && filtersPanel) {
        bindButton("#filters-btn", function () { closeMenus(); setPanel(!panelOpen(), false); });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panelOpen()) {
                var inside = bar.contains(document.activeElement);
                setPanel(false, inside);
            }
        });
        /* Toucher ou cliquer ailleurs ferme le volet (pointerdown : fonctionne aussi au toucher sur iOS) */
        document.addEventListener("pointerdown", function (e) {
            if (panelOpen() && !filtersPanel.contains(e.target) && !filtersBtn.contains(e.target)) setPanel(false, false);
        });
        /* Le focus quitte le volet au clavier (Tab) : on le ferme, sans piéger le focus */
        filtersPanel.addEventListener("focusout", function (e) {
            var next = e.relatedTarget;
            if (next && panelOpen() && !filtersPanel.contains(next) && next !== filtersBtn) setPanel(false, false);
        });
        if (window.matchMedia) {
            var narrow = window.matchMedia("(max-width: 1180px)");
            var onChange = function () { if (!narrow.matches) setPanel(false, false); };
            if (narrow.addEventListener) narrow.addEventListener("change", onChange); else if (narrow.addListener) narrow.addListener(onChange);
        }
    }

    /* Menus déroulants de la barre (sommaire, « ⋯ ») : bouton aria-expanded, flèches, Échap ferme et rend le
       focus au bouton, Tab ou un clic ailleurs ferme sans piéger le focus. Un seul menu (ou le volet Filtres) ouvert à la fois. */
    var menus = [];
    function closeMenus() { menus.forEach(function (m) { m.close(false); }); }
    function makeMenu(btn, menu, firstSel) {
        var m = { btn: btn, menu: menu };
        function items() { return Array.prototype.slice.call(menu.querySelectorAll("a, button")); }
        function focusAt(i) { var it = items(); it[(i + it.length) % it.length].focus(); }
        m.open = function () {
            closeMenus();
            setPanel(false, false);
            menu.hidden = false;
            // barre pas encore collée en haut : le menu ne doit pas dépasser le bas de l'écran
            menu.style.maxHeight = Math.max(160, window.innerHeight - btn.getBoundingClientRect().bottom - 16) + "px";
            btn.setAttribute("aria-expanded", "true");
            (menu.querySelector(firstSel || "a, button")).focus();
        };
        m.close = function (returnFocus) {
            if (menu.hidden) return;
            menu.hidden = true;
            btn.setAttribute("aria-expanded", "false");
            if (returnFocus) btn.focus();
        };
        btn.addEventListener("click", function () { if (menu.hidden) m.open(); else m.close(true); });
        menu.addEventListener("keydown", function (e) {
            var it = items(), i = it.indexOf(document.activeElement);
            if (e.key === "ArrowDown") { e.preventDefault(); focusAt(i + 1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(i - 1); }
            else if (e.key === "Escape") { e.preventDefault(); m.close(true); }
            else if (e.key === "Tab") m.close(false);
        });
        menus.push(m);
        return m;
    }
    document.addEventListener("pointerdown", function (e) {
        menus.forEach(function (m) { if (!m.menu.hidden && !m.menu.contains(e.target) && !m.btn.contains(e.target)) m.close(false); });
    });

    /* Sommaire : le menu reprend la liste de la colonne latérale (une seule liste dans le HTML) */
    var tocList = document.querySelector(".toc-list");
    var tocBtn = document.getElementById("toc-btn"), tocMenu = document.getElementById("toc-menu"), tocCur = document.getElementById("toc-cur");
    var tocMenuObj = null;
    if (tocList && tocBtn && tocMenu) {
        tocMenu.appendChild(tocList.cloneNode(true));
        tocMenuObj = makeMenu(tocBtn, tocMenu, "a[aria-current=true]");
        tocMenu.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) tocMenuObj.close(false); });
    }
    var moreBtn = document.getElementById("more-btn"), moreMenu = document.getElementById("more-menu");
    if (moreBtn && moreMenu) {
        var moreMenuObj = makeMenu(moreBtn, moreMenu);
        moreMenu.addEventListener("click", function (e) {
            var item = e.target.closest && e.target.closest("button");
            if (!item) return;
            moreMenuObj.close(item.id === "theme");        /* le panneau d'aide ou l'impression gardent le focus ; le thème le rend au bouton */
            if (item.id === "print") window.print();
            else if (item.id === "help-btn") openHelp(moreBtn);
        });
    }
    /* Bouton « Revenir en haut » : visible après un écran de défilement */
    var topBtn = document.getElementById("back-top");
    if (topBtn) {
        var updateTop = function () {
            var show = window.scrollY > window.innerHeight;
            if (topBtn.hidden === show) topBtn.hidden = !show;
        };
        window.addEventListener("scroll", updateTop, { passive: true });
        window.addEventListener("resize", updateTop);
        updateTop();
        topBtn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    /* Section en cours : lien actif de la colonne, entrée marquée aria-current du menu, libellé du bouton sommaire */
    var tocLinks = q(".toc a, .toc-menu a");
    function setCurrent(id) {
        var label = "";
        tocLinks.forEach(function (a) {
            var on = a.getAttribute("href") === "#" + id;
            a.classList.toggle("active", on);
            if (on) { a.setAttribute("aria-current", "true"); label = a.textContent; } else a.removeAttribute("aria-current");
        });
        if (label && tocCur) tocCur.textContent = label;
    }
    if (tocLinks.length) setCurrent(tocLinks[0].getAttribute("href").slice(1));
    if ("IntersectionObserver" in window) {
        var tocObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) { if (entry.isIntersecting) setCurrent(entry.target.id); });
        }, { rootMargin: "-30% 0px -60% 0px" });
        q("main section[id]").forEach(function (s) { tocObserver.observe(s); });
    }

    /* ---------- Graphiques plus larges que l'écran : indication « fais glisser » ---------- */
    function updateScrollHints() {
        q(".chart-scroll").forEach(function (el) {
            el.classList.toggle("can-scroll", el.scrollWidth > el.clientWidth + 4);
        });
    }
    q(".chart-scroll").forEach(function (el) {
        el.addEventListener("scroll", function () { if (el.scrollLeft > 8) el.classList.add("scrolled"); }, { passive: true });
    });
    window.addEventListener("resize", updateScrollHints);

    /* ---------- Un seul arrêt de tabulation par graphique (« roving tabindex ») ----------
       Tab entre dans le graphique sur une seule case ou barre ; les flèches, Début et Fin déplacent le focus
       (l'infobulle suit, voir focusin). Calendriers : la case qui a tabindex="0" est choisie en Python,
       les jours sont les enfants de .days, dans l'ordre des dates. Annuel (semaines en colonnes) :
       gauche / droite = semaine, haut / bas = jour ; mini-mois (semaines en lignes) : l'inverse, comme à l'écran. */
    function rove(group, items, hStep, vStep) {
        if (!items.length) return;
        var current = items.filter(function (el) { return el.getAttribute("tabindex") === "0"; })[0] || items[0];
        items.forEach(function (el) {
            el.setAttribute("tabindex", el === current ? "0" : "-1");
            if (!el.hasAttribute("role")) el.setAttribute("role", "img");
        });
        function moveTo(el) {
            items.forEach(function (it) { if (it !== el && it.getAttribute("tabindex") === "0") it.setAttribute("tabindex", "-1"); });
            el.setAttribute("tabindex", "0");
        }
        group.__roveTo = moveTo;   /* utilisé par la fiche du jour pour suivre le jour affiché */
        group.addEventListener("focusin", function (e) { if (items.indexOf(e.target) >= 0) moveTo(e.target); });
        group.addEventListener("keydown", function (e) {
            var i = items.indexOf(e.target);
            if (i < 0) return;
            var steps = { ArrowLeft: -hStep, ArrowRight: hStep, ArrowUp: -vStep, ArrowDown: vStep };
            var j = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (e.key in steps ? i + steps[e.key] : null);
            if (j === null) return;
            e.preventDefault();
            j = Math.max(0, Math.min(items.length - 1, j));
            /* élément masqué (carte : site de l'autre discipline) : on continue dans le même sens */
            var dir = e.key === "Home" ? 1 : e.key === "End" ? -1 : (j < i ? -1 : 1);
            while (items[j] && !items[j].getClientRects().length) j += dir;
            if (!items[j]) return;
            moveTo(items[j]);
            items[j].focus();
        });
    }
    /* Cases de jour : aucun <title> ni data-date dans le HTML (poids). La date vient de la position (1er janvier + i), l'infobulle
       de calendarTip() ; data-tip ne sert qu'à désigner l'élément. Le nom accessible est calculé au focus (voir plus bas). */
    function calendarDays(scope) {
        var days = q(".days > *", scope);
        days.forEach(function (el, i) {
            var d = new Date(cfg.year, 0, 1 + i);
            el.__iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
            el.setAttribute("data-tip", "jour");
            if (/\bcal-[pmb]\d/.test(el.getAttribute("class") || "")) el.setAttribute("data-date", el.__iso);   /* jour de vol : cliquable */
        });
        return days;
    }
    document.addEventListener("focusin", function (e) {
        if (e.target.__iso) e.target.setAttribute("aria-label", calendarLabel(e.target));
    }, true);

    /* ---------- Séries et régularité (F5) : une tuile .rt-btn allume dans le calendrier les jours de data-from à data-to ----------
       Un jour = sa position dans .days (1er janvier + i, comme calendarDays) : vaut aussi pour les jours sans vol.
       Une seule tuile allumée à la fois ; second clic ou Échap : tout s'éteint. */
    function dayIndex(iso) {
        var p = iso.split("-");
        return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(cfg.year, 0, 1)) / 864e5);
    }
    function lightDays(btn) {
        var from = btn ? dayIndex(btn.getAttribute("data-from")) : 1, to = btn ? dayIndex(btn.getAttribute("data-to")) : 0;
        q(".rt-btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        q(".days > .cal-hl").forEach(function (c) { c.classList.remove("cal-hl"); });
        if (!btn) return;
        q(".chart-calendar, .cal-mini", btn.closest(".v") || document).forEach(function (cal) {
            q(".days > *", cal).forEach(function (c, i) { if (i >= from && i <= to) c.classList.add("cal-hl"); });
        });
    }
    q(".rt-btn").forEach(function (btn) {
        btn.addEventListener("click", function () { lightDays(btn.getAttribute("aria-pressed") === "true" ? null : btn); });
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && q(".rt-btn[aria-pressed=true]").length) lightDays(null);
    });
    q(".chart-calendar").forEach(function (svg) { rove(svg, calendarDays(svg), 7, 1); });
    q(".cal-mini").forEach(function (cal) { rove(cal, calendarDays(cal), 1, 7); });
    q("svg.chart").forEach(function (svg) {
        if (svg.closest(".cal-mini") || svg.classList.contains("chart-calendar")) return;
        var items = q("[tabindex]", svg);
        /* Barres empilées : 2 segments par colonne (parapente puis paramoteur) ; gauche / droite = colonne voisine (même segment),
           haut / bas = segment du dessus / du dessous ; Début et Fin = première et dernière barre */
        if (items.length > 1) { if (svg.classList.contains("chart-stack")) rove(svg, items, 2, -1); else rove(svg, items, 1, 1); }
    });

    /* ---------- Cumul interactif (I6) : réticule, valeur de chaque année, jalons ----------
       Un SVG par discipline (svg.chart-cum, data-cum="gauche,largeur,haut,hauteur,ymax" en px et heures).
       Aucune donnée dupliquée : les valeurs se lisent dans l'attribut d des courbes (M x,y H x V y H x V y ... : escalier).
       Un seul arrêt de tabulation : le SVG. Flèches gauche / droite = 1 jour (Maj : 1 mois), Page préc. / suiv. = 1 mois,
       Début / Fin = 1er janvier / 31 décembre, haut / bas = jalon précédent / suivant (les losanges ne sont donc pas
       des arrêts de plus), Entrée ou Espace = fiche du jour d'un jalon, Échap = masque le réticule.
       Souris : réticule qui suit le pointeur, losange = jalon. Toucher : un toucher place le réticule et épingle l'infobulle,
       un second sur le même jalon ouvre la journée (le défilement de la page et du graphique reste libre). */
    var cumLive = null;     /* zone aria-live discrète (lecteurs d'écran) */
    function cumAnnounce(text) {
        if (!cumLive) {
            cumLive = mk("div", "sr-only");
            cumLive.setAttribute("aria-live", "polite");
            document.body.appendChild(cumLive);
        }
        cumLive.textContent = text;
    }
    function svgEl(tag, attrs) {
        var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
        return el;
    }
    function monthDays(year, m) { return new Date(year, m + 1, 0).getDate(); }
    function initCumul(svg) {
        var geo = svg.getAttribute("data-cum").split(",").map(Number);
        var left = geo[0], pw = geo[1], top = geo[2], ph = geo[3], ymax = geo[4];
        var vb = svg.viewBox.baseVal;
        /* jours de l'année du rapport : dm[i] mois (0-11), dd[i] jour ; first[m] = rang du 1er du mois */
        var dm = [], dd = [], first = [];
        for (var m = 0; m < 12; m++) {
            first.push(dm.length);
            for (var d = 1; d <= monthDays(cfg.year, m); d++) { dm.push(m); dd.push(d); }
        }
        function pxOf(year, i) { return left + pw * (dm[i] + dd[i] / monthDays(year, dm[i])) / 12; }   /* fin de journée, comme report_data.x_of_date */
        /* courbes (années de comparaison d'abord dans le HTML : on trie par style, année du rapport en tête) */
        var curves = q("path.line", svg).map(function (p) {
            var c = { el: p, year: +/cy-(\d+)/.exec(p.getAttribute("class"))[1], style: +/sk(\d)/.exec(p.getAttribute("class"))[1], xs: [], ys: [], end: 0 };
            var x = 0, y = 0;
            (p.getAttribute("d").match(/[MHV][^MHV]*/g) || []).forEach(function (cmd) {
                var v = cmd.slice(1).trim();
                if (cmd.charAt(0) === "H") { x = +v; c.end = x; return; }
                if (cmd.charAt(0) === "M") { var xy = v.split(","); x = +xy[0]; y = +xy[1]; } else y = +v;
                c.xs.push(x); c.ys.push(y);
            });
            return c;
        }).sort(function (a, b) { return a.style - b.style; });
        function yAt(c, i) {      /* ordonnée (px) de l'escalier au jour i, null au-delà de la fin de la courbe */
            var px = pxOf(c.year, i);
            if (px > c.end + 0.3) return null;
            var k = 0;
            while (k + 1 < c.xs.length && c.xs[k + 1] <= px + 0.3) k++;
            return c.ys[k];
        }
        var hours = function (y) { return Math.round(Math.max(0, (top + ph - y) / ph * ymax) * 10) / 10; };
        function hLabel(h) { return fmtNum(h, 1) + NBSP + "h"; }
        var main = curves.filter(function (c) { return c.style === 0; })[0];
        if (!main) return;
        function idxOfPx(px) {      /* jour dont la fin de journée est la plus proche de l'abscisse px */
            var t = (px - left) / pw * 12, mo = Math.max(0, Math.min(11, Math.floor(t)));
            var day = Math.max(1, Math.min(monthDays(cfg.year, mo), Math.round((t - mo) * monthDays(cfg.year, mo))));
            return first[mo] + day - 1;
        }
        var lastIdx = idxOfPx(main.end - 0.3);   /* « aujourd'hui » ou fin d'année */
        /* jalons de la discipline de cette variante, regroupés par jour : jal[rang du jour] = { idx, iso, titles, gold, x, y } */
        var holder = svg.closest("[data-v-disc]"), disc = holder && holder.getAttribute("data-v-disc");
        var jal = {}, marks = [];
        q('[data-v-disc="' + disc + '"] .tl-item').forEach(function (li) {
            var time = li.querySelector("time"), title = li.querySelector(".tl-title");
            if (!time || !title || time.getAttribute("datetime").slice(0, 4) !== String(cfg.year)) return;
            var iso = time.getAttribute("datetime"), p = iso.split("-");
            var idx = first[+p[1] - 1] + (+p[2]) - 1, y = yAt(main, idx);
            if (y === null) return;
            var j = jal[idx];
            if (!j) { j = jal[idx] = { idx: idx, iso: iso, titles: [], gold: false, x: pxOf(cfg.year, idx), y: y }; marks.push(j); }
            j.titles.push(title.textContent);
            if (li.classList.contains("gold")) j.gold = true;
        });
        marks.sort(function (a, b) { return a.idx - b.idx; });
        marks.forEach(function (j) {     /* losange (gros pour un jalon or) cerclé de la couleur du fond */
            var r = j.gold ? 7 : 5.5;
            svg.appendChild(svgEl("path", { "class": "cum-ms" + (j.gold ? " gold" : ""), "aria-hidden": "true",
                d: "M" + j.x + "," + (j.y - r) + "l" + r + "," + r + "l-" + r + "," + r + "l-" + r + ",-" + r + "z" }));
        });
        /* réticule : un trait et un point par courbe (le point suit la classe cy-<année> : masqué avec l'année) */
        var g = svgEl("g", { "class": "cum-g", "aria-hidden": "true" });
        var line = svgEl("line", { "class": "cum-rt", y1: top, y2: top + ph });
        g.appendChild(line);
        curves.forEach(function (c) {
            c.pt = svgEl("circle", { "class": "cum-pt fl" + c.style + " cy-" + c.year, r: 4.5 });
            g.appendChild(c.pt);
        });
        svg.appendChild(g);
        svg.__hide = function () { g.classList.remove("on"); };
        svg.classList.add("cum-live");
        svg.setAttribute("tabindex", "0");
        svg.setAttribute("aria-label", svg.getAttribute("aria-label") + " Flèches gauche et droite : parcourir les jours ; haut et bas : passer d'un jalon à l'autre.");
        var cur = lastIdx;

        /* Contenu de l'infobulle au jour i ; mode = "mouse" | "touch" | "key" (formule de l'aide du jalon) */
        function readDay(i, mode) {
            var rows = [], v0 = null, vCmp = null;
            curves.forEach(function (c) {
                var y = c.el.hasAttribute("hidden") ? null : yAt(c, i), x = pxOf(c.year, i);
                c.pt.setAttribute("visibility", y === null ? "hidden" : "visible");
                if (y === null) return;
                c.pt.setAttribute("cx", x);
                c.pt.setAttribute("cy", y);
                var h = hours(y);
                rows.push([String(c.year), hLabel(h)]);
                if (c.style === 0) v0 = h; else if (vCmp === null) vCmp = h;
            });
            if (v0 !== null && vCmp !== null) {
                var diff = Math.round((v0 - vCmp) * 10) / 10;
                rows.push(["Écart", (diff > 0 ? "+" : diff < 0 ? "\u2212" : "") + hLabel(Math.abs(diff))]);
            }
            var j = jal[i], hint = "";
            if (j) {
                j.titles.forEach(function (t) { rows.push(["Jalon", t]); });
                hint = mode === "key" ? "Appuie sur Entrée pour ouvrir la journée" : mode === "touch" ? "Touche à nouveau pour ouvrir la journée" : "Clique pour ouvrir la journée";
            }
            return { title: (dd[i] === 1 ? "1er" : dd[i]) + " " + MONTHS[dm[i]], pills: [], rows: rows, hint: hint };
        }
        /* Place le réticule au jour i ; (cx, cy) = position du pointeur dans la fenêtre, absente au clavier */
        function show(i, mode, cx, cy) {
            cur = i;
            var content = readDay(i, mode);
            var x = pxOf(cfg.year, i);
            line.setAttribute("x1", x);
            line.setAttribute("x2", x);
            g.classList.add("on");
            if (cx === undefined) {          /* clavier : on ramène le jour dans le cadre, l'infobulle se pose sur le trait */
                var box = svg.parentNode, br = box.getBoundingClientRect(), sr = svg.getBoundingClientRect();
                var wx = sr.left + x * sr.width / vb.width;
                if (wx < br.left + 20 || wx > br.right - 20) { box.scrollLeft += wx - (br.left + br.right) / 2; sr = svg.getBoundingClientRect(); wx = sr.left + x * sr.width / vb.width; }
                cx = wx;
                cy = sr.top + (top + ph * 0.3) * sr.height / vb.height;
                cumAnnounce(content.title + " : " + content.rows.map(function (r) { return r[0] + " " + r[1]; }).join(", "));
            }
            activeTip = svg;
            placeTip(content, cx, cy);
        }
        function openMark(i) { hideChartTip(svg); openDaySheet(jal[i].iso, svg); }
        /* Jour (ou jalon voisin du doigt / de la souris) sous le pointeur, null hors de la zone de tracé */
        function locate(e) {
            var r = svg.getBoundingClientRect();
            if (!r.width) return null;
            var px = (e.clientX - r.left) * vb.width / r.width, py = (e.clientY - r.top) * vb.height / r.height;
            var best = null, dist = lastPointer === "touch" ? 22 : 10;
            marks.forEach(function (j) {
                var dj = Math.sqrt((j.x - px) * (j.x - px) + (j.y - py) * (j.y - py));
                if (dj <= dist) { dist = dj; best = j; }
            });
            if (best) return { idx: best.idx, mark: true };
            if (px < left || px > left + pw || py < top || py > top + ph) return null;
            return { idx: idxOfPx(px), mark: false };
        }
        svg.addEventListener("pointermove", function (e) {
            if (e.pointerType === "touch" || pinnedTip) return;
            var hit = locate(e);
            if (hit) show(hit.idx, "mouse", e.clientX, e.clientY); else hideChartTip(svg);
        });
        svg.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch" && !pinnedTip) hideChartTip(svg); });
        svg.addEventListener("pointerdown", function () {      /* un clic qui donne le focus ne montre pas le réticule du clavier */
            svg.__ptr = true;
            setTimeout(function () { svg.__ptr = false; }, 400);
        });
        svg.addEventListener("click", function (e) {
            var hit = locate(e);
            if (lastPointer !== "touch") { if (hit && hit.mark) openMark(hit.idx); return; }
            if (!hit) { hideChartTip(svg); return; }
            if (pinnedTip === svg && cur === hit.idx && jal[hit.idx]) { openMark(hit.idx); return; }
            show(hit.idx, "touch", e.clientX, e.clientY);
            pinnedTip = svg;
        });
        svg.addEventListener("focus", function () { if (!svg.__ptr) show(cur, "key"); });
        svg.addEventListener("blur", function () { hideChartTip(svg); });
        svg.addEventListener("keydown", function (e) {
            var i = cur, k = e.key, month = e.shiftKey ? 1 : 0;
            if (k === "ArrowLeft" || k === "ArrowRight") {
                var dir = k === "ArrowLeft" ? -1 : 1;
                if (month) { i = monthStep(cur, dir); } else i = cur + dir;
            } else if (k === "PageUp" || k === "PageDown") i = monthStep(cur, k === "PageUp" ? -1 : 1);
            else if (k === "Home") i = 0;
            else if (k === "End") i = dm.length - 1;
            else if (k === "ArrowUp" || k === "ArrowDown") {
                var up = k === "ArrowUp", pick = null;
                marks.forEach(function (j) { if (up ? j.idx < cur : j.idx > cur) { if (!pick || (up ? j.idx > pick.idx : j.idx < pick.idx)) pick = j; } });
                if (!pick) { e.preventDefault(); return; }
                i = pick.idx;
            } else if ((k === "Enter" || k === " ") && jal[cur]) { e.preventDefault(); openMark(cur); return; }
            else if (k === "Escape") { hideChartTip(svg); return; }
            else return;
            e.preventDefault();
            show(Math.max(0, Math.min(dm.length - 1, i)), "key");
        });
        function monthStep(i, dir) {      /* même quantième dans le mois voisin (ramené au dernier jour si besoin) */
            var m2 = dm[i] + dir;
            if (m2 < 0) return 0;
            if (m2 > 11) return dm.length - 1;
            return first[m2] + Math.min(dd[i], monthDays(cfg.year, m2)) - 1;
        }
    }
    q("svg.chart-cum").forEach(initCumul);

    /* ---------- Matrice jour × heure (T53) : infobulle et flèches ----------
       Le <table class="mx"> est déjà dans la page (le nombre de vols est écrit dans chaque case). Ici : lundi = ligne 0 de <tbody>,
       première heure = texte du premier <th scope="col">. L'infobulle (vols, durée, sites) est calculée depuis #flights-data pour
       la discipline de la variante (data-v-disc) ; un seul arrêt de tabulation (la case la plus chargée), flèches pour se déplacer. */
    var WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    function weekdayOf(iso) {                       /* 0 = lundi, comme Python */
        var p = iso.split("-");
        return (new Date(+p[0], +p[1] - 1, +p[2]).getDay() + 6) % 7;
    }
    function slotFlights(el) {
        var slot = el.__mx, disc = (el.closest(".v") || el).getAttribute("data-v-disc") || "all";
        return flightsData.f.filter(function (f) {
            return f.t && +f.t.slice(0, 2) === slot.hour && weekdayOf(f.d) === slot.day && (disc === "all" || f.disc === disc);
        });
    }
    function slotTitle(slot) { return WEEKDAYS[slot.day] + ", " + slot.hour + NBSP + "h – " + (slot.hour + 1) + NBSP + "h"; }
    function slotTip(el) {
        var flights = slotFlights(el), out = { title: slotTitle(el.__mx), pills: [], rows: [], hint: "" };
        var minutes = flights.reduce(function (sum, f) { return sum + (f.mn || 0); }, 0);
        ["parapente", "paramoteur"].forEach(function (d) {
            if (flights.some(function (f) { return f.disc === d; })) out.pills.push(d);
        });
        out.rows.push(["Vols", String(flights.length)]);
        if (minutes) out.rows.push(["Durée", fmtDuration(minutes)]);
        var sites = countList(flights, "s");
        if (sites) out.rows.push([sites.indexOf(",") > 0 ? "Sites" : "Site", sites]);
        return out;
    }
    function slotLabel(el) {                         /* nom accessible, calculé au focus : « Samedi, 14 h – 15 h : 3 vols · 2 h 10 min » */
        var n = +el.textContent || 0, c = slotTip(el);
        return c.title + " : " + (n ? [plural(n, "vol")].concat(c.rows.filter(function (r) { return r[0] === "Durée"; }).map(function (r) { return r[1]; })).join(" · ") : "aucun vol");
    }
    q("table.mx").forEach(function (table) {
        var h0 = parseInt(q("thead th[scope=col]", table)[0].textContent, 10), cells = [], cols = 0;
        q("tbody tr", table).forEach(function (tr, day) {
            var tds = q("td:not(.t)", tr);
            cols = tds.length;
            tds.forEach(function (td, i) {
                td.__mx = { day: day, hour: h0 + i };
                td.setAttribute("role", "cell");
                if (td.textContent) td.setAttribute("data-tip", "case");
                cells.push(td);
            });
        });
        var start = q("td.top", table)[0] || cells.filter(function (td) { return td.textContent; })[0];
        if (start) start.setAttribute("tabindex", "0");
        rove(table, cells, 1, cols);
    });
    document.addEventListener("focusin", function (e) {
        if (e.target.__mx) e.target.setAttribute("aria-label", slotLabel(e.target));
    }, true);

    /* ---------- Fiche du jour (I2) : clic, toucher, Entrée ou Espace sur un jour de vol du calendrier ----------
       Boîte de dialogue modale construite au premier usage (rien dans le HTML : sans JavaScript, elle n'existe pas).
       Panneau à droite sur grand écran, feuille montant du bas sur téléphone (CSS .day-sheet).
       Respecte la discipline choisie (state.disc) : vols affichés et jours précédent / suivant.
       Focus : envoyé dans le panneau, piégé tant qu'il est ouvert, rendu à la case du jour affiché à la fermeture. */
    var NBSP = " ";
    var MODE_CLASS = { "Site": "wc-site", "Treuil": "wc-treuil", "Rando": "wc-rando", "Bord de mer": "wc-mer", "Moteur": "wc-moteur" };
    var DISC_PILL = { parapente: "pill-p", paramoteur: "pill-m" };
    var sheet = null;          /* éléments du panneau, créés par buildSheet() */
    var sheetDate = null;      /* jour affiché « AAAA-MM-JJ » */
    var sheetReturn = null;    /* case qui reprend le focus à la fermeture */
    var sheetScrollY = 0;
    var sheetFromCalendar = false;   /* ouverte depuis le calendrier : le focus revient à la case du jour affiché */

    function mk(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined && text !== null) el.textContent = text;
        return el;
    }
    function fmtDuration(minutes) {            /* comme report_format.fmt_duration : « 35 min », « 3 h », « 1 h 05 min » */
        var total = Math.round(minutes), h = Math.floor(total / 60), m = total % 60;
        if (!h) return m + NBSP + "min";
        if (!m) return h + NBSP + "h";
        return h + NBSP + "h" + NBSP + (m < 10 ? "0" : "") + m + NBSP + "min";
    }
    function fmtNum(x, digits) { return x.toLocaleString("fr-FR", { maximumFractionDigits: digits || 0 }); }
    function plural(n, word) { return n + NBSP + word + (n > 1 ? "s" : ""); }
    function longDate(iso) {
        var p = iso.split("-");
        var s = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        if (+p[2] === 1) s = s.replace(/ 1 /, " 1er ");     /* « dimanche 1er mars » */
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function buildSheet() {
        var backdrop = mk("div", "day-sheet-backdrop");
        backdrop.hidden = true;
        var panel = mk("div", "day-sheet");
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-labelledby", "day-sheet-title");
        panel.setAttribute("tabindex", "-1");
        var head = mk("div", "ds-head");
        var headText = mk("div", "ds-head-text");
        headText.setAttribute("aria-live", "polite");
        var kicker = mk("p", "ds-kicker");
        var title = mk("h2", "ds-title");
        title.id = "day-sheet-title";
        var summary = mk("p", "ds-sum");
        headText.appendChild(kicker); headText.appendChild(title); headText.appendChild(summary);
        var close = mk("button", "ds-close", "✕");
        close.type = "button";
        close.setAttribute("aria-label", "Fermer la fiche");
        head.appendChild(headText); head.appendChild(close);
        var body = mk("div", "ds-body");
        var nav = mk("div", "ds-nav");
        var prev = mk("button", "ds-prev", "← Jour de vol précédent");
        var next = mk("button", "ds-next", "Jour de vol suivant →");
        prev.type = next.type = "button";
        nav.appendChild(prev); nav.appendChild(next);
        panel.appendChild(head); panel.appendChild(body); panel.appendChild(nav);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        close.addEventListener("click", closeSheet);
        prev.addEventListener("click", function () { stepDay(-1); });
        next.addEventListener("click", function () { stepDay(1); });
        backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeSheet(); });
        backdrop.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeSheet();
            } else if (e.key === "Tab") {      /* focus piégé : Tab et Maj+Tab tournent dans le panneau */
                var items = q("button:not([disabled]), a[href]", panel).filter(function (el) { return el.getClientRects().length > 0; });
                if (!items.length) return;
                var first = items[0], last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        });
        sheet = { backdrop: backdrop, panel: panel, kicker: kicker, title: title, summary: summary, body: body, nav: nav, prev: prev, next: next };
    }

    /* Mesures d'un vol : seules les valeurs connues sont affichées (jamais « 0 ») */
    function flightMeasures(f) {
        var out = [];
        if (f.mn) out.push(["Durée", fmtDuration(f.mn)]);
        if (f.c) out.push(["Plafond", fmtNum(f.c) + NBSP + "m"]);
        if (f.km) out.push(["Distance", fmtNum(f.km, 1) + NBSP + "km"]);
        if (f.v) out.push(["Vitesse max", fmtNum(f.v) + NBSP + "km/h"]);
        if (f.z) out.push(["Vario max", fmtNum(f.z, 1) + NBSP + "m/s"]);
        return out;
    }

    function flightCard(f) {
        var card = mk("article", "ds-flight");
        var top = mk("div", "ds-fh");
        if (f.t) top.appendChild(mk("span", "ds-time", f.t));
        top.appendChild(mk("span", "pill " + (DISC_PILL[f.disc] || "pill-p"), f.disc));
        if (f.f) {
            var mode = mk("span", "ds-mode");
            var swatch = mk("i", MODE_CLASS[f.f] || "wc-autre");
            swatch.setAttribute("aria-hidden", "true");
            mode.appendChild(swatch);
            mode.appendChild(document.createTextNode(f.f));
            top.appendChild(mode);
        }
        card.appendChild(top);
        card.appendChild(mk("h3", "ds-site", f.s || "Site inconnu"));
        if (f.w) card.appendChild(mk("p", "ds-wing", "Voile : " + f.w));
        var measures = flightMeasures(f);
        if (measures.length) {
            var dl = mk("dl", "ds-meas");
            measures.forEach(function (m) {
                var cell = mk("div");
                cell.appendChild(mk("dt", "", m[0]));
                cell.appendChild(mk("dd", "", m[1]));
                dl.appendChild(cell);
            });
            card.appendChild(dl);
        }
        var url = flightUrl(f);
        if (url) {
            var a = mk("a", "ds-link", "Fiche Syride ↗");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener";
            a.setAttribute("aria-label", "Fiche Syride du vol" + (f.t ? " de " + f.t : "") + " (nouvel onglet)");
            card.appendChild(a);
        }
        return card;
    }

    /* Jour de vol voisin dans la discipline choisie (null aux extrémités) */
    function neighbourDay(date, step) {
        var dates = flightDatesFor(state.disc);
        if (step < 0) {
            for (var i = dates.length - 1; i >= 0; i--) if (dates[i] < date) return dates[i];
        } else {
            for (var j = 0; j < dates.length; j++) if (dates[j] > date) return dates[j];
        }
        return null;
    }

    function renderDay(date) {
        sheetDate = date;
        sheet.kicker.textContent = "Fiche du jour";
        sheet.nav.hidden = false;
        var flights = flightsOn(date, state.disc);
        var others = flightsOn(date, "all").length - flights.length;
        sheet.title.textContent = longDate(date);
        sheet.summary.textContent = "";
        sheet.body.textContent = "";
        if (!flights.length) {
            sheet.summary.textContent = "Pas de vol ce jour-là.";
        } else {
            var minutes = flights.reduce(function (s, f) { return s + (f.mn || 0); }, 0);
            var parts = [plural(flights.length, "vol")];
            if (minutes) parts.push(fmtDuration(minutes) + " de vol");
            sheet.summary.appendChild(document.createTextNode(parts.join(" · ") + " "));
            ["parapente", "paramoteur"].forEach(function (d) {
                if (flights.some(function (f) { return f.disc === d; })) sheet.summary.appendChild(mk("span", "pill " + DISC_PILL[d], d));
            });
        }
        if (others > 0) {
            var other = state.disc === "parapente" ? "paramoteur" : "parapente";
            sheet.body.appendChild(mk("p", "ds-note", "Et " + plural(others, "vol") + " de " + other
                + " ce jour-là, non " + (others > 1 ? "affichés" : "affiché") + " : la discipline choisie en haut de page est « " + state.disc + " »."));
        }
        var list = mk("div", "ds-list");
        flights.forEach(function (f) { list.appendChild(flightCard(f)); });
        sheet.body.appendChild(list);
        sheet.body.scrollTop = 0;
        var prev = neighbourDay(date, -1), next = neighbourDay(date, 1);
        sheet.prev.disabled = !prev;
        sheet.next.disabled = !next;
        sheet.prev.setAttribute("aria-label", prev ? "Jour de vol précédent : " + longDate(prev) : "Pas de jour de vol précédent");
        sheet.next.setAttribute("aria-label", next ? "Jour de vol suivant : " + longDate(next) : "Pas de jour de vol suivant");
        selectCalendarDay(date);
    }

    /* Case du jour dans le calendrier visible : surlignée (.is-sel) et seule case tabulable (roving), focus rendu à elle */
    function selectCalendarDay(date) {
        q(".days > .is-sel").forEach(function (c) { c.classList.remove("is-sel"); });
        var cells = q('.days > [data-date="' + date + '"]').filter(function (c) { return !c.closest("[hidden]"); });
        cells.forEach(function (c) {
            c.classList.add("is-sel");
            var group = c.closest(".chart-calendar, .cal-mini");
            if (group && group.__roveTo) group.__roveTo(c);
        });
        var shown = cells.filter(function (c) { return c.getClientRects().length > 0; })[0];
        if (shown && sheetFromCalendar) sheetReturn = shown;
    }

    function stepDay(step) {
        var target = neighbourDay(sheetDate, step);
        if (!target) return;
        renderDay(target);
        /* le bouton pressé est devenu inactif (extrémité) : le focus passe à l'autre */
        var pressed = step < 0 ? sheet.prev : sheet.next, other = step < 0 ? sheet.next : sheet.prev;
        if (pressed.disabled) (other.disabled ? sheet.panel : other).focus();
    }

    /* Page figée derrière la fiche (indispensable sur téléphone : sinon la page défile sous le doigt) */
    function lockScroll(on) {
        var s = document.body.style;
        if (on) {
            sheetScrollY = window.scrollY;
            root.style.scrollBehavior = "auto";
            s.position = "fixed"; s.top = -sheetScrollY + "px"; s.left = "0"; s.right = "0";
        } else {
            s.position = ""; s.top = ""; s.left = ""; s.right = "";
            window.scrollTo(0, sheetScrollY);
            root.style.scrollBehavior = "";
        }
    }

    /* Ouverture du panneau (fiche du jour ou fiche de site) : `from` reprend le focus à la fermeture */
    function openSheet(from) {
        if (!sheet) buildSheet();
        if (sheet.backdrop.hidden) {
            sheetReturn = from || document.activeElement;
            sheetFromCalendar = !!(from && from.closest && from.closest(".days"));
            lockScroll(true);
            sheet.backdrop.hidden = false;
        }
    }
    function openDaySheet(date, cell) {
        openSheet(cell);
        renderDay(date);
        sheet.panel.focus();
    }

    function closeSheet() {
        if (!sheet || sheet.backdrop.hidden) return;
        sheet.backdrop.hidden = true;
        lockScroll(false);
        q(".days > .is-sel").forEach(function (c) { c.classList.remove("is-sel"); });
        if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus();
    }

    /* ---------- Carte par zones (T46) et fiche de site (F22) ----------
       La carte est rendue une fois en Python (toutes disciplines, tailles selon les vols) : .map-view = une vue
       (0 = vue d'ensemble si plusieurs zones), cercles circle[data-site] (un site) et circle[data-zone] (une zone,
       data-go = vue à ouvrir). Ici : une seule vue affichée, sites de l'autre discipline masqués, rayons recalculés
       (vols ou heures, même échelle que le rendu Python, donc jamais plus grands : pas de chevauchement),
       étiquettes replacées avec un texte d'au moins MAP_MIN_PX px à l'écran (téléphone), infobulles mises à jour.
       #map-data : {"z": [[site principal, [sites]], ...], "new": {site: date ISO de découverte}}. */
    var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    var MAP_MIN_PX = 12, MAP_FS = 13, MAP_MAX_LABELS = 14, MAP_TAP_PX = 24, MAP_RING_GAP = 4;   /* MAP_RING_GAP : comme report_charts */
    var mapData = (function () {
        var el = document.getElementById("map-data");
        try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
    })() || { z: [], "new": {} };
    var mapBox = document.querySelector("[data-map]");
    var mapState = { view: 0, measure: "n" };
    var SVGNS = "http://www.w3.org/2000/svg";

    function siteFlights(site, disc) {
        return flightsData.f.filter(function (f) { return f.s === site && (!disc || disc === "all" || f.disc === disc); });
    }
    var siteTotalsCache = {};
    function siteTotals(disc) {         /* {site: {n, mn}} pour une discipline */
        if (siteTotalsCache[disc]) return siteTotalsCache[disc];
        var out = {};
        flightsData.f.forEach(function (f) {
            if (disc !== "all" && f.disc !== disc) return;
            var t = out[f.s] || (out[f.s] = { n: 0, mn: 0 });
            t.n++; t.mn += f.mn || 0;
        });
        return (siteTotalsCache[disc] = out);
    }
    function zoneTotals(zi, totals) {
        var z = mapData.z[zi] || ["", []], out = { n: 0, mn: 0, sites: 0, top: z[0] };
        z[1].forEach(function (s) { var t = totals[s]; if (t) { out.n += t.n; out.mn += t.mn; out.sites++; } });
        return out;
    }
    function fmtHours(minutes) { return fmtNum(minutes / 60, minutes < 600 ? 1 : 0) + NBSP + "h"; }
    function dayMonth(iso) {
        var p = iso.split("-");
        return (+p[2] === 1 ? "1er" : +p[2]) + NBSP + MONTHS[+p[1] - 1];
    }
    function amount(t) { return mapState.measure === "h" ? fmtHours(t.mn) : plural(t.n, "vol"); }

    function mapLabel(svg, x, y, anchor, lines, fs) {
        var t = document.createElementNS(SVGNS, "text");
        t.setAttribute("class", "t map-label");
        t.setAttribute("x", x.toFixed(1)); t.setAttribute("y", y.toFixed(1));
        t.setAttribute("text-anchor", anchor);
        t.style.fontSize = fs.toFixed(1) + "px";
        lines.forEach(function (line, k) {
            var span = document.createElementNS(SVGNS, "tspan");
            if (k) { span.setAttribute("x", x.toFixed(1)); span.setAttribute("dy", "1.15em"); span.setAttribute("class", "map-sub"); }
            span.textContent = line;
            t.appendChild(span);
        });
        return t;
    }

    /* Rayons, infobulles et étiquettes d'une vue (seulement la vue visible : il faut sa largeur à l'écran) */
    function layoutMapView(svg) {
        var p = svg.getAttribute("data-r").split(" ").map(Number);
        var rmin = p[0], rmax = p[1], nmax = p[2], mmax = p[3] || 1;
        var vb = svg.viewBox.baseVal, width = vb.width, height = vb.height;
        var scale = svg.getBoundingClientRect().width / width || 1;
        var fs = Math.max(MAP_FS, MAP_MIN_PX / scale);
        /* échelle, nord et crédit : au moins 11 px à l'écran (un style en ligne l'emporte sur report.css) */
        q(".t-axis, .map-credit", svg).forEach(function (t) { t.style.fontSize = scale < 1 ? (11 / scale).toFixed(1) + "px" : ""; });
        var totals = siteTotals(state.disc);
        var items = q("circle[data-site], circle[data-zone]", svg);
        var shown = [];
        items.forEach(function (el) {
            var site = el.getAttribute("data-site"), t, tip;
            if (site !== null) {
                t = totals[site] || { n: 0, mn: 0 };
                tip = site + " : " + plural(t.n, "vol") + " · " + fmtDuration(t.mn);
                if (mapData["new"][site]) tip += " · nouveau site, découvert le " + dayMonth(mapData["new"][site]);
                el.__lines = el.hasAttribute("data-in-zone") ? null : [site];   /* site d'une zone : le halo porte l'étiquette */
            } else {
                t = zoneTotals(+el.getAttribute("data-zone"), totals);
                tip = "Autour de " + t.top + " : " + plural(t.sites, "site") + " · " + plural(t.n, "vol") + " · " + fmtDuration(t.mn) + ". Ouvre la vue de la zone.";
                el.__lines = [t.top, plural(t.sites, "site") + " · " + amount(t)];
            }
            var ring = el.previousElementSibling;
            if (ring && ring.getAttribute("class") !== "map-ring") ring = null;
            setVisible(el, t.n > 0);
            if (ring) setVisible(ring, t.n > 0);
            if (!t.n) return;
            var v = mapState.measure === "h" ? t.mn / mmax : t.n / nmax;
            el.__r = rmin + (rmax - rmin) * Math.sqrt(Math.max(0, Math.min(1, v)));
            el.__v = v;
            el.setAttribute("r", el.__r.toFixed(1));
            if (ring) ring.setAttribute("r", (el.__r + MAP_RING_GAP).toFixed(1));
            el.setAttribute("data-tip", tip);
            el.setAttribute("aria-label", tip);
            shown.push(el);
        });
        /* halos de zone (vue d'ensemble) : masqués sans vol dans la discipline, étiquetés à la place de leurs sites */
        var halos = q("circle[data-halo]", svg).filter(function (el) {
            var t = zoneTotals(+el.getAttribute("data-halo"), totals);
            setVisible(el, t.n > 0);
            if (!t.n) return false;
            var tip = "Autour de " + t.top + " : " + plural(t.sites, "site") + " · " + plural(t.n, "vol") + " · " + fmtDuration(t.mn) + ". Clique pour zoomer sur la zone.";
            el.setAttribute("data-tip", tip);
            el.__lines = [t.top, plural(t.sites, "site") + " · " + amount(t)];
            el.__r = +el.getAttribute("r");
            el.__v = mapState.measure === "h" ? t.mn / mmax : t.n / nmax;
            return true;
        });
        /* tabulation : l'élément d'entrée (tabindex 0) doit rester visible */
        var entry = items.filter(function (el) { return el.getAttribute("tabindex") === "0"; })[0];
        if (shown.length && (!entry || shown.indexOf(entry) < 0)) {
            if (svg.__roveTo) svg.__roveTo(shown[0]); else shown[0].setAttribute("tabindex", "0");
        }
        /* étiquettes : les plus gros cercles d'abord, 4 positions essayées, rien ne chevauche ni ne sort */
        var layer = svg.querySelector(".map-labels");
        if (!layer) return;
        layer.textContent = "";
        var circles = shown.concat(halos).map(function (el) {
            var x = +el.getAttribute("cx"), y = +el.getAttribute("cy"), r = el.__r;
            return [x - r, y - r, x + r, y + r, el];
        });
        var placed = [];
        function free(b, self) {
            return placed.every(function (o) { return b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]; })
                && circles.every(function (o) { return o[4] === self || b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]; });
        }
        shown.concat(halos).filter(function (el) { return el.__lines; }).sort(function (a, b) { return b.__v - a.__v; }).slice(0, MAP_MAX_LABELS).forEach(function (el) {
            var lines = el.__lines, x = +el.getAttribute("cx"), y = +el.getAttribute("cy"), r = el.__r;
            var w = Math.max(lines[0].length, lines.length > 1 ? lines[1].length * 0.85 : 0) * fs * 0.56 + 6;
            var h = fs * (lines.length > 1 ? 2.3 : 1.2), lift = h - fs * 1.2, base = fs * 0.32;
            var spots = [[r + 5, base - lift / 2, "start"], [-(r + 5), base - lift / 2, "end"],
                         [0, -(r + 6) - lift, "middle"], [0, r + fs + 2, "middle"]];
            for (var k = 0; k < spots.length; k++) {
                var lx = x + spots[k][0], ly = y + spots[k][1], anchor = spots[k][2];
                var x0 = anchor === "start" ? lx : anchor === "end" ? lx - w : lx - w / 2;
                var box = [x0, ly - fs, x0 + w, ly - fs + h];
                if (box[0] > 4 && box[2] < width - 4 && box[1] > 4 && box[3] < height - 4 && free(box, el)) {
                    placed.push(box);
                    layer.appendChild(mapLabel(svg, lx, ly, anchor, lines, fs));
                    break;
                }
            }
        });
    }

    function renderMap() {
        if (!mapBox) return;
        mapBox.setAttribute("data-disc", state.disc);
        var totals = siteTotals(state.disc);
        /* zones sans vol dans la discipline choisie : bouton masqué ; si c'était la vue affichée, retour à l'ensemble */
        q("button[data-map-view]", mapBox).forEach(function (b) {
            var zi = b.getAttribute("data-zone");
            if (zi === null) return;
            var t = zoneTotals(+zi, totals);
            setVisible(b, t.n > 0);
            if (!t.n && +b.getAttribute("data-map-view") === mapState.view) mapState.view = 0;
            var count = b.querySelector(".mz-n");
            if (count) count.textContent = amount(t);
        });
        q("button[data-map-view]", mapBox).forEach(function (b) {
            b.setAttribute("aria-pressed", String(+b.getAttribute("data-map-view") === mapState.view));
        });
        q("[data-map-measure]", mapBox).forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.getAttribute("data-map-measure") === mapState.measure));
        });
        var sizeLabel = mapBox.querySelector("[data-map-size-label]");
        if (sizeLabel) sizeLabel.textContent = "taille du cercle : " + (mapState.measure === "h" ? "heures de vol" : "nombre de vols");
        q("figure.map-view", mapBox).forEach(function (fig) {
            var on = +fig.getAttribute("data-map-view") === mapState.view;
            setVisible(fig, on);
            if (on) q("svg.chart-map", fig).forEach(layoutMapView);
        });
        updateScrollHints();
    }
    /* Téléphone : la carte déborde de sa carte (défilement horizontal) ; on centre les cercles de la vue à son ouverture */
    function centerMapView() {
        var fig = mapBox.querySelector('figure[data-map-view="' + mapState.view + '"]');
        var scroller = fig && fig.querySelector(".chart-scroll");
        if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
        var dots = q("circle[data-site], circle[data-zone]", fig).filter(function (c) { return c.getClientRects().length > 0; });
        if (!dots.length) return;
        var box = scroller.getBoundingClientRect(), lo = Infinity, hi = -Infinity;
        dots.forEach(function (c) { var r = c.getBoundingClientRect(); lo = Math.min(lo, r.left); hi = Math.max(hi, r.right); });
        scroller.scrollLeft += (lo + hi) / 2 - (box.left + box.width / 2);
        updateScrollHints();
    }
    function setMapView(view, focusMap) {
        mapState.view = view;
        renderMap();
        centerMapView();
        if (!focusMap) return;
        var fig = mapBox.querySelector('figure[data-map-view="' + view + '"]');
        var entry = fig && fig.querySelector('circle[tabindex="0"]');
        if (entry) entry.focus();
    }
    /* Cercle visé par un clic : le cercle lui-même, ou au doigt le plus proche à moins de MAP_TAP_PX px (cible élargie) */
    function mapTarget(e) {
        var hit = e.target.closest("circle[data-site], circle[data-zone]");
        if (hit && hit.closest("[data-map]")) return hit;
        var svg = e.target.closest("[data-map] svg.chart-map");
        if (!svg) return null;
        var halo = e.target.closest("circle[data-halo]");
        if (halo || e.clientX === undefined) return halo;   /* dans un halo, hors d'un site : vue de la zone */
        var best = null, bestD = Infinity;
        q("circle[data-site], circle[data-zone]", svg).forEach(function (el) {
            var rc = el.getBoundingClientRect();
            if (!rc.width) return;
            var d = Math.hypot(rc.left + rc.width / 2 - e.clientX, rc.top + rc.height / 2 - e.clientY) - rc.width / 2;
            if (d < bestD) { bestD = d; best = el; }
        });
        return bestD <= MAP_TAP_PX ? best : null;
    }
    function activateMapItem(el) {
        hideChartTip();
        if (el.hasAttribute("data-go")) setMapView(+el.getAttribute("data-go"), true);
        else openSiteSheet(el.getAttribute("data-site"), el);
    }
    if (mapBox) {
        bindButton("[data-map] button[data-map-view]", function () { setMapView(+this.getAttribute("data-map-view"), false); });
        bindButton("[data-map-measure]", function () { mapState.measure = this.getAttribute("data-map-measure"); renderMap(); });
        var mapResize = null;
        window.addEventListener("resize", function () {
            clearTimeout(mapResize);
            mapResize = setTimeout(renderMap, 150);
        });
    }

    /* Fiche de site : même panneau que la fiche du jour (buildSheet), calculée depuis #flights-data
       pour la discipline choisie en haut de page. */
    function countBy(flights, key) {
        var out = {};
        flights.forEach(function (f) { if (f[key]) out[f[key]] = (out[f[key]] || 0) + 1; });
        return Object.keys(out).sort(function (a, b) { return out[b] - out[a] || (a < b ? -1 : 1); })
            .map(function (k) { return k + " (" + out[k] + ")"; }).join(", ");
    }
    function renderSite(site) {
        var flights = siteFlights(site, state.disc);
        var others = siteFlights(site, "all").length - flights.length;
        sheet.kicker.textContent = "Fiche du site";
        sheet.nav.hidden = true;
        sheet.title.textContent = site;
        sheet.summary.textContent = "";
        sheet.body.textContent = "";
        var minutes = flights.reduce(function (s, f) { return s + (f.mn || 0); }, 0);
        sheet.summary.appendChild(document.createTextNode(flights.length
            ? plural(flights.length, "vol") + " en " + cfg.year + (minutes ? " · " + fmtDuration(minutes) + " de vol" : "") + " "
            : "Pas de vol ici dans la discipline choisie. "));
        ["parapente", "paramoteur"].forEach(function (d) {
            if (flights.some(function (f) { return f.disc === d; })) sheet.summary.appendChild(mk("span", "pill " + DISC_PILL[d], d));
        });
        var found = mapData["new"][site];
        if (found) sheet.body.appendChild(mk("p", "ss-new", "Nouveau site : découvert le " + dayMonth(found)));
        if (others > 0) {
            var other = state.disc === "parapente" ? "paramoteur" : "parapente";
            sheet.body.appendChild(mk("p", "ds-note", "Et " + plural(others, "vol") + " de " + other
                + " sur ce site, non " + (others > 1 ? "comptés" : "compté") + " : la discipline choisie en haut de page est « " + state.disc + " »."));
        }
        if (flights.length) {
            var dl = mk("dl", "ss-facts");
            var facts = [["Premier vol", longDate(flights[0].d)], ["Dernier vol", longDate(flights[flights.length - 1].d)],
                         ["Voiles", countBy(flights, "w")], ["Façons de voler", countBy(flights, "f")]];
            if (flights.length === 1) facts.splice(0, 2, ["Vol", longDate(flights[0].d)]);
            facts.forEach(function (fact) {
                if (!fact[1]) return;
                var row = mk("div");
                row.appendChild(mk("dt", "", fact[0]));
                row.appendChild(mk("dd", "", fact[1]));
                dl.appendChild(row);
            });
            sheet.body.appendChild(dl);
            /* mini-frise des 12 mois : carré teinté selon le nombre de vols du mois, chiffre en dessous */
            var perMonth = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            flights.forEach(function (f) { perMonth[+f.d.slice(5, 7) - 1]++; });
            var top = Math.max.apply(null, perMonth);
            var hasP = flights.some(function (f) { return f.disc === "parapente"; }), hasM = flights.some(function (f) { return f.disc === "paramoteur"; });
            var kind = hasP && hasM ? "b" : hasM ? "m" : "p";
            sheet.body.appendChild(mk("h3", "ss-h", "Mois de vol"));
            var strip = mk("ol", "ss-months");
            perMonth.forEach(function (n, m) {
                var li = mk("li");
                li.setAttribute("aria-label", MONTHS[m] + " : " + (n ? plural(n, "vol") : "aucun vol"));
                li.title = li.getAttribute("aria-label");
                var cell = mk("span", "ss-cell");
                cell.setAttribute("aria-hidden", "true");
                cell.style.background = n ? "var(--cal-" + kind + Math.max(1, Math.ceil(4 * n / top)) + ")" : "";
                var lab = mk("span", "ss-mo", MONTHS[m].charAt(0).toUpperCase());
                lab.setAttribute("aria-hidden", "true");
                var num = mk("span", "ss-n", n ? String(n) : "·");
                num.setAttribute("aria-hidden", "true");
                li.appendChild(lab); li.appendChild(cell); li.appendChild(num);
                strip.appendChild(li);
            });
            sheet.body.appendChild(strip);
            /* meilleur vol : le plus long ; plafond le plus haut s'il s'agit d'un autre vol */
            var longest = flights.reduce(function (a, f) { return (f.mn || 0) > (a.mn || 0) ? f : a; }, flights[0]);
            var highest = flights.reduce(function (a, f) { return (f.c || 0) > (a.c || 0) ? f : a; }, flights[0]);
            if (longest.mn) {
                sheet.body.appendChild(mk("h3", "ss-h", "Ton plus long vol ici : " + longDate(longest.d).toLowerCase()));
                sheet.body.appendChild(flightCard(longest));
            }
            if (highest.c && highest !== longest) {
                var hp = mk("p", "ss-best", "Plafond le plus haut : " + fmtNum(highest.c) + NBSP + "m, " + longDate(highest.d).toLowerCase() + " ");
                var url = flightUrl(highest);
                if (url) {
                    var a = mk("a", "ds-link", "Fiche Syride ↗");
                    a.href = url; a.target = "_blank"; a.rel = "noopener";
                    a.setAttribute("aria-label", "Fiche Syride du vol au plafond le plus haut (nouvel onglet)");
                    hp.appendChild(a);
                }
                sheet.body.appendChild(hp);
            }
        }
        if (siteFlights(site, "all").length) {      /* filtre croisé : surligne les jours et la carte, sans quitter la page */
            var fb = xfBtn("site", site, T("site"), "ss-go ss-xf");
            fb.removeChild(fb.lastChild);
            fb.setAttribute("aria-pressed", String(xf.site === site));
            fb.addEventListener("click", closeSheet);   /* le clic délégué pose ou retire le filtre */
            sheet.body.appendChild(fb);
        }
        sheet.body.scrollTop = 0;
    }
    function openSiteSheet(site, from) {
        if (!site) return;
        openSheet(from);
        renderSite(site);
        sheet.panel.focus();
    }
    /* Tableau « Sites pratiqués » : chaque nom devient un bouton qui ouvre la fiche du site */
    q(".sites-tbl tbody td:first-child").forEach(function (td) {
        var site = td.getAttribute("data-v");
        var btn = mk("button", "site-btn", site);
        btn.type = "button";
        btn.setAttribute("aria-label", "Fiche du site " + site);
        btn.addEventListener("click", function () { openSiteSheet(site, btn); });
        var chip = td.querySelector(".new-chip");
        td.textContent = "";
        td.appendChild(btn);
        if (chip) { td.appendChild(document.createTextNode(" ")); td.appendChild(chip); }
    });

    /* Nouveaux sites (puces sous la phrase de la section Où) : le nom ouvre la fiche du site, comme dans le tableau */
    q(".ns-n").forEach(function (span) {
        var site = span.textContent;
        var btn = mk("button", "site-btn", site);
        btn.type = "button";
        btn.setAttribute("aria-label", "Fiche du site " + site);
        btn.addEventListener("click", function () { openSiteSheet(site, btn); });
        span.textContent = "";
        span.appendChild(btn);
    });

    /* ---------- Rejouer l'année (I1, T30) ----------
       Vue plein écran (dialog modale, construite au premier lancement) qui rejoue state.disc jour après jour. Aucune donnée nouvelle :
       vols = #flights-data, calendrier et carte = clones de ceux de la page (variante visible), jalons = lus dans la frise visible.
       Les jours pas encore joués perdent leur couleur (.rp-f), les sites apparaissent le jour de leur premier vol (.rp-on).
       Durée : ~RP_SECONDS s pour l'année à ×1 ; un jour de vol dure RP_FLIGHT_WEIGHT fois plus qu'un jour sans vol.
       Mouvement réduit : ni lecture ni animation, curseur et flèches seulement. Libellés : data-t-* du premier [data-rejeu].
       La discipline ne change pas pendant l'ouverture : le panneau couvre la barre et les raccourcis 1 2 3 sont suspendus. */
    var RP_SECONDS = 20, RP_FLIGHT_WEIGHT = 3, RP_SPEEDS = [1, 2, 4], RP_OLD_MAX = 3;
    var rp = null;
    function rpText(k) { return q("[data-rejeu]")[0].getAttribute("data-t-" + k); }
    function rpCount(n, k) { return fmtNum(n) + NBSP + rpText(k) + (n > 1 && k !== "heures" ? "s" : ""); }
    function rpDur(x) {       /* « 83 h 28 » ; arrondi à la minute, moitié vers le pair comme le round de Python : même total que le hero */
        var m = Math.round(x), h;
        if (x % 1 === 0.5 && m % 2) m--;
        h = Math.floor(m / 60);
        return h ? h + NBSP + "h" + NBSP + ("0" + m % 60).slice(-2) : m + NBSP + "min";
    }
    function rpDate(n) {
        var d = new Date(cfg.year, 0, 1 + n), s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        return d.getDate() === 1 ? s.replace(/ 1 /, " 1er ") : s;
    }
    function rpClone(src, cls) {        /* copie inerte (ni id, ni focus, ni infobulle) : [enveloppe, cases de .days dans l'ordre, indices des jours de vol] */
        var box = mk("div", cls), c = src.cloneNode(true), cells = [], flight = [];
        box.setAttribute("aria-hidden", "true");
        q("title", c).forEach(function (t) { t.parentNode.removeChild(t); });
        q("*", c).forEach(function (el) { ["id", "tabindex", "data-tip", "aria-label", "role"].forEach(function (a) { el.removeAttribute(a); }); });
        q(".days > *", c).forEach(function (el, i) {
            cells.push(el);
            if (el.hasAttribute("data-date")) { flight.push(i); el.removeAttribute("data-date"); }
        });
        box.appendChild(c);
        return [box, cells, flight];
    }
    function trapTab(e, el) {      /* focus piégé dans un panneau plein écran (rejeu, récap), comme la fiche du jour */
        var items = q("button:not([disabled]), input", el).filter(function (b) { return b.getClientRects().length > 0; });
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function buildReplay() {
        var el = mk("div", "rp"), kpi = ["vols", "heures", "sites"].map(function (k) {
            return '<div class="rp-kpi"><b></b><span><svg class="ico" width="18" height="18" aria-hidden="true"><use href="#ic-b-' + k + '"/></svg><i></i></span></div>';
        }).join("");
        el.hidden = true;
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-labelledby", "rp-title");
        el.tabIndex = -1;
        el.innerHTML = '<div class="rp-head"><div class="rp-head-text"><p class="rp-kicker" id="rp-title"></p><p class="rp-date"></p></div>'
            + '<button type="button" class="rp-x">✕</button></div><div class="rp-main"><div class="rp-cnt">' + kpi + '</div>'
            + '<div class="rp-box rp-cal"></div><div class="rp-box rp-jal"></div><div class="rp-box rp-map"></div></div>'
            + '<div class="rp-ctl"><button type="button" class="rp-play"></button><input type="range" min="0" step="1" class="rp-range">'
            + '<div class="rp-speed" role="group">' + RP_SPEEDS.map(function (s) { return '<button type="button">×' + s + "</button>"; }).join("") + "</div>"
            + '<button type="button" class="rp-prev"></button><button type="button" class="rp-next"></button><p class="rp-help"></p></div>'
            + '<div class="sr-only" aria-live="polite"></div>';
        document.body.appendChild(el);
        rp = { el: el, playing: false, rate: 1, n: 0, p: 0, from: null, kp: q(".rp-kpi", el), live: el.querySelector(".sr-only"), sbox: el.querySelector(".rp-speed") };
        ["kicker", "date", "x", "cal", "jal", "map", "play", "range", "prev", "next", "help"].forEach(function (k) { rp[k] = el.querySelector(".rp-" + k); });
        q("button", rp.sbox).forEach(function (b, i) { b.addEventListener("click", function () { rp.rate = RP_SPEEDS[i]; rpRateButtons(); }); });
        rp.x.addEventListener("click", closeReplay);
        rp.play.addEventListener("click", function () { rpPlay(!rp.playing, rp.playing); });
        rp.range.addEventListener("input", function () { rpPlay(false); rpSeek(+rp.range.value); });
        rp.range.addEventListener("change", rpAnnounce);
        rp.prev.addEventListener("click", function () { rpStep(-1); });
        rp.next.addEventListener("click", function () { rpStep(1); });
        el.addEventListener("keydown", function (e) {
            var k = e.key;
            if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeReplay(); }
            else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); rpStep(k === "ArrowLeft" ? -1 : 1); }
            else if (k === " " && e.target.tagName !== "BUTTON" && !reducedMotion()) { e.preventDefault(); rpPlay(!rp.playing, rp.playing); }
            else if (k === "Tab") trapTab(e, el);
        });
    }

    /* Données et clones pour state.disc (à chaque ouverture) */
    function rpLoad() {
        var disc = state.disc, i, flights = flightsData.f.filter(function (f) { return disc === "all" || f.disc === disc; });
        function visible(el) { return !el.closest("[hidden]"); }
        rp.el.setAttribute("data-disc", disc);
        rp.kicker.textContent = rpText("titre") + " · " + cfg.year;
        rp.cal.textContent = "";
        var srcY = q(".cal-year svg.chart-calendar").filter(visible)[0], srcM = q(".cal-months .cal-mini").filter(visible)[0];
        rp.cells = [srcY && rpClone(srcY, "rp-cal-y"), srcM && rpClone(srcM, "rp-cal-m")].filter(Boolean);
        rp.cells.forEach(function (c) { rp.cal.appendChild(c[0]); });
        /* dernier jour joué : le calendrier marque « à venir » (cal-future) les jours après la date des données */
        var ref = rp.cells.length ? rp.cells[0][1] : [], N = ref.length || 365;
        for (i = 0; i < ref.length; i++) if (/\bcal-future\b/.test(ref[i].getAttribute("class") || "")) { N = i; break; }
        rp.N = N = Math.max(N, 1);
        /* par jour : vols, minutes, nouveaux sites (premier vol de chaque site) */
        var dn = [], dmn = [], ds = [], first = {};
        for (i = 0; i < N; i++) { dn.push(0); dmn.push(0); ds.push(0); }
        flights.forEach(function (f) {
            var d = dayIndex(f.d);
            if (d < 0 || d >= N) return;
            dn[d]++; dmn[d] += f.mn || 0;
            if (f.s && !(first[f.s] <= d)) first[f.s] = d;
        });
        Object.keys(first).forEach(function (s) { ds[first[s]]++; });
        rp.cum = []; rp.fd = []; rp.start = [0];
        var a = 0, b = 0, c = 0, nf = dn.filter(Boolean).length, unit = RP_SECONDS / (N + (RP_FLIGHT_WEIGHT - 1) * nf);
        for (i = 0; i < N; i++) {
            a += dn[i]; b += dmn[i]; c += ds[i];
            rp.cum.push([a, b, c]);
            if (dn[i]) rp.fd.push(i);
            rp.start.push(rp.start[i] + unit * (dn[i] ? RP_FLIGHT_WEIGHT : 1));
        }
        rp.total = rp.start[N];
        rp.fcells = (rp.cells[0] ? rp.cells[0][2] : []).filter(function (d) { return d < N; });
        /* jalons de la frise visible */
        rp.ms = q(".tl-item").filter(visible).map(function (li) {
            var t = li.querySelector("time");
            return { i: dayIndex(t.getAttribute("datetime")), date: t.textContent, title: li.querySelector(".tl-title").textContent,
                     ico: li.querySelector(".tl-ico svg"), gold: li.classList.contains("gold") };
        }).filter(function (m) { return m.i >= 0 && m.i < N; });
        rp.k = -1;
        /* carte : vue d'ensemble clonée ; sites sans vol dans la discipline retirés, les autres apparaissent à leur premier vol */
        rp.map.textContent = "";
        rp.dots = [];
        var srcMap = mapBox && mapBox.querySelector('figure.map-view[data-map-view="0"] svg.chart-map');
        if (srcMap) {
            var mc = rpClone(srcMap, "rp-map-in"), svg = mc[0].firstChild, rr = svg.getAttribute("data-r").split(" ").map(Number), totals = siteTotals(disc);
            q(".map-halos, .map-labels, .map-ring, [data-zone], [data-halo]", svg).forEach(function (e) { e.parentNode.removeChild(e); });
            q("circle.map-dot", svg).forEach(function (dot) {
                var site = dot.getAttribute("data-site"), t = totals[site];
                dot.removeAttribute("data-site");
                if (!t || first[site] === undefined) { dot.parentNode.removeChild(dot); return; }
                dot.setAttribute("r", (rr[0] + (rr[1] - rr[0]) * Math.sqrt(Math.min(1, t.n / rr[2]))).toFixed(1));
                rp.dots.push([first[site], dot]);
            });
            if (rp.dots.length) rp.map.appendChild(mc[0]);
        }
        setVisible(rp.map, rp.dots.length > 0);
        var still = reducedMotion();
        setVisible(rp.play, !still); setVisible(rp.sbox, !still);
        rp.range.max = String(N - 1);
        rp.range.setAttribute("aria-label", rpText("curseur"));
        rp.sbox.setAttribute("aria-label", rpText("vitesse"));
        rp.x.setAttribute("aria-label", rpText("fermer"));
        rp.prev.textContent = rpText("prec"); rp.next.textContent = rpText("suiv"); rp.help.textContent = rpText("aide");
        rp.n = 0; rp.p = 0; rp.rate = 1;
        rpRateButtons();
        rpShow(0);
        rpPlay(false);
    }
    function rpRateButtons() {
        q("button", rp.sbox).forEach(function (b, k) { b.setAttribute("aria-pressed", String(RP_SPEEDS[k] === rp.rate)); });
    }

    /* Affiche le jour n : cases du calendrier, compteurs, jalons, carte, date, boutons */
    function rpShow(n) {
        var old = rp.n, t = rp.cum[n], k = 0;
        rp.n = n;
        rp.cells.forEach(function (c) {
            rp.fcells.forEach(function (d) { c[1][d].classList.toggle("rp-f", d > n); });
            c[1][old].classList.remove("rp-now");
            c[1][n].classList.add("rp-now");
        });
        [fmtNum(t[0]), rpDur(t[1]), fmtNum(t[2])].forEach(function (v, i) { rp.kp[i].firstChild.textContent = v; });
        rp.kp[0].lastChild.lastChild.textContent = rpText("vol") + (t[0] > 1 ? "s" : "");
        rp.kp[1].lastChild.lastChild.textContent = rpText("heures");
        rp.kp[2].lastChild.lastChild.textContent = rpText("site") + (t[2] > 1 ? "s" : "");
        rp.dots.forEach(function (d) { d[1].classList.toggle("rp-on", d[0] <= n); });
        rp.date.textContent = rpDate(n);
        rp.range.setAttribute("aria-valuetext", rp.date.textContent);
        rp.range.value = String(n);
        rp.ms.forEach(function (m) { if (m.i <= n) k++; });
        if (k !== rp.k) { rp.k = k; rpMilestones(k); }
        rp.prev.disabled = !(rp.fd.length && rp.fd[0] < n);
        rp.next.disabled = !(rp.fd.length && rp.fd[rp.fd.length - 1] > n);
    }
    /* Dernier jalon atteint en bandeau, les RP_OLD_MAX précédents en petit */
    function rpMilestones(k) {
        var box = rp.jal, m = rp.ms[k - 1];
        box.textContent = "";
        box.appendChild(mk("p", "rp-kicker", rpText("jalons") + NBSP + ": " + k + "/" + rp.ms.length));
        if (!m) return;
        var top = mk("div", "rp-j-top" + (m.gold ? " gold" : "")), ico = mk("span", "tl-ico"), txt = mk("div");
        if (m.ico) ico.appendChild(m.ico.cloneNode(true));
        txt.appendChild(mk("span", "tl-date", m.date));
        txt.appendChild(mk("h4", "tl-title", m.title));
        top.appendChild(ico); top.appendChild(txt);
        box.appendChild(top);
        var ul = mk("ul", "rp-j-old");
        rp.ms.slice(Math.max(0, k - 1 - RP_OLD_MAX), k - 1).reverse().forEach(function (o) {
            var li = mk("li");
            li.appendChild(mk("time", "", o.date));
            li.appendChild(document.createTextNode(o.title));
            ul.appendChild(li);
        });
        if (ul.firstChild) box.appendChild(ul);
    }

    function rpSeek(n) { rp.p = rp.start[n]; rpShow(n); }
    function rpStep(dir) {      /* jour de vol précédent / suivant */
        var target = rp.fd.filter(function (d) { return dir < 0 ? d < rp.n : d > rp.n; });
        if (!target.length) return;
        rpPlay(false);
        rpSeek(dir < 0 ? target[target.length - 1] : target[0]);
        rpAnnounce();
    }
    function rpAnnounce(done) {
        var t = rp.cum[rp.n], resume = rpCount(t[0], "vol") + ", " + rpDur(t[1]) + NBSP + rpText("heures") + ", " + rpCount(t[2], "site");
        rp.live.textContent = rpText(done === true ? "annonce_fin" : "annonce_pause").replace("{date}", rpDate(rp.n)).replace("{resume}", resume);
    }
    function rpPlay(on, announce) {
        if (on && rp.n >= rp.N - 1) rpSeek(0);        /* relance depuis le début */
        rp.playing = on;
        rp.play.textContent = rpText(on ? "pause" : "lecture");
        if (rp.raf) cancelAnimationFrame(rp.raf);
        rp.raf = on ? requestAnimationFrame(rpTick) : 0;
        rp.last = 0;
        if (announce === true) rpAnnounce();
    }
    function rpTick(ts) {
        var dt = rp.last ? Math.min(0.1, (ts - rp.last) / 1000) : 0, lo = 0, hi = rp.N - 1;
        rp.last = ts;
        rp.p += dt * rp.rate;
        if (rp.p >= rp.total) { rpShow(hi); rpPlay(false); rpAnnounce(true); return; }
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (rp.start[mid] <= rp.p) lo = mid; else hi = mid - 1; }
        if (lo !== rp.n) rpShow(lo);
        rp.raf = requestAnimationFrame(rpTick);
    }

    function openReplay(from) {
        if (!rp) buildReplay();
        if (!rp.el.hidden) return;
        rp.from = from;
        rpLoad();
        lockScroll(true);
        rp.el.hidden = false;
        if (reducedMotion()) rp.range.focus(); else { rp.play.focus(); rpPlay(true); }
    }
    function closeReplay() {
        if (!rp || rp.el.hidden) return;
        rpPlay(false);
        rp.el.hidden = true;
        lockScroll(false);
        if (rp.from && document.contains(rp.from)) rp.from.focus();
    }
    q("[data-rejeu]").forEach(function (b) { b.addEventListener("click", function () { openReplay(b); }); });
    function updateReplayButtons() {      /* pas de bouton pour une discipline sans vol */
        var any = flightDatesFor(state.disc).length > 0;
        q("[data-rejeu]").forEach(function (b) { setVisible(b.parentNode, any); });
    }

    /* ---------- Mode récap (L2, I8, T36) ----------
       Pages plein écran (une par écran, défilement horizontal avec scroll-snap) pour state.disc, et image de partage dessinée dans un <canvas>.
       Tout vient de #recap-data (chaînes déjà formatées par report_html.py : aucun calcul ici) ; libellés fixes : data-t-* du premier [data-recap].
       Une page sans donnée est absente du JSON, donc omise. Le panneau reprend les conventions du rejeu : dialog modale construite au premier
       lancement, focus piégé (trapTab), Échap ferme et rend le focus au bouton, lockScroll, raccourcis 1 2 3 suspendus.
       Couleurs de l'image : variables --rc-* de .rc (palette du hero, identique en clair et en sombre), valeurs de secours ci-dessous. */
    var RC_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', RC_MONTHS = "JFMAMJJASOND";
    var RC_FALLBACK = { "--rc-bg1": "#0b1d3a", "--rc-bg2": "#12305c", "--rc-ink": "#ffffff", "--rc-mut": "#b6c3da", "--rc-c": "#93c5fd", "--rc-gold": "#fbbf24" };
    var rc = null, rcData = null;
    try { rcData = JSON.parse(document.getElementById("recap-data").textContent); } catch (err) { rcData = null; }
    function rcText(k) { return q("[data-recap]")[0].getAttribute("data-t-" + k); }
    function rcPages(E) {
        var pages = [];
        function page(key, cls) {
            var el = mk("section", "rc-page" + (cls ? " " + cls : ""));
            el.appendChild(mk("p", "rc-k", rcText(key)));
            pages.push({ el: el, k: rcText(key) });
            return el;
        }
        function line(el, cls, text) { if (text) el.appendChild(mk("p", cls, text)); }
        var c = page("k_couv", "rc-couv");
        line(c, "rc-title", rcData.t);
        line(c, "rc-pilot", rcData.n);
        line(c, "rc-t rc-mut", E.d + (rcData.au ? " · " + rcData.au : ""));
        var f = page("k_phare");
        line(f, "rc-big rc-huge", E.h || E.v);
        if (E.h) line(f, "rc-cap", rcText("heures"));
        line(f, "rc-t", E.h ? E.v + " · " + E.j : E.j);
        if (E.e) line(f, "rc-t rc-mut rc-gap", E.e[1]);
        if (E.m) {
            var m = page("k_mois"), bars = mk("div", "rc-bars"), top = Math.max.apply(null, E.m[2]), star = E.m[2].indexOf(top);
            line(m, "rc-big", E.m[0]);
            E.m[2].forEach(function (v, i) {
                var bar = mk("span", "rc-bar" + (i === star ? " rc-star" : "")), fill = mk("i");
                fill.style.setProperty("--h", Math.round(100 * v / top));
                bar.appendChild(fill);
                bar.appendChild(mk("b", "", RC_MONTHS.charAt(i)));
                bars.appendChild(bar);
            });
            bars.setAttribute("aria-hidden", "true");
            m.appendChild(bars);
            line(m, "rc-t", E.m[1]);
        }
        [["b", "k_jour"], ["s", "k_site"], ["w", "k_voile"], ["r", "k_record"], ["p", "k_portrait"]].forEach(function (d) {
            var a = E[d[0]], el, ico;
            if (!a) return;
            el = page(d[1]);
            if (d[0] === "p") {
                ico = mk("span", "rc-ico");
                ico.innerHTML = '<svg class="ico" width="44" height="44" aria-hidden="true"><use href="#ic-' + a[2] + '"/></svg>';
                el.appendChild(ico);
            }
            line(el, "rc-big" + (d[0] === "r" ? " rc-gold" : ""), a[0]);
            a.slice(1, d[0] === "p" ? 2 : 4).forEach(function (t, i) { line(el, "rc-t" + (d[0] === "s" && i === 2 ? " rc-gold" : ""), t); });
        });
        var sh = page("k_partage", "rc-share"), cv = mk("canvas", "rc-cv"), acts = mk("div", "rc-acts"), dl = mk("button", "rc-btn rc-btn-main", rcText("telecharger"));
        cv.width = 1080; cv.height = 1350;
        cv.setAttribute("role", "img");
        cv.setAttribute("aria-label", rcText("apercu"));
        dl.type = "button";
        dl.addEventListener("click", rcDownload);
        acts.appendChild(dl);
        sh.appendChild(cv);
        sh.appendChild(acts);
        rc.cv = cv; rc.acts = acts; rc.file = null;
        return pages;
    }
    function rcColor(name) { return getComputedStyle(rc.card).getPropertyValue(name).trim() || RC_FALLBACK[name]; }
    function rcFit(g, text, maxW, size, weight, min) {
        var sz;
        for (sz = size; sz >= min; sz -= 2) {
            g.font = weight + " " + sz + "px " + RC_FONT;
            if (g.measureText(text).width <= maxW) return text;
        }
        g.font = weight + " " + min + "px " + RC_FONT;
        while (text.length > 1 && g.measureText(text + "…").width > maxW) text = text.slice(0, -1);
        return text + "…";
    }
    function rcDraw(E) {
        var g = rc.cv.getContext("2d"), W = 1080, H = 1350, X = 80, MW = W - 2 * X, y;
        var grad = g.createLinearGradient(0, 0, W * 0.5, H);
        grad.addColorStop(0, rcColor("--rc-bg1"));
        grad.addColorStop(1, rcColor("--rc-bg2"));
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        g.textBaseline = "alphabetic";
        g.fillStyle = rcColor("--rc-c");
        g.fillRect(X, 96, 96, 8);
        function put(text, yy, size, weight, color, min) {
            g.fillStyle = color;
            g.fillText(rcFit(g, text, MW, size, weight, min || Math.round(size / 2)), X, yy);
        }
        var ink = rcColor("--rc-ink"), mut = rcColor("--rc-mut"), acc = rcColor("--rc-c"), gold = rcColor("--rc-gold");
        put(rcData.it, 190, 64, 700, ink);
        put(rcData.n, 262, 46, 500, mut);
        put(E.d + (rcData.au ? " · " + rcData.au : ""), 322, 38, 600, acc);
        put(E.h || E.v, 560, 280, 800, ink, 120);
        if (E.h) put(rcText("heures"), 632, 52, 500, mut);
        put(E.v + " · " + E.ns, 740, 58, 650, ink);
        put(E.j, 806, 46, 500, mut);
        g.fillStyle = acc;
        g.globalAlpha = 0.35;
        g.fillRect(X, 860, MW, 3);
        g.globalAlpha = 1;
        y = 930;
        [[rcText("k_site"), E.s && E.s[0], ink], [rcText("img_record"), E.r && E.r[0], gold], [rcText("k_portrait"), E.p && E.p[0], ink]].forEach(function (row) {
            if (!row[1]) return;
            put(row[0].toUpperCase(), y, 30, 650, mut, 24);
            put(row[1], y + 60, 54, 700, row[2], 30);
            y += 124;
        });
        put(rcData["if"], H - 56, 30, 500, mut, 20);
        rc.file = null;
        rc.cv.toBlob(function (blob) {
            var old = q(".rc-share-btn", rc.acts)[0], file, btn;
            if (old) rc.acts.removeChild(old);
            try {
                file = blob && new File([blob], rcFileName(), { type: "image/png" });
                if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) return;
            } catch (err) { return; }
            rc.file = file;
            btn = mk("button", "rc-btn rc-share-btn", rcText("partager"));
            btn.type = "button";
            btn.addEventListener("click", function () { if (rc.file) navigator.share({ files: [rc.file], title: rcData.it }).catch(function () {}); });
            rc.acts.appendChild(btn);
        }, "image/png");
    }
    function rcFileName() { return "annee-de-vol-" + rcData.y + "-" + rcData.n.replace(/[^A-Za-z0-9_-]+/g, "_") + ".png"; }
    function rcDownload() {
        rc.cv.toBlob(function (blob) {
            if (!blob) return;
            var url = URL.createObjectURL(blob), a = document.createElement("a");
            a.href = url; a.download = rcFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        }, "image/png");
    }
    function buildRecap() {
        var el = mk("div", "rc");
        el.hidden = true;
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-label", rcText("dialogue"));
        el.tabIndex = -1;
        el.innerHTML = '<div class="rc-card"><div class="rc-head"><div class="rc-dots"></div><button type="button" class="rp-x rc-x">✕</button></div>'
            + '<div class="rc-track"></div><div class="rc-nav"><button type="button" class="rc-prev"></button><span class="rc-count" aria-hidden="true"></span>'
            + '<button type="button" class="rc-next"></button></div><p class="sr-only" aria-live="polite"></p></div>';
        document.body.appendChild(el);
        rc = { el: el, card: el.firstChild, i: 0, n: 0, pages: [], from: null, live: el.querySelector(".sr-only"), timer: 0, raf: 0 };
        ["dots", "x", "track", "prev", "next", "count"].forEach(function (k) { rc[k] = el.querySelector(".rc-" + k); });
        rc.x.addEventListener("click", closeRecap);
        rc.prev.addEventListener("click", function () { rcGo(rc.i - 1); });
        rc.next.addEventListener("click", function () { rcGo(rc.i + 1); });
        rc.track.addEventListener("scroll", function () {
            if (!rc.raf) rc.raf = requestAnimationFrame(function () { rc.raf = 0; rcMark(Math.round(rc.track.scrollLeft / Math.max(rc.track.clientWidth, 1))); });
        });
        window.addEventListener("resize", function () { if (!el.hidden) rcGo(rc.i, true); });
        el.addEventListener("click", function (e) { if (e.target === el) closeRecap(); });
        el.addEventListener("keydown", function (e) {
            var k = e.key;
            if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeRecap(); }
            else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); rcGo(rc.i + (k === "ArrowLeft" ? -1 : 1)); }
            else if (k === "Tab") trapTab(e, el);
        });
    }
    function rcMark(i) {
        i = Math.max(0, Math.min(rc.n - 1, i));
        rc.i = i;
        q("button", rc.dots).forEach(function (d, j) { if (j === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current"); });
        rc.count.textContent = (i + 1) + " / " + rc.n;
        rc.prev.setAttribute("aria-disabled", String(i === 0));
        rc.next.setAttribute("aria-disabled", String(i === rc.n - 1));
        clearTimeout(rc.timer);
        rc.timer = setTimeout(function () { rc.live.textContent = (i + 1) + " / " + rc.n + " : " + rc.pages[i].k; }, 250);
    }
    function rcGo(i, instant) {
        i = Math.max(0, Math.min(rc.n - 1, i));
        rc.track.scrollTo({ left: i * rc.track.clientWidth, behavior: instant || reducedMotion() ? "auto" : "smooth" });
        rcMark(i);
    }
    function rcLoad(E) {
        rc.el.setAttribute("data-disc", state.disc);
        rc.track.textContent = "";
        rc.dots.textContent = "";
        rc.pages = rcPages(E);
        rc.n = rc.pages.length;
        rc.pages.forEach(function (pg, i) {
            var d = mk("button", "rc-dot");
            d.type = "button";
            d.setAttribute("aria-label", pg.k);
            d.addEventListener("click", function () { rcGo(i); });
            rc.dots.appendChild(d);
            rc.track.appendChild(pg.el);
        });
        rc.prev.textContent = rcText("prec"); rc.next.textContent = rcText("suiv");
        rc.x.setAttribute("aria-label", rcText("fermer"));
    }
    function openRecap(from) {
        var E = rcData && rcData.disc[state.disc];
        if (!E) return;
        if (!rc) buildRecap();
        if (!rc.el.hidden) return;
        rc.from = from;
        rcLoad(E);
        lockScroll(true);
        rc.el.hidden = false;
        rcDraw(E);
        rcGo(0, true);
        rc.next.focus();
    }
    function closeRecap() {
        if (!rc || rc.el.hidden) return;
        rc.el.hidden = true;
        lockScroll(false);
        if (rc.from && document.contains(rc.from)) rc.from.focus();
    }
    q("[data-recap]").forEach(function (b) { b.addEventListener("click", function () { openRecap(b); }); });

    /* ---------- Progression de lecture ---------- */
    var progress = document.getElementById("reading-progress");
    var progressTrack = progress && progress.parentElement;
    function updateProgress() {
        if (!progress || !progressTrack) return;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var value = max > 0 ? Math.round(Math.min(1, Math.max(0, window.scrollY / max)) * 100) : 0;
        progress.style.width = value + "%";
        progressTrack.setAttribute("aria-valuenow", String(value));
    }
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    updateProgress();

    /* ---------- Animations des graphiques : au moment où ils entrent à l'écran ----------
       Sans cela, elles se jouent au chargement de la page et sont terminées quand on arrive
       sur un graphique situé plus bas. La classe html.anim (posée dans le <head>) les met en attente. */
    (function () {
        if (!("IntersectionObserver" in window)) return;
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var seen = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("in-view");
                seen.unobserve(entry.target);
            });
        }, { threshold: 0.15 });
        root.classList.add("anim");
        q(".chart-scroll").forEach(function (el) { seen.observe(el); });
    })();

    /* ---------- Récit de l'année : frise des jalons (F3) ----------
       « Voir la journée » (data-open-day) : ouvre la fiche du jour ; le focus revient au bouton à la fermeture.
       Entrée à l'écran : jalons échelonnés (.in-view), une seule fois par chargement ; rien si l'utilisateur
       demande moins de mouvement (html.anim absente). */
    document.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest("[data-open-day]");
        if (btn) { openDaySheet(btn.getAttribute("data-open-day"), btn); return; }
        var dot = e.target.closest && e.target.closest(".tl-dot");
        if (dot) {
            var item = document.getElementById(dot.getAttribute("href").slice(1));
            if (!item) return;
            e.preventDefault();
            item.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest", inline: "start" });
            q(".tl-item.is-hl").forEach(function (el) { el.classList.remove("is-hl"); });
            item.classList.add("is-hl");
            setTimeout(function () { item.classList.remove("is-hl"); }, 1600);
        }
    });
    function reducedMotion() {
        return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    (function () {
        if (!("IntersectionObserver" in window) || reducedMotion()) return;
        var watch = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                el.classList.add("in-view");
                watch.unobserve(el);
            });
        }, { threshold: 0.2 });
        q(".tl").forEach(function (el) { watch.observe(el); });
    })();

    /* ---------- Compteurs animés de l'en-tête ---------- */
    function countUp() {
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        q(".count").forEach(function (el) {
            if (el.closest("[hidden]")) return;
            var target = parseFloat(el.getAttribute("data-to"));
            var final = el.getAttribute("data-final") || el.textContent;
            var start = null;
            function step(ts) {
                if (start === null) start = ts;
                var p = Math.min((ts - start) / 900, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = p < 1 ? Math.round(target * eased).toLocaleString("fr-FR") : final;
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }

    /* Mini-courbes mensuelles des cartes de chiffres (data-spark) : 12 barres de l'année du rapport, calculées
       depuis #flights-data. La discipline est celle de la variante qui contient la carte (data-v-disc). */
    function renderSparks() {
        var SVG = "http://www.w3.org/2000/svg", now = new Date();
        var liveMonth = now.getFullYear() === cfg.year ? now.getMonth() : -1;
        q("svg.spark").forEach(function (svg) {
            var wrap = svg.closest("[data-v-disc]"), disc = wrap ? wrap.getAttribute("data-v-disc") : "all";
            var kind = svg.getAttribute("data-spark"), days = [], minutes = [], count = [], i;
            for (i = 0; i < 12; i++) { days.push({}); minutes.push(0); count.push(0); }
            flightsData.f.forEach(function (f) {
                if (disc !== "all" && f.disc !== disc) return;
                var m = +f.d.slice(5, 7) - 1;
                days[m][f.d] = 1;
                if (f.mn) { minutes[m] += f.mn; count[m]++; }
            });
            var vals = days.map(function (d, m) {
                return kind === "days" ? Object.keys(d).length : (count[m] ? minutes[m] / count[m] : 0);
            });
            var max = Math.max.apply(null, vals), html = "";
            if (!max) { svg.textContent = ""; return; }
            svg.setAttribute("viewBox", "0 0 120 26");
            svg.setAttribute("preserveAspectRatio", "none");
            vals.forEach(function (v, m) {
                var h = v ? Math.max(3, v / max * 24) : 1;
                var op = !v ? .35 : (liveMonth < 0 || m === liveMonth ? 1 : .55);
                html += '<rect x="' + (m * 10 + 1) + '" y="' + (25 - h).toFixed(1) + '" width="8" height="' + h.toFixed(1)
                    + '" rx="1" fill="currentColor" opacity="' + op + '"/>';
            });
            svg.innerHTML = html;
        });
    }
        /* ---------- Nuage de points des vols (T54) ----------
       Un point par vol de #flights-data, dessiné ici dans la carte vide .sc-card ; axes : durée × plafond (c) ou distance (km).
       Un vol sans les deux mesures n'est pas placé. Cercle = parapente, losange = paramoteur, anneau or = record de la vue.
       Clic, Entrée, Espace : fiche du jour ; au toucher, un 1er toucher épingle l'infobulle, un 2e ouvre la fiche. */
    var SC = { c: ["plafond", "Plafond (m)", "Le plus haut"], km: ["distance", "Distance (km)", "Le plus loin"] };
    var scCard = q(".sc-card")[0];
    function scatterTip(el) {
        var f = el.__fl, rows = [];
        if (f.s) rows.push(["Site", f.s]);
        if (f.w) rows.push(["Voile", f.w]);
        rows = rows.concat(flightMeasures(f).filter(function (r) { return /^(Du|Pl|Di)/.test(r[0]); }));
        return { title: longDate(f.d), pills: [f.disc], rows: rows, hint: (lastPointer === "touch" ? "Touche à nouveau" : "Clique") + " pour ouvrir la journée" };
    }
    function scatterActivate(pt, byKey) {
        if (!byKey && lastPointer === "touch" && pinnedTip !== pt) {
            pinnedTip = null; showTipNear(pt); pinnedTip = pt;
            return;
        }
        hideChartTip();
        openDaySheet((pt.__fl || pt.__rb).d, pt);
    }
    function renderScatter() {
        if (!scCard) return;
        var box = q(".chart-scroll", scCard)[0], note = q(".mx-note", scCard)[0], key = q(".sc-key", scCard)[0], ax = state.scAxis, S = SC[ax];
        q("[data-sc-axes]", scCard).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-sc-axes") === ax)); });
        var all = flightsData.f.filter(function (f) { return state.disc === "all" || f.disc === state.disc; });
        var pts = all.filter(function (f) { return f.mn > 0 && f[ax] > 0; }), n = pts.length;
        box.textContent = key.textContent = "";
        note.textContent = n < all.length ? n + NBSP + (n > 1 ? "vols sur " : "vol sur ") + all.length + " placé" + (n > 1 ? "s" : "") + " : les autres n'ont pas de " + S[0] + " mesuré." : "";
        if (n < 2) {
            box.appendChild(mk("p", "empty", all.length ? "Pas assez de vols avec un " + S[0] + " mesuré pour dessiner le graphique." : "Aucun vol dans cette discipline."));
            return;
        }
        var W = 780, L = 58, R = 756, T = 32, B = 332;
        function top(f) { return Math.max.apply(null, pts.map(function (p) { return p[f]; })); }
        var xmax = top("mn"), xs = [15, 30, 60, 120, 180, 240, 360, 480, 720].filter(function (s) { return Math.ceil(xmax / s) <= 6; })[0] || 720;
        var xtop = Math.ceil(xmax / xs) * xs, mag = Math.pow(10, Math.floor(Math.log(top(ax) / 5) / Math.LN10)), m = top(ax) / 5 / mag;
        var ys = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * mag, ytop = Math.ceil(top(ax) / ys - 1e-9) * ys;     /* graduations rondes */
        function px(v) { return L + (R - L) * v / xtop; }
        function py(v) { return B - (B - T) * v / ytop; }
        var svg = svgEl("svg", { "class": "chart chart-sc", viewBox: "0 0 " + W + " 380", role: "img",
            "aria-label": "Nuage de points : un point par vol, durée et " + S[0] + ", " + n + " vols" });
        function text(x, y, s, cls, anchor) {
            var t = svgEl("text", { x: x, y: y, "class": cls, "text-anchor": anchor || "start" });
            t.textContent = s;
            svg.appendChild(t);
        }
        function line(x1, y1, x2, y2, cls) { svg.appendChild(svgEl("line", { x1: x1, y1: y1, x2: x2, y2: y2, "class": cls })); }
        for (var i = 0; i * xs <= xtop; i++) {
            if (i) line(px(i * xs), T, px(i * xs), B, "gridl gridl-v");
            text(px(i * xs), B + 18, i ? fmtDuration(i * xs) : "0", "t t-axis", "middle");
        }
        for (var j = 0; j * ys <= ytop + 1e-9; j++) {
            line(L, py(j * ys), R, py(j * ys), "gridl");
            text(L - 8, py(j * ys) + 4, fmtNum(Math.round(j * ys * 10) / 10, ys % 1 ? 1 : 0), "t t-axis", "end");
        }
        text(L, 16, S[1], "t t-title");
        text((L + R) / 2, 374, "Durée du vol", "t t-title", "middle");
        var recX = pts.filter(function (f) { return f.mn === xmax; })[0], recY = pts.filter(function (f) { return f[ax] === top(ax); })[0], recs = recX === recY ? [recX] : [recX, recY];
        function point(f) {
            var p = f.disc === "paramoteur", g = svgEl("g", { "class": "sc-pt", "data-tip": "pt", role: "img", transform: "translate(" + px(f.mn).toFixed(1) + " " + py(f[ax]).toFixed(1) + ")" });
            g.__fl = f;
            g.appendChild(svgEl("circle", { r: 11, "class": "sc-hit" }));
            if (recs.indexOf(f) >= 0) g.appendChild(svgEl(p ? "path" : "circle", p ? { d: "M0-11L11 0 0 11-11 0Z", "class": "sc-ring" } : { r: 10, "class": "sc-ring" }));
            g.appendChild(svgEl(p ? "path" : "circle", p ? { d: "M0-6.5L6.5 0 0 6.5-6.5 0Z", "class": "sc-m" } : { r: 5, "class": "sc-p" }));
            var c = scatterTip(g);
            g.setAttribute("aria-label", c.title + " : " + [f.disc].concat(c.rows.map(function (r) { return r[0] + " " + r[1]; })).join(", "));
            svg.appendChild(g);
        }
        pts.forEach(function (f) { if (recs.indexOf(f) < 0) point(f); });
        recs.forEach(point);                    /* les records par-dessus, puis leur étiquette (dessous si elle sort du cadre ou en chevauche une) */
        var placed = [];
        recs.forEach(function (f) {
            var label = recX === recY ? "Le plus long et " + S[2].toLowerCase() : f === recX ? "Le plus long" : S[2];
            var w = label.length * 7.4, x = Math.max(L + w / 2, Math.min(W - 6 - w / 2, px(f.mn))), y = py(f[ax]);
            var below = y < 34 || placed.some(function (o) { return !o.below && Math.abs(o.x - x) < (o.w + w) / 2; });
            text(x, below ? y + 28 : y - 17, label, "t t-rec", "middle");
            placed.push({ x: x, w: w, below: below });
        });
        box.appendChild(svg);
        var both = ["parapente", "paramoteur"].every(function (d) { return pts.some(function (f) { return f.disc === d; }); });
        if (both) key.innerHTML = '<span><b class="sc-p" aria-hidden="true">●</b> parapente</span><span><b class="sc-m" aria-hidden="true">◆</b> paramoteur</span>';
        key.hidden = !both;
        rove(svg, q(".sc-pt", svg).sort(function (a, b) { return a.__fl.mn - b.__fl.mn || a.__fl[ax] - b.__fl[ax]; }), 1, 1);
    }
    bindButton("[data-sc-axes]", function () {
        state.scAxis = this.getAttribute("data-sc-axes");
        renderScatter();
    });


    /* ---------- Ruban voile × mois (T55) ----------
       Carte vide .rb-card (Python : _wing_ribbon), remplie ici depuis #flights-data selon state.disc. Un <table class="mx rb"> (styles de la
       matrice T53) : une ligne par voile (tr[data-wing], classe mx-p / mx-m / mx-b selon la discipline de la voile), une colonne par mois
       de janvier au dernier mois couvert (td[data-month] = 1 à 12), l'intensité suit les heures de la case (niveaux comme la matrice).
       Case non vide (.rb-c) : infobulle, clic / Entrée = fiche du jour du premier vol de la voile ce mois-là (td.__rb = { w, m, f, d }).
       Au-dessus : « voile du moment » (.rb-now), la voile la plus volée sur les data-days jours avant le dernier vol de l'année. */
    var RB_SHARES = [0.25, 0.5, 0.75];            /* comme MATRIX_LEVEL_SHARES (report_html.py) */
    var MONTHS_SHORT = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];
    var rbCard = q(".rb-card")[0];
    function rbSum(flights) { return flights.reduce(function (sum, f) { return sum + (f.mn || 0); }, 0); }
    function rbTip(el) {
        var r = el.__rb, mn = rbSum(r.f), pills = [];
        ["parapente", "paramoteur"].forEach(function (d) { if (r.f.some(function (f) { return f.disc === d; })) pills.push(d); });
        var rows = [["Voile", r.w], ["Vols", String(r.f.length)]];
        if (mn) rows.push(["Durée", fmtDuration(mn)]);
        return { title: MONTHS[r.m - 1].charAt(0).toUpperCase() + MONTHS[r.m - 1].slice(1), pills: pills, rows: rows,
                 hint: (lastPointer === "touch" ? "Touche à nouveau" : "Clique") + " pour ouvrir la journée" };
    }
    function rbFill(template, name, flights) {   /* {voile}, {vols}, {duree} : le nom passe par textContent, donc échappé */
        return template.replace("{voile}", mk("b", "", name).innerHTML).replace("{vols}", plural(flights.length, "vol")).replace("{duree}", fmtDuration(rbSum(flights)));
    }
    function renderRibbon() {
        if (!rbCard) return;
        var body = q(".rb-body", rbCard)[0], now = q(".rb-now", rbCard)[0], disc = state.disc;
        body.textContent = now.textContent = "";
        now.hidden = true;
        var view = flightsData.f.filter(function (f) { return disc === "all" || f.disc === disc; });
        if (!view.length) { body.appendChild(mk("p", "empty", "Aucun vol dans cette discipline.")); return; }
        var wings = {}, list = [];
        view.forEach(function (f) {
            var name = f.w || "Voile non renseignée", w = wings[name];
            if (!w) {
                w = wings[name] = { name: name, min: 0, all: [], months: [], discs: {} };
                for (var m = 0; m < 12; m++) w.months.push([]);
                list.push(w);
            }
            w.months[+f.d.slice(5, 7) - 1].push(f);
            w.all.push(f);
            w.min += f.mn || 0;
            w.discs[f.disc] = 1;
        });
        if (list.length < 2) { body.appendChild(mk("p", "empty")).innerHTML = rbFill(rbCard.getAttribute("data-t-one"), list[0].name, []); return; }
        list.sort(function (a, b) { return b.min - a.min || (a.name < b.name ? -1 : 1); });
        /* voile du moment : fenêtre de data-days jours avant le dernier vol de l'année (toutes disciplines) ; rien si la discipline affichée n'a pas volé dans la fenêtre */
        var last = flightsData.f[flightsData.f.length - 1].d, days = +rbCard.getAttribute("data-days") || 30, p = last.split("-");
        var from = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - days)).toISOString().slice(0, 10);
        var best = null;
        list.forEach(function (w) {
            var recent = w.all.filter(function (f) { return f.d > from; });
            if (recent.length && (!best || recent.length > best.f.length || (recent.length === best.f.length && rbSum(recent) > rbSum(best.f)))) best = { w: w, f: recent };
        });
        if (best) { now.innerHTML = rbFill(rbCard.getAttribute("data-t-now"), best.w.name, best.f); now.hidden = false; }
        /* tableau */
        var nm = Math.max.apply(null, flightsData.f.map(function (f) { return +f.d.slice(5, 7); }));
        var peak = Math.max.apply(null, list.map(function (w) { return Math.max.apply(null, w.months.map(rbSum)); }));
        var kinds = {}, cells = [], start = null, best1 = 0;
        var table = mk("table", "mx rb"), head = mk("tr"), tb = mk("tbody");
        table.style.setProperty("--n", nm);
        table.appendChild(mk("caption", "sr-only", "Heures de vol par voile et par mois"));
        head.appendChild(mk("td"));
        for (var m = 0; m < nm; m++) { var th = mk("th", "", MONTHS_SHORT[m]); th.scope = "col"; head.appendChild(th); }
        head.appendChild(mk("th", "", "Total (h)")).scope = "col";
        table.appendChild(mk("thead")).appendChild(head);
        list.forEach(function (w) {
            var ds = Object.keys(w.discs), kind = ds.length > 1 ? "b" : ds[0] === "paramoteur" ? "m" : "p", tr = mk("tr", "mx-" + kind), name = mk("th", "");
            kinds[kind] = 1;
            tr.setAttribute("data-wing", w.name);
            name.scope = "row"; name.title = w.name;
            name.appendChild(xfBtn("wing", w.name, w.name, "rb-name"));
            tr.appendChild(name);
            for (var m = 0; m < nm; m++) {
                var fl = w.months[m], mn = rbSum(fl), td = mk("td");
                td.setAttribute("data-month", m + 1);
                td.setAttribute("role", "cell");
                td.setAttribute("data-tip", "rb");
                td.__rb = { w: w.name, m: m + 1, f: fl, d: fl.length ? fl[0].d : null };
                if (fl.length) {
                    td.className = "rb-c l" + (1 + RB_SHARES.filter(function (s) { return mn / peak > s; }).length);
                    td.textContent = fmtNum(Math.max(0.1, Math.round(mn / 6) / 10), 1);
                    if (mn > best1) { best1 = mn; start = td; }
                }
                var c = rbTip(td);
                td.setAttribute("aria-label", w.name + ", " + c.title + " : " + (fl.length ? plural(fl.length, "vol") + (mn ? " · " + fmtDuration(mn) : "") : "aucun vol"));
                cells.push(td);
                tr.appendChild(td);
            }
            tr.appendChild(mk("td", "t", fmtNum(Math.round(w.min / 6) / 10, 1)));
            tb.appendChild(tr);
        });
        table.appendChild(tb);
        if (start) start.setAttribute("tabindex", "0");
        rove(table, cells, 1, nm);
        var ks = Object.keys(kinds), ramp = function (k) { return '<span class="mx-' + k + '"><i class=l1></i><i class=l2></i><i class=l3></i><i class=l4></i></span>'; };
        var key = mk("p", "mx-key");
        key.setAttribute("aria-hidden", "true");
        key.innerHTML = ks.length === 1 ? "Moins " + ramp(ks[0]) + " Plus" : "Moins d'heures → plus : " + ks.map(function (k) { return ramp(k) + " " + { p: "parapente", m: "paramoteur", b: "les deux" }[k]; }).join(" · ");
        var box = mk("div", "mx-box mx-b"), scrollBox = mk("div", "mx-scroll");
        scrollBox.appendChild(table);
        box.appendChild(scrollBox);
        box.appendChild(key);
        body.appendChild(box);
    }

    /* ---------- Filtres croisés (T56) ----------
       Un seul modèle : xf = { site, wing, month, weekday, mode } (valeurs texte, combinées en ET), plus la discipline
       (state.disc) et la recherche texte. Il commande (1) les lignes du tableau « Tous tes vols » (filterFlights),
       (2) les puces « Site : X ✕ » (renderChips), (3) le surlignage ailleurs (applyHighlight) : classe body.xf-on et
       classe xf-hit sur les éléments retenus, le CSS estompe les autres ; les graphiques ne sont pas recalculés.
       Déclencheurs : boutons [data-xf] (voile, jour, façon, site) et barres de mois ; un second clic retire le filtre.
       jour = 0 (lundi) à 6, mois = « 1 » à « 12 ». Phrases : attributs data-t-* de #xf-tools (report_textes.md, xf_*). */
    var XF_ORDER = ["site", "wing", "month", "weekday", "mode"];
    var XF_NAME = { site: "Site", wing: "Voile", month: "Mois", weekday: "Jour", mode: "Façon" };
    var XF_NO_WING = "Voile non renseignée";       /* comme renderRibbon */
    var xf = {};
    var xfShown = 0, xfTotal = 0, volsInView = false;
    var xfTools = document.getElementById("xf-tools");
    var xfLive = mk("p", "sr-only"), xfGo = mk("a", "xf-go back-chart");
    xfLive.setAttribute("role", "status");
    xfGo.href = "#vols";
    xfGo.hidden = true;
    document.body.appendChild(xfLive);
    document.body.appendChild(xfGo);
    function T(key, vars) {                         /* phrase de #xf-tools, {nom} remplacés */
        var t = (xfTools && xfTools.getAttribute("data-t-" + key)) || "";
        return t.replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; });
    }
    function xfValues(f) {
        return { site: f.s, wing: f.w || XF_NO_WING, month: String(+f.d.slice(5, 7)), weekday: String(weekdayOf(f.d)), mode: f.f || "" };
    }
    function flightMatches(vals) {
        return XF_ORDER.every(function (k) { return xf[k] === undefined || vals[k] === xf[k]; });
    }
    function xfOn() { return Object.keys(xf).length > 0; }
    function xfLabel(key, value) { return key === "month" ? MONTHS[+value - 1] : key === "weekday" ? WEEKDAYS[+value] : value; }
    /* Bouton déclencheur : texte visible = text (ou la valeur), suffixe lu « Filtrer les vols » ; aria-pressed mis à jour par applyHighlight */
    function xfBtn(key, value, text, cls) {
        var b = mk("button", "xf-btn " + (cls || ""), text);
        b.type = "button";
        b.dataset.xf = key;
        b.dataset.xfV = value;
        b.appendChild(mk("span", "sr-only", ". " + T("sr")));
        return b;
    }
    function setFilter(key, value) {
        if (xf[key] === value) delete xf[key]; else xf[key] = value;
        xfRefresh();
    }
    function clearFilters() { xf = {}; xfRefresh(); }
    function xfRefresh() {
        if (monthSelect) monthSelect.value = xf.month || "";
        filterFlights();
        applyHighlight();
        updateGo();
        xfLive.textContent = xfOn() ? T("annonce", { vols: plural(xfShown, "vol"), total: xfTotal }) : T("retires");
    }
    function renderChips() {
        var box = document.getElementById("xf-chips");
        if (!box) return;
        box.textContent = "";
        XF_ORDER.forEach(function (k) {
            if (xf[k] === undefined) return;
            var label = xfLabel(k, xf[k]), chip = mk("button", "xf-chip", XF_NAME[k] + " : " + label + " ✕");
            chip.type = "button";
            chip.dataset.xfX = k;
            chip.setAttribute("aria-label", T("puce", { filtre: XF_NAME[k].toLowerCase(), valeur: label }));
            box.appendChild(chip);
        });
        if (backToMonths) backToMonths.hidden = xf.month === undefined;
    }
    /* Lien flottant « Voir les n vols ↓ » : visible tant qu'un filtre est posé et que le tableau n'est pas à l'écran */
    function updateGo() {
        xfGo.hidden = !xfOn() || volsInView;
        if (!xfGo.hidden) xfGo.textContent = T("voir", { vols: plural(xfShown, "vol") });
    }
    function applyHighlight() {
        var on = xfOn(), sites = {}, dates = {};
        document.body.classList.toggle("xf-on", on);
        q("[data-xf]").forEach(function (b) { b.setAttribute("aria-pressed", String(xf[b.dataset.xf] === b.dataset.xfV)); });
        q(".xf-hit").forEach(function (el) { el.classList.remove("xf-hit"); });
        if (!on) return;
        function mark(selector, test) { q(selector).forEach(function (el) { if (test(el)) el.classList.add("xf-hit"); }); }
        flightsData.f.forEach(function (f) {
            if ((state.disc !== "all" && f.disc !== state.disc) || !flightMatches(xfValues(f))) return;
            dates[f.d] = sites[f.s] = 1;
        });
        mark(".days > [data-date]", function (el) { return dates[el.getAttribute("data-date")]; });
        mark("circle[data-site]", function (el) { return sites[el.getAttribute("data-site")]; });
        mark("circle[data-zone], circle[data-halo]", function (el) {
            var z = mapData.z[+(el.getAttribute("data-zone") || el.getAttribute("data-halo"))];
            return z && z[1].some(function (s) { return sites[s]; });
        });
        /* ruban voile × mois : une case est retenue si elle contient un vol retenu, une ligne si elle contient une case retenue */
        mark("table.rb td[data-tip]", function (td) { return td.__rb.f.some(function (f) { return flightMatches(xfValues(f)); }); });
        mark("table.rb tbody tr", function (tr) { return !!tr.querySelector(".xf-hit"); });
    }
    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-xf]");
        if (b) { setFilter(b.dataset.xf, b.dataset.xfV); return; }
        var x = e.target.closest && e.target.closest("[data-xf-x]");
        if (!x) return;
        delete xf[x.dataset.xfX];
        xfRefresh();
        var next = q(".xf-chip")[0] || resetFilters;     /* le focus ne reste pas sur une puce disparue */
        if (next) next.focus();
    });
    /* Déclencheurs créés une fois : voiles (tableau), jours (matrice), façons de voler (légende) ; ruban : voir renderRibbon */
    q("#matos table.bars").forEach(function (table) {
        if (table.tHead.rows[0].cells[0].textContent !== "Voile") return;
        q("tbody td:first-child", table).forEach(function (td) {
            var name = td.getAttribute("data-v") || XF_NO_WING;
            td.replaceChild(xfBtn("wing", name, name), td.firstChild);
        });
    });
    q("table.mx:not(.rb) tbody tr").forEach(function (tr, day) {
        var th = tr.cells[0];
        th.replaceChild(xfBtn("weekday", String(day), th.textContent), th.firstChild);
    });
    q(".mode-legend li").forEach(function (li) {
        var b = xfBtn("mode", li.querySelector("strong").textContent, "");
        while (li.firstChild) b.insertBefore(li.firstChild, b.lastChild);
        li.appendChild(b);
    });
    if ("IntersectionObserver" in window && document.getElementById("vols")) {
        new IntersectionObserver(function (entries) {
            volsInView = entries[entries.length - 1].isIntersecting;
            updateGo();
        }).observe(document.getElementById("vols"));
    }

    renderSparks();
    applyState();
    if (mapBox) centerMapView();
    countUp();
    window.__rapportOk = true;   /* signale au script du <head> que le rapport est démarré */
})();