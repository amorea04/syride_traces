/**
 * Calculs des blocs « Rythme », « Quand vole-t-on ? », « Matériel » et « Durée et plafond » du tableau de bord.
 * Seuils et conventions repris de src/rapport/report_charts.py (CALENDAR_LEVELS) et report_html.py
 * (MATRIX_LEVEL_SHARES, MATRIX_FAV_MIN, MATRIX_MIN_COLS, hours_window).
 */

import type { Flight } from '@/data/flight';
import { daysInMonth, epochDay, isoOfEpochDay, mondayOfEpochDay } from '@/lib/isoDay';
import { MEASURES } from '@/lib/measures';
import { sum } from '@/lib/numeric';
import { dailySummaries, minutesOf, type DaySummary, type WeekHourMatrix } from '@/lib/rhythm';
import type { CoverageKey } from '@/lib/records';

// ---------------------------------------------------------------------------
// Calendrier
// ---------------------------------------------------------------------------

/** Bornes hautes (incluses) des niveaux 1 à 3, en minutes volées dans la journée ; au-delà : niveau 4 (paliers fixes du rapport). */
export const CALENDAR_LEVELS = [30, 75, 150] as const;
export const CALENDAR_LEVEL_LABELS = ['≤ 30 min', '≤ 1 h 15', '≤ 2 h 30', '> 2 h 30'] as const;

/** Niveau d'intensité 1 à 4 d'une journée de vol. */
export function calendarLevel(minutes: number): 1 | 2 | 3 | 4 {
  const index = CALENDAR_LEVELS.findIndex((edge) => minutes <= edge);
  return ((index === -1 ? 3 : index) + 1) as 1 | 2 | 3 | 4;
}

export type CalendarKind = 'p' | 'm' | 'b';

/** Discipline d'une journée : p (parapente seul), m (paramoteur seul), b (les deux le même jour). */
export function calendarKind(disciplines: readonly string[]): CalendarKind {
  if (disciplines.length > 1) return 'b';
  return disciplines[0] === 'paramoteur' ? 'm' : 'p';
}

/** Jeton de couleur d'un jour de vol : `cal-p1` … `cal-b4`. */
export function calendarToken(day: DaySummary): string {
  return `cal-${calendarKind(day.disciplines)}${calendarLevel(day.minutes)}`;
}

/** Années présentes dans la sélection, de la plus récente à la plus ancienne. */
export function yearsOf(flights: readonly Flight[]): number[] {
  return [...new Set(flights.map((f) => f.year))].sort((a, b) => b - a);
}

/** Dernier jour écoulé de l'année : la date de référence (`referenceDate` de `lib/dashboard`) si elle tombe dans l'année, sinon le 31 décembre. */
export function yearEnd(year: number, reference: string): string {
  if (Number(reference.slice(0, 4)) === year) return reference;
  return `${year}-12-31`;
}

/** Position d'un jour dans la grille « semaines en colonnes, lundi en haut ». */
export interface GridCell {
  iso: string;
  col: number;
  /** 0 = lundi. */
  row: number;
}

/** Les jours d'une année dans la grille annuelle (colonne 0 = semaine du 1er janvier) et le nombre de colonnes. */
export function yearGrid(year: number): { cells: GridCell[]; columns: number; monthColumns: number[] } {
  const first = epochDay(`${year}-01-01`);
  const last = epochDay(`${year}-12-31`);
  const origin = mondayOfEpochDay(first);
  const cells: GridCell[] = [];
  for (let d = first; d <= last; d += 1) {
    cells.push({ iso: isoOfEpochDay(d), col: Math.floor((d - origin) / 7), row: d - mondayOfEpochDay(d) });
  }
  const columns = (cells[cells.length - 1]?.col ?? 0) + 1;
  const monthColumns = Array.from({ length: 12 }, (_, m) => {
    const day = epochDay(`${year}-${String(m + 1).padStart(2, '0')}-01`);
    return Math.floor((day - origin) / 7);
  });
  return { cells, columns, monthColumns };
}

/** Les jours d'un mois (1–12) dans une mini-grille : colonne 0 = semaine du 1er du mois. */
export function monthGrid(year: number, month: number): { cells: GridCell[]; columns: number } {
  const first = epochDay(`${year}-${String(month).padStart(2, '0')}-01`);
  const origin = mondayOfEpochDay(first);
  const cells: GridCell[] = [];
  for (let i = 0; i < daysInMonth(year, month); i += 1) {
    const d = first + i;
    cells.push({ iso: isoOfEpochDay(d), col: Math.floor((d - origin) / 7), row: d - mondayOfEpochDay(d) });
  }
  return { cells, columns: (cells[cells.length - 1]?.col ?? 0) + 1 };
}

/** Jours volés de la sélection, par date. */
export function dayMap(flights: readonly Flight[]): Map<string, DaySummary> {
  return new Map(dailySummaries(flights).map((d) => [d.date, d]));
}

