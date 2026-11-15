/**
 * Filtres globaux : état, application, options en cascade, raccourcis de période et
 * (dé)sérialisation de la query string. Tout est pur (aucun accès au DOM ni au routeur).
 */
import type { Flight } from '@/data/flight';
import type { DisciplineFilter } from '@/data/schema.gen';

export type ActivityFilter = DisciplineFilter;

export interface Filters {
  /** Slugs de pilotes ; vide = tous. */
  pilots: string[];
  activity: ActivityFilter;
  /** Date ISO incluse, ou null (pas de borne). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Noms de voiles ; vide = toutes. */
  wings: string[];
  /** Identifiants de sites ; vide = tous. */
  sites: number[];
}

export const ACTIVITY_VALUES: readonly ActivityFilter[] = ['tout', 'parapente', 'paramoteur'];

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  pilots: [],
  activity: 'tout',
  dateFrom: null,
  dateTo: null,
  wings: [],
  sites: [],
});

export function defaultFilters(): Filters {
  return { pilots: [], activity: 'tout', dateFrom: null, dateTo: null, wings: [], sites: [] };
}

export function filtersEqual(a: Filters, b: Filters): boolean {
  const same = <T>(x: readonly T[], y: readonly T[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    a.activity === b.activity &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    same(a.pilots, b.pilots) &&
    same(a.wings, b.wings) &&
    same(a.sites, b.sites)
  );
}

export function isDefaultFilters(filters: Filters): boolean {
  return filtersEqual(filters, DEFAULT_FILTERS);
}

/** Nombre de dimensions filtrées (la période compte pour une). */
export function countActiveFilters(filters: Filters): number {
  return (
    (filters.pilots.length > 0 ? 1 : 0) +
    (filters.activity !== 'tout' ? 1 : 0) +
    (filters.dateFrom !== null || filters.dateTo !== null ? 1 : 0) +
    (filters.wings.length > 0 ? 1 : 0) +
    (filters.sites.length > 0 ? 1 : 0)
  );
}

export type FilterDimension = 'pilots' | 'activity' | 'period' | 'wings' | 'sites';

/** Vrai si le vol passe tous les filtres, sauf ceux de la dimension `omit`. */
export function flightMatches(flight: Flight, filters: Filters, omit?: FilterDimension): boolean {
  if (omit !== 'pilots' && filters.pilots.length > 0 && !filters.pilots.includes(flight.pilotSlug)) {
    return false;
  }
  if (omit !== 'activity' && filters.activity !== 'tout' && flight.activity !== filters.activity) {
    return false;
  }
  if (omit !== 'period') {
    if (filters.dateFrom !== null && flight.date < filters.dateFrom) return false;
    if (filters.dateTo !== null && flight.date > filters.dateTo) return false;
  }
  if (omit !== 'wings' && filters.wings.length > 0) {
    if (flight.wing === null || !filters.wings.includes(flight.wing)) return false;
  }
  if (omit !== 'sites' && filters.sites.length > 0) {
    if (flight.siteId === null || !filters.sites.includes(flight.siteId)) return false;
  }
  return true;
}

/** Vols qui passent tous les filtres (ordre conservé). Renvoie le même tableau si rien n'est filtré. */
export function applyFilters(flights: readonly Flight[], filters: Filters): Flight[] {
  return flights.filter((f) => flightMatches(f, filters));
}

export interface FilterOption<T> {
  value: T;
  label: string;
  /** Vols restants si on choisissait cette option, les autres filtres étant appliqués. */
  count: number;
}

export interface CascadeOptions {
  activity: Record<ActivityFilter, number>;
  pilots: FilterOption<string>[];
  wings: FilterOption<string>[];
  sites: FilterOption<number>[];
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function byLabel<T>(a: FilterOption<T>, b: FilterOption<T>): number {
  return collator.compare(a.label, b.label);
}

function byCountThenLabel<T>(a: FilterOption<T>, b: FilterOption<T>): number {
  return b.count - a.count || byLabel(a, b);
}

/** Compte les vols par valeur ; les valeurs déjà sélectionnées sont toujours présentes (même à 0). */
function tally<T extends string | number>(
  flights: readonly Flight[],
  filters: Filters,
  omit: FilterDimension,
  key: (f: Flight) => T | null,
  label: (f: Flight) => string,
  selected: readonly T[],
  labelOfSelected: (value: T) => string,
): FilterOption<T>[] {
  const map = new Map<T, FilterOption<T>>();
  for (const f of flights) {
    if (!flightMatches(f, filters, omit)) continue;
    const value = key(f);
    if (value === null) continue;
    const option = map.get(value);
    if (option) option.count += 1;
    else map.set(value, { value, label: label(f), count: 1 });
  }
  for (const value of selected) {
    if (!map.has(value)) map.set(value, { value, label: labelOfSelected(value), count: 0 });
  }
  return [...map.values()];
}

/**
 * Pour chaque dimension, les options possibles avec leur compteur de vols, en appliquant tous
 * les autres filtres sauf celui de la dimension. Pilotes triés par nom, voiles et sites par
 * nombre de vols décroissant.
 */
export function cascadeOptions(flights: readonly Flight[], filters: Filters): CascadeOptions {
  const activity: Record<ActivityFilter, number> = { tout: 0, parapente: 0, paramoteur: 0 };
  for (const f of flights) {
    if (!flightMatches(f, filters, 'activity')) continue;
    activity.tout += 1;
    activity[f.activity] += 1;
  }
  const siteName = new Map<number, string>();
  for (const f of flights) if (f.siteId !== null && f.site !== null) siteName.set(f.siteId, f.site);

  return {
    activity,
    pilots: tally(
      flights,
      filters,
      'pilots',
      (f) => f.pilotSlug,
      (f) => f.pilot,
      filters.pilots,
      (v) => v,
    ).sort(byLabel),
    wings: tally(
      flights,
      filters,
      'wings',
      (f) => f.wing,
      (f) => f.wing ?? '',
      filters.wings,
      (v) => v,
    ).sort(byCountThenLabel),
    sites: tally(
      flights,
      filters,
      'sites',
      (f) => f.siteId,
      (f) => f.site ?? '',
      filters.sites,
      (v) => siteName.get(v) ?? `Site ${v}`,
    ).sort(byCountThenLabel),
  };
}

// ---------------------------------------------------------------------------
// Raccourcis de période
// ---------------------------------------------------------------------------

export interface PeriodShortcut {
  id: string;
  label: string;
  dateFrom: string;
  dateTo: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const MS_PER_DAY = 86_400_000;

function parseIsoParts(iso: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return [y, m, d];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Lendemain d'une date ISO. */
function nextDay(iso: string): string {
  const [y, m, d] = parseIsoParts(iso);
  const t = new Date(Date.UTC(y, m - 1, d) + MS_PER_DAY);
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Du lendemain d'il y a un an jusqu'à `today` inclus : « 12 derniers mois ». */
export function lastTwelveMonths(today: string): PeriodShortcut {
  const [y, m, d] = parseIsoParts(today);
  const from = nextDay(isoOf(y - 1, m, Math.min(d, daysInMonth(y - 1, m))));
  return { id: '12m', label: '12 derniers mois', dateFrom: from, dateTo: today };
}

/** Du 1ᵉʳ janvier de l'année de `today` à aujourd'hui (borne de fin ouverte). */
export function thisYear(today: string): PeriodShortcut {
  const [y] = parseIsoParts(today);
  return { id: 'annee-courante', label: 'Cette année', dateFrom: isoOf(y, 1, 1), dateTo: null };
}

export function yearPeriod(year: number): PeriodShortcut {
  return {
    id: `annee-${year}`,
    label: String(year),
    dateFrom: isoOf(year, 1, 1),
    dateTo: isoOf(year, 12, 31),
  };
}

/** Raccourcis fixes (hors années) pour la date du jour `today` (ISO). */
export function periodShortcuts(today: string): PeriodShortcut[] {
  return [thisYear(today), lastTwelveMonths(today)];
}

/** Années présentes dans les vols, de la plus récente à la plus ancienne. */
export function availableYears(flights: readonly Flight[]): number[] {
  return [...new Set(flights.map((f) => f.year))].sort((a, b) => b - a);
}

/** Raccourci correspondant exactement à la période des filtres, s'il existe. */
export function activeShortcut(
  filters: Filters,
  shortcuts: readonly PeriodShortcut[],
): PeriodShortcut | null {
  return shortcuts.find((s) => s.dateFrom === filters.dateFrom && s.dateTo === filters.dateTo) ?? null;
}

/** Date du jour au format ISO local (pas UTC : « aujourd'hui » du pilote). */
export function todayIso(now: Date = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

/** Noms des paramètres d'URL (courts, en français). */
export const PARAM = {
  pilots: 'pilote',
  activity: 'activite',
  dateFrom: 'du',
  dateTo: 'au',
  wings: 'voile',
  sites: 'site',
} as const;

const FILTER_PARAM_NAMES: readonly string[] = Object.values(PARAM);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date ISO valide (calendrier réel), sinon null. */
export function parseIsoDate(value: string | null): string | null {
  if (value === null) return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return value;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Lit les filtres d'une query string (avec ou sans « ? ») ; tout ce qui est invalide est ignoré. */
export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const activity = params.get(PARAM.activity);
  const sites = params
    .getAll(PARAM.sites)
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
  return {
    pilots: unique(params.getAll(PARAM.pilots).filter((s) => s !== '')),
    activity: ACTIVITY_VALUES.includes(activity as ActivityFilter) ? (activity as ActivityFilter) : 'tout',
    dateFrom: parseIsoDate(params.get(PARAM.dateFrom)),
    dateTo: parseIsoDate(params.get(PARAM.dateTo)),
    wings: unique(params.getAll(PARAM.wings).filter((s) => s !== '')),
    sites: unique(sites),
  };
}

/** Vrai si la query string contient au moins un paramètre de filtre. */
export function hasFilterParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return FILTER_PARAM_NAMES.some((name) => params.has(name));
}

/**
 * Query string (avec « ? », ou chaîne vide) = `search` dont les paramètres de filtre sont
 * remplacés par ceux de `filters`. Les valeurs par défaut sont absentes ; les autres
 * paramètres sont conservés.
 */
export function writeFilters(search: string, filters: Filters): string {
  const params = new URLSearchParams(search);
  for (const name of FILTER_PARAM_NAMES) params.delete(name);
  const next = new URLSearchParams();
  for (const slug of filters.pilots) next.append(PARAM.pilots, slug);
  if (filters.activity !== 'tout') next.append(PARAM.activity, filters.activity);
  if (filters.dateFrom !== null) next.append(PARAM.dateFrom, filters.dateFrom);
  if (filters.dateTo !== null) next.append(PARAM.dateTo, filters.dateTo);
  for (const wing of filters.wings) next.append(PARAM.wings, wing);
  for (const id of filters.sites) next.append(PARAM.sites, String(id));
  for (const [k, v] of params) next.append(k, v);
  const text = next.toString();
  return text === '' ? '' : `?${text}`;
}

/** Fenêtre en deçà de laquelle une nouvelle modification remplace l'entrée d'historique. */
export const HISTORY_COALESCE_MS = 800;

/**
 * Pousse une entrée d'historique, sauf pour une modification rapide (moins de
 * `HISTORY_COALESCE_MS` après la dernière entrée poussée) qui la remplace.
 */
export function historyModeFor(
  now: number,
  lastPushAt: number | null,
  windowMs: number = HISTORY_COALESCE_MS,
): 'push' | 'replace' {
  return lastPushAt !== null && now - lastPushAt < windowMs ? 'replace' : 'push';
}
