/**
 * Calculs du Bilan, lot A : cartes de chiffres, tableau de comparaison, vol de l'année, jalons cliquables,
 * points des jalons sur la courbe cumulée, changement d'année dans l'URL.
 *
 * Règles du rapport (`report_data.py`, `report_html.py`), reproduites ici :
 * - les chiffres de l'année du bilan sont arrêtés à `cutoff` (`kpi_equiv[année]`), ceux des années comparées sont
 *   ENTIERS : `deltaPct(année en cours à date, année comparée entière)` ;
 * - une pastille est « stable » sous 0,5 % ; seuls vols, heures et jours volés sont colorés (vert / rouge), le reste
 *   est neutre ;
 * - une mesure absente de tous les vols s'affiche « non mesuré » (pas de mini-courbe) ; absente de certains vols,
 *   elle s'accompagne de « sur N vols mesurés » ;
 * - le « vol de l'année » est le plus long vol (`records["duree"][0]`).
 * Les textes (phrases du récit) ne sont jamais produits ici : ils viennent des insights.
 */
import type { Flight } from '@/data/flight';
import type { Story } from '@/data/schema.gen';
import { dayOfLeapYear } from '@/lib/compare';
import { fmtDuration, fmtHm, fmtInt, fmtNum, NBSP } from '@/lib/format';
import {
  computeCoverage,
  computeKpis,
  deltaPct,
  topRecords,
  type CoverageKey,
  type Kpis,
  type RecordEntry,
} from '@/lib/records';
import { parseCompareYears, writeCompareYears, PARAM_COMPARE } from '@/lib/bilan';
import { maxPositive, positives } from '@/lib/numeric';
import { minutesOf } from '@/lib/rhythm';

// ---------------------------------------------------------------------------
// Cartes de chiffres et tableau de comparaison
// ---------------------------------------------------------------------------

/** Pastille d'écart : vert / rouge pour les volumes, neutre pour le reste. */
export type KpiKind = 'volume' | 'neutre';

export type KpiId =
  | 'vols'
  | 'temps'
  | 'jours'
  | 'sites'
  | 'duree'
  | 'distance'
  | 'plafond'
  | 'vitesse'
  | 'vario'
  | 'g';

interface KpiDef {
  id: KpiId;
  label: string;
  kind: KpiKind;
  /** Unité écrite à côté de la valeur ; « » si la mise en forme la contient déjà. */
  unit: string;
  /** Mesure dont dépend la couverture (`KPI_MEASURE` du rapport) ; `null` : toujours connue. */
  measure: CoverageKey | null;
  value: (k: Kpis) => number | null;
  /** Mise en forme du tableau de comparaison (unité comprise), comme `_fmt_value` du rapport. */
  format: (v: number) => string;
  /** Mise en forme dans une carte (valeur seule, l'unité est à part) ; défaut : `format`. */
  cardFormat?: (v: number) => string;
  /** Valeur d'un mois (12 barres de la mini-courbe) ; `null` : pas de mini-courbe. */
  month: ((flights: readonly Flight[]) => number) | null;
}

const withUnit = (unit: string, format: (v: number) => string) => (v: number) => `${format(v)}${NBSP}${unit}`;
const fmt1 = (v: number) => fmtNum(v, 1);

/** Durée moyenne d'un mois : moyenne des vols dont la durée est connue (`report.js` : `f.mn` non nul). */
function monthMeanDuration(flights: readonly Flight[]): number {
  const known = flights.map(minutesOf).filter((m) => m > 0);
  return known.length === 0 ? 0 : known.reduce((a, b) => a + b, 0) / known.length;
}

