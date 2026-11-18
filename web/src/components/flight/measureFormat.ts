import { EMPTY, fmtDuration, fmtInt, fmtNum, NBSP } from '@/lib/format';

/** Unités affichées par la fiche vol. `count` : effectif sans unité ; `min` : durée en minutes. */
export type FlightUnit = 'count' | 'min' | 'km' | 'm' | 'km/h' | 'm/s' | 'g';

/** Valeur avec son unité (« 23 min », « 9,4 km », « 3 209 m »), « – » si elle manque. */
export function fmtWithUnit(value: number | null, unit: FlightUnit, digits: number): string {
  if (value === null || Number.isNaN(value)) return EMPTY;
  if (unit === 'count') return fmtInt(value);
  if (unit === 'min') return fmtDuration(value);
  if (digits === 0) return `${fmtInt(value)}${NBSP}${unit}`;
  return `${fmtNum(value, digits)}${NBSP}${unit}`;
}
