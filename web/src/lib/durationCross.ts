/**
 * Bloc « Durée des vols » : la durée croisée avec une mesure (nuage durée × mesure) ou avec une catégorie
 * (« nuage en bandes » : une colonne par mois, heure de décollage, voile ou site, trait de médiane par colonne).
 * Fonctions pures : catégorisation, regroupement « Autres », médianes, décalage horizontal déterministe.
 */

import type { Flight } from '@/data/flight';
import { NBSP } from '@/lib/format';
import { max, median } from '@/lib/numeric';
import { MATRIX_DEFAULT_HOURS, type ScatterY } from '@/lib/rhythmBlocks';

/** Mesures proposées : toutes les mesures par vol de `MEASURES` (hors durée), couvertes à plus de 50 % des vols. */
export const CROSS_MEASURES: readonly ScatterY[] = [
  'plafond',
  'distance',
  'gain',
  'vitesseMoyenne',
  'vitesseMax',
  'vario',
  'g',
];

export type CrossCategory = 'mois' | 'heure' | 'voile' | 'site';
export const CROSS_CATEGORIES: readonly CrossCategory[] = ['mois', 'heure', 'voile', 'site'];
export const CATEGORY_LABELS: Readonly<Record<CrossCategory, string>> = {
  mois: 'Mois',
  heure: 'Heure de décollage',
  voile: 'Voile',
  site: 'Site',
};

export type CrossKey = ScatterY | CrossCategory;

export function isCategory(key: CrossKey): key is CrossCategory {
  return (CROSS_CATEGORIES as readonly string[]).includes(key);
}
export function isMeasure(key: string): key is ScatterY {
  return (CROSS_MEASURES as readonly string[]).includes(key);
}
/** Clé valide (mesure ou catégorie) ou `null`. */
export function parseCrossKey(raw: string | null): CrossKey | null {
  if (raw === null) return null;
  return isMeasure(raw) || (CROSS_CATEGORIES as readonly string[]).includes(raw) ? (raw as CrossKey) : null;
}

export const MONTH_LABELS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** Nombre de voiles ou de sites montrés avant de regrouper le reste en « Autres ». */
export const BAND_TOP = 12;
export const OTHERS_LABEL = 'Autres';
/** Demi-largeur du nuage dans une colonne (la colonne mesure 1) : laisse un blanc entre deux colonnes. */
export const BAND_SPREAD = 0.34;

/** Hachage FNV-1a 32 bits d'une chaîne. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Décalage horizontal pseudo-aléatoire mais déterministe d'un point, dans [-spread, spread] : il ne dépend que de la
 * clé du vol (graine fixe), donc un point ne bouge pas quand les filtres changent. Générateur mulberry32.
 */
export function bandJitter(key: string, spread: number = BAND_SPREAD): number {
  let a = (hash32(key) + 0x9e3779b9) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return (unit * 2 - 1) * spread;
}

export interface BandColumn {
  label: string;
  /** Vols de la colonne dont la durée est connue. */
  n: number;
  /** Médiane et maximum de la durée en minutes, `null` si la colonne est vide. */
  median: number | null;
  max: number | null;
}

export interface BandPoint {
  flight: Flight;
  /** Indice de la colonne. */
  col: number;
  /** Position horizontale : l'indice de colonne plus le décalage déterministe. */
  x: number;
  /** Durée en minutes. */
  y: number;
}

export interface BandCloud {
  columns: BandColumn[];
  points: BandPoint[];
  /** Vols écartés : durée inconnue ou catégorie inconnue. */
  missing: number;
}

/** Fenêtre d'heures de décollage : de 8 h à 20 h comme les matrices, élargie si des vols en sortent. */
export function takeoffHourWindow(flights: readonly Flight[]): [number, number] {
  let [lo, hi] = MATRIX_DEFAULT_HOURS;
  for (const f of flights) {
    if (f.hour === null) continue;
    const h = Math.floor(f.hour);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return [lo, hi];
}

/** Libellé de colonne d'une heure de décollage (« 8 h » pour 8 h à 9 h). */
export function hourLabel(hour: number): string {
  return `${hour}${NBSP}h`;
}

/** Nom de la voile ou du site d'un vol ; `null` s'il est inconnu. */
function nameOf(f: Flight, category: 'voile' | 'site'): string | null {
  return category === 'voile' ? f.wing : f.site;
}

/** Les `top` plus volés (à égalité : ordre alphabétique) et les autres, regroupés. */
export function topWithOthers(
  counts: ReadonlyMap<string, number>,
  top: number = BAND_TOP,
): { kept: string[]; others: Set<string> } {
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  return {
    kept: ranked.slice(0, top).map(([name]) => name),
    others: new Set(ranked.slice(top).map(([name]) => name)),
  };
}

/**
 * Colonnes et points du nuage en bandes. Seuls les vols dont la durée (> 0) et la catégorie sont connues sont tracés ;
 * les autres sont comptés dans `missing`. Mois : 12 colonnes fixes ; heure : une colonne par heure de la fenêtre ;
 * voile et site : les `BAND_TOP` plus volés (triés par nombre de vols), puis « Autres » s'il en reste.
 */
export function bandCloud(flights: readonly Flight[], category: CrossCategory): BandCloud {
  const usable = flights.filter((f) => f.durationMin !== null && f.durationMin > 0);
  let labels: string[];
  let columnOf: (f: Flight) => number | null;

  if (category === 'mois') {
    labels = [...MONTH_LABELS];
    columnOf = (f) => f.month - 1;
  } else if (category === 'heure') {
    const [lo, hi] = takeoffHourWindow(usable);
    labels = Array.from({ length: hi - lo + 1 }, (_, i) => hourLabel(lo + i));
    columnOf = (f) => (f.hour === null ? null : Math.floor(f.hour) - lo);
  } else {
    const counts = new Map<string, number>();
    for (const f of usable) {
      const name = nameOf(f, category);
      if (name !== null) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const { kept, others } = topWithOthers(counts);
    labels = others.size > 0 ? [...kept, OTHERS_LABEL] : kept;
    const index = new Map(kept.map((name, i) => [name, i]));
    columnOf = (f) => {
      const name = nameOf(f, category);
      if (name === null) return null;
      return index.get(name) ?? (others.has(name) ? kept.length : null);
    };
  }

  const points: BandPoint[] = [];
  const durations: number[][] = labels.map(() => []);
  for (const flight of usable) {
    const col = columnOf(flight);
    if (col === null || col < 0 || col >= labels.length) continue;
    const y = flight.durationMin as number;
    points.push({ flight, col, x: col + bandJitter(flight.key), y });
    (durations[col] as number[]).push(y);
  }
  const columns = labels.map((label, i) => {
    const values = durations[i] as number[];
    return { label, n: values.length, median: median(values), max: max(values) };
  });
  return { columns, points, missing: flights.length - points.length };
}
