/**
 * Rythme de vol : répartitions, matrice jour × heure, jours volés, séries, pauses, régularité.
 * Portage des fonctions génériques de src/rapport/report_data.py : `_distribution`, `week_hour_matrix`,
 * `_longest_gap`, `_longest_run`, `_weeks_active_total`, `compute_rhythm`, `_seasons`, `_flight_modes`
 * et la courbe cumulée (`steps` de `compute_indicators`).
 *
 * Conventions du rapport : une durée inconnue compte 0 minute (`prepare_report_df` fait `fillna(0)`),
 * la semaine va du lundi au dimanche, la semaine du 1er janvier compte, aucune pause n'est comptée après le
 * dernier vol.
 */

import type { Flight, Season } from '@/data/flight';
import { daysInMonth, epochDay, isoOfEpochDay, mondayOfEpochDay, weekdayOfEpochDay } from '@/lib/isoDay';

/** Durée d'un vol en minutes, 0 si inconnue (convention du rapport). */
export const minutesOf = (flight: Flight): number => flight.durationMin ?? 0;

/** Heure entière de décollage (0–23), `null` si inconnue : seule la partie « HH » compte, comme `_hour_of`. */
export function hourOf(flight: Flight): number | null {
  return flight.time === null ? null : Number(flight.time.slice(0, 2));
}

/** Nombre de vols et minutes pour chaque valeur d'une clé entière, dans [offset, offset + size). */
export interface Distribution {
  flights: number[];
  minutes: number[];
}

/** Port de `_distribution`. */
export function distribution(
  flights: readonly Flight[],
  keyOf: (f: Flight) => number | null,
  size: number,
  offset = 0,
): Distribution {
  const out: Distribution = {
    flights: new Array<number>(size).fill(0),
    minutes: new Array<number>(size).fill(0),
  };
  for (const f of flights) {
    const key = keyOf(f);
    if (key === null || key < offset || key >= offset + size) continue;
    out.flights[key - offset] = (out.flights[key - offset] ?? 0) + 1;
    out.minutes[key - offset] = (out.minutes[key - offset] ?? 0) + minutesOf(f);
  }
  return out;
}

/** Répartition par mois (index 0 = janvier). */
export const monthDistribution = (flights: readonly Flight[]): Distribution =>
  distribution(flights, (f) => f.month, 12, 1);
/** Répartition par jour de la semaine (index 0 = lundi). */
export const weekdayDistribution = (flights: readonly Flight[]): Distribution =>
  distribution(flights, (f) => f.weekday, 7);
/** Répartition par heure de décollage (index = heure, 0–23). */
export const hourDistribution = (flights: readonly Flight[]): Distribution =>
  distribution(flights, hourOf, 24);

/** Matrice jour de la semaine × heure de décollage. */
export interface WeekHourMatrix {
  /** [7][24] vols ; lundi = 0. */
  counts: number[][];
  /** [7][24] minutes. */
  minutes: number[][];
  /** Vols sans heure de décollage connue : comptés ici, non placés. */
  missing: number;
}

/** Port de `week_hour_matrix`. */
export function weekHourMatrix(flights: readonly Flight[]): WeekHourMatrix {
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const minutes = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let missing = 0;
  for (const f of flights) {
    const hour = hourOf(f);
    const rowCounts = counts[f.weekday];
    const rowMinutes = minutes[f.weekday];
    if (hour !== null && hour >= 0 && hour < 24 && rowCounts && rowMinutes) {
      rowCounts[hour] = (rowCounts[hour] ?? 0) + 1;
      rowMinutes[hour] = (rowMinutes[hour] ?? 0) + minutesOf(f);
    } else {
      missing += 1;
    }
  }
  return { counts, minutes, missing };
}

/** Un jour de vol : nombre de vols, minutes, disciplines présentes. */
export interface DaySummary {
  date: string;
  n: number;
  minutes: number;
  disciplines: string[];
}