export const KPI_DEFS: readonly KpiDef[] = [
  {
    id: 'vols',
    label: 'Vols',
    kind: 'volume',
    unit: '',
    measure: null,
    value: (k) => k.nFlights,
    format: fmtInt,
    month: (fs) => fs.length,
  },
  {
    id: 'temps',
    label: 'Temps de vol',
    kind: 'volume',
    unit: '',
    measure: null,
    value: (k) => k.minutes,
    format: fmtDuration,
    cardFormat: fmtHm,
    month: (fs) => fs.reduce((a, f) => a + minutesOf(f), 0),
  },
  {
    id: 'jours',
    label: 'Jours de vol',
    kind: 'volume',
    unit: '',
    measure: null,
    value: (k) => k.daysFlown,
    format: fmtInt,
    month: (fs) => new Set(fs.map((f) => f.date)).size,
  },
  {
    id: 'sites',
    label: 'Sites différents',
    kind: 'neutre',
    unit: '',
    measure: null,
    value: (k) => k.nSites,
    format: fmtInt,
    month: (fs) => new Set(fs.filter((f) => f.site !== null).map((f) => f.site)).size,
  },
  {
    id: 'duree',
    label: 'Durée moyenne',
    kind: 'neutre',
    unit: '',
    measure: null,
    value: (k) => k.durationMean,
    format: fmtDuration,
    month: monthMeanDuration,
  },
  {
    id: 'distance',
    label: 'Distance totale',
    kind: 'neutre',
    unit: 'km',
    measure: 'distance',
    value: (k) => k.distanceTotal,
    format: withUnit('km', fmtInt),
    cardFormat: fmtInt,
    month: (fs) => positives(fs.map((f) => f.distKm)).reduce((a, b) => a + b, 0),
  },
  {
    id: 'plafond',
    label: 'Plafond max',
    kind: 'neutre',
    unit: 'm',
    measure: 'plafond',
    value: (k) => k.ceilingMax,
    format: withUnit('m', fmtInt),
    cardFormat: fmtInt,
    month: (fs) => maxPositive(fs.map((f) => f.ceilingM)) ?? 0,
  },
  {
    id: 'vitesse',
    label: 'Vitesse max',
    kind: 'neutre',
    unit: 'km/h',
    measure: 'vitesseMax',
    value: (k) => k.speedMaxMax,
    format: withUnit('km/h', fmtInt),
    cardFormat: fmtInt,
    month: (fs) => maxPositive(fs.map((f) => f.speedMax)) ?? 0,
  },
  {
    id: 'vario',
    label: 'Vario max',
    kind: 'neutre',
    unit: 'm/s',
    measure: 'vario',
    value: (k) => k.varioMax,
    format: withUnit('m/s', fmt1),
    cardFormat: fmt1,
    month: null,
  },
  {
    id: 'g',
    label: 'Facteur g max',
    kind: 'neutre',
    unit: 'g',
    measure: 'g',
    value: (k) => k.gMax,
    format: withUnit('g', fmt1),
    cardFormat: fmt1,
    month: null,
  },
];

/** Les 8 cartes de l'aperçu, dans l'ordre de la maquette. */
export const OVERVIEW_IDS: readonly KpiId[] = ['vols', 'temps', 'jours', 'sites', 'duree', 'distance', 'plafond', 'vitesse'];

export interface KpiDelta {
  year: number;
  /** Écart en % par rapport à l'année comparée entière ; `null` : non calculable. */
  pct: number | null;
}

export interface KpiRow {
  id: KpiId;
  label: string;
  kind: KpiKind;
  unit: string;
  /** Mesure dont dépend la couverture ; `null` : toujours connue. */
  measure: CoverageKey | null;
  value: number | null;
  /** Valeur de l'année du bilan (unité comprise, « – » si absente). */
  text: string;
  /** Valeur pour une carte (sans l'unité). */
  cardText: string;
  /** Mesure absente de tous les vols : afficher « non mesuré ». */
  notMeasured: boolean;
  /** Mesure absente de certains vols : « sur `ok` vols mesurés ». */
  measuredNote: { ok: number; n: number } | null;
  /** 12 valeurs mensuelles ; `null` : pas de mini-courbe. */
  spark: number[] | null;
  deltas: KpiDelta[];
  /** Valeurs des années comparées (unité comprise), même ordre que `deltas`. */
  refs: { year: number; value: number | null; text: string }[];
}

const DASH = '–';

/** Vols par mois (index 0 = janvier). */
export function monthBuckets(flights: readonly Flight[]): Flight[][] {
  const out: Flight[][] = Array.from({ length: 12 }, () => []);
  for (const f of flights) out[f.month - 1]?.push(f);
  return out;
}

/** Mini-courbe mensuelle d'un chiffre ; `null` si tout est nul (`report.js` : `!max`). */
export function sparkValues(def: Pick<KpiDef, 'month'>, buckets: readonly (readonly Flight[])[]): number[] | null {
  if (!def.month) return null;
  const values = buckets.map((b) => def.month?.(b) ?? 0);
  return Math.max(...values) > 0 ? values : null;
}