/** Jour volé précédent (`-1`) ou suivant (`1`) dans une liste triée de dates ; `null` s'il n'y en a pas. */
export function neighborFlownDay(sortedDates: readonly string[], iso: string, direction: -1 | 1): string | null {
  if (direction === 1) return sortedDates.find((d) => d > iso) ?? null;
  for (let i = sortedDates.length - 1; i >= 0; i -= 1) {
    const d = sortedDates[i] as string;
    if (d < iso) return d;
  }
  return null;
}

/** Part des vols faits le samedi ou le dimanche (0 à 1), 0 sans vol. */
export function weekendShareOf(flights: readonly Flight[]): number {
  if (flights.length === 0) return 0;
  return flights.filter((f) => f.weekday >= 5).length / flights.length;
}

/** Vols par discipline : parts parapente / paramoteur (0 à 1). */
export function disciplineShares(flights: readonly Flight[]): { parapente: number; paramoteur: number; n: number } {
  const n = flights.length;
  const m = flights.filter((f) => f.activity === 'paramoteur').length;
  return { parapente: n === 0 ? 0 : (n - m) / n, paramoteur: n === 0 ? 0 : m / n, n };
}

/** Vols d'une journée triés par heure de décollage (heure inconnue en dernier), puis par numéro Syride. */
export function flightsOfDay(flights: readonly Flight[], iso: string): Flight[] {
  return flights
    .filter((f) => f.date === iso)
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.syrideNum - b.syrideNum);
}

// ---------------------------------------------------------------------------
// Matrice jour × heure
// ---------------------------------------------------------------------------

/** Niveaux 1 à 4 : part de la cellule maximale (jusqu'à 25 %, 50 %, 75 %, au-delà). */
export const MATRIX_LEVEL_SHARES = [0.25, 0.5, 0.75] as const;
/** Il faut au moins 3 vols dans la cellule maximale pour parler de « créneau favori ». */
export const MATRIX_FAV_MIN = 3;
/** Fenêtre d'heures affichée : au moins 8 colonnes. */
export const MATRIX_MIN_COLS = 8;

/** Niveau 1 à 4 d'une cellule non vide ; `peak` = maximum de la matrice. */
export function matrixLevel(n: number, peak: number): 1 | 2 | 3 | 4 {
  if (peak <= 0) return 1;
  return (1 + MATRIX_LEVEL_SHARES.filter((share) => n / peak > share).length) as 1 | 2 | 3 | 4;
}

/** Première et dernière heure affichées (port de `hours_window`) : heures utilisées, au moins 8 colonnes ; 8 h–18 h sans vol. */
export function hoursWindow(counts: readonly (readonly number[])[]): [number, number] {
  const used: number[] = [];
  for (let h = 0; h < 24; h += 1) if (counts.some((row) => (row[h] ?? 0) > 0)) used.push(h);
  let lo = used.length > 0 ? Math.min(...used) : 8;
  let hi = used.length > 0 ? Math.max(...used) : 18;
  while (hi - lo < MATRIX_MIN_COLS - 1) {
    lo = Math.max(lo - 1, 0);
    hi = Math.min(hi + 1, 23);
  }
  return [lo, hi];
}

export interface FavoriteSlot {
  /** 0 = lundi. */
  weekday: number;
  hour: number;
  n: number;
}

