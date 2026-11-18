/**
 * Contexte d'un vol (ROADMAP §5.3) : rangs parlants, comparaison aux moyennes du pilote et du site,
 * vols du même jour, vol précédent et suivant du pilote. Fonctions pures, sans géométrie (D12).
 */
import type { Flight } from '@/data/flight';
import { fmtInt } from '@/lib/format';
import { MEASURES, measureValue } from '@/lib/metrics';
import { mean, meanPositive, positives, present, rankOf } from '@/lib/numeric';

/** Effectif minimal d'une population pour qu'un rang mérite d'être dit. */
export const MIN_RANK_POPULATION = 5;
/** Un rang est « parlant » s'il est dans les 3 premiers ou dans les 10 % de tête. */
export const RANK_TOP_COUNT = 3;
export const RANK_TOP_SHARE = 0.1;

/** Ordre chronologique d'un vol : date, heure (absente = début de journée), puis numéro Syride. */
export function compareFlights(a: Flight, b: Flight): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.syrideNum - b.syrideNum;
}

/** « 1ᵉʳ », « 2ᵉ », « 12ᵉ ». */
export function fmtOrdinal(n: number): string {
  return n === 1 ? '1ᵉʳ' : `${fmtInt(n)}ᵉ`;
}

export { rankOf };

/** Un rang est-il assez parlant pour être dit ? */
export function isNotableRank(rank: number, total: number): boolean {
  if (total < MIN_RANK_POPULATION) return false;
  return rank <= RANK_TOP_COUNT || rank <= Math.ceil(total * RANK_TOP_SHARE);
}

// ---------------------------------------------------------------------------
// Rangs
// ---------------------------------------------------------------------------

export type RankMetricId = 'duree' | 'distance' | 'plafond' | 'vitesse_max';

interface RankMetric {
  id: RankMetricId;
  /** Superlatif complet, au singulier (« plus long vol »). */
  superlative: string;
  of: (f: Flight) => number | null;
}

