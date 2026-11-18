/**
 * Logique pure des pages Sites (`/sites`, `/site/:id`) et Records (`/records`) : lignes du tableau des sites,
 * recherche sans accents, saisonnalité mois × heure, pilotes d'un site, derniers vols, classements « Top N »
 * avec ex æquo, description sobre des filtres actifs.
 *
 * Conventions : une durée inconnue compte 0 minute pour les totaux (comme `rhythm.ts`) ; les mesures ≤ 0 sont
 * déjà `null` à l'export ; D12 : la position d'un site vient de `sites.json`, jamais d'un vol.
 */

import type { Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import type { Filters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { MEASURES, type MeasureDef } from '@/lib/measures';
import { maxPositive } from '@/lib/numeric';
import { hourOf, minutesOf } from '@/lib/rhythm';

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/** Minuscules sans accents ni espaces de bord : base de la recherche insensible aux accents. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Tableau des sites
// ---------------------------------------------------------------------------

/** Sous-ensemble d'un site dont on a besoin (compatible avec `Site` de `@/data/load`). */
export interface SiteInfo {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
}

export interface SiteTableRow {
  siteId: number;
  name: string;
  flights: number;
  minutes: number;
  pilots: number;
  parapente: number;
  paramoteur: number;
  /** Part de vols en parapente, 0 à 100 ; `null` sans vol. */
  parapenteShare: number | null;
  lastDate: string | null;
  ceilingMax: number | null;
}

/** Une ligne par site ayant au moins un vol dans `flights` ; les vols sans site connu sont ignorés. */
export function siteTableRows(
  flights: readonly Flight[],
  siteById: ReadonlyMap<number, SiteInfo>,
): SiteTableRow[] {
  const rows: SiteTableRow[] = [];
  for (const [siteId, group] of groupBy(flights, (f) => f.siteId)) {
    const site = siteById.get(siteId);
    if (!site) continue;
    let parapente = 0;
    let paramoteur = 0;
    let minutes = 0;
    let lastDate: string | null = null;
    const pilots = new Set<string>();
    for (const f of group) {
      if (f.activity === 'parapente') parapente += 1;
      else paramoteur += 1;
      minutes += minutesOf(f);
      pilots.add(f.pilotSlug);
      if (lastDate === null || f.date > lastDate) lastDate = f.date;
    }
    rows.push({
      siteId,
      name: site.name,
      flights: group.length,
      minutes,
      pilots: pilots.size,
      parapente,
      paramoteur,
      parapenteShare: group.length > 0 ? (100 * parapente) / group.length : null,
      lastDate,
      ceilingMax: maxPositive(group.map((f) => f.ceilingM)),
    });
  }
  return rows;
}

export type SiteSortKey = 'name' | 'flights' | 'minutes' | 'pilots' | 'share' | 'lastDate' | 'ceiling';
export type SortDirection = 'asc' | 'desc';

const SORT_VALUE: Record<Exclude<SiteSortKey, 'name'>, (r: SiteTableRow) => number | string | null> = {
  flights: (r) => r.flights,
  minutes: (r) => r.minutes,
  pilots: (r) => r.pilots,
  share: (r) => r.parapenteShare,
  lastDate: (r) => r.lastDate,
  ceiling: (r) => r.ceilingMax,
};

/** Tri d'une copie : valeur absente toujours en fin, à égalité par nom. */
export function sortSiteRows(
  rows: readonly SiteTableRow[],
  key: SiteSortKey,
  direction: SortDirection,
): SiteTableRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byName = (a: SiteTableRow, b: SiteTableRow) => a.name.localeCompare(b.name, 'fr');
  return [...rows].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    const va = SORT_VALUE[key](a);
    const vb = SORT_VALUE[key](b);
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return byName(a, b);
  });
}

/** Lignes dont le nom contient la requête, sans tenir compte des accents ni de la casse. */
export function filterSiteRows(rows: readonly SiteTableRow[], query: string): SiteTableRow[] {
  const q = foldText(query);
  if (q === '') return [...rows];
  return rows.filter((r) => foldText(r.name).includes(q));
}

// ---------------------------------------------------------------------------
// Saisonnalité d'un site
// ---------------------------------------------------------------------------

