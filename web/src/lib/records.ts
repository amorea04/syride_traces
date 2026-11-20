/**
 * Indicateurs génériques d'un ensemble de vols : chiffres clés, durées, records, faits marquants, couverture
 * des données, carrière, variation. Portage de src/rapport/report_data.py : `compute_kpis`, `_duration_stats`,
 * `_records`, `_best_flight`, `_highlights`, `_coverage`, `compute_career`, `delta_pct`, `_site_rows`,
 * `_wing_rows`, `_instrument_rows`.
 *
 * Mêmes conventions que `rhythm.ts` (durée inconnue = 0 minute ; mesures <= 0 ignorées, déjà `null` à l'export).
 *
 * Écarts assumés avec le Python (le Python écrit « nan » ou compte de travers) :
 *   - un vol sans site ou sans voile a `site` ou `wing` à `null` dans les records (Python : la chaîne « nan ») ;
 *   - `highlights.bestDay.n` compte tous les vols du jour (Python : `("site", "count")` saute les vols sans site) ;
 *   - `highlights.bestDay.sites` ignore les vols sans site (Python : « nan » apparaît comme un site) ;
 *   - les coordonnées des sites et `date_update` ne sont pas dans `Flight` : `coverage.noPosition` reçoit un
 *     prédicat, et `updated` n'existe pas ;
 *   - un lien Syride n'est pas construit ici : un record porte `pilot` et `syrideNum` (voir `syrideFlightUrl`).
 */

