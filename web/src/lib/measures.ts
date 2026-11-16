/**
 * Table unique des mesures d'un vol (accesseur, libellé, unité, décimales) et son formateur, partagés par les
 * records récents, les caractéristiques de vol et la couverture des données.
 */

import type { Flight } from '@/data/flight';
import { fmtDuration, fmtNum, NBSP } from '@/lib/format';

export type MeasureId =
  | 'duree'
  | 'distance'
  | 'vitesseMoyenne'
  | 'vitesseMax'
  | 'plafond'
  | 'gain'
  | 'vario'
  | 'g';

export interface MeasureDef {
  label: string;
  unit: string;
  digits: number;
  of: (f: Flight) => number | null;
}

/** Les mesures ; la distance est la distance en ligne droite (`distKm`), volontairement, partout. */
export const MEASURES: Readonly<Record<MeasureId, MeasureDef>> = {
  duree: { label: 'Durée', unit: 'min', digits: 0, of: (f) => f.durationMin },
  distance: { label: 'Distance', unit: 'km', digits: 1, of: (f) => f.distKm },
  vitesseMoyenne: { label: 'Vitesse moyenne', unit: 'km/h', digits: 1, of: (f) => f.speedAvg },
  vitesseMax: { label: 'Vitesse max', unit: 'km/h', digits: 1, of: (f) => f.speedMax },
  plafond: { label: 'Plafond', unit: 'm', digits: 0, of: (f) => f.ceilingM },
  gain: { label: 'Gain d’altitude', unit: 'm', digits: 0, of: (f) => f.gainM },
  vario: { label: 'Vario max', unit: 'm/s', digits: 1, of: (f) => f.varioMax },
  g: { label: 'g max', unit: 'g', digits: 1, of: (f) => f.gMax },
};

/** Valeur d'une mesure : durée en « 1 h 12 min », le reste avec son unité. */
export function formatMeasure(def: Pick<MeasureDef, 'unit' | 'digits'>, value: number): string {
  if (def.unit === 'min') return fmtDuration(value);
  return `${fmtNum(value, def.digits)}${NBSP}${def.unit}`;
}
