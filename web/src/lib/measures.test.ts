import { describe, expect, it } from 'vitest';
import { NBSP } from '@/lib/format';
import { formatMeasure, MEASURES } from '@/lib/measures';
import { makeFlight } from '../../tests/flightFactory';

describe('MEASURES', () => {
  it('lit le bon champ du vol, distance en ligne droite comprise', () => {
    const f = makeFlight('2025-05-01', { durationMin: 75, distKm: 12.3, distCumKm: 40, ceilingM: 2100, gMax: null });
    expect(MEASURES.duree.of(f)).toBe(75);
    expect(MEASURES.distance.of(f)).toBe(12.3);
    expect(MEASURES.plafond.of(f)).toBe(2100);
    expect(MEASURES.g.of(f)).toBeNull();
  });
});

describe('formatMeasure', () => {
  it('formate la durée en heures et minutes', () => {
    expect(formatMeasure(MEASURES.duree, 72).replace(/\s/g, " ")).toBe('1 h 12 min');
  });
  it('ajoute l’unité avec le bon nombre de décimales', () => {
    expect(formatMeasure(MEASURES.plafond, 2100.4)).toContain(`${NBSP}m`);
    expect(formatMeasure(MEASURES.vario, 3.25).replace(/\s/g, " ")).toMatch(/^3,[23] m\/s$/);
  });
});
