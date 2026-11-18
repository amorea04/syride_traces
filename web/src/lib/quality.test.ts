import { describe, expect, it } from 'vitest';
import { METRICS } from '@/lib/metrics';
import {
  AGGREGATION_LABELS,
  computeQuality,
  metricRule,
  normalizeWingName,
  similarWings,
} from '@/lib/quality';
import { makeFlight } from '../../tests/flightFactory';

describe('normalizeWingName', () => {
  it('ignore casse, accents, espaces et tirets', () => {
    expect(normalizeWingName('  Océan-Pro  2 ')).toBe('ocean pro 2');
    expect(normalizeWingName('OCEAN PRO 2')).toBe('ocean pro 2');
    expect(normalizeWingName('ocean_pro-2')).toBe('ocean pro 2');
  });
});

describe('similarWings', () => {
  it('regroupe les écritures proches, la plus utilisée d’abord', () => {
    const flights = [
      makeFlight('2025-01-01', { wing: 'Ocean-Pro' }),
      makeFlight('2025-01-02', { wing: 'ocean pro' }),
      makeFlight('2025-01-03', { wing: 'ocean pro' }),
      makeFlight('2025-01-04', { wing: 'Solo' }),
      makeFlight('2025-01-05', { wing: null }),
    ];
    const groups = similarWings(flights);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.variants).toEqual([
      { name: 'ocean pro', flights: 2 },
      { name: 'Ocean-Pro', flights: 1 },
    ]);
  });
  it('ne signale rien quand tout est cohérent', () => {
    expect(similarWings([makeFlight('2025-01-01', { wing: 'A' })])).toEqual([]);
  });
});

describe('computeQuality', () => {
  const sites = [
    { id: 0, name: 'Avec', lat: 1, lon: 2 },
    { id: 1, name: 'Sans', lat: null, lon: null },
    { id: 2, name: 'Vide', lat: null, lon: 3 },
  ];
  const flights = [
    makeFlight('2025-01-01', { siteId: 0, source: 'gpx', ceilingM: 100 }),
    makeFlight('2025-01-02', { siteId: 1, source: 'fiche', incomplete: true }),
    makeFlight('2025-01-03', { siteId: 1, source: 'aucune' }),
    makeFlight('2025-01-04', { siteId: null, site: null, source: 'aucune' }),
  ];
  const q = computeQuality(flights, sites, 2);
  it('compte les anomalies', () => {
    expect(q).toMatchObject({
      exported: 4,
      excluded: 2,
      incomplete: 1,
      withoutSite: 1,
      flightsWithoutCoords: 2,
    });
    expect(q.sitesWithoutCoords.map((s) => [s.name, s.flights])).toEqual([
      ['Sans', 2],
      ['Vide', 0],
    ]);
  });
  it('réutilise la couverture', () => {
    expect(q.coverage.sources).toEqual({ gpx: 1, fiche: 1, aucune: 2 });
    expect(q.coverage.measured.plafond).toBe(1);
    expect(q.coverage.noPosition).toBe(2);
  });
});

describe('metricRule', () => {
  const rule = (id: string) => metricRule(METRICS.find((m) => m.id === id)!);
  it('décrit chaque famille de métriques', () => {
    expect(rule('nb_vols')).toContain('incomplets');
    expect(rule('cumul_duree_vol')).toContain('durées inconnues');
    expect(rule('moyenne_duree_vol')).toContain('une durée nulle est conservée');
    expect(rule('max_plafond')).toContain('≤ 0');
    expect(rule('max_plafond')).toContain('vol incomplet');
  });
  it('couvre les 19 métriques', () => {
    expect(METRICS.every((m) => metricRule(m).length > 0)).toBe(true);
    expect(Object.keys(AGGREGATION_LABELS)).toHaveLength(5);
  });
});
