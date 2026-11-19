/**
 * Agrégats par site et positionnement d'un site parmi les autres (D15, D17). Module unique,
 * réutilisé par la fiche vol (phase 4) et la page site (phase 5).
 *
 * Règles : moyennes en ignorant les `null` et les valeurs ≤ 0 (la durée garde les zéros, comme
 * `metrics.ts`) ; un site compte pour une voix, la moyenne « des autres » est la moyenne de leurs
 * moyennes. Rang 1 = valeur la plus haute ; les ex æquo partagent le même rang.
 */
import type { Flight } from '@/data/flight';
import { MEASURES, measureValue } from '@/lib/metrics';
import { mean, meanPositive, median, present, rankOf } from '@/lib/numeric';

/** Un site est comparé à partir de ce nombre de vols (D15). */
export const MIN_SITE_FLIGHTS = 10;
/** Seuil de la vue « Ce pilote » (D17) : sites d'au moins ce nombre de vols du pilote. */
export const MIN_SITE_FLIGHTS_PILOT = 10;

/** D20 : « Ses sites face à face » (page pilote) prend tous les sites du pilote, dès 1 vol. */
export const MIN_SITE_FLIGHTS_FACE_TO_FACE = 1;
/** Sous ce nombre de vols, la moyenne d'un site est fragile : la page pilote le signale (« peu de vols »). */
export const FEW_SITE_FLIGHTS = 3;

/** Vrai si la moyenne du site repose sur trop peu de vols. */
export function hasFewFlights(flights: number): boolean {
  return flights < FEW_SITE_FLIGHTS;
}

export interface SiteAggregate {
  siteId: number;
  flights: number;
  pilots: number;
  parapente: number;
  paramoteur: number;
  durationMean: number | null;
  distanceMean: number | null;
  ceilingMean: number | null;
  speedMean: number | null;
  varioMaxMean: number | null;
}

/** Agrégats de tous les sites présents dans `flights` (les vols sans site sont ignorés). Un seul passage + un par site. */
export function siteAggregates(flights: readonly Flight[]): Map<number, SiteAggregate> {
  const bySite = new Map<number, Flight[]>();
  for (const f of flights) {
    if (f.siteId === null) continue;
    const list = bySite.get(f.siteId);
    if (list) list.push(f);
    else bySite.set(f.siteId, [f]);
  }
  const out = new Map<number, SiteAggregate>();
  for (const [siteId, list] of bySite) {
    const pilots = new Set<string>();
    let parapente = 0;
    let paramoteur = 0;
    for (const f of list) {
      pilots.add(f.pilotSlug);
      if (f.activity === 'parapente') parapente += 1;
      else if (f.activity === 'paramoteur') paramoteur += 1;
    }
    out.set(siteId, {
      siteId,
      flights: list.length,
      pilots: pilots.size,
      parapente,
      paramoteur,
      durationMean: mean(present(list.map((f) => f.durationMin))),
      distanceMean: meanPositive(list.map((f) => f.distKm)),
      ceilingMean: meanPositive(list.map((f) => measureValue(f, MEASURES.plafond))),
      speedMean: meanPositive(list.map((f) => measureValue(f, MEASURES.vitesse_moyenne))),
      varioMaxMean: meanPositive(list.map((f) => measureValue(f, MEASURES.vario_max))),
    });
  }
  return out;
}

export type SiteIndicatorId = 'flights' | 'pilots' | 'duration' | 'distance' | 'ceiling' | 'speed' | 'vario';

export interface SiteIndicator {
  id: SiteIndicatorId;
  label: string;
  /** Unité de la valeur brute ; `duration` est en minutes. */
  unit: 'count' | 'min' | 'km' | 'm' | 'km/h' | 'm/s';
  digits: number;
  /** Échelle de la bande : logarithmique pour les effectifs, très étalés. */
  scale: 'linear' | 'log';
  of: (agg: SiteAggregate) => number | null;
}