export interface SeasonalityMatrix {
  /** [12][24] vols ; index 0 = janvier, colonne = heure entière de décollage. */
  counts: number[][];
  /** Vols par mois, y compris ceux sans heure connue. */
  monthTotals: number[];
  /** Vols par heure (placés seulement). */
  hourTotals: number[];
  /** Vols sans heure de décollage connue : comptés dans `monthTotals`, non placés dans `counts`. */
  missing: number;
}

/** Matrice mois × heure de décollage (nombre de vols). */
export function seasonalityMatrix(flights: readonly Flight[]): SeasonalityMatrix {
  const counts = Array.from({ length: 12 }, () => new Array<number>(24).fill(0));
  const monthTotals = new Array<number>(12).fill(0);
  const hourTotals = new Array<number>(24).fill(0);
  let missing = 0;
  for (const f of flights) {
    const m = f.month - 1;
    if (m < 0 || m > 11) continue;
    monthTotals[m] = (monthTotals[m] ?? 0) + 1;
    const hour = hourOf(f);
    const row = counts[m];
    if (hour !== null && hour >= 0 && hour < 24 && row) {
      row[hour] = (row[hour] ?? 0) + 1;
      hourTotals[hour] = (hourTotals[hour] ?? 0) + 1;
    } else {
      missing += 1;
    }
  }
  return { counts, monthTotals, hourTotals, missing };
}

/** Vols par mois (index 0 = janvier) et par discipline, pour les barres de saisonnalité. */
export function monthByDiscipline(flights: readonly Flight[]): { parapente: number[]; paramoteur: number[] } {
  const parapente = new Array<number>(12).fill(0);
  const paramoteur = new Array<number>(12).fill(0);
  for (const f of flights) {
    const target = f.activity === 'parapente' ? parapente : paramoteur;
    const m = f.month - 1;
    target[m] = (target[m] ?? 0) + 1;
  }
  return { parapente, paramoteur };
}

// ---------------------------------------------------------------------------
// Pilotes présents, derniers vols
// ---------------------------------------------------------------------------

/** Date puis heure du vol, pour départager de façon stable. */
const momentOf = (f: Flight): string => `${f.date} ${f.time ?? ''}`;

export interface SitePilotRow {
  pilotSlug: string;
  pilot: string;
  flights: number;
  minutes: number;
  lastDate: string;
}

/** Pilotes des vols donnés : vols décroissants, puis heures, puis nom. */
export function sitePilotRows(flights: readonly Flight[]): SitePilotRow[] {
  const rows: SitePilotRow[] = [];
  for (const [pilotSlug, group] of groupBy(flights, (f) => f.pilotSlug)) {
    let minutes = 0;
    let lastDate = '';
    for (const f of group) {
      minutes += minutesOf(f);
      if (f.date > lastDate) lastDate = f.date;
    }
    rows.push({ pilotSlug, pilot: group[0]?.pilot ?? pilotSlug, flights: group.length, minutes, lastDate });
  }
  return rows.sort(
    (a, b) => b.flights - a.flights || b.minutes - a.minutes || a.pilot.localeCompare(b.pilot, 'fr'),
  );
}

