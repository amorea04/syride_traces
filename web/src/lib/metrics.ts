/**
 * Les 19 statistiques de la page « Répartitions » (liste `list_values_graph` de src/app.py), définies une seule
 * fois : identifiant, libellé, unité, agrégation. Les identifiants reprennent les colonnes de `create_grouped_df`
 * (src/app_functions.py), ce qui permet la comparaison directe avec le Python.
 *
 * Règles reprises du Python :
 *   - moyennes et max ignorent les valeurs <= 0 (déjà `null` dans l'export) ;
 *   - un vol incomplet compte (vols, durée) mais pas dans les moyennes et max des statistiques de la fiche
 *     (`FICHE_STATS` : vitesses, distance cumulée, vario, g, plafond), qu'il ne connaît pas encore ;
 *   - la durée n'a pas de filtre « > 0 » : seule une durée inconnue (`null`) est sautée.
 */

import type { Flight } from '@/data/flight';
import { distinctCount, max, mean, maxPositive, meanPositive, present, sum } from '@/lib/numeric';

export const METRIC_IDS = [
  'nb_vols',
  'cumul_duree_vol',
  'nb_pilotes',
  'nb_sites_visites',
  'nb_voiles_utilisees',
  'moyenne_vitesse_moyenne',
  'max_vitesse_moyenne',
  'moyenne_vitesse_max',
  'max_vitesse_max',
  'moyenne_distance_cumulee',
  'max_distance_cumulee',
  'moyenne_duree_vol',
  'max_duree_vol',
  'moyenne_vario_max',
  'max_vario_max',
  'moyenne_g_max',
  'max_g_max',
  'moyenne_plafond',
  'max_plafond',
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export type Aggregation = 'count' | 'distinct' | 'sum' | 'mean' | 'max';

/** Mesure d'un vol sur laquelle porte une moyenne ou un max. */
export type MeasureId =
  'vitesse_moyenne' | 'vitesse_max' | 'distance_cumulee' | 'duree_vol' | 'vario_max' | 'g_max' | 'plafond';

export interface Measure {
  id: MeasureId;
  /** Libellé propre, sans la mention de l'agrégation. */
  label: string;
  unit: string;
  /** Décimales d'affichage (celles du Python : `round(x, n)`). */
  digits: number;
  /** Mesure issue de la fiche de vol : ignorée pour un vol incomplet. */
  fiche: boolean;
  /** Valeur brute d'un vol (`null` si inconnue ou <= 0 pour les mesures de l'export). */
  of: (flight: Flight) => number | null;
}

export const MEASURES: Readonly<Record<MeasureId, Measure>> = {
  vitesse_moyenne: {
    id: 'vitesse_moyenne',
    label: 'Vitesse moyenne',
    unit: 'km/h',
    digits: 1,
    fiche: true,
    of: (f) => f.speedAvg,
  },
  vitesse_max: {
    id: 'vitesse_max',
    label: 'Vitesse max',
    unit: 'km/h',
    digits: 1,
    fiche: true,
    of: (f) => f.speedMax,
  },
  distance_cumulee: {
    id: 'distance_cumulee',
    label: 'Distance',
    unit: 'km',
    digits: 1,
    fiche: true,
    of: (f) => f.distCumKm,
  },
  duree_vol: {
    id: 'duree_vol',
    label: 'Durée de vol',
    unit: 'min',
    digits: 0,
    fiche: false,
    of: (f) => f.durationMin,
  },
  vario_max: {
    id: 'vario_max',
    label: 'Vario max',
    unit: 'm/s',
    digits: 1,
    fiche: true,
    of: (f) => f.varioMax,
  },
  g_max: {
    id: 'g_max',
    label: 'Facteur de charge maximal',
    unit: 'g',
    digits: 1,
    fiche: true,
    of: (f) => f.gMax,
  },
  plafond: {
    id: 'plafond',
    label: 'Plafond',
    unit: 'm',
    digits: 0,
    fiche: true,
    of: (f) => f.ceilingM,
  },
};

export interface Metric {
  id: MetricId;
  /** Libellé complet, utilisable seul (sélecteur, titre de graphique). */
  label: string;
  /** Libellé de l'ancienne application (`list_values_graph`), pour la table de correspondance de la phase 3. */
  legacyLabel: string;
  unit: string;
  aggregation: Aggregation;
  /** Mesure sous-jacente (absente pour les dénombrements et la somme des heures). */
  measure: MeasureId | null;
  digits: number;
  aggregate: (flights: readonly Flight[]) => number | null;
}

/** Valeur d'une mesure pour un vol, `null` pour une statistique de fiche d'un vol incomplet. */
export function measureValue(flight: Flight, measure: Measure): number | null {
  return measure.fiche && flight.incomplete ? null : measure.of(flight);
}

function measureValues(flights: readonly Flight[], id: MeasureId): (number | null)[] {
  const measure = MEASURES[id];
  return flights.map((f) => measureValue(f, measure));
}

function countMetric(
  id: MetricId,
  label: string,
  legacyLabel: string,
  unit: string,
  aggregation: 'count' | 'distinct',
  aggregate: (flights: readonly Flight[]) => number,
): Metric {
  return { id, label, legacyLabel, unit, aggregation, measure: null, digits: 0, aggregate };
}

function statMetric(id: MetricId, kind: 'mean' | 'max', measureId: MeasureId, legacyLabel: string): Metric {
  const measure = MEASURES[measureId];
  const isMean = kind === 'mean';
  // La durée garde les zéros (Python : mean/max sans filtre), les autres mesures ignorent les valeurs <= 0.
  const reduce = (values: (number | null)[]): number | null => {
    if (measureId === 'duree_vol') return isMean ? mean(present(values)) : max(present(values));
    return isMean ? meanPositive(values) : maxPositive(values);
  };
  return {
    id,
    label: `${measure.label} : ${isMean ? 'moyenne' : 'maximum'}`,
    legacyLabel,
    unit: measure.unit,
    aggregation: kind,
    measure: measureId,
    digits: measure.digits,
    aggregate: (flights) => reduce(measureValues(flights, measureId)),
  };
}

const LIST: readonly Metric[] = [
  countMetric('nb_vols', 'Vols', 'Nombre de vols', 'vols', 'count', (fs) => fs.length),
  {
    id: 'cumul_duree_vol',
    label: 'Heures de vol',
    legacyLabel: "Nombre d'heures de vol",
    unit: 'h',
    aggregation: 'sum',
    measure: 'duree_vol',
    digits: 1,
    aggregate: (fs) => sum(present(fs.map((f) => f.durationMin))) / 60,
  },
  countMetric('nb_pilotes', 'Pilotes', 'Nombre de pilotes', 'pilotes', 'distinct', (fs) =>
    distinctCount(fs.map((f) => f.pilot)),
  ),
  countMetric('nb_sites_visites', 'Sites visités', 'Nombre de sites visités', 'sites', 'distinct', (fs) =>
    distinctCount(fs.map((f) => f.site)),
  ),
  countMetric(
    'nb_voiles_utilisees',
    'Voiles utilisées',
    'Nombre de voiles utilisées',
    'voiles',
    'distinct',
    (fs) => distinctCount(fs.map((f) => f.wing)),
  ),
  statMetric('moyenne_vitesse_moyenne', 'mean', 'vitesse_moyenne', 'Moyenne de la vitesse moyenne'),
  statMetric('max_vitesse_moyenne', 'max', 'vitesse_moyenne', 'Max de la vitesse moyenne'),
  statMetric('moyenne_vitesse_max', 'mean', 'vitesse_max', 'Moyenne de la vitesse max'),
  statMetric('max_vitesse_max', 'max', 'vitesse_max', 'Max de la vitesse max'),
  statMetric('moyenne_distance_cumulee', 'mean', 'distance_cumulee', 'Moyenne de la distance cumulée'),
  statMetric('max_distance_cumulee', 'max', 'distance_cumulee', 'Max de la distance cumulée'),
  statMetric('moyenne_duree_vol', 'mean', 'duree_vol', 'Moyenne de la durée de vol'),
  statMetric('max_duree_vol', 'max', 'duree_vol', 'Max de la durée de vol'),
  statMetric('moyenne_vario_max', 'mean', 'vario_max', 'Moyenne du vario max'),
  statMetric('max_vario_max', 'max', 'vario_max', 'Max du vario max'),
  statMetric('moyenne_g_max', 'mean', 'g_max', 'Moyenne de g max'),
  statMetric('max_g_max', 'max', 'g_max', 'max de g max'),
  statMetric('moyenne_plafond', 'mean', 'plafond', 'Moyenne du plafond'),
  statMetric('max_plafond', 'max', 'plafond', 'Max du plafond'),
];

/** Les 19 métriques, dans l'ordre du sélecteur de l'ancienne application. */
export const METRICS: readonly Metric[] = LIST;

const BY_ID = new Map<string, Metric>(LIST.map((m) => [m.id, m]));

export function isMetricId(value: string): value is MetricId {
  return BY_ID.has(value);
}

/** Métrique par identifiant ; lève une erreur si l'identifiant est inconnu. */
export function metricById(id: MetricId): Metric {
  const metric = BY_ID.get(id);
  if (!metric) throw new Error(`Métrique inconnue\u00a0: ${id}`);
  return metric;
}