import { MEASURES } from '@/lib/measures';
import type { Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import {
  distinctCount,
  max,
  maxPositive,
  mean,
  meanPositive,
  median,
  positives,
  sum,
  sumPositive,
} from '@/lib/numeric';
import {
  type CountMinutes,
  dailySummaries,
  longestGap,
  minutesOf,
  monthDistribution,
  weekdayDistribution,
} from '@/lib/rhythm';

// ---------------------------------------------------------------------------
// Chiffres clés
// ---------------------------------------------------------------------------

export interface Kpis {
  nFlights: number;
  /** Total des durées en minutes. */
  minutes: number;
  daysFlown: number;
  nSites: number;
  nWings: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Distance affichée par Syride (`distKm`), somme / moyenne / max des valeurs > 0. */
  distanceTotal: number | null;
  distanceMean: number | null;
  distanceMax: number | null;
  /** Durée moyenne et max, une durée inconnue comptant 0. */
  durationMean: number | null;
  durationMax: number | null;
  speedAvgMean: number | null;
  speedAvgMax: number | null;
  speedMaxMean: number | null;
  speedMaxMax: number | null;
  ceilingMean: number | null;
  ceilingMax: number | null;
  gainMax: number | null;
  varioMean: number | null;
  varioMax: number | null;
  gMean: number | null;
  gMax: number | null;
}

/** Port de `compute_kpis`. Sans vol : zéros et `null`. */
export function computeKpis(flights: readonly Flight[]): Kpis {
  const col = (pick: (f: Flight) => number | null): (number | null)[] => flights.map(pick);
  const dates = flights.map((f) => f.date).sort();
  const durations = flights.map(minutesOf);
  return {
    nFlights: flights.length,
    minutes: sum(durations),
    daysFlown: distinctCount(dates),
    nSites: distinctCount(flights.map((f) => f.site)),
    nWings: distinctCount(flights.map((f) => f.wing)),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    distanceTotal: sumPositive(col((f) => f.distKm)),
    distanceMean: meanPositive(col((f) => f.distKm)),
    distanceMax: maxPositive(col((f) => f.distKm)),
    durationMean: mean(durations),
    durationMax: max(durations),
    speedAvgMean: meanPositive(col((f) => f.speedAvg)),
    speedAvgMax: maxPositive(col((f) => f.speedAvg)),
    speedMaxMean: meanPositive(col((f) => f.speedMax)),
    speedMaxMax: maxPositive(col((f) => f.speedMax)),
    ceilingMean: meanPositive(col((f) => f.ceilingM)),
    ceilingMax: maxPositive(col((f) => f.ceilingM)),
    gainMax: maxPositive(col((f) => f.gainM)),
    varioMean: meanPositive(col((f) => f.varioMax)),
    varioMax: maxPositive(col((f) => f.varioMax)),
    gMean: meanPositive(col((f) => f.gMax)),
    gMax: maxPositive(col((f) => f.gMax)),
  };
}

/** Port de `delta_pct` : variation en % de `current` par rapport à `reference`, `null` si non calculable. */
export function deltaPct(current: number | null, reference: number | null): number | null {
  if (current === null || reference === null || reference === 0) return null;
  return (100 * (current - reference)) / reference;
}

// ---------------------------------------------------------------------------
// Durées
// ---------------------------------------------------------------------------

/** Bornes hautes des tranches de durée, en minutes ; une tranche = [borne précédente, borne), la dernière est ouverte. */
export const DURATION_BINS = [15, 30, 60, 120] as const;
export const DURATION_BIN_LABELS = ['< 15\u00a0min', '15–30\u00a0min', '30\u00a0min–1\u00a0h', '1–2\u00a0h', '> 2\u00a0h'] as const;

export interface MedianValue {
  /** Médiane, `null` sans mesure. */
  value: number | null;
  /** Vols où la mesure existe. */
  count: number;
}

export interface DurationStats {
  /** Vols par tranche de durée. */
  bins: number[];
  /** Tranche qui contient le vol médian. */
  medianBin: number | null;
  medians: { duree: MedianValue; plafond: MedianValue; vitesseMax: MedianValue; distance: MedianValue };
}

const binOf = (minutes: number): number => DURATION_BINS.filter((edge) => minutes >= edge).length;

function medianOf(values: readonly (number | null)[]): MedianValue {
  const p = positives(values);
  return { value: median(p), count: p.length };
}

/** Port de `_duration_stats`, pour un ensemble de vols non vide (sinon médianes `null`). */
export function durationStats(flights: readonly Flight[]): DurationStats {
  const minutes = flights.map(minutesOf);
  const med = median(minutes);
  const bins = new Array<number>(DURATION_BINS.length + 1).fill(0);
  for (const m of minutes) bins[binOf(m)] = (bins[binOf(m)] ?? 0) + 1;
  return {
    bins,
    medianBin: med === null ? null : binOf(med),
    medians: {
      duree: { value: med, count: minutes.length },
      plafond: medianOf(flights.map((f) => f.ceilingM)),
      vitesseMax: medianOf(flights.map((f) => f.speedMax)),
      distance: medianOf(flights.map((f) => f.distKm)),
    },
  };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export const RECORD_KEYS = ['plafond', 'vitesseMax', 'distance', 'vario', 'g', 'duree'] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

const RECORD_VALUE: Readonly<Record<RecordKey, (f: Flight) => number | null>> = {
  plafond: (f) => f.ceilingM,
  vitesseMax: (f) => f.speedMax,
  distance: (f) => f.distKm,
  vario: (f) => f.varioMax,
  g: (f) => f.gMax,
  duree: minutesOf,
};

export interface RecordEntry {
  value: number;
  date: string;
  site: string | null;
  wing: string | null;
  discipline: string;
  /** Pilote, numéro Syride et clé du vol : de quoi bâtir `/vol/:key` et le lien Syride. */
  pilot: string;
  syrideNum: number;
  flightKey: string;
}

function toEntry(f: Flight, value: number): RecordEntry {
  return {
    value,
    date: f.date,
    site: f.site,
    wing: f.wing,
    discipline: f.activity,
    pilot: f.pilot,
    syrideNum: f.syrideNum,
    flightKey: f.key,
  };
}

/** Vols ayant une mesure > 0 pour un critère, avec leur valeur. */
function measured(flights: readonly Flight[], key: RecordKey): { flight: Flight; value: number }[] {
  const out: { flight: Flight; value: number }[] = [];
  for (const flight of flights) {
    const value = RECORD_VALUE[key](flight);
    if (value !== null && value > 0) out.push({ flight, value });
  }
  return out;
}

/**
 * Port de `_records` : les `top` meilleurs vols de chaque critère (valeur décroissante, puis date la plus récente
 * d'abord ; à égalité parfaite, l'ordre d'entrée).
 */
export function topRecords(flights: readonly Flight[], top = 5): Record<RecordKey, RecordEntry[]> {
  const out = {} as Record<RecordKey, RecordEntry[]>;
  for (const key of RECORD_KEYS) {
    out[key] = measured(flights, key)
      .sort(
        (a, b) =>
          b.value - a.value || (a.flight.date < b.flight.date ? 1 : a.flight.date > b.flight.date ? -1 : 0),
      )
      .slice(0, top)
      .map(({ flight, value }) => toEntry(flight, value));
  }
  return out;
}

/** Port de `_best_flight` : meilleur vol d'un critère (le plus ancien à égalité), `null` sans mesure. */
export function bestFlight(
  flights: readonly Flight[],
  key: RecordKey,
): (RecordEntry & { year: number }) | null {
  const [best] = measured(flights, key).sort(
    (a, b) =>
      b.value - a.value || (a.flight.date < b.flight.date ? -1 : a.flight.date > b.flight.date ? 1 : 0),
  );
  return best ? { ...toEntry(best.flight, best.value), year: best.flight.year } : null;
}

// ---------------------------------------------------------------------------
// Sites, voiles, instruments
// ---------------------------------------------------------------------------

export interface SiteRow extends CountMinutes {
  site: string;
  durationMean: number;
  speedAvgMean: number | null;
}

export interface WingRow extends CountMinutes {
  wing: string;
  durationMean: number;
  speedAvgMean: number | null;
  gainMax: number | null;
  varioMax: number | null;
  gMax: number | null;
}

export interface InstrumentRow extends CountMinutes {
  instrument: string;
}

/** Tri du rapport : minutes décroissantes, puis vols décroissants, puis nom. */
function byMinutesThenName<T extends CountMinutes>(rows: T[], name: (r: T) => string): T[] {
  return rows.sort(
    (a, b) => b.minutes - a.minutes || b.n - a.n || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0),
  );
}

/** Port de `_site_rows` (sans coordonnées) : une ligne par site, vols sans site ignorés. */
export function siteRows(flights: readonly Flight[]): SiteRow[] {
  const rows = [...groupBy(flights, (f) => f.site)].map(([site, g]) => ({
    site,
    n: g.length,
    minutes: sum(g.map(minutesOf)),
    durationMean: mean(g.map(minutesOf)) ?? 0,
    speedAvgMean: meanPositive(g.map((f) => f.speedAvg)),
  }));
  return byMinutesThenName(rows, (r) => r.site);
}

/** Port de `_wing_rows`. */
export function wingRows(flights: readonly Flight[]): WingRow[] {
  const rows = [...groupBy(flights, (f) => f.wing)].map(([wing, g]) => ({
    wing,
    n: g.length,
    minutes: sum(g.map(minutesOf)),
    durationMean: mean(g.map(minutesOf)) ?? 0,
    speedAvgMean: meanPositive(g.map((f) => f.speedAvg)),
    gainMax: maxPositive(g.map((f) => f.gainM)),
    varioMax: maxPositive(g.map((f) => f.varioMax)),
    gMax: maxPositive(g.map((f) => f.gMax)),
  }));
  return byMinutesThenName(rows, (r) => r.wing);
}

/** Port de `_instrument_rows` (instruments absents déjà `null` à l'export). */
export function instrumentRows(flights: readonly Flight[]): InstrumentRow[] {
  const rows = [...groupBy(flights, (f) => f.instrument)].map(([instrument, g]) => ({
    instrument,
    n: g.length,
    minutes: sum(g.map(minutesOf)),
  }));
  return byMinutesThenName(rows, (r) => r.instrument);
}

// ---------------------------------------------------------------------------
// Faits marquants
// ---------------------------------------------------------------------------

export interface Highlights {
  /** Index 0 = janvier. */
  busiestMonth: { index: number; flights: number } | null;
  /** Index 0 = lundi. */
  busiestWeekday: { index: number; flights: number } | null;
  topSite: { site: string; n: number; minutes: number } | null;
  topWing: { wing: string; n: number; minutes: number } | null;
  longestGapDays: number;
  bestDay: { date: string; minutes: number; n: number; sites: string[] } | null;
}

function argmax(values: readonly number[]): number {
  let best = 0;
  values.forEach((v, i) => {
    if (v > (values[best] as number)) best = i;
  });
  return best;
}

/** Port de `_highlights`. */
export function computeHighlights(flights: readonly Flight[]): Highlights {
  const out: Highlights = {
    busiestMonth: null,
    busiestWeekday: null,
    topSite: null,
    topWing: null,
    longestGapDays: 0,
    bestDay: null,
  };
  if (flights.length === 0) return out;
  const months = monthDistribution(flights).flights;
  const weekdays = weekdayDistribution(flights).flights;
  if (Math.max(...months) > 0)
    out.busiestMonth = { index: argmax(months), flights: months[argmax(months)] as number };
  if (Math.max(...weekdays) > 0) {
    out.busiestWeekday = { index: argmax(weekdays), flights: weekdays[argmax(weekdays)] as number };
  }
  const site = siteRows(flights)[0];
  if (site) out.topSite = { site: site.site, n: site.n, minutes: site.minutes };
  const wing = wingRows(flights)[0];
  if (wing) out.topWing = { wing: wing.wing, n: wing.n, minutes: wing.minutes };
  const days = dailySummaries(flights);
  out.longestGapDays = longestGap(days.map((d) => d.date))?.days ?? 0;
  const bestIndex = argmax(days.map((d) => d.minutes));
  const best = days[bestIndex];
  if (best) {
    const counts = new Map<string, number>();
    for (const f of flights) {
      if (f.date === best.date && f.site !== null) counts.set(f.site, (counts.get(f.site) ?? 0) + 1);
    }
    const sites = [...counts.entries()]
      .sort(([a, na], [b, nb]) => nb - na || (a < b ? -1 : a > b ? 1 : 0))
      .map(([name]) => name);
    out.bestDay = { date: best.date, minutes: best.minutes, n: best.n, sites };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Couverture des données
// ---------------------------------------------------------------------------

export const MEASURE_KEYS = ['plafond', 'distance', 'gain', 'vitesseMax', 'vario', 'g'] as const;
export type CoverageKey = (typeof MEASURE_KEYS)[number];

export interface Coverage {
  n: number;
  /** Vols où chaque mesure existe (> 0). */
  measured: Record<CoverageKey, number>;
  /** Origine des statistiques : gpx, fiche, aucune. */
  sources: { gpx: number; fiche: number; aucune: number };
  /** Vols dont le site n'a aucune coordonnée (`null` si le prédicat n'est pas fourni). */
  noPosition: number | null;
  /** Parts mesurées (0 à 1) du gain et de la distance, et gain total : ne proposer une équivalence que si assez complet. */
  gain: number;
  distance: number;
  gainTotal: number;
}

/**
 * Port de `_coverage`. `siteHasCoords(siteId)` dit si un site a des coordonnées (fichier `sites.json`) ;
 * sans lui, `noPosition` vaut `null`.
 */
export function computeCoverage(
  flights: readonly Flight[],
  siteHasCoords?: (siteId: number) => boolean,
): Coverage {
  const n = flights.length;
  const measuredCounts = {} as Record<CoverageKey, number>;
  for (const key of MEASURE_KEYS) measuredCounts[key] = positives(flights.map(MEASURES[key].of)).length;
  const sources = { gpx: 0, fiche: 0, aucune: 0 };
  for (const f of flights) sources[f.source] += 1;
  const noPosition = siteHasCoords
    ? flights.filter((f) => f.siteId !== null && !siteHasCoords(f.siteId)).length
    : null;
  return {
    n,
    measured: measuredCounts,
    sources,
    noPosition,
    gain: measuredCounts.gain / Math.max(n, 1),
    distance: measuredCounts.distance / Math.max(n, 1),
    gainTotal: sum(positives(flights.map((f) => f.gainM))),
  };
}

// ---------------------------------------------------------------------------
// Carrière
// ---------------------------------------------------------------------------

/** La section « Depuis tes débuts » demande au moins 2 années de données. */
export const CAREER_MIN_YEARS = 2;

export interface CareerYear {
  year: number;
  pMin: number;
  mMin: number;
  pN: number;
  mN: number;
}

export interface Career {
  years: CareerYear[];
  minutes: number;
  flights: number;
  sites: number;
  distance: number;
  /** Vols avec distance. */
  distanceN: number;
  firstDate: string;
  bestYear: number;
  bestFlightsYear: number;
}

/**
 * Port de `compute_career` pour les vols d'UN pilote. Cumul jusqu'à la date du rapport : années postérieures
 * ignorées, année du rapport jusqu'à `cutoff` ([mois, jour]) si fourni. `null` sous 2 années de données.
 */
export function computeCareer(
  flights: readonly Flight[],
  year: number,
  cutoff: readonly [number, number] | null = null,
): Career | null {
  const d = flights.filter((f) => {
    if (f.year > year) return false;
    if (cutoff === null) return true;
    const [month, day] = cutoff;
    // Transcrit du Python : les années antérieures passent, l'année du rapport s'arrête à la coupure.
    const dayOfMonth = Number(f.date.slice(8, 10));
    return f.year < year || f.month < month || (f.month === month && dayOfMonth <= day);
  });
  const rows = careerYearRows(d);
  if (rows.length < CAREER_MIN_YEARS) return null;
  return careerFromRows(d, rows);
}

/** Une ligne par année avec vol, de la plus ancienne à la plus récente (heures et vols par discipline). */
export function careerYearRows(flights: readonly Flight[]): CareerYear[] {
  const rows: CareerYear[] = [];
  for (const [year, g] of groupBy(flights, (f) => f.year)) {
    const p = g.filter((f) => f.activity === 'parapente');
    const m = g.filter((f) => f.activity === 'paramoteur');
    rows.push({
      year,
      pMin: sum(p.map(minutesOf)),
      mMin: sum(m.map(minutesOf)),
      pN: p.length,
      mN: m.length,
    });
  }
  return rows.sort((a, b) => a.year - b.year);
}

/**
 * Année qui maximise `score` ; à égalité la plus récente (`max` du Python : les clés incluent l'année, donc jamais
 * d'égalité parfaite). `null` sans ligne.
 */
export function bestCareerYear(rows: readonly CareerYear[], score: (r: CareerYear) => number): number | null {
  let best: CareerYear | null = null;
  for (const r of rows) if (best === null || score(r) >= score(best)) best = r;
  return best?.year ?? null;
}

/** Carrière d'un pilote à partir de ses vols `d` et de leurs lignes par année (déjà calculées, au moins une). */
export function careerFromRows(d: readonly Flight[], rows: readonly CareerYear[]): Career {
  const dist = positives(d.map((f) => f.distKm));
  return {
    years: [...rows],
    minutes: sum(d.map(minutesOf)),
    flights: d.length,
    sites: distinctCount(d.map((f) => f.site)),
    distance: sum(dist),
    distanceN: dist.length,
    firstDate: d.map((f) => f.date).sort()[0] as string,
    bestYear: bestCareerYear(rows, (r) => r.pMin + r.mMin) as number,
    bestFlightsYear: bestCareerYear(rows, (r) => r.pN + r.mN) as number,
  };
}