/** Cellule la plus chargée (à égalité : la plus longue en minutes, puis la première), `null` sous `MATRIX_FAV_MIN` vols. */
export function favoriteSlot(matrix: WeekHourMatrix): FavoriteSlot | null {
  let peak = 0;
  for (const row of matrix.counts) for (const n of row) peak = Math.max(peak, n);
  if (peak < MATRIX_FAV_MIN) return null;
  let best: FavoriteSlot | null = null;
  let bestMinutes = -1;
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      if (matrix.counts[day]?.[hour] !== peak) continue;
      const minutes = matrix.minutes[day]?.[hour] ?? 0;
      if (minutes > bestMinutes) {
        best = { weekday: day, hour, n: peak };
        bestMinutes = minutes;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Ruban voile × mois
// ---------------------------------------------------------------------------

/** Nombre de voiles affichées dans le ruban. */
export const RIBBON_TOP = 8;

export interface RibbonMonth {
  year: number;
  month: number;
}

export interface WingRibbonData {
  months: RibbonMonth[];
  rows: { wing: string; n: number[]; minutes: number[]; totalN: number; totalMinutes: number }[];
  /** Voiles non affichées (au-delà du top). */
  hidden: number;
}

/** Top `RIBBON_TOP` voiles (temps de vol décroissant) par mois, de façon continue du premier au dernier mois de la sélection (mois sans vol compris). */
export function wingRibbon(flights: readonly Flight[], top = RIBBON_TOP): WingRibbonData {
  const withWing = flights.filter((f): f is Flight & { wing: string } => f.wing !== null);
  let first = Infinity;
  let last = -Infinity;
  for (const f of flights) {
    const k = f.year * 12 + (f.month - 1);
    if (k < first) first = k;
    if (k > last) last = k;
  }
  // Colonnes continues, du premier au dernier mois de la sélection : les mois sans vol restent des colonnes vides.
  const monthKeys = flights.length === 0 ? [] : Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const months = monthKeys.map((k) => ({ year: Math.floor(k / 12), month: (k % 12) + 1 }));
  const byWing = new Map<string, { n: number[]; minutes: number[] }>();
  for (const f of withWing) {
    const row = byWing.get(f.wing) ?? {
      n: new Array<number>(months.length).fill(0),
      minutes: new Array<number>(months.length).fill(0),
    };
    const i = f.year * 12 + (f.month - 1) - first;
    row.n[i] = (row.n[i] ?? 0) + 1;
    row.minutes[i] = (row.minutes[i] ?? 0) + minutesOf(f);
    byWing.set(f.wing, row);
  }
  const all = [...byWing.entries()]
    .map(([wing, r]) => ({ wing, ...r, totalN: sum(r.n), totalMinutes: sum(r.minutes) }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes || b.totalN - a.totalN || a.wing.localeCompare(b.wing));
  return { months, rows: all.slice(0, top), hidden: Math.max(all.length - top, 0) };
}

/** Nombre de mois montrés par le ruban voile × mois. */
export const RIBBON_MONTHS = 24;

/**
 * Vols des `months` derniers mois de la sélection (le dernier mois étant celui du dernier vol de la sélection) ;
 * `truncated` vaut vrai si des vols plus anciens ont été écartés.
 */
export function lastMonthsFlights(
  flights: readonly Flight[],
  months = RIBBON_MONTHS,
): { flights: Flight[]; truncated: boolean } {
  let last = -Infinity;
  for (const f of flights) last = Math.max(last, f.year * 12 + (f.month - 1));
  const kept = flights.filter((f) => f.year * 12 + (f.month - 1) > last - months);
  return { flights: kept, truncated: kept.length < flights.length };
}

/** Intervalle `[dateFrom, dateTo]` d'un mois, pour un filtre de période. */
export function monthRange(year: number, month: number): [string, string] {
  const mm = String(month).padStart(2, '0');
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`];
}

// ---------------------------------------------------------------------------
// Nuage durée × plafond / distance
// ---------------------------------------------------------------------------

export type ScatterY = 'plafond' | 'distance';

/** Au-delà de ce nombre de points, ECharts passe en mode `large` (rendu groupé, pas d'animation). */
export const SCATTER_LARGE_THRESHOLD = 3000;

export interface ScatterPoint {
  flight: Flight;
  /** Durée en minutes. */
  x: number;
  y: number;
}

/** Points du nuage : vols dont la durée et la mesure (> 0) sont connues. Les autres sont comptés dans `missing`. */
export function scatterPoints(
  flights: readonly Flight[],
  yKey: ScatterY,
): { points: ScatterPoint[]; missing: number } {
  const points: ScatterPoint[] = [];
  for (const flight of flights) {
    const y = yKey === 'plafond' ? flight.ceilingM : flight.distKm;
    if (flight.durationMin === null || flight.durationMin <= 0 || y === null || y <= 0) continue;
    points.push({ flight, x: flight.durationMin, y });
  }
  return { points, missing: flights.length - points.length };
}

// ---------------------------------------------------------------------------
// Données partielles
// ---------------------------------------------------------------------------

/** Au-delà de 20 % de vols sans la mesure, on le signale. */
export const COVERAGE_NOTICE_THRESHOLD = 0.2;

export const MEASURE_LABELS: Readonly<Record<CoverageKey, string>> = {
  plafond: 'plafond',
  distance: 'distance',
  gain: 'gain d’altitude',
  vitesseMax: 'vitesse max',
  vario: 'vario max',
  g: 'g max',
};

export interface PartialData {
  n: number;
  missing: number;
  /** Part des vols sans la mesure (0 à 1). */
  missingShare: number;
  /** Origine des statistiques des vols de la sélection. */
  sources: { gpx: number; fiche: number; aucune: number };
  /** Origine des seuls vols sans la mesure. */
  missingSources: { gpx: number; fiche: number; aucune: number };
  /** Vrai si la part manquante dépasse `COVERAGE_NOTICE_THRESHOLD`. */
  partial: boolean;
}

/** Couverture d'une mesure (> 0) dans la sélection. */
export function partialData(flights: readonly Flight[], measure: CoverageKey): PartialData {
  const value = MEASURES[measure].of;
  const sources = { gpx: 0, fiche: 0, aucune: 0 };
  const missingSources = { gpx: 0, fiche: 0, aucune: 0 };
  let missing = 0;
  for (const f of flights) {
    sources[f.source] += 1;
    const v = value(f);
    if (v === null || v <= 0) {
      missing += 1;
      missingSources[f.source] += 1;
    }
  }
  const n = flights.length;
  const missingShare = n === 0 ? 0 : missing / n;
  return { n, missing, missingShare, sources, missingSources, partial: missingShare > COVERAGE_NOTICE_THRESHOLD };
}

