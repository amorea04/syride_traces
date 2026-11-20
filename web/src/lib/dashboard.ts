/**
 * Calculs du tableau de bord (lot A de la phase 3) : bandeau de KPI et période précédente, activité
 * collective (saison du groupe, mois / semaine, derniers vols, records récents), caractéristiques de vol,
 * barres de « Répartitions » et séries d'« Évolution ». Tout est pur : les composants restent minces.
 *
 * Date de référence (« aujourd'hui ») : `referenceDate`, jamais l'horloge, pour que le tableau de bord
 * reflète l'état des données (dernière mise à jour).
 */

import type { Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import { flightMatches, sortYears, todayIso, yearsContiguous, type Filters } from '@/lib/filters';
import { fmtDuration, fmtHours, fmtInt, fmtNum, MONTHS_LONG, MONTHS_SHORT, NBSP } from '@/lib/format';
import { daysInMonth, epochDay, isoOfEpochDay, mondayOfEpochDay } from '@/lib/isoDay';
import { MEASURES, type MeasureDef } from '@/lib/measures';
import { METRICS, metricById, type Metric, type MetricId } from '@/lib/metrics';
import {
  compareStrings,
  distinctCount,
  maxPositive,
  meanPositive,
  median,
  positives,
  sum,
  sumPositive,
} from '@/lib/numeric';
import { deltaPct } from '@/lib/records';
import { cumulativeSteps, minutesOf, xOfDate } from '@/lib/rhythm';
import { computeMetrics, type AxisId, type GroupRow } from '@/lib/stats';
import type { Highlight } from '@/store/highlight';

// ---------------------------------------------------------------------------
// Date de référence et périodes
// ---------------------------------------------------------------------------

/**
 * Date de référence : `meta.data_updated_at` (AAAA-MM-JJ…), sinon la date du dernier vol, sinon le jour
 * de l'horloge (cas d'une base vide).
 */
export function referenceDate(dataUpdatedAt: string | null | undefined, flights: readonly Flight[]): string {
  if (dataUpdatedAt) return dataUpdatedAt.slice(0, 10);
  let last = '';
  for (const f of flights) if (f.date > last) last = f.date;
  return last || todayIso();
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Période filtrée. Règle : `dateFrom` obligatoire (sans borne de début, la durée n'est pas définie : `null`) ;
 * `dateFrom` seul = de `dateFrom` jusqu'à la date de référence (ou `dateFrom` lui-même si elle est postérieure) ;
 * une `dateTo` postérieure à la date de référence est plafonnée à celle-ci (période « à date ») ;
 * `dateTo` sans `dateFrom` = pas de période comparable. Bornes incluses.
 */
export function filteredPeriod(
  dateFrom: string | null,
  dateTo: string | null,
  today: string,
): DateRange | null {
  if (dateFrom === null) return null;
  let to = dateTo ?? (today >= dateFrom ? today : dateFrom);
  // Une fin postérieure à la date de référence est ramenée à celle-ci : on compare des périodes écoulées de même durée.
  if (to > today && today >= dateFrom) to = today;
  if (to < dateFrom) return null;
  return { from: dateFrom, to };
}

/** Période précédente équivalente : même durée, juste avant `dateFrom`. `null` si pas de période filtrée. */
export function previousPeriod(
  dateFrom: string | null,
  dateTo: string | null,
  today: string,
): DateRange | null {
  const period = filteredPeriod(dateFrom, dateTo, today);
  if (!period) return null;
  const start = epochDay(period.from);
  const days = epochDay(period.to) - start + 1;
  return { from: isoOfEpochDay(start - days), to: isoOfEpochDay(start - 1) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Même jour de l'année précédente (le 29 février devient le 28). */
function sameDayPreviousYear(iso: string): string {
  const y = Number(iso.slice(0, 4)) - 1;
  const m = Number(iso.slice(5, 7));
  const d = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export interface Comparison {
  period: DateRange;
  previous: DateRange;
  /** `annee` : comparaison à l'année précédente ; `periode` : à la période précédente de même durée. */
  kind: 'annee' | 'periode';
}

/**
 * Période filtrée et période de comparaison des KPI, d'après la période Du / Au et les années cochées.
 * - une seule année, sans période : l'année précédente, jusqu'au même jour si l'année est en cours ;
 * - années contiguës : leur étendue (du 1er janvier au 31 décembre), comparée à la période précédente de même durée ;
 * - années non contiguës : pas de comparaison (`null`) ;
 * - années et période : l'intersection, comparée à la période précédente de même durée.
 */
export function comparisonPeriods(filters: Filters, today: string): Comparison | null {
  const years = sortYears(filters.years);
  if (years.length === 0) {
    const period = filteredPeriod(filters.dateFrom, filters.dateTo, today);
    const previous = previousPeriod(filters.dateFrom, filters.dateTo, today);
    return period && previous ? { period, previous, kind: 'periode' } : null;
  }
  if (!yearsContiguous(years)) return null;
  const first = years[0] ?? 0;
  const last = years[years.length - 1] ?? 0;
  let from = `${first}-01-01`;
  let to = `${last}-12-31`;
  const hasPeriod = filters.dateFrom !== null || filters.dateTo !== null;
  if (hasPeriod) {
    if (filters.dateFrom !== null && filters.dateFrom > from) from = filters.dateFrom;
    if (filters.dateTo !== null && filters.dateTo < to) to = filters.dateTo;
  }
  const period = filteredPeriod(from, to, today);
  if (!period) return null;
  if (years.length === 1 && !hasPeriod) {
    return {
      period,
      previous: { from: `${first - 1}-01-01`, to: sameDayPreviousYear(period.to) },
      kind: 'annee',
    };
  }
  const previous = previousPeriod(period.from, period.to, today);
  return previous ? { period, previous, kind: 'periode' } : null;
}

// ---------------------------------------------------------------------------
// Meilleur vol d'un critère
// ---------------------------------------------------------------------------

export interface Best {
  flight: Flight;
  value: number;
}

/** Vol qui maximise `valueOf` (valeurs > 0 seulement) ; à égalité le plus ancien. */
export function bestOf(flights: readonly Flight[], valueOf: (f: Flight) => number | null): Best | null {
  let best: Best | null = null;
  for (const flight of flights) {
    const value = valueOf(flight);
    if (value === null || !(value > 0)) continue;
    if (best === null || value > best.value || (value === best.value && flight.date < best.flight.date)) {
      best = { flight, value };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Bandeau de KPI
// ---------------------------------------------------------------------------

export const KPI_IDS = ['vols', 'heures', 'sites', 'pilotes', 'distance', 'plafond'] as const;
export type KpiId = (typeof KPI_IDS)[number];

export interface KpiValues {
  flights: number;
  /** Total des durées en minutes. */
  minutes: number;
  sites: number;
  pilots: number;
  /** Somme des distances cumulées (`distCumKm`, valeurs > 0), `null` sans mesure. */
  distanceKm: number | null;
  ceilingM: number | null;
  /** Clé du vol au plafond maximal (lien `/vol/:key`). */
  ceilingFlightKey: string | null;
}

export function kpiValues(flights: readonly Flight[]): KpiValues {
  const ceiling = bestOf(flights, (f) => f.ceilingM);
  return {
    flights: flights.length,
    minutes: sum(flights.map(minutesOf)),
    sites: distinctCount(flights.map((f) => f.site)),
    pilots: distinctCount(flights.map((f) => f.pilot)),
    distanceKm: sumPositive(flights.map((f) => f.distCumKm)),
    ceilingM: ceiling?.value ?? null,
    ceilingFlightKey: ceiling?.flight.key ?? null,
  };
}

export interface KpiBandResult {
  current: KpiValues;
  /** Période précédente équivalente (`null` si aucune période n'est filtrée). */
  period: DateRange | null;
  previousPeriod: DateRange | null;
  /** Nature de la comparaison (`null` sans comparaison). */
  comparisonKind: Comparison['kind'] | null;
  previous: KpiValues | null;
  /** Variation en % par tuile ; `null` en bloc sans période, `null` par tuile si non calculable. */
  deltas: Record<KpiId, number | null> | null;
}

/**
 * KPI de la sélection et variations par rapport à la période précédente équivalente.
 * Les vols de comparaison : tous les vols qui passent les filtres hors période et tombent dans la période précédente.
 */
export function kpiBand(
  allFlights: readonly Flight[],
  selection: readonly Flight[],
  filters: Filters,
  today: string,
): KpiBandResult {
  const current = kpiValues(selection);
  const comparison = comparisonPeriods(filters, today);
  if (!comparison) {
    const period = filters.years.length > 0 ? null : filteredPeriod(filters.dateFrom, filters.dateTo, today);
    return { current, period, previousPeriod: null, comparisonKind: null, previous: null, deltas: null };
  }
  const { period, previous: prevRange } = comparison;
  const previousFlights = allFlights.filter(
    (f) => f.date >= prevRange.from && f.date <= prevRange.to && flightMatches(f, filters, 'period'),
  );
  const previous = kpiValues(previousFlights);
  return {
    current,
    period,
    previousPeriod: prevRange,
    comparisonKind: comparison.kind,
    previous,
    deltas: {
      vols: deltaPct(current.flights, previous.flights),
      heures: deltaPct(current.minutes, previous.minutes),
      sites: deltaPct(current.sites, previous.sites),
      pilotes: deltaPct(current.pilots, previous.pilots),
      distance: deltaPct(current.distanceKm, previous.distanceKm),
      plafond: deltaPct(current.ceilingM, previous.ceilingM),
    },
  };
}

// ---------------------------------------------------------------------------
// La saison du groupe
// ---------------------------------------------------------------------------

export interface SeasonGap {
  year: number;
  previousYear: number;
  /** Minutes cumulées de l'année de référence, du 1er janvier à la date de référence. */
  minutes: number;
  /** Minutes cumulées de l'année précédente à la même date (même jour et mois). */
  previousMinutes: number;
  /** `minutes − previousMinutes`. */
  gapMinutes: number;
  /** Courbes en escalier : [position dans l'année (0–1), heures cumulées]. */
  curve: [number, number][];
  previousCurve: [number, number][];
  /** Position de la date de référence dans l'année (fin de journée). */
  xToday: number;
}

/** Écart « à date » entre l'année de `today` et la précédente (port de `year_gap`, sur tous les pilotes). */
export function seasonGap(flights: readonly Flight[], today: string): SeasonGap {
  const year = Number(today.slice(0, 4));
  const monthDay = today.slice(5);
  const currentFlights = flights.filter((f) => f.year === year && f.date <= today);
  const previousFlights = flights.filter((f) => f.year === year - 1);
  const minutes = sum(currentFlights.map(minutesOf));
  const previousMinutes = sum(previousFlights.filter((f) => f.date.slice(5) <= monthDay).map(minutesOf));
  const xToday = xOfDate(today);
  const curve: [number, number][] = [[0, 0], ...cumulativeSteps(currentFlights), [xToday, minutes / 60]];
  const previousTotal = sum(previousFlights.map(minutesOf)) / 60;
  const previousCurve: [number, number][] = [[0, 0], ...cumulativeSteps(previousFlights), [1, previousTotal]];
  return {
    year,
    previousYear: year - 1,
    minutes,
    previousMinutes,
    gapMinutes: minutes - previousMinutes,
    curve,
    previousCurve,
    xToday,
  };
}

/** Date ISO correspondant à une position dans l'année (inverse approché de `xOfDate`, fin de journée). */
export function dateOfPosition(x: number, year: number): string {
  const monthFloat = Math.min(Math.max(x, 0), 1) * 12;
  const month = Math.min(12, Math.max(1, Math.ceil(monthFloat - 1e-9)));
  const dim = daysInMonth(year, month);
  const day = Math.min(dim, Math.max(1, Math.round((monthFloat - (month - 1)) * dim)));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Valeur d'une courbe en escalier à la position `x` (dernier point dont l'abscisse est ≤ x). */
export function stepValueAt(curve: readonly [number, number][], x: number): number {
  let value = 0;
  for (const [px, py] of curve) {
    if (px > x + 1e-9) break;
    value = py;
  }
  return value;
}

/** Écart sous le seuil duquel on parle de « autant » (une minute d'arrondi d'affichage ne fait pas une avance). */
const GAP_EVEN_MINUTES = 3;

/** Phrase d'écart : « Le groupe a 34 h d'avance sur 2025 à date. » */
export function seasonPhrase(gap: SeasonGap): string {
  if (gap.previousMinutes === 0 && gap.minutes === 0) {
    return `Aucun vol en ${gap.previousYear} ni en ${gap.year} à date.`;
  }
  if (gap.previousMinutes === 0)
    return `Aucun vol en ${gap.previousYear} à la même date\u00a0: pas de comparaison.`;
  const abs = Math.abs(gap.gapMinutes);
  if (abs < GAP_EVEN_MINUTES) return `Le groupe a volé autant qu’en ${gap.previousYear} à date.`;
  const tenths = Math.round(abs / 6);
  const amount = fmtHours(abs, abs >= 600 || tenths % 10 === 0 ? 0 : 1);
  const word = gap.gapMinutes > 0 ? 'd’avance' : 'de retard';
  return `Le groupe a ${amount} ${word} sur ${gap.previousYear} à date.`;
}

// ---------------------------------------------------------------------------
// Ce mois-ci / cette semaine
// ---------------------------------------------------------------------------

export type PeriodKind = 'mois' | 'semaine';

/** Du début du mois (ou du lundi de la semaine) jusqu'à `today`. */
export function currentPeriodRange(today: string, kind: PeriodKind): DateRange {
  if (kind === 'mois') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: isoOfEpochDay(mondayOfEpochDay(epochDay(today))), to: today };
}

export interface PeriodActivity {
  range: DateRange;
  pilots: number;
  flights: number;
  minutes: number;
  topSite: { site: string; flights: number } | null;
  longest: Best | null;
}

export function periodActivity(flights: readonly Flight[], today: string, kind: PeriodKind): PeriodActivity {
  const range = currentPeriodRange(today, kind);
  const inRange = flights.filter((f) => f.date >= range.from && f.date <= range.to);
  const bySite = groupBy(inRange, (f) => f.site);
  let topSite: PeriodActivity['topSite'] = null;
  let topMinutes = -1;
  for (const [site, list] of bySite) {
    const minutes = sum(list.map(minutesOf));
    const better =
      topSite === null ||
      list.length > topSite.flights ||
      (list.length === topSite.flights &&
        (minutes > topMinutes || (minutes === topMinutes && compareStrings(site, topSite.site) < 0)));
    if (better) {
      topSite = { site, flights: list.length };
      topMinutes = minutes;
    }
  }
  return {
    range,
    pilots: distinctCount(inRange.map((f) => f.pilot)),
    flights: inRange.length,
    minutes: sum(inRange.map(minutesOf)),
    topSite,
    longest: bestOf(inRange, (f) => f.durationMin),
  };
}

// ---------------------------------------------------------------------------
// Derniers vols
// ---------------------------------------------------------------------------

/** Les `count` vols les plus récents (date puis heure décroissantes ; sans heure = minuit ; puis numéro Syride). */
export function latestFlights(flights: readonly Flight[], count = 15): Flight[] {
  const stamp = (f: Flight): string => `${f.date} ${f.time ?? '00:00'}`;
  return [...flights]
    .sort((a, b) => {
      const sa = stamp(a);
      const sb = stamp(b);
      return sa < sb ? 1 : sa > sb ? -1 : b.syrideNum - a.syrideNum;
    })
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Records récents
// ---------------------------------------------------------------------------

export const RECENT_RECORD_DAYS = 30;

export const RECORD_METRIC_IDS = ['plafond', 'distance', 'duree', 'vitesseMax', 'vario', 'g'] as const;
export type RecordMetricId = (typeof RECORD_METRIC_IDS)[number];

/** Critères de records (mesures partagées, voir `lib/measures`). */
export const RECORD_METRICS: Readonly<Record<RecordMetricId, MeasureDef>> = {
  plafond: MEASURES.plafond,
  distance: MEASURES.distance,
  duree: MEASURES.duree,
  vitesseMax: MEASURES.vitesseMax,
  vario: MEASURES.vario,
  g: MEASURES.g,
};

export interface RecentRecord {
  pilot: string;
  pilotSlug: string;
  activity: Flight['activity'];
  metric: RecordMetricId;
  value: number;
  /** Meilleure valeur du pilote (dans cette discipline) avant la fenêtre. */
  previous: number;
  flight: Flight;
}

/**
 * Records personnels battus dans les `days` derniers jours, `today` inclus (fenêtre de `days` jours). Par pilote ET discipline :
 * le meilleur vol de la fenêtre pour un critère est un record s'il dépasse strictement le meilleur des vols
 * antérieurs à la fenêtre ; sans vol antérieur mesuré, ce n'est pas un record (premier vol). Mesures
 * absentes ou ≤ 0 ignorées. Les plus récents d'abord.
 */
export function recentRecords(
  flights: readonly Flight[],
  today: string,
  days = RECENT_RECORD_DAYS,
): RecentRecord[] {
  const windowStart = isoOfEpochDay(epochDay(today) - days + 1);
  interface Group {
    pilot: string;
    pilotSlug: string;
    activity: Flight['activity'];
    before: Map<RecordMetricId, number>;
    inWindow: Map<RecordMetricId, Best>;
  }
  const groups = new Map<string, Group>();
  for (const flight of flights) {
    if (flight.date > today) continue;
    const key = `${flight.pilotSlug}|${flight.activity}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        pilot: flight.pilot,
        pilotSlug: flight.pilotSlug,
        activity: flight.activity,
        before: new Map(),
        inWindow: new Map(),
      };
      groups.set(key, group);
    }
    const isBefore = flight.date < windowStart;
    for (const id of RECORD_METRIC_IDS) {
      const value = RECORD_METRICS[id].of(flight);
      if (value === null || !(value > 0)) continue;
      if (isBefore) {
        if (value > (group.before.get(id) ?? 0)) group.before.set(id, value);
      } else {
        const best = group.inWindow.get(id);
        if (!best || value > best.value || (value === best.value && flight.date < best.flight.date)) {
          group.inWindow.set(id, { flight, value });
        }
      }
    }
  }
  const out: RecentRecord[] = [];
  for (const group of groups.values()) {
    for (const [metric, best] of group.inWindow) {
      const previous = group.before.get(metric);
      if (previous === undefined || !(best.value > previous)) continue;
      out.push({
        pilot: group.pilot,
        pilotSlug: group.pilotSlug,
        activity: group.activity,
        metric,
        value: best.value,
        previous,
        flight: best.flight,
      });
    }
  }
  return out.sort(
    (a, b) =>
      (a.flight.date < b.flight.date ? 1 : a.flight.date > b.flight.date ? -1 : 0) ||
      compareStrings(a.pilot, b.pilot) ||
      RECORD_METRIC_IDS.indexOf(a.metric) - RECORD_METRIC_IDS.indexOf(b.metric),
  );
}

// ---------------------------------------------------------------------------
// Caractéristiques de vol
// ---------------------------------------------------------------------------

export const CHARACTERISTIC_IDS = [
  'duree',
  'distance',
  'vitesseMoyenne',
  'vitesseMax',
  'plafond',
  'vario',
  'g',
] as const;
export type CharacteristicId = (typeof CHARACTERISTIC_IDS)[number];

export interface CharacteristicRow {
  id: CharacteristicId;
  label: string;
  unit: string;
  digits: number;
  /** Nombre de vols mesurés (valeurs > 0). */
  count: number;
  mean: number | null;
  median: number | null;
  max: number | null;
  /** Vol record (lien `/vol/:key`). */
  maxFlight: Flight | null;
}

/** Moyenne, médiane et max de chaque caractéristique ; valeurs absentes ou ≤ 0 ignorées. */
export function characteristics(flights: readonly Flight[]): CharacteristicRow[] {
  return CHARACTERISTIC_IDS.map((id) => {
    const def = MEASURES[id];
    const values = positives(flights.map(def.of));
    const best = bestOf(flights, def.of);
    return {
      id,
      label: def.label,
      unit: def.unit,
      digits: def.digits,
      count: values.length,
      mean: meanPositive(values),
      median: median(values),
      max: maxPositive(values),
      maxFlight: best?.flight ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Répartitions (StatChart)
// ---------------------------------------------------------------------------

/** Axes à catégories nombreuses ou libres : barres horizontales triées, top N. */
export const HORIZONTAL_AXES: readonly AxisId[] = ['pilote', 'voile', 'site'];
export const STAT_TOP_N = 15;

export function isHorizontalAxis(axis: AxisId): boolean {
  return HORIZONTAL_AXES.includes(axis);
}

/** Valeur d'une métrique avec son unité (durées en « 1 h 12 min »). */
export function formatMetricValue(metric: Metric, value: number): string {
  if (metric.unit === 'min') return fmtDuration(value);
  if (metric.aggregation === 'count' || metric.aggregation === 'distinct') return fmtInt(value);
  return `${fmtNum(value, metric.digits)}${NBSP}${metric.unit}`;
}

export interface StatBar {
  key: string;
  label: string;
  value: number;
  /** Filtre global à poser au clic ; `null` quand l'axe n'a pas de filtre correspondant. */
  target: Partial<Filters> | null;
  /** Élément à surligner au survol ; `null` si l'axe n'en désigne pas. */
  highlight: Highlight | null;
}

export interface StatBars {
  bars: StatBar[];
  /** Nombre de catégories mesurées (hors valeurs `null`). */
  total: number;
  /** Catégories masquées par le top N. */
  hidden: number;
}

/** Groupe d'un axe à identité stable (pilote : slug ; site : identifiant) : un pilote ou un site = une barre. */
interface StableGroup {
  key: string;
  label: string;
  /** Complément qui distingue deux groupes de même libellé. */
  hint: string;
  flights: Flight[];
  target: Partial<Filters> | null;
  highlight: Highlight | null;
}

function stableGroups(flights: readonly Flight[], axis: 'pilote' | 'site'): StableGroup[] {
  const groups = new Map<string, StableGroup>();
  for (const f of flights) {
    let group: StableGroup | undefined;
    if (axis === 'pilote') {
      group = groups.get(f.pilotSlug) ?? {
        key: f.pilotSlug,
        label: f.pilot,
        hint: f.pilotSlug,
        flights: [],
        target: { pilots: [f.pilotSlug] },
        highlight: { kind: 'pilot', pilotSlug: f.pilotSlug },
      };
      groups.set(f.pilotSlug, group);
    } else {
      if (f.site === null) continue;
      // Site sans identifiant : regroupé par nom, sans filtre ni surlignage possible.
      const key = f.siteId !== null ? String(f.siteId) : `nom:${f.site}`;
      group = groups.get(key) ?? {
        key,
        label: f.site,
        hint: f.siteId !== null ? `n° ${f.siteId}` : f.site,
        flights: [],
        target: f.siteId !== null ? { sites: [f.siteId] } : null,
        highlight: f.siteId !== null ? { kind: 'site', siteId: f.siteId } : null,
      };
      groups.set(key, group);
    }
    group.flights.push(f);
  }
  return [...groups.values()];
}

/**
 * Barres de la statistique `metricId` selon l'axe : ordre naturel pour les axes courts (années croissantes),
 * ordre décroissant et top `limit` pour pilote / voile / site. Catégories sans valeur écartées.
 * Pilote et site sont regroupés par leur clé stable (slug, identifiant) et non par leur nom d'affichage : une barre
 * correspond exactement aux vols que son clic filtre. Deux clés de même nom sont distinguées dans le libellé.
 */
export function statBars(
  rows: readonly GroupRow[],
  metricId: MetricId,
  axis: AxisId,
  flights: readonly Flight[],
  limit: number | null = STAT_TOP_N,
): StatBars {
  const shortMonth = (label: string): string => {
    const i = MONTHS_LONG.indexOf(label as (typeof MONTHS_LONG)[number]);
    return i >= 0 ? (MONTHS_SHORT[i] ?? label) : label;
  };

  let all: StatBar[] = [];
  if (axis === 'pilote' || axis === 'site') {
    const groups = stableGroups(flights, axis);
    const labelCount = new Map<string, number>();
    for (const g of groups) labelCount.set(g.label, (labelCount.get(g.label) ?? 0) + 1);
    for (const g of groups) {
      const value = computeMetrics(g.flights)[metricId];
      if (value === null) continue;
      const duplicated = (labelCount.get(g.label) ?? 0) > 1;
      all.push({
        key: g.key,
        label: duplicated ? `${g.label} (${g.hint})` : g.label,
        value,
        target: g.target,
        highlight: g.highlight,
      });
    }
  } else {
    for (const row of rows) {
      const value = row.values[metricId];
      if (value === null) continue;
      let target: Partial<Filters> | null = null;
      let highlight: Highlight | null = null;
      if (axis === 'voile') {
        target = { wings: [row.key] };
        highlight = { kind: 'wing', wing: row.key };
      } else if (axis === 'annee') {
        target = { years: [Number(row.key)], dateFrom: null, dateTo: null };
      }
      all.push({
        key: row.key,
        label: axis === 'mois' ? shortMonth(row.label) : row.label,
        value,
        target,
        highlight,
      });
    }
  }
  if (axis === 'annee') all = all.reverse();
  if (isHorizontalAxis(axis)) {
    all = all.sort(
      (a, b) => b.value - a.value || compareStrings(a.label, b.label) || compareStrings(a.key, b.key),
    );
  }
  const total = all.length;
  const bars = limit !== null && isHorizontalAxis(axis) ? all.slice(0, limit) : all;
  return { bars, total, hidden: total - bars.length };
}

/** Métrique par identifiant, réexportée pour que les composants n'importent qu'ici. */
export const STAT_METRICS: readonly Metric[] = METRICS;
export { metricById };

// ---------------------------------------------------------------------------
// Évolution dans le temps
// ---------------------------------------------------------------------------

export type StackMode = 'none' | 'activity' | 'pilot';
export const EVOLUTION_TOP_PILOTS = 8;
export const OTHERS_KEY = '__autres__';

export interface EvolutionSeries {
  key: string;
  name: string;
  /** Une valeur par mois de `months`. */
  hours: number[];
  flights: number[];
}

export interface Evolution {
  /** Mois consécutifs « AAAA-MM », du premier au dernier vol (mois sans vol = 0). */
  months: string[];
  series: EvolutionSeries[];
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** « AAAA-MM » → « janv. 24 ». */
export function monthLabel(ym: string): string {
  const year = ym.slice(2, 4);
  const month = Number(ym.slice(5, 7));
  return `${MONTHS_SHORT[month - 1] ?? ''}${NBSP}${year}`;
}

function cumulate(values: number[]): number[] {
  let run = 0;
  return values.map((v) => (run += v));
}

/**
 * Heures et vols par mois, éventuellement empilés par activité ou par pilote (les 8 premiers par heures,
 * puis « Autres »), éventuellement cumulés. Une sélection vide donne `months` vide.
 */
export function evolution(flights: readonly Flight[], stack: StackMode, cumulative: boolean): Evolution {
  if (flights.length === 0) return { months: [], series: [] };
  let first = Infinity;
  let last = -Infinity;
  for (const f of flights) {
    const i = monthIndex(f.year, f.month);
    if (i < first) first = i;
    if (i > last) last = i;
  }
  const count = last - first + 1;
  const months = Array.from({ length: count }, (_, k) => {
    const i = first + k;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  });

  let topPilots: Set<string> | null = null;
  const names = new Map<string, string>();
  if (stack === 'pilot') {
    const minutesByPilot = new Map<string, number>();
    for (const f of flights) {
      minutesByPilot.set(f.pilotSlug, (minutesByPilot.get(f.pilotSlug) ?? 0) + minutesOf(f));
      names.set(f.pilotSlug, f.pilot);
    }
    topPilots = new Set(
      [...minutesByPilot.entries()]
        .sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
        .slice(0, EVOLUTION_TOP_PILOTS)
        .map(([slug]) => slug),
    );
  }
  const keyOf = (f: Flight): string => {
    if (stack === 'none') return 'tout';
    if (stack === 'activity') return f.activity;
    return topPilots?.has(f.pilotSlug) ? f.pilotSlug : OTHERS_KEY;
  };

  const byKey = new Map<string, { minutes: number[]; flights: number[]; total: number }>();
  for (const f of flights) {
    const key = keyOf(f);
    let s = byKey.get(key);
    if (!s) {
      s = { minutes: new Array<number>(count).fill(0), flights: new Array<number>(count).fill(0), total: 0 };
      byKey.set(key, s);
    }
    const k = monthIndex(f.year, f.month) - first;
    s.minutes[k] = (s.minutes[k] ?? 0) + minutesOf(f);
    s.flights[k] = (s.flights[k] ?? 0) + 1;
    s.total += minutesOf(f);
  }
  const nameOf = (key: string): string => {
    if (key === 'tout') return 'Tous les vols';
    if (key === OTHERS_KEY) return 'Autres';
    if (stack === 'activity') return key === 'parapente' ? 'Parapente' : 'Paramoteur';
    return names.get(key) ?? key;
  };
  const series = [...byKey.entries()]
    .sort((a, b) => {
      if (a[0] === OTHERS_KEY) return 1;
      if (b[0] === OTHERS_KEY) return -1;
      if (stack === 'activity') return (a[0] === 'parapente' ? 0 : 1) - (b[0] === 'parapente' ? 0 : 1);
      return b[1].total - a[1].total || compareStrings(a[0], b[0]);
    })
    .map(([key, s]) => {
      const hours = s.minutes.map((m) => m / 60);
      return {
        key,
        name: nameOf(key),
        hours: cumulative ? cumulate(hours) : hours,
        flights: cumulative ? cumulate(s.flights) : s.flights,
      };
    });
  return { months, series };
}
