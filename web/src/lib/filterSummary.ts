/**
 * Ligne « Vue filtrée : … » : description sobre des filtres globaux qui réduisent la vue. Un seul helper pour
 * toutes les pages (pilote, comparer, sites, site, records). Fonctions pures.
 *
 * Les pilotes, sites et voiles sont affichés par leur nom d'affichage (jamais le slug ni l'identifiant bruts) :
 * un ou deux noms sont listés, au-delà « N pilotes », « N sites », « N voiles ».
 */
import type { FilterDimension, Filters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';

/** Nombre maximal de noms listés avant de passer au décompte. */
export const MAX_LISTED_NAMES = 2;

export interface FilterNames {
  /** Nom d'affichage d'un pilote (repli : à la charge de l'appelant). */
  pilot: (slug: string) => string;
  /** Nom d'affichage d'un site. */
  site: (id: number) => string;
  /** Nom d'affichage d'une voile ; par défaut le nom tel quel (le filtre porte déjà des noms). */
  wing?: (name: string) => string;
}

/** Libellé court de la période (année entière → « 2025 »), ou `null` sans borne. */
function periodText(from: string | null, to: string | null): string | null {
  if (from && to) {
    if (from.slice(0, 4) === to.slice(0, 4) && from.slice(5) === '01-01' && to.slice(5) === '12-31') {
      return from.slice(0, 4);
    }
    return `du ${fmtDate(from, { withYear: true })} au ${fmtDate(to, { withYear: true })}`;
  }
  if (from) return `depuis le ${fmtDate(from, { withYear: true })}`;
  if (to) return `jusqu’au ${fmtDate(to, { withYear: true })}`;
  return null;
}

/** « A », « A et B », puis « 3 pilotes ». */
function listOrCount<T>(values: readonly T[], name: (v: T) => string, noun: string): string {
  if (values.length <= MAX_LISTED_NAMES) return values.map(name).join(' et ');
  return `${values.length} ${noun}`;
}

/**
 * Libellés des filtres actifs, hors dimensions `omit` (filtre de l'entité de la page ou filtre remplacé par un
 * sélecteur local). Vide si rien ne réduit la vue.
 */
export function filterSummary(
  filters: Filters,
  names: FilterNames,
  omit: readonly FilterDimension[] = [],
): string[] {
  const out: string[] = [];
  if (!omit.includes('pilots') && filters.pilots.length > 0) {
    out.push(listOrCount(filters.pilots, names.pilot, 'pilotes'));
  }
  if (!omit.includes('activity') && filters.activity !== 'tout') out.push(filters.activity);
  if (!omit.includes('period')) {
    const period = periodText(filters.dateFrom, filters.dateTo);
    if (period) out.push(period);
  }
  if (!omit.includes('wings') && filters.wings.length > 0) {
    out.push(listOrCount(filters.wings, names.wing ?? ((w) => w), 'voiles'));
  }
  if (!omit.includes('sites') && filters.sites.length > 0) {
    out.push(listOrCount(filters.sites, names.site, 'sites'));
  }
  return out;
}
