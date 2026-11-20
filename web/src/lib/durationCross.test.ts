import { describe, expect, it } from 'vitest';
import {
  BAND_SPREAD,
  BAND_TOP,
  OTHERS_LABEL,
  bandCloud,
  bandJitter,
  isCategory,
  parseCrossKey,
  takeoffHourWindow,
  topWithOthers,
} from '@/lib/durationCross';
import { makeFlight } from '../../tests/flightFactory';

describe('clé de croisement', () => {
  it('distingue mesures et catégories, refuse le reste', () => {
    expect(isCategory('mois')).toBe(true);
    expect(isCategory('plafond')).toBe(false);
    expect(parseCrossKey('vitesseMoyenne')).toBe('vitesseMoyenne');
    expect(parseCrossKey('site')).toBe('site');
    expect(parseCrossKey('duree')).toBeNull();
    expect(parseCrossKey(null)).toBeNull();
  });
});

describe('décalage déterministe', () => {
  it('même clé, même décalage, toujours dans la bande', () => {
    expect(bandJitter('alice-12')).toBe(bandJitter('alice-12'));
    const values = Array.from({ length: 200 }, (_, i) => bandJitter(`p-${i}`));
    for (const v of values) expect(Math.abs(v)).toBeLessThanOrEqual(BAND_SPREAD);
    expect(new Set(values).size).toBeGreaterThan(150);
    expect(Math.min(...values)).toBeLessThan(-BAND_SPREAD / 2);
    expect(Math.max(...values)).toBeGreaterThan(BAND_SPREAD / 2);
  });
});

describe('top N et « Autres »', () => {
  it('tri par effectif décroissant puis alphabétique, reste regroupé', () => {
    const counts = new Map([
      ['b', 3],
      ['a', 3],
      ['c', 9],
      ['d', 1],
    ]);
    const r = topWithOthers(counts, 2);
    expect(r.kept).toEqual(['c', 'a']);
    expect([...r.others].sort()).toEqual(['b', 'd']);
    expect(topWithOthers(counts, 4).others.size).toBe(0);
  });
});

describe('nuage en bandes', () => {
  it('mois : 12 colonnes fixes, médiane et max par colonne', () => {
    const fl = [
      makeFlight('2025-05-01', { durationMin: 30 }),
      makeFlight('2025-05-02', { durationMin: 90 }),
      makeFlight('2025-05-03', { durationMin: 60 }),
      makeFlight('2025-07-03', { durationMin: 45 }),
      makeFlight('2025-07-04', { durationMin: 0 }),
      makeFlight('2025-07-05', { durationMin: null }),
    ];
    const r = bandCloud(fl, 'mois');
    expect(r.columns).toHaveLength(12);
    expect(r.columns[4]).toEqual({ label: 'mai', n: 3, median: 60, max: 90 });
    expect(r.columns[6]).toMatchObject({ label: 'juil.', n: 1, median: 45, max: 45 });
    expect(r.columns[0]).toEqual({ label: 'janv.', n: 0, median: null, max: null });
    expect(r.points).toHaveLength(4);
    expect(r.missing).toBe(2);
    for (const p of r.points) expect(Math.abs(p.x - p.col)).toBeLessThanOrEqual(BAND_SPREAD);
  });

  it('heure : fenêtre 8 h – 20 h, élargie par les vols hors plage, vols sans heure écartés', () => {
    expect(takeoffHourWindow([])).toEqual([8, 20]);
    const fl = [
      makeFlight('2025-05-01', { time: '06:40', durationMin: 10 }),
      makeFlight('2025-05-01', { time: '08:00', durationMin: 20 }),
      makeFlight('2025-05-01', { time: '08:59', durationMin: 40 }),
      makeFlight('2025-05-01', { time: '21:10', durationMin: 50 }),
      makeFlight('2025-05-01', { time: null, durationMin: 50 }),
    ];
    const r = bandCloud(fl, 'heure');
    expect(r.columns.map((c) => c.label)[0]).toBe('6 h');
    expect(r.columns).toHaveLength(16);
    expect(r.columns[2]).toMatchObject({ label: '8 h', n: 2, median: 30, max: 40 });
    expect(r.columns[15]?.label).toBe('21 h');
    expect(r.missing).toBe(1);
    expect(bandCloud([makeFlight('2025-05-01')], 'heure').columns).toHaveLength(13);
  });

  it('voile : les plus volées d’abord, au plus 12 colonnes, puis « Autres »', () => {
    const fl = [
      ...Array.from({ length: 14 }, (_, i) =>
        makeFlight('2025-05-01', { wing: `Voile ${String(i).padStart(2, '0')}`, durationMin: 10 + i }),
      ),
      makeFlight('2025-05-01', { wing: 'Voile 13', durationMin: 100 }),
      makeFlight('2025-05-01', { wing: null }),
    ];
    const r = bandCloud(fl, 'voile');
    expect(r.columns).toHaveLength(BAND_TOP + 1);
    expect(r.columns[0]).toMatchObject({ label: 'Voile 13', n: 2, median: 61.5, max: 100 });
    expect(r.columns[BAND_TOP]).toMatchObject({ label: OTHERS_LABEL, n: 2 });
    expect(r.points).toHaveLength(15);
    expect(r.missing).toBe(1);
  });

  it('site : pas de colonne « Autres » sous 12 sites', () => {
    const fl = [makeFlight('2025-05-01', { site: 'A' }), makeFlight('2025-05-01', { site: 'B' })];
    const r = bandCloud(fl, 'site');
    expect(r.columns.map((c) => c.label)).toEqual(['A', 'B']);
    expect(bandCloud([], 'site')).toEqual({ columns: [], points: [], missing: 0 });
  });
});
