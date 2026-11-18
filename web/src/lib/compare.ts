/**
 * Comparaison (phase 5, lot A) : paramètres d'URL, population, sélection par défaut, séries comparées, KPI,
 * haltères, rythme et courbes d'heures cumulées. Fonctions pures.
 *
 * Populations (voir `comparePool`) : la page travaille sur les filtres globaux, sauf la dimension que le
 * sélecteur de la page remplace (pilotes en mode Pilotes et Années, période en mode Années, sites en mode Sites).
 */
import type { Flight } from '@/data/flight';
import type { DeltaKind } from '@/components/common/DeltaPill';
import { applyFilters, type Filters } from '@/lib/filters';
import { fmtDuration, fmtHm, fmtInt, fmtNum, fmtPercent, NBSP } from '@/lib/format';
import { epochDay, isoOfEpochDay, mondayOfEpochDay } from '@/lib/isoDay';
import { MEASURES, formatMeasure } from '@/lib/measures';
import { distinctCount } from '@/lib/numeric';
import { computeKpis, deltaPct, type Kpis } from '@/lib/records';
import { computeRhythm, minutesOf } from '@/lib/rhythm';
import type { ColorKey } from '@/theme/tokens';
import { yearPatterns } from '@/theme/tokens';

export type CompareMode = 'pilotes' | 'annees' | 'sites';

export const COMPARE_MODES: readonly { value: CompareMode; label: string }[] = [
  { value: 'pilotes', label: 'Pilotes' },
  { value: 'annees', label: 'Années' },
  { value: 'sites', label: 'Sites' },
];

export const MIN_SERIES = 2;
export const MAX_SERIES = 4;
export const PARAM_MODE = 'mode';
export const PARAM_IDS = 'ids';

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export interface CompareParams {
  mode: CompareMode;
  /** Pilotes : slugs. Sites : identifiants. Années : slug du pilote, puis les années. */
  ids: string[];
}

export function isCompareMode(value: string | null): value is CompareMode {
  return value === 'pilotes' || value === 'annees' || value === 'sites';
}