export const SITE_INDICATORS: readonly SiteIndicator[] = [
  { id: 'flights', label: 'Nombre de vols', unit: 'count', digits: 0, scale: 'log', of: (a) => a.flights },
  { id: 'pilots', label: 'Nombre de pilotes', unit: 'count', digits: 0, scale: 'log', of: (a) => a.pilots },
  {
    id: 'duration',
    label: 'Durée moyenne',
    unit: 'min',
    digits: 0,
    scale: 'linear',
    of: (a) => a.durationMean,
  },
  {
    id: 'distance',
    label: 'Distance moyenne',
    unit: 'km',
    digits: 1,
    scale: 'linear',
    of: (a) => a.distanceMean,
  },
  { id: 'ceiling', label: 'Plafond moyen', unit: 'm', digits: 0, scale: 'linear', of: (a) => a.ceilingMean },
  { id: 'speed', label: 'Vitesse moyenne', unit: 'km/h', digits: 1, scale: 'linear', of: (a) => a.speedMean },
  {
    id: 'vario',
    label: 'Vario max moyen',
    unit: 'm/s',
    digits: 1,
    scale: 'linear',
    of: (a) => a.varioMaxMean,
  },
];

export interface IndicatorPosition {
  id: SiteIndicatorId;
  /** Valeur du site (`null` si aucune mesure). */
  value: number | null;
  /** 1 = valeur la plus haute ; `null` si le site n'a pas de valeur. */
  rank: number | null;
  /** Nombre de sites comparés ayant une valeur (le site lui-même compris). */
  total: number;
  /** Moyenne et médiane des autres sites (`null` s'il n'y en a pas). */
  othersMean: number | null;
  othersMedian: number | null;
  /** Valeurs de tous les sites comparés (le site compris), pour la bande. */
  values: number[];
  /** Site de chaque valeur de `values` (même ordre), pour nommer les points de la bande. */
  valueSiteIds: number[];
  min: number | null;
  max: number | null;
}

export interface DisciplineShare {
  parapente: number;
  paramoteur: number;
}

export interface SitePosition {
  siteId: number;
  /** Sites comparés (au moins `minFlights` vols), le site compris. */
  comparedSites: number;
  /** Vols de ces sites. */
  comparedFlights: number;
  /** Sites et vols au total dans la population (avant le seuil). */
  totalSites: number;
  totalFlights: number;
  minFlights: number;
  indicators: IndicatorPosition[];
  /** Vols de parapente et paramoteur du site, puis cumul des autres sites comparés. */
  site: DisciplineShare;
  others: DisciplineShare;
}

/**
 * Positionne un site parmi les sites d'au moins `minFlights` vols. `null` si le site n'atteint pas
 * ce seuil (ou n'existe pas dans `aggregates`) : l'appelant affiche alors un message sobre.
 */
export function positionAmongSites(
  aggregates: ReadonlyMap<number, SiteAggregate>,
  siteId: number,
  minFlights: number = MIN_SITE_FLIGHTS,
): SitePosition | null {
  const self = aggregates.get(siteId);
  if (!self || self.flights < minFlights) return null;
  const compared: SiteAggregate[] = [];
  let totalFlights = 0;
  for (const a of aggregates.values()) {
    totalFlights += a.flights;
    if (a.flights >= minFlights) compared.push(a);
  }
  const others = compared.filter((a) => a.siteId !== siteId);

  const indicators = SITE_INDICATORS.map((ind): IndicatorPosition => {
    const own = ind.of(self);
    const values: number[] = [];
    const valueSiteIds: number[] = [];
    for (const a of compared) {
      const [v] = present([ind.of(a)]);
      if (v === undefined) continue;
      values.push(v);
      valueSiteIds.push(a.siteId);
    }
    const otherValues = present(others.map(ind.of));
    const rank = own === null ? null : rankOf(own, values);
    return {
      id: ind.id,
      value: own,
      rank,
      total: values.length,
      othersMean: mean(otherValues),
      othersMedian: median(otherValues),
      values,
      valueSiteIds,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  });

  const share: DisciplineShare = { parapente: 0, paramoteur: 0 };
  for (const a of others) {
    share.parapente += a.parapente;
    share.paramoteur += a.paramoteur;
  }
  return {
    siteId,
    comparedSites: compared.length,
    comparedFlights: compared.reduce((n, a) => n + a.flights, 0),
    totalSites: aggregates.size,
    totalFlights,
    minFlights,
    indicators,
    site: { parapente: self.parapente, paramoteur: self.paramoteur },
    others: share,
  };
}

/** Part du parapente en % (0 si aucun vol). */
export function parapenteShare(share: DisciplineShare): number {
  const total = share.parapente + share.paramoteur;
  return total === 0 ? 0 : (100 * share.parapente) / total;
}
