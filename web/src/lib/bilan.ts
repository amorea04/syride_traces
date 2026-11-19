/**
 * Bilan pilote × année (§5.4 bis) : sélection des vols, années disponibles et années comparées.
 *
 * Règles alignées sur `build_report` (`src/rapport/report_data.py`) :
 * - l'année du bilan est arrêtée à la date de coupure des insights (`cutoff`) quand elle est en cours ;
 * - les années comparées sont prises **entières** ;
 * - par défaut, on compare aux 2 années précédentes où le pilote a volé (toutes disciplines), plus récente d'abord.
 *
 * Seul le filtre global « activité » s'applique au Bilan (comme les `by_disc` du rapport) : les filtres de pilote,
 * période, site et voile sont ignorés, pour que chiffres et textes restent ceux du récit Python.
 */
import type { Flight } from '@/data/flight';
import type { DisciplineFilter } from '@/data/schema.gen';

/** Nombre maximal d'années comparées (comme `max_compare` du rapport). */
export const MAX_COMPARE_YEARS = 2;

/** Paramètre d'URL des années comparées : absent = défaut ; `comparer=` (vide) = aucune ; `comparer=2025,2023`. */
export const PARAM_COMPARE = 'comparer';

/** Vrai si le vol appartient à la discipline (`tout` = toutes). */
export function inDiscipline(flight: Flight, discipline: DisciplineFilter): boolean {
  return discipline === 'tout' || flight.activity === discipline;
}

/** Vols d'un pilote, toutes années, dans la discipline. */
export function pilotFlights(all: readonly Flight[], slug: string, discipline: DisciplineFilter): Flight[] {
  return all.filter((f) => f.pilotSlug === slug && inDiscipline(f, discipline));
}

/** Vols d'une année, arrêtés à `cutoff` (date ISO incluse) si elle est donnée. */
export function yearFlights(flights: readonly Flight[], year: number, cutoff?: string | null): Flight[] {
  const prefix = String(year);
  return flights.filter(
    (f) => f.date.startsWith(prefix) && (cutoff == null || f.date <= cutoff),
  );
}

/** Années où le pilote a au moins un vol daté (toutes disciplines), de la plus récente à la plus ancienne. */
export function pilotYears(all: readonly Flight[], slug: string): number[] {
  const years = new Set<number>();
  for (const f of all) if (f.pilotSlug === slug) years.add(f.year);
  return [...years].sort((a, b) => b - a);
}

/** Années comparées par défaut : jusqu'à 2 années précédentes disponibles, plus récente d'abord. */
export function defaultCompareYears(available: readonly number[], year: number): number[] {
  return available.filter((y) => y < year).slice(0, MAX_COMPARE_YEARS);
}

/**
 * Années comparées lues dans l'URL. Paramètre absent : défaut. Valeurs inconnues, l'année du bilan elle-même et
 * doublons ignorés ; au plus 2 ; triées de la plus récente à la plus ancienne.
 */
export function parseCompareYears(
  params: URLSearchParams,
  available: readonly number[],
  year: number,
): number[] {
  const raw = params.get(PARAM_COMPARE);
  if (raw === null) return defaultCompareYears(available, year);
  const picked = new Set<number>();
  for (const part of raw.split(',')) {
    const y = Number(part.trim());
    if (Number.isInteger(y) && y !== year && available.includes(y)) picked.add(y);
  }
  return [...picked].sort((a, b) => b - a).slice(0, MAX_COMPARE_YEARS);
}

/** Écrit les années comparées dans l'URL ; retire le paramètre si c'est le choix par défaut. */
export function writeCompareYears(
  params: URLSearchParams,
  compare: readonly number[],
  available: readonly number[],
  year: number,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const sorted = [...compare].sort((a, b) => b - a);
  const def = defaultCompareYears(available, year);
  if (sorted.length === def.length && sorted.every((y, i) => y === def[i])) next.delete(PARAM_COMPARE);
  else next.set(PARAM_COMPARE, sorted.join(','));
  return next;
}

/** Année précédente et suivante disponibles (flèches du sélecteur), `null` en bout de liste. */
export function adjacentYears(available: readonly number[], year: number): { prev: number | null; next: number | null } {
  const older = available.filter((y) => y < year);
  const newer = available.filter((y) => y > year);
  return { prev: older[0] ?? null, next: newer[newer.length - 1] ?? null };
}
