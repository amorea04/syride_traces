/**
 * Qualité des données (page À propos) : compteurs d'anomalies utiles à la maintenance. Fonctions pures.
 * Les vols sans date n'existent pas côté app : le schéma les écarte à l'export (`meta.counts.excluded_flights`).
 */

import type { Flight } from '@/data/flight';
import { normalizeText } from '@/lib/flightsTable';
import { MEASURES, type Aggregation, type Metric } from '@/lib/metrics';
import { computeCoverage, type Coverage } from '@/lib/records';

/** Nom de voile ramené à une forme canonique : casse, accents, espaces et tirets ignorés. */
export function normalizeWingName(name: string): string {
  return normalizeText(name)
    .replace(/[-_‐-―]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface WingVariant {
  name: string;
  flights: number;
}

export interface WingGroup {
  /** Forme normalisée commune. */
  key: string;
  /** Variantes d'écriture, la plus utilisée d'abord. */
  variants: WingVariant[];
}

/** Voiles écrites de plusieurs façons (même nom une fois normalisé) : candidates à l'uniformisation. */
export function similarWings(flights: readonly Flight[]): WingGroup[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const f of flights) {
    if (f.wing === null) continue;
    const key = normalizeWingName(f.wing);
    let variants = byKey.get(key);
    if (!variants) {
      variants = new Map();
      byKey.set(key, variants);
    }
    variants.set(f.wing, (variants.get(f.wing) ?? 0) + 1);
  }
  const groups: WingGroup[] = [];
  for (const [key, variants] of byKey) {
    if (variants.size < 2) continue;
    groups.push({
      key,
      variants: [...variants.entries()]
        .map(([name, count]) => ({ name, flights: count }))
        .sort((a, b) => b.flights - a.flights || a.name.localeCompare(b.name, 'fr')),
    });
  }
  return groups.sort((a, b) => a.key.localeCompare(b.key, 'fr'));
}

/** Sous-ensemble d'un site dont on a besoin. */
export interface QualitySite {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
}

export interface DataQuality {
  /** Vols exportés (présents dans l'app). */
  exported: number;
  /** Vols écartés à l'export (ex. date sentinelle). */
  excluded: number;
  incomplete: number;
  /** Vols sans site rattaché. */
  withoutSite: number;
  /** Sites sans coordonnées, et vols concernés. */
  sitesWithoutCoords: { id: number; name: string; flights: number }[];
  flightsWithoutCoords: number;
  coverage: Coverage;
  similarWings: WingGroup[];
}

/** Compteurs de qualité sur l'ensemble des vols exportés (indépendants des filtres). */
export function computeQuality(
  flights: readonly Flight[],
  sites: readonly QualitySite[],
  excluded: number,
): DataQuality {
  const hasCoords = new Set<number>();
  for (const s of sites) if (s.lat !== null && s.lon !== null) hasCoords.add(s.id);
  const flightsBySite = new Map<number, number>();
  let incomplete = 0;
  let withoutSite = 0;
  for (const f of flights) {
    if (f.incomplete) incomplete += 1;
    if (f.siteId === null) withoutSite += 1;
    else flightsBySite.set(f.siteId, (flightsBySite.get(f.siteId) ?? 0) + 1);
  }
  const sitesWithoutCoords = sites
    .filter((s) => !hasCoords.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, flights: flightsBySite.get(s.id) ?? 0 }))
    .sort((a, b) => b.flights - a.flights || a.name.localeCompare(b.name, 'fr'));
  return {
    exported: flights.length,
    excluded,
    incomplete,
    withoutSite,
    sitesWithoutCoords,
    flightsWithoutCoords: sitesWithoutCoords.reduce((s, r) => s + r.flights, 0),
    coverage: computeCoverage(flights, (id) => hasCoords.has(id)),
    similarWings: similarWings(flights),
  };
}

// ---------------------------------------------------------------------------
// Glossaire : règle de calcul d'une métrique
// ---------------------------------------------------------------------------

/** Libellé de l'agrégation d'une métrique. */
export const AGGREGATION_LABELS: Readonly<Record<Aggregation, string>> = {
  count: 'Dénombrement',
  distinct: 'Valeurs distinctes',
  sum: 'Somme',
  mean: 'Moyenne',
  max: 'Maximum',
};

/** Phrase de règle d'une métrique : valeurs ignorées et traitement des vols incomplets. */
export function metricRule(metric: Metric): string {
  if (metric.aggregation === 'count' || metric.aggregation === 'distinct') {
    return 'Tous les vols comptent, y compris les vols incomplets.';
  }
  if (metric.aggregation === 'sum') {
    return 'Les durées inconnues sont ignorées ; les vols incomplets comptent.';
  }
  const measure = metric.measure ? MEASURES[metric.measure] : null;
  if (measure?.id === 'duree_vol') {
    return 'Seules les durées inconnues sont ignorées (une durée nulle est conservée) ; les vols incomplets comptent.';
  }
  const incomplete = measure?.fiche
    ? ' Un vol incomplet est compté ailleurs, mais sa mesure est ignorée ici.'
    : '';
  return `Les valeurs inconnues ou ≤ 0 sont ignorées.${incomplete}`;
}