export function parseCompareParams(params: URLSearchParams): CompareParams {
  const mode = params.get(PARAM_MODE);
  const ids = (params.get(PARAM_IDS) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { mode: isCompareMode(mode) ? mode : 'pilotes', ids: [...new Set(ids)] };
}

/** Copie de `params` avec `mode` et `ids` remplacés ; les autres paramètres (filtres globaux) sont conservés. */
export function writeCompareParams(params: URLSearchParams, next: CompareParams): URLSearchParams {
  const out = new URLSearchParams(params);
  out.delete(PARAM_MODE);
  out.delete(PARAM_IDS);
  if (next.mode !== 'pilotes' || next.ids.length > 0) out.set(PARAM_MODE, next.mode);
  if (next.ids.length > 0) out.set(PARAM_IDS, next.ids.join(','));
  return out;
}

// ---------------------------------------------------------------------------
// Population et sélection
// ---------------------------------------------------------------------------

/** Vols sur lesquels on compare : filtres globaux sans la dimension que le sélecteur de la page remplace. */
export function comparePool(mode: CompareMode, flights: readonly Flight[], filters: Filters): readonly Flight[] {
  const f: Filters = { ...filters };
  if (mode === 'pilotes') f.pilots = [];
  if (mode === 'annees') {
    f.pilots = [];
    f.dateFrom = null;
    f.dateTo = null;
  }
  if (mode === 'sites') f.sites = [];
  return applyFilters(flights, f);
}

export interface Candidate {
  value: string;
  label: string;
  flights: number;
}

/** Pilotes (modes Pilotes et Années) ou sites (mode Sites) présents dans la population, les plus actifs d'abord. */
export function candidates(mode: CompareMode, pool: readonly Flight[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const f of pool) {
    let value: string;
    let label: string;
    if (mode === 'sites') {
      if (f.siteId === null) continue;
      value = String(f.siteId);
      label = f.site ?? `Site ${f.siteId}`;
    } else {
      value = f.pilotSlug;
      label = f.pilot;
    }
    const c = map.get(value);
    if (c) c.flights += 1;
    else map.set(value, { value, label, flights: 1 });
  }
  return [...map.values()].sort((a, b) => b.flights - a.flights || a.label.localeCompare(b.label, 'fr'));
}

/** Années où le pilote a au moins un vol dans la population, de la plus récente à la plus ancienne. */
export function pilotYears(pool: readonly Flight[], slug: string): number[] {
  const years = new Set<number>();
  for (const f of pool) if (f.pilotSlug === slug) years.add(f.year);
  return [...years].sort((a, b) => b - a);
}

export interface Selection {
  ids: string[];
  /** Choix proposé par défaut (rien n'était choisi dans l'URL). */
  isDefault: boolean;
  /** Au moins le minimum requis : la comparaison peut être calculée. */
  valid: boolean;
  /** Pourquoi la comparaison n'est pas possible (« Choisir au moins 2 pilotes. »), sinon `null`. */
  problem: string | null;
}

const NOUN: Record<CompareMode, string> = { pilotes: 'pilotes', annees: 'années', sites: 'sites' };

/** Garde les identifiants connus, uniques, au plus `MAX_SERIES` ; propose les plus actifs si rien n'est choisi. */
export function resolveSelection(mode: CompareMode, ids: readonly string[], pool: readonly Flight[]): Selection {
  const known = candidates(mode, pool);
  const knownValues = new Set(known.map((c) => c.value));
  let chosen: string[];
  let isDefault = false;

  if (mode === 'annees') {
    let pilot = ids[0] !== undefined && knownValues.has(ids[0]) ? ids[0] : null;
    let years: number[] = [];
    if (pilot !== null) {
      const available = new Set(pilotYears(pool, pilot));
      years = [...new Set(ids.slice(1).map(Number))].filter((y) => available.has(y)).slice(0, MAX_SERIES);
    }
    if (ids.length === 0) {
      isDefault = true;
      pilot = (known.find((c) => pilotYears(pool, c.value).length >= 2) ?? known[0])?.value ?? null;
      years = pilot === null ? [] : pilotYears(pool, pilot).slice(0, MIN_SERIES).reverse();
    }
    // Années du plus ancien au plus récent : la plus ancienne sert de référence aux écarts.
    years.sort((a, b) => a - b);
    chosen = pilot === null ? [] : [pilot, ...years.map(String)];
    const valid = pilot !== null && years.length >= MIN_SERIES;
    return {
      ids: chosen,
      isDefault,
      valid,
      problem: valid
        ? null
        : pilot === null
          ? 'Choisir un pilote.'
          : `Choisir au moins ${MIN_SERIES} années.`,
    };
  }

  if (ids.length === 0) {
    isDefault = true;
    chosen = known.slice(0, MIN_SERIES).map((c) => c.value);
  } else {
    chosen = ids.filter((id) => knownValues.has(id)).slice(0, MAX_SERIES);
  }
  const valid = chosen.length >= MIN_SERIES;
  return {
    ids: chosen,
    isDefault,
    valid,
    problem: valid ? null : `Choisir au moins ${MIN_SERIES} ${NOUN[mode]}.`,
  };
}

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

export interface CompareSeries {
  id: string;
  label: string;
  flights: readonly Flight[];
  /** Période sur laquelle compter les semaines (mode Années : l'année jusqu'à la date de référence). */
  span: { from: string; to: string } | null;
}

/** Séries à comparer, dans l'ordre de `ids` (la première sert de référence aux écarts). `refDate` : date des données. */
export function buildSeries(
  mode: CompareMode,
  ids: readonly string[],
  pool: readonly Flight[],
  refDate: string,
): CompareSeries[] {
  if (mode === 'annees') {
    const [slug, ...years] = ids;
    const mine = pool.filter((f) => f.pilotSlug === slug);
    return years.map((y) => {
      const year = Number(y);
      return {
        id: y,
        label: y,
        flights: mine.filter((f) => f.year === year),
        span: { from: `${year}-01-01`, to: refDate.slice(0, 4) === y ? refDate : `${year}-12-31` },
      };
    });
  }
  return ids.map((id) => {
    const flights = pool.filter((f) => (mode === 'sites' ? String(f.siteId) === id : f.pilotSlug === id));
    const first = flights[0];
    const label =
      mode === 'sites' ? (first?.site ?? `Site ${id}`) : (first?.pilot ?? id);
    return { id, label, flights, span: null };
  });
}

export interface SeriesStyle {
  colorKey: ColorKey;
  /** Motif de trait (px plein / px vide), `null` = trait plein. */
  dash: number[] | null;
  shape: 'circle' | 'square' | 'diamond' | 'triangle';
}

const SHAPES: SeriesStyle['shape'][] = ['circle', 'square', 'diamond', 'triangle'];
const CATEGORY_DASH: (number[] | null)[] = [null, [7, 4], [2, 4], [10, 3, 2, 3]];
const CATEGORY_KEYS: ColorKey[] = ['c1', 'c2', 'c3', 'c4'];
const YEAR_KEYS: ColorKey[] = ['y0', 'y1', 'y2'];

function parseDash(value: string): number[] | null {
  return value === 'none' ? null : value.split(' ').map(Number);
}

/**
 * Couleur et motif de la série d'index `index`. Pilotes et sites : c1 à c4. Années : y0 à y2 avec les motifs
 * `yearPatterns` ; la 4ᵉ année prend c4 (trait tirets-points), les jetons d'années n'étant que trois.
 */
export function seriesStyle(mode: CompareMode, index: number): SeriesStyle {
  const shape = SHAPES[index] ?? 'circle';
  if (mode === 'annees' && index < YEAR_KEYS.length) {
    const key = YEAR_KEYS[index] as 'y0' | 'y1' | 'y2';
    return { colorKey: key, dash: parseDash(yearPatterns[key].dasharray), shape };
  }
  return { colorKey: CATEGORY_KEYS[index] ?? 'c4', dash: CATEGORY_DASH[index] ?? null, shape };
}

// ---------------------------------------------------------------------------
// Chiffres, écarts, haltères
// ---------------------------------------------------------------------------

export interface SeriesStats {
  kpis: Kpis;
  pilots: number;
  /** Heures de vol (durée inconnue = 0). */
  hours: number;
  parapenteShare: number | null;
}

export function seriesStats(flights: readonly Flight[]): SeriesStats {
  const kpis = computeKpis(flights);
  const para = flights.filter((f) => f.activity === 'parapente').length;
  return {
    kpis,
    pilots: distinctCount(flights.map((f) => f.pilotSlug)),
    hours: kpis.minutes / 60,
    parapenteShare: flights.length === 0 ? null : (100 * para) / flights.length,
  };
}

export interface CompareKpiDef {
  id: string;
  label: string;
  kind: DeltaKind;
  /** Mode où la ligne n'a de sens que là (le nombre de pilotes en mode Sites). */
  onlyMode?: CompareMode;
  /** Absente en mode Sites (un site n'a pas de « sites visités »). */
  hideInMode?: CompareMode;
  value: (s: SeriesStats) => number | null;
  format: (v: number) => string;
}

/** KPI côte à côte ; volumes en vert/rouge (`volume`), le reste neutre. */
export const COMPARE_KPIS: readonly CompareKpiDef[] = [
  { id: 'vols', label: 'Vols', kind: 'volume', value: (s) => s.kpis.nFlights, format: fmtInt },
  { id: 'heures', label: 'Heures de vol', kind: 'volume', value: (s) => s.kpis.minutes, format: fmtHm },
  { id: 'jours', label: 'Jours volés', kind: 'volume', value: (s) => s.kpis.daysFlown, format: fmtInt },
  { id: 'sites', label: 'Sites visités', kind: 'neutre', hideInMode: 'sites', value: (s) => s.kpis.nSites, format: fmtInt },
  { id: 'pilotes', label: 'Pilotes', kind: 'neutre', onlyMode: 'sites', value: (s) => s.pilots, format: fmtInt },
  { id: 'duree', label: 'Durée moyenne', kind: 'neutre', value: (s) => s.kpis.durationMean, format: fmtDuration },
];

export function kpisForMode(mode: CompareMode): CompareKpiDef[] {
  return COMPARE_KPIS.filter((k) => (k.onlyMode ? k.onlyMode === mode : true) && k.hideInMode !== mode);
}

/** Écart en % de chaque valeur à la première (la référence) ; `null` pour la première ou sans comparaison possible. */
export function deltasVsFirst(values: readonly (number | null)[]): (number | null)[] {
  const reference = values[0] ?? null;
  return values.map((v, i) => (i === 0 ? null : deltaPct(v, reference)));
}

export interface DumbbellMetricDef {
  id: string;
  label: string;
  value: (s: SeriesStats) => number | null;
  format: (v: number) => string;
}

export const DUMBBELL_METRICS: readonly DumbbellMetricDef[] = [
  { id: 'duree', label: 'Durée moyenne', value: (s) => s.kpis.durationMean, format: (v) => formatMeasure(MEASURES.duree, v) },
  { id: 'distance', label: 'Distance moyenne', value: (s) => s.kpis.distanceMean, format: (v) => formatMeasure(MEASURES.distance, v) },
  { id: 'plafond', label: 'Plafond moyen', value: (s) => s.kpis.ceilingMean, format: (v) => formatMeasure(MEASURES.plafond, v) },
  { id: 'vitesse', label: 'Vitesse max moyenne', value: (s) => s.kpis.speedMaxMean, format: (v) => formatMeasure(MEASURES.vitesseMax, v) },
  { id: 'vario', label: 'Vario max moyen', value: (s) => s.kpis.varioMean, format: (v) => formatMeasure(MEASURES.vario, v) },
  { id: 'vols', label: 'Vols', value: (s) => s.kpis.nFlights, format: fmtInt },
  { id: 'heures', label: 'Heures de vol', value: (s) => s.hours, format: (v) => `${fmtNum(v, 1)}${NBSP}h` },
];

// ---------------------------------------------------------------------------
// Rythme
// ---------------------------------------------------------------------------

export interface RhythmSummary {
  weeksActive: number;
  weeksTotal: number;
  /** Semaines avec vol sur semaines de la période, 0 à 1. */
  regularity: number;
  /** Plus longue série de jours volés consécutifs (1 s'il n'y a pas de série). */
  streakDays: number;
  /** Part des vols faits le week-end, 0 à 1. */
  weekendShare: number;
}

/**
 * Rythme d'une série. Les semaines de la période vont du lundi du premier vol à celui du dernier (ou de `span`).
 * `null` sans vol.
 */
export function rhythmSummary(
  flights: readonly Flight[],
  span: { from: string; to: string } | null = null,
): RhythmSummary | null {
  if (flights.length === 0) return null;
  const dates = flights.map((f) => f.date).sort();
  const from = span?.from ?? (dates[0] as string);
  const to = span?.to ?? (dates[dates.length - 1] as string);
  const rhythm = computeRhythm(flights, Number(from.slice(0, 4)), to);
  if (rhythm === null) return null;
  const weeksTotal = Math.max(
    (mondayOfEpochDay(epochDay(to)) - mondayOfEpochDay(epochDay(from))) / 7 + 1,
    rhythm.weeksActive,
  );
  return {
    weeksActive: rhythm.weeksActive,
    weeksTotal,
    regularity: rhythm.weeksActive / weeksTotal,
    streakDays: rhythm.streak?.days ?? 1,
    weekendShare: rhythm.weekendShare,
  };
}

export const fmtRegularity = (r: RhythmSummary): string =>
  `${fmtPercent(100 * r.regularity)} (${r.weeksActive}${NBSP}/${NBSP}${r.weeksTotal}${NBSP}sem.)`;

// ---------------------------------------------------------------------------
// Heures cumulées
// ---------------------------------------------------------------------------

export interface CumulativeData {
  /** `date` : axe = dates ISO de la période. `jour-annee` : axe = jours d'une année bissextile de référence (`2000-MM-JJ`). */
  kind: 'date' | 'jour-annee';
  axis: string[];
  /** Heures cumulées à chaque jour de l'axe ; `null` après la date de référence (année en cours). */
  series: { id: string; values: (number | null)[] }[];
}

const LEAP_YEAR = 2000;
const DAYS_IN_LEAP_YEAR = 366;

/** Position (0 à 365) d'un jour dans l'année, en comptant toujours un 29 février. */
export function dayOfLeapYear(iso: string): number {
  return epochDay(`${LEAP_YEAR}-${iso.slice(5)}`) - epochDay(`${LEAP_YEAR}-01-01`);
}

/**
 * Courbes d'heures cumulées sur un axe commun, un point par jour (le réticule lit ainsi la valeur de chaque
 * série à la date survolée). Mode Années : un axe de 366 jours, l'année en cours s'arrête à `refDate`.
 * Modes Pilotes et Sites : de la première date à la dernière date de toutes les séries.
 */
export function cumulativeCurves(
  mode: CompareMode,
  series: readonly CompareSeries[],
  refDate: string,
): CumulativeData {
  if (mode === 'annees') {
    const start = epochDay(`${LEAP_YEAR}-01-01`);
    const axis = Array.from({ length: DAYS_IN_LEAP_YEAR }, (_, i) => isoOfEpochDay(start + i));
    return {
      kind: 'jour-annee',
      axis,
      series: series.map((s) => {
        const year = Number(s.id);
        const minutes = new Array<number>(DAYS_IN_LEAP_YEAR).fill(0);
        for (const f of s.flights) {
          const i = dayOfLeapYear(f.date);
          minutes[i] = (minutes[i] ?? 0) + minutesOf(f);
        }
        const last = refDate.slice(0, 4) === String(year) ? dayOfLeapYear(refDate) : DAYS_IN_LEAP_YEAR - 1;
        let total = 0;
        return { id: s.id, values: minutes.map((m, i) => ((total += m), i <= last ? total / 60 : null)) };
      }),
    };
  }
  const all = series.flatMap((s) => s.flights.map((f) => f.date));
  if (all.length === 0) return { kind: 'date', axis: [], series: series.map((s) => ({ id: s.id, values: [] })) };
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of all) {
    const e = epochDay(d);
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  const length = hi - lo + 1;
  return {
    kind: 'date',
    axis: Array.from({ length }, (_, i) => isoOfEpochDay(lo + i)),
    series: series.map((s) => {
      const minutes = new Array<number>(length).fill(0);
      for (const f of s.flights) {
        const i = epochDay(f.date) - lo;
        minutes[i] = (minutes[i] ?? 0) + minutesOf(f);
      }
      let total = 0;
      return { id: s.id, values: minutes.map((m) => ((total += m), total / 60)) };
    }),
  };
}
