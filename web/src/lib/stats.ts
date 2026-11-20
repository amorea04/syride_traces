/**
 * Portage de `get_flight_params` et `create_grouped_df` (src/app_functions.py).
 *
 * Écarts assumés avec le Python (documentés, testés dans tests/stats.regression.test.ts) :
 *   - `nbSites` ne compte pas les vols sans site (corrigé aussi côté Python, `nunique()`).
 *   - `get_flight_params` ne retire pas les mesures de fiche des vols incomplets, contrairement à
 *     `create_grouped_df`. Dans le pkl elles sont vides pour ces vols : sans effet sur les vraies données. Le port
 *     garde les deux comportements (ici : on prend les valeurs exportées telles quelles).
 *   - Les nombres sont rendus arrondis comme le Python (`round` sur un résultat pandas : voir `numpyRound`), sans
 *     mise en texte.
 */

import type { Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import { hourOf } from '@/lib/rhythm';
import { METRICS, type MetricId } from '@/lib/metrics';
import {
  compareStrings,
  distinctCount,
  max,
  maxPositive,
  mean,
  meanPositive,
  present,
  numpyRound,
  sum,
} from '@/lib/numeric';

/** Moyenne et maximum d'une mesure (`null` si aucune valeur). */
export interface MeanMax {
  mean: number | null;
  max: number | null;
}

/** Chiffres clés d'un ensemble de vols : valeurs de `get_flight_params`, sans la mise en texte. */
export interface FlightParams {
  nbVols: number;
  /** Total des durées en minutes, arrondi à l'entier. */
  totalMinutes: number;
  /** Partie entière des heures (`totalMinutes // 60`). */
  hours: number;
  /** Minutes restantes (`totalMinutes % 60`). */
  minutes: number;
  nbSites: number;
  nbPilots: number;
  /** Km/h, 1 décimale. */
  speedAvg: MeanMax;
  speedMax: MeanMax;
  /** Minutes, entier (durées inconnues ignorées, zéros conservés). */
  duration: MeanMax;
  /** Distance cumulée, km, 1 décimale. */
  distance: MeanMax;
  /** Mètres, entier. */
  ceiling: MeanMax;
  /** m/s, 1 décimale. */
  vario: MeanMax;
  /** g, 1 décimale. */
  g: MeanMax;
}

function rounded(value: number | null, digits: number): number | null {
  return value === null ? null : numpyRound(value, digits);
}

function meanMax(flights: readonly Flight[], pick: (f: Flight) => number | null, digits: number): MeanMax {
  const values = flights.map(pick);
  return { mean: rounded(meanPositive(values), digits), max: rounded(maxPositive(values), digits) };
}

/** Port de `get_flight_params`. */
export function getFlightParams(flights: readonly Flight[]): FlightParams {
  const durations = present(flights.map((f) => f.durationMin));
  const totalMinutes = numpyRound(sum(durations), 0);
  return {
    nbVols: flights.length,
    totalMinutes,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    nbSites: distinctCount(flights.map((f) => f.site)),
    nbPilots: distinctCount(flights.map((f) => f.pilot)),
    speedAvg: meanMax(flights, (f) => f.speedAvg, 1),
    speedMax: meanMax(flights, (f) => f.speedMax, 1),
    duration: { mean: rounded(mean(durations), 0), max: rounded(max(durations), 0) },
    distance: meanMax(flights, (f) => f.distCumKm, 1),
    ceiling: meanMax(flights, (f) => f.ceilingM, 0),
    vario: meanMax(flights, (f) => f.varioMax, 1),
    g: meanMax(flights, (f) => f.gMax, 1),
  };
}

// ---------------------------------------------------------------------------
// Regroupement par axe
// ---------------------------------------------------------------------------

export const AXIS_IDS = [
  'pilote',
  'annee',
  'mois',
  'voile',
  'jour_semaine',
  'saison',
  'site',
  'heure',
] as const;

export type AxisId = (typeof AXIS_IDS)[number];

/** Noms de mois du pkl (sans accent), ordre de `CATEGORY_ORDERS["mois"]`. */
const MONTH_KEYS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const;
const MONTH_LABELS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;
const WEEKDAY_KEYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const SEASON_KEYS = ['hiver', 'printemps', 'été', 'automne'] as const;

type Order = 'category' | 'ascending' | 'descending';

interface AxisDef {
  id: AxisId;
  label: string;
  /** Clé de regroupement (identique au Python, `str`), `null` : vol écarté (pandas ignore les NaN). */
  keyOf: (f: Flight) => string | null;
  labelOf: (key: string) => string;
  order: Order;
  /** Ordre des catégories, pour `order === 'category'`. */
  categories?: readonly string[];
}

const same = (key: string): string => key;

export const AXES: Readonly<Record<AxisId, AxisDef>> = {
  pilote: { id: 'pilote', label: 'Pilote', keyOf: (f) => f.pilot, labelOf: same, order: 'ascending' },
  annee: {
    id: 'annee',
    label: 'Année',
    keyOf: (f) => String(f.year),
    labelOf: same,
    order: 'descending',
  },
  mois: {
    id: 'mois',
    label: 'Mois',
    keyOf: (f) => MONTH_KEYS[f.month - 1] ?? null,
    labelOf: (key) => MONTH_LABELS[MONTH_KEYS.indexOf(key as (typeof MONTH_KEYS)[number])] ?? key,
    order: 'category',
    categories: MONTH_KEYS,
  },
  voile: { id: 'voile', label: 'Voile', keyOf: (f) => f.wing, labelOf: same, order: 'ascending' },
  jour_semaine: {
    id: 'jour_semaine',
    label: 'Jour de la semaine',
    keyOf: (f) => WEEKDAY_KEYS[f.weekday] ?? null,
    labelOf: same,
    order: 'category',
    categories: WEEKDAY_KEYS,
  },
  saison: {
    id: 'saison',
    label: 'Saison',
    keyOf: (f) => f.season,
    labelOf: same,
    order: 'category',
    categories: SEASON_KEYS,
  },
  site: { id: 'site', label: 'Site', keyOf: (f) => f.site, labelOf: same, order: 'ascending' },
  // Nouvel axe (absent de l'ancienne application) : heure entière de décollage, vols sans heure écartés.
  heure: {
    id: 'heure',
    label: 'Heure de décollage',
    keyOf: (f) => {
      const hour = hourOf(f);
      return hour === null ? null : String(hour);
    },
    labelOf: (key) => `${key.padStart(2, '0')}\u00a0h`,
    order: 'ascending',
  },
};

/** Une ligne de `create_grouped_df` : la catégorie et les 19 statistiques. */
export interface GroupRow {
  /** Valeur de l'axe, comme dans le Python (« fevrier », « 2024 », « 8 »). */
  key: string;
  /** Libellé d'affichage (« février », « 08 h »). */
  label: string;
  values: Record<MetricId, number | null>;
}

function compareKeys(axis: AxisDef, a: string, b: string): number {
  if (axis.order === 'category') {
    const cats = axis.categories ?? [];
    return cats.indexOf(a) - cats.indexOf(b);
  }
  if (axis.id === 'annee' || axis.id === 'heure') {
    return axis.order === 'descending' ? Number(b) - Number(a) : Number(a) - Number(b);
  }
  return axis.order === 'descending' ? compareStrings(b, a) : compareStrings(a, b);
}

/** Les 19 statistiques d'un ensemble de vols. */
export function computeMetrics(flights: readonly Flight[]): Record<MetricId, number | null> {
  const values = {} as Record<MetricId, number | null>;
  for (const metric of METRICS) values[metric.id] = metric.aggregate(flights);
  return values;
}

/**
 * Port de `create_grouped_df` : une ligne par valeur de l'axe, triée comme le Python (catégories dans leur ordre
 * naturel ; pilote, voile, site par ordre alphabétique ; année décroissante ; heure croissante).
 */
export function groupFlights(flights: readonly Flight[], axisId: AxisId): GroupRow[] {
  const axis = AXES[axisId];
  const groups = groupBy(flights, axis.keyOf);
  return [...groups.keys()]
    .sort((a, b) => compareKeys(axis, a, b))
    .map((key) => ({
      key,
      label: axis.labelOf(key),
      values: computeMetrics(groups.get(key) ?? []),
    }));
}