/** Jours de vol, triés par date (équivalent du dictionnaire `daily` de `compute_indicators`). */
export function dailySummaries(flights: readonly Flight[]): DaySummary[] {
  const byDay = new Map<string, DaySummary>();
  for (const f of flights) {
    const day = byDay.get(f.date) ?? { date: f.date, n: 0, minutes: 0, disciplines: [] };
    day.n += 1;
    day.minutes += minutesOf(f);
    if (!day.disciplines.includes(f.activity)) day.disciplines.push(f.activity);
    byDay.set(f.date, day);
  }
  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const d of days) d.disciplines.sort();
  return days;
}

/** Position de la FIN d'une journée dans l'année, entre 0 et 1 (`x_of_date`). */
export function xOfDate(isoDate: string): number {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  return (m - 1 + d / daysInMonth(y, m)) / 12;
}

/** Courbe cumulée des heures de vol : un point (position dans l'année, heures cumulées) par jour de vol. */
export function cumulativeSteps(flights: readonly Flight[]): [number, number][] {
  let cumulative = 0;
  return dailySummaries(flights).map((day) => {
    cumulative += day.minutes;
    return [xOfDate(day.date), cumulative / 60];
  });
}

// ---------------------------------------------------------------------------
// Séries, pauses, régularité
// ---------------------------------------------------------------------------

/** Une « série » compte au moins 2 jours de vol consécutifs. */
export const RHYTHM_MIN_STREAK = 2;
/** Samedi et dimanche (lundi = 0). */
const WEEKEND_DAYS: readonly number[] = [5, 6];

export interface DateSpan {
  /** Nombre de jours (série ou pause). */
  days: number;
  start: string;
  end: string;
}

/** Port de `_longest_run` : plus longue suite d'entiers consécutifs d'une liste triée (la première en cas d'égalité). */
export function longestRun(keys: readonly number[]): { length: number; first: number; last: number } | null {
  let best: { length: number; first: number; last: number } | null = null;
  let start = 0;
  for (let i = 1; i <= keys.length; i += 1) {
    if (i === keys.length || (keys[i] as number) !== (keys[i - 1] as number) + 1) {
      const length = i - start;
      if (best === null || length > best.length) {
        best = { length, first: keys[start] as number, last: keys[i - 1] as number };
      }
      start = i;
    }
  }
  return best;
}

/**
 * Port de `_longest_gap` : plus longue pause entre deux jours de vol consécutifs d'une liste triée de dates ISO
 * (jours sans vol, premier et dernier jour sans vol), `null` s'il n'y en a pas. La première en cas d'égalité.
 */
export function longestGap(sortedDates: readonly string[]): DateSpan | null {
  let best: DateSpan | null = null;
  for (let i = 1; i < sortedDates.length; i += 1) {
    const a = epochDay(sortedDates[i - 1] as string);
    const b = epochDay(sortedDates[i] as string);
    const days = b - a - 1;
    if (days > 0 && (best === null || days > best.days)) {
      best = { days, start: isoOfEpochDay(a + 1), end: isoOfEpochDay(b - 1) };
    }
  }
  return best;
}

export interface Rhythm {
  /** Plus longue série de jours consécutifs volés, `null` si elle fait moins de 2 jours. */
  streak: DateSpan | null;
  /** Plus longue pause entre deux jours de vol (pas de pause après le dernier vol). */
  gap: DateSpan | null;
  /** Meilleure semaine civile (minutes, puis vols, puis la plus ancienne). */
  week: { start: string; end: string; minutes: number; n: number };
  /** Semaines (lundi-dimanche) avec au moins un vol. */
  weeksActive: number;
  /** Semaines écoulées de l'année, celle du 1er janvier comptant. */
  weeksTotal: number;
  /** Plus longue suite de semaines avec vol. */
  weeksStreak: number;
  /** Part des vols faits le samedi ou le dimanche (0 à 1). */
  weekendShare: number;
}

/**
 * Port de `compute_rhythm`. `year` : année du rapport (semaine du 1er janvier) ; `start` : premier jour de la période si ce n'est pas le 1er janvier (12 mois glissants) ; `end` : dernier jour écoulé
 * (aujourd'hui pour l'année en cours, le 31 décembre sinon). `null` sans vol.
 */