/**
 * Lignes des chiffres de l'année : `flights` arrêté à la coupure, `compareFlights` années entières.
 * `ids` choisit et ordonne les lignes (par défaut, les 10 du tableau de comparaison).
 */
export function kpiRows(
  flights: readonly Flight[],
  compareYears: readonly number[],
  compareFlights: ReadonlyMap<number, readonly Flight[]>,
  ids?: readonly KpiId[],
): KpiRow[] {
  const kpis = computeKpis(flights);
  const coverage = computeCoverage(flights);
  const buckets = monthBuckets(flights);
  const refKpis = compareYears.map((y) => [y, computeKpis(compareFlights.get(y) ?? [])] as const);
  const defs = ids ? ids.map((id) => KPI_DEFS.find((d) => d.id === id)).filter((d): d is KpiDef => !!d) : KPI_DEFS;
  return defs.map((def) => {
    const value = def.value(kpis);
    const ok = def.measure ? coverage.measured[def.measure] : coverage.n;
    const notMeasured = def.measure !== null && coverage.n > 0 && ok === 0;
    const measuredNote = def.measure !== null && !notMeasured && ok < coverage.n ? { ok, n: coverage.n } : null;
    const card = def.cardFormat ?? def.format;
    return {
      id: def.id,
      label: def.label,
      kind: def.kind,
      unit: def.unit,
      measure: def.measure,
      value,
      text: value === null ? DASH : def.format(value),
      cardText: value === null ? DASH : card(value),
      notMeasured,
      measuredNote,
      spark: notMeasured ? null : sparkValues(def, buckets),
      deltas: refKpis.map(([year, ref]) => ({ year, pct: deltaPct(value, def.value(ref)) })),
      refs: refKpis.map(([year, ref]) => {
        const v = def.value(ref);
        return { year, value: v, text: v === null ? DASH : def.format(v) };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Vol de l'année, jalons
// ---------------------------------------------------------------------------

export interface FlightOfYear {
  entry: RecordEntry;
  flight: Flight | null;
}

/** « Vol de l'année » : le plus long vol (règle du rapport, `records["duree"][0]`). `null` sans durée connue. */
export function flightOfTheYear(flights: readonly Flight[]): FlightOfYear | null {
  const entry = topRecords(flights, 1).duree[0];
  if (!entry) return null;
  return { entry, flight: flights.find((f) => f.key === entry.flightKey) ?? null };
}

/** Vrai si ce vol a battu un record personnel de l'année (`records_beaten`) : sa valeur peut passer en or. */
export function isRecordFlight(story: NonNullable<Story>, key: string, metric?: string): boolean {
  return story.records_beaten.some((r) => r.flight === key && (metric === undefined || r.metric === metric));
}

export type MilestoneTarget = { type: 'flight'; key: string } | { type: 'day'; date: string } | null;

/**
 * Cible d'un jalon : sa fiche vol si le vol existe dans l'historique, sinon la fiche du jour s'il y a des vols
 * ce jour-là, sinon rien (non cliquable).
 */
export function milestoneTarget(
  milestone: { date: string; flight: string | null },
  flightKeys: ReadonlySet<string>,
  flightDays: ReadonlySet<string>,
): MilestoneTarget {
  if (milestone.flight !== null && flightKeys.has(milestone.flight)) return { type: 'flight', key: milestone.flight };
  if (flightDays.has(milestone.date)) return { type: 'day', date: milestone.date };
  return null;
}

/** Étiquette d'un jalon d'or (« Record », « Nouveauté », « Meilleur jour ») ; `null` pour les autres. */
export function milestoneTag(kind: string, gold: boolean): string | null {
  if (!gold) return null;
  if (kind === 'record') return 'Record';
  if (kind === 'best_day') return 'Meilleur jour';
  if (kind === 'new_site' || kind === 'new_wing') return 'Nouveauté';
  return null;
}

export interface MilestonePoint {
  date: string;
  /** Valeur d'axe de la courbe (jour de l'année bissextile `2000-MM-JJ`). */
  axis: string;
  /** Heures cumulées ce jour-là. */
  hours: number;
  titles: string[];
  gold: boolean;
}

/**
 * Points des jalons sur la courbe des heures cumulées de l'année du bilan. Un jour qui porte plusieurs jalons
 * donne un seul point (titres regroupés). Les jalons hors de la courbe (après la coupure) sont ignorés.
 */
export function milestonePoints(
  milestones: readonly { date: string; title: string; gold: boolean }[],
  axis: readonly string[],
  values: readonly (number | null)[],
): MilestonePoint[] {
  const byDate = new Map<string, MilestonePoint>();
  for (const m of milestones) {
    const index = dayOfLeapYear(m.date);
    const hours = values[index];
    const axisValue = axis[index];
    if (hours === null || hours === undefined || axisValue === undefined) continue;
    const known = byDate.get(m.date);
    if (known) {
      known.titles.push(m.title);
      known.gold = known.gold || m.gold;
    } else {
      byDate.set(m.date, { date: m.date, axis: axisValue, hours, titles: [m.title], gold: m.gold });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Équivalences et changement d'année
// ---------------------------------------------------------------------------

/** Indice suivant de la rotation des équivalences (bouton ↻). */
export function nextEquivalence(index: number, count: number): number {
  return count <= 1 ? 0 : (index + 1) % count;
}

/**
 * Paramètres d'URL après un changement d'année : les filtres sont conservés ; `comparer` ne l'est que s'il reste
 * valide pour la nouvelle année (années connues et antérieures, deux au plus), sinon il est retiré. Un choix
 * identique au défaut de la nouvelle année est normalisé (paramètre retiré).
 */
export function paramsForYear(
  params: URLSearchParams,
  newYear: number,
  available: readonly number[],
): URLSearchParams {
  const raw = params.get(PARAM_COMPARE);
  const next = new URLSearchParams(params);
  if (raw === null) return next;
  const listed = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map(Number);
  const valid =
    listed.length <= 2 &&
    new Set(listed).size === listed.length &&
    listed.every((y) => Number.isInteger(y) && y < newYear && available.includes(y));
  if (!valid) {
    next.delete(PARAM_COMPARE);
    return next;
  }
  return writeCompareYears(next, parseCompareYears(next, available, newYear), available, newYear);
}

// ---------------------------------------------------------------------------
// Fiche du jour : ouverture depuis un autre bloc du Bilan
// ---------------------------------------------------------------------------

/** Événement de document : demande d'ouverture de la fiche du jour (`detail` = date ISO), écouté par le bloc Rythme. */
export const OPEN_DAY_EVENT = 'bilan:open-day';

export function requestOpenDay(iso: string): void {
  document.dispatchEvent(new CustomEvent<string>(OPEN_DAY_EVENT, { detail: iso }));
}

// ---------------------------------------------------------------------------
// Fond de l'en-tête : courbes de niveau (port de `hero_topo`, sans animation)
// ---------------------------------------------------------------------------

/** Massifs : (centre x, centre y, nombre de courbes, écart entre courbes, étirement horizontal, phase du relief). */
const TOPO_PEAKS = [
  [960, 150, 15, 21, 1.45, 0.4],
  [150, 470, 9, 24, 1.25, 2.1],
] as const;
const TOPO_INDEX_EVERY = 5;
const TOPO_POINTS = 28;

/** Tracés (attribut `d`) des courbes de niveau : `lines` courantes et `index` (une sur cinq, plus marquée). */
export function topoPaths(): { lines: string; index: string } {
  const lines: string[] = [];
  const index: string[] = [];
  const n = TOPO_POINTS;
  for (const [cx, cy, count, step, stretch, phase] of TOPO_PEAKS) {
    for (let k = 1; k <= count; k++) {
      const r = k * step;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const t = (2 * Math.PI * i) / n;
        const f = 1 + 0.17 * Math.sin(2 * t + phase) + 0.09 * Math.sin(3 * t + 2 * phase) + 0.05 * Math.sin(5 * t + 1.3);
        pts.push([cx + r * f * stretch * Math.cos(t), cy - 1.2 * k + r * f * Math.sin(t)]);
      }
      const mids = pts.map((p, i) => {
        const q = pts[(i + n - 1) % n] as [number, number];
        return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
      });
      const m0 = mids[0] as readonly [number, number];
      let d = `M${Math.round(m0[0])} ${Math.round(m0[1])}`;
      for (let i = 0; i < n; i++) {
        const p = pts[i] as [number, number];
        const m = mids[(i + 1) % n] as readonly [number, number];
        d += `Q${Math.round(p[0])} ${Math.round(p[1])} ${Math.round(m[0])} ${Math.round(m[1])}`;
      }
      (k % TOPO_INDEX_EVERY === 0 ? index : lines).push(`${d}z`);
    }
  }
  return { lines: lines.join(''), index: index.join('') };
}