/** Les `count` vols les plus récents (date, heure, numéro Syride décroissants). */
export function latestFlightsOf(flights: readonly Flight[], count: number): Flight[] {
  return [...flights]
    .sort((a, b) => {
      const ma = momentOf(a);
      const mb = momentOf(b);
      if (ma !== mb) return ma < mb ? 1 : -1;
      return b.syrideNum - a.syrideNum;
    })
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Records : classements « Top N »
// ---------------------------------------------------------------------------

export interface RecordMetric {
  id: string;
  label: string;
  unit: string;
  digits: number;
  of: (f: Flight) => number | null;
}

const fromMeasure = (id: string, def: MeasureDef, label = def.label): RecordMetric => ({
  id,
  label,
  unit: def.unit,
  digits: def.digits,
  of: def.of,
});

/** Les huit métriques de la page Records, dans l'ordre d'affichage. */
export const RECORD_METRICS: readonly RecordMetric[] = [
  fromMeasure('duree', MEASURES.duree, 'Durée'),
  fromMeasure('distance', MEASURES.distance, 'Distance'),
  { id: 'distCum', label: 'Distance cumulée', unit: 'km', digits: 1, of: (f) => f.distCumKm },
  fromMeasure('plafond', MEASURES.plafond),
  fromMeasure('gain', MEASURES.gain),
  fromMeasure('vitesseMax', MEASURES.vitesseMax),
  fromMeasure('vario', MEASURES.vario),
  fromMeasure('g', MEASURES.g),
];

export interface RankedFlight {
  /** 1 = valeur la plus haute ; les ex æquo partagent le même rang (1, 2, 2, 4). */
  rank: number;
  value: number;
  flight: Flight;
}

export interface RankOptions {
  /** Nombre de lignes (10 par défaut). */
  top?: number;
  /** Ne garder que la meilleure marque de chaque pilote. */
  onePerPilot?: boolean;
}

/**
 * Meilleurs vols d'une mesure (valeurs > 0 seulement). À valeur égale : le plus ancien d'abord (premier à avoir
 * posé la marque). Avec `onePerPilot`, seule la meilleure marque de chaque pilote reste (la plus ancienne à égalité).
 */
export function rankedTop(
  flights: readonly Flight[],
  of: (f: Flight) => number | null,
  { top = 10, onePerPilot = false }: RankOptions = {},
): RankedFlight[] {
  const better = (a: { value: number; flight: Flight }, b: { value: number; flight: Flight }): boolean =>
    a.value > b.value || (a.value === b.value && momentOf(a.flight) < momentOf(b.flight));
  let pool: { value: number; flight: Flight }[] = [];
  if (onePerPilot) {
    const best = new Map<string, { value: number; flight: Flight }>();
    for (const flight of flights) {
      const value = of(flight);
      if (value === null || value <= 0) continue;
      const candidate = { value, flight };
      const current = best.get(flight.pilotSlug);
      if (!current || better(candidate, current)) best.set(flight.pilotSlug, candidate);
    }
    pool = [...best.values()];
  } else {
    for (const flight of flights) {
      const value = of(flight);
      if (value !== null && value > 0) pool.push({ value, flight });
    }
  }
  pool.sort((a, b) => b.value - a.value || (momentOf(a.flight) < momentOf(b.flight) ? -1 : 1));
  const out: RankedFlight[] = [];
  let rank = 1;
  for (let i = 0; i < Math.min(top, pool.length); i += 1) {
    const item = pool[i]!;
    if (i > 0 && item.value < pool[i - 1]!.value) rank = i + 1;
    out.push({ rank, value: item.value, flight: item.flight });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filtres actifs
// ---------------------------------------------------------------------------

/** Libellé court de la période (année entière → « 2025 »), ou `null` sans borne. */
function periodText(from: string | null, to: string | null): string | null {
  if (from && to) {
    if (from.slice(0, 4) === to.slice(0, 4) && from.slice(5) === '01-01' && to.slice(5) === '12-31')
      return from.slice(0, 4);
    return `du ${fmtDate(from, { withYear: true })} au ${fmtDate(to, { withYear: true })}`;
  }
  if (from) return `depuis le ${fmtDate(from, { withYear: true })}`;
  if (to) return `jusqu’au ${fmtDate(to, { withYear: true })}`;
  return null;
}

/**
 * Libellés des filtres actifs, sans celui de l'entité de la page (`omit`) : « paramoteur », « 2025 »…
 * `pilotName` et `siteName` résolvent les identifiants (repli sur l'identifiant).
 */
export function describeFilters(
  filters: Filters,
  names: { pilot: (slug: string) => string; site: (id: number) => string },
  omit?: 'pilots' | 'sites',
): string[] {
  const out: string[] = [];
  if (omit !== 'pilots') for (const slug of filters.pilots) out.push(names.pilot(slug));
  if (filters.activity !== 'tout') out.push(filters.activity);
  const period = periodText(filters.dateFrom, filters.dateTo);
  if (period) out.push(period);
  for (const w of filters.wings) out.push(w);
  if (omit !== 'sites') for (const id of filters.sites) out.push(names.site(id));
  return out;
}