export function computeRhythm(
  flights: readonly Flight[],
  year: number,
  end: string,
  start?: string,
): Rhythm | null {
  const daily = dailySummaries(flights);
  if (daily.length === 0) return null;
  const dates = daily.map((d) => d.date);
  const days = dates.map(epochDay);

  const run = longestRun(days);
  const streak: DateSpan | null =
    run && run.length >= RHYTHM_MIN_STREAK
      ? { days: run.length, start: isoOfEpochDay(run.first), end: isoOfEpochDay(run.last) }
      : null;

  const weeks = new Map<number, { minutes: number; n: number }>();
  for (const d of daily) {
    const monday = mondayOfEpochDay(epochDay(d.date));
    const w = weeks.get(monday) ?? { minutes: 0, n: 0 };
    w.minutes += d.minutes;
    w.n += d.n;
    weeks.set(monday, w);
  }
  let bestMonday = Number.NaN;
  let best = { minutes: -Infinity, n: -Infinity };
  for (const [monday, w] of weeks) {
    const better =
      w.minutes > best.minutes ||
      (w.minutes === best.minutes && (w.n > best.n || (w.n === best.n && monday < bestMonday)));
    if (better) {
      bestMonday = monday;
      best = w;
    }
  }

  const mondayOfEnd = mondayOfEpochDay(epochDay(end));
  const mondayOfJan1 = mondayOfEpochDay(epochDay(start ?? `${year}-01-01`));
  const weeksTotal = Math.max(Math.floor((mondayOfEnd - mondayOfJan1) / 7) + 1, weeks.size);
  // Un lundi vaut 7k + 4 en jours depuis 1970 : k est continu d'une semaine à l'autre.
  const weekStreak = longestRun([...weeks.keys()].map((m) => Math.floor(m / 7)).sort((a, b) => a - b));

  const total = daily.reduce((s, d) => s + d.n, 0);
  const weekend = daily
    .filter((d) => WEEKEND_DAYS.includes(weekdayOfEpochDay(epochDay(d.date))))
    .reduce((s, d) => s + d.n, 0);

  return {
    streak,
    gap: longestGap(dates),
    week: {
      start: isoOfEpochDay(bestMonday),
      end: isoOfEpochDay(bestMonday + 6),
      minutes: best.minutes,
      n: best.n,
    },
    weeksActive: weeks.size,
    weeksTotal,
    weeksStreak: weekStreak?.length ?? 0,
    weekendShare: weekend / Math.max(total, 1),
  };
}

// ---------------------------------------------------------------------------
// Saisons et façons de voler
// ---------------------------------------------------------------------------

export const SEASONS: readonly Season[] = ['hiver', 'printemps', 'été', 'automne'];
/** Ordre canonique des façons de voler (`MODE_ORDER`). */
export const MODE_ORDER: readonly string[] = ['Site', 'Treuil', 'Rando', 'Bord de mer', 'Moteur'];

export interface CountMinutes {
  n: number;
  minutes: number;
}

/** Port de `_seasons` : vols et minutes par saison, les quatre toujours présentes. */
export function seasonsBreakdown(flights: readonly Flight[]): Record<Season, CountMinutes> {
  const out: Record<Season, CountMinutes> = {
    hiver: { n: 0, minutes: 0 },
    printemps: { n: 0, minutes: 0 },
    été: { n: 0, minutes: 0 },
    automne: { n: 0, minutes: 0 },
  };
  for (const f of flights) {
    out[f.season].n += 1;
    out[f.season].minutes += minutesOf(f);
  }
  return out;
}

export interface ModeRow extends CountMinutes {
  mode: string;
}

/** Port de `_flight_modes` : ordre canonique puis libellés inconnus (alphabétique) ; modes vides omis. */
export function flightModes(flights: readonly Flight[]): ModeRow[] {
  const byMode = new Map<string, CountMinutes>();
  for (const f of flights) {
    if (f.mode === null) continue;
    const row = byMode.get(f.mode) ?? { n: 0, minutes: 0 };
    row.n += 1;
    row.minutes += minutesOf(f);
    byMode.set(f.mode, row);
  }
  const rank = (m: string): number => {
    const i = MODE_ORDER.indexOf(m);
    return i === -1 ? 99 : i;
  };
  return [...byMode.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([mode, row]) => ({ mode, ...row }));
}