/** Valeur strictement positive ou `null` (règle commune : les valeurs ≤ 0 sont des mesures absentes). */
function positive(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

export const RANK_METRICS: readonly RankMetric[] = [
  { id: 'duree', superlative: 'plus long vol', of: (f) => positive(f.durationMin) },
  { id: 'distance', superlative: 'plus longue distance', of: (f) => positive(f.distKm) },
  { id: 'plafond', superlative: 'plus haut plafond', of: (f) => positive(measureValue(f, MEASURES.plafond)) },
  {
    id: 'vitesse_max',
    superlative: 'plus grande vitesse max',
    of: (f) => positive(measureValue(f, MEASURES.vitesse_max)),
  },
];

export type RankScope = 'pilot' | 'pilot-year' | 'site' | 'site-year';

export interface RankStatement {
  metric: RankMetricId;
  scope: RankScope;
  rank: number;
  /** Nombre de vols mesurés de la population. */
  total: number;
  /** Phrase sobre (« 3ᵉ plus long vol de j2f »). */
  text: string;
  /** Complément (« sur 143 vols mesurés »). */
  detail: string;
  /** Or réservé au rang 1. */
  gold: boolean;
}

function scopePhrase(scope: RankScope, flight: Flight): string {
  switch (scope) {
    case 'pilot':
      return `de ${flight.pilot}`;
    case 'pilot-year':
      return `de ${flight.pilot} en ${flight.year}`;
    case 'site':
      return `à ${flight.site ?? ''}`;
    case 'site-year':
      return `à ${flight.site ?? ''} en ${flight.year}`;
  }
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Phrase de rang : « Plus haut plafond de 2025 à Montbron » pour un 1ᵉʳ, « 3ᵉ plus long vol de j2f » sinon. */
export function rankSentence(superlative: string, rank: number, scope: string): string {
  return rank === 1 ? `${upperFirst(superlative)} ${scope}` : `${fmtOrdinal(rank)} ${superlative} ${scope}`;
}

export interface Populations {
  pilot: readonly Flight[];
  site: readonly Flight[];
}

/**
 * Rangs parlants du vol. Une population annuelle identique à celle de toutes les années
 * (le pilote ou le site n'a volé que cette année) n'est pas répétée. Rang 1 d'abord.
 */
export function rankStatements(flight: Flight, populations: Populations): RankStatement[] {
  const scopes: { scope: RankScope; flights: readonly Flight[] }[] = [
    { scope: 'pilot', flights: populations.pilot },
    { scope: 'pilot-year', flights: populations.pilot.filter((f) => f.year === flight.year) },
  ];
  if (flight.siteId !== null && flight.site) {
    scopes.push(
      { scope: 'site', flights: populations.site },
      { scope: 'site-year', flights: populations.site.filter((f) => f.year === flight.year) },
    );
  }
  const out: RankStatement[] = [];
  for (const metric of RANK_METRICS) {
    const own = metric.of(flight);
    if (own === null) continue;
    const seen = new Map<RankScope, number>();
    for (const { scope, flights } of scopes) {
      const values = present(flights.map(metric.of));
      // Même population que la portée « toutes années » : pas de doublon.
      const parent = scope === 'pilot-year' ? 'pilot' : scope === 'site-year' ? 'site' : null;
      if (parent && seen.get(parent) === values.length) continue;
      seen.set(scope, values.length);
      const rank = rankOf(own, values);
      if (!isNotableRank(rank, values.length)) continue;
      out.push({
        metric: metric.id,
        scope,
        rank,
        total: values.length,
        text: rankSentence(metric.superlative, rank, scopePhrase(scope, flight)),
        detail: `sur ${fmtInt(values.length)} vols mesurés`,
        gold: rank === 1,
      });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// ---------------------------------------------------------------------------
// Face aux moyennes
// ---------------------------------------------------------------------------

export type ComparisonId = 'duree' | 'distance' | 'plafond' | 'vitesse_max' | 'vario_max';

interface ComparisonDef {
  id: ComparisonId;
  label: string;
  unit: string;
  digits: number;
  /** La durée garde les zéros (seule une durée inconnue est sautée), comme `metrics.ts`. */
  keepZero?: boolean;
  of: (f: Flight) => number | null;
}

export const COMPARISONS: readonly ComparisonDef[] = [
  { id: 'duree', label: 'Durée', unit: 'min', digits: 0, keepZero: true, of: (f) => f.durationMin },
  { id: 'distance', label: 'Distance', unit: 'km', digits: 1, of: (f) => f.distKm },
  { id: 'plafond', label: 'Plafond', unit: 'm', digits: 0, of: (f) => measureValue(f, MEASURES.plafond) },
  {
    id: 'vitesse_max',
    label: 'Vitesse max',
    unit: 'km/h',
    digits: 1,
    of: (f) => measureValue(f, MEASURES.vitesse_max),
  },
  {
    id: 'vario_max',
    label: 'Vario max',
    unit: 'm/s',
    digits: 1,
    of: (f) => measureValue(f, MEASURES.vario_max),
  },
];

export interface MetricComparison {
  id: ComparisonId;
  label: string;
  unit: string;
  digits: number;
  /** Valeur de ce vol (`null` si absente). */
  value: number | null;
  pilotMean: number | null;
  /** Nombre de vols du pilote avec une mesure. */
  pilotCount: number;
  siteMean: number | null;
  siteCount: number;
  /** Plus grande des trois valeurs : échelle commune des barres. */
  scaleMax: number;
}

function meanOf(values: readonly (number | null)[], keepZero: boolean | undefined): number | null {
  return keepZero ? mean(present(values)) : meanPositive(values);
}

function countOf(values: readonly (number | null)[], keepZero: boolean | undefined): number {
  return keepZero ? present(values).length : positives(values).length;
}

/** Une ligne par métrique : ce vol, moyenne du pilote, moyenne du site (valeurs ≤ 0 ignorées). */
export function metricComparisons(flight: Flight, populations: Populations): MetricComparison[] {
  return COMPARISONS.map((def) => {
    const own = def.of(flight);
    const value = own !== null && (def.keepZero || own > 0) ? own : null;
    const pilotValues = populations.pilot.map(def.of);
    const siteValues = flight.siteId === null ? [] : populations.site.map(def.of);
    const pilotMean = meanOf(pilotValues, def.keepZero);
    const siteMean = siteValues.length === 0 ? null : meanOf(siteValues, def.keepZero);
    const scaleMax = Math.max(value ?? 0, pilotMean ?? 0, siteMean ?? 0);
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      digits: def.digits,
      value,
      pilotMean,
      pilotCount: countOf(pilotValues, def.keepZero),
      siteMean,
      siteCount: countOf(siteValues, def.keepZero),
      scaleMax,
    };
  });
}

/** Écart relatif en % de `value` par rapport à `reference` ; `null` si l'un manque ou si la référence est nulle. */
export function deltaPercent(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

/** Largeur d'une barre en % de l'échelle (0 si valeur absente ou échelle nulle). */
export function barWidth(value: number | null, scaleMax: number): number {
  if (value === null || scaleMax <= 0) return 0;
  return Math.max(0, Math.min(100, (value / scaleMax) * 100));
}

// ---------------------------------------------------------------------------
// Même jour, précédent et suivant
// ---------------------------------------------------------------------------

export interface SameDay {
  /** Autres vols du même jour au même site, tous pilotes. */
  sameSite: Flight[];
  /** Autres vols du pilote ce jour-là, sur un autre site (ou sans site). */
  elsewhere: Flight[];
}

export function sameDayFlights(flight: Flight, all: readonly Flight[]): SameDay {
  const sameSite: Flight[] = [];
  const elsewhere: Flight[] = [];
  for (const f of all) {
    if (f.dayKey !== flight.dayKey || f.key === flight.key) continue;
    if (flight.siteId !== null && f.siteId === flight.siteId) sameSite.push(f);
    else if (f.pilotSlug === flight.pilotSlug) elsewhere.push(f);
  }
  return { sameSite: sameSite.sort(compareFlights), elsewhere: elsewhere.sort(compareFlights) };
}

/** Vols précédent et suivant du pilote (ordre date, heure, numéro Syride). */
export function neighbours(
  flight: Flight,
  pilotFlights: readonly Flight[],
): { previous: Flight | null; next: Flight | null } {
  let previous: Flight | null = null;
  let next: Flight | null = null;
  for (const f of pilotFlights) {
    if (f.key === flight.key) continue;
    if (compareFlights(f, flight) < 0) {
      if (previous === null || compareFlights(f, previous) > 0) previous = f;
    } else if (next === null || compareFlights(f, next) < 0) next = f;
  }
  return { previous, next };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export interface FlightContext {
  populations: Populations;
  ranks: RankStatement[];
  comparisons: MetricComparison[];
  sameDay: SameDay;
  previous: Flight | null;
  next: Flight | null;
}

/** Populations du vol : ses vols de pilote et ceux de son site (en un seul passage). */
export function populationsOf(flight: Flight, all: readonly Flight[]): Populations {
  const pilot: Flight[] = [];
  const site: Flight[] = [];
  for (const f of all) {
    if (f.pilotSlug === flight.pilotSlug) pilot.push(f);
    if (flight.siteId !== null && f.siteId === flight.siteId) site.push(f);
  }
  return { pilot, site };
}

/** Tout le contexte d'un vol, calculé sur l'ensemble des vols (indépendant des filtres globaux). */
export function buildFlightContext(flight: Flight, all: readonly Flight[]): FlightContext {
  const populations = populationsOf(flight, all);
  const { previous, next } = neighbours(flight, populations.pilot);
  return {
    populations,
    ranks: rankStatements(flight, populations),
    comparisons: metricComparisons(flight, populations),
    sameDay: sameDayFlights(flight, all),
    previous,
    next,
  };
}
