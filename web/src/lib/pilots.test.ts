import { describe, expect, it } from 'vitest';
import { defaultFilters } from '@/lib/filters';
import {
  careerBars,
  filterSummary,
  intensityLevel,
  personalRecords,
  pilotSummaries,
  searchPilots,
  sortPilots,
  wingTimeline,
  yearCards,
} from '@/lib/pilots';
import { makeFlight } from '../../tests/flightFactory';

const alice = { pilot: 'Alice', pilotSlug: 'alice' };
const zoe = { pilot: 'Zoé', pilotSlug: 'zoe', activity: 'paramoteur' as const };

describe('pilotSummaries et tri', () => {
  const flights = [
    makeFlight('2024-03-01', { ...alice, durationMin: 60 }),
    makeFlight('2025-04-01', { ...alice, durationMin: 30, activity: 'paramoteur' }),
    makeFlight('2025-06-01', { ...zoe, durationMin: 200 }),
    makeFlight('2023-06-01', { ...zoe, durationMin: 10 }),
  ];
  const rows = pilotSummaries(flights);

  it('résume vols, heures, activité principale et dates', () => {
    const a = rows.find((r) => r.slug === 'alice')!;
    expect(a).toMatchObject({ flights: 2, minutes: 90, mainActivity: 'parapente', firstYear: 2024, lastDate: '2025-04-01' });
    expect(a.parapenteShare).toBeCloseTo(60 / 90);
    expect(rows.find((r) => r.slug === 'zoe')?.mainActivity).toBe('paramoteur');
  });

  it('trie par heures, vols, dernier vol et nom', () => {
    expect(sortPilots(rows, 'heures').map((r) => r.slug)).toEqual(['zoe', 'alice']);
    expect(sortPilots(rows, 'vols')[0]?.slug).toBe('alice');
    expect(sortPilots(rows, 'dernier')[0]?.slug).toBe('zoe');
    expect(sortPilots(rows, 'nom').map((r) => r.slug)).toEqual(['alice', 'zoe']);
  });

  it('cherche sans accents ni casse', () => {
    expect(searchPilots(rows, 'ZOE').map((r) => r.slug)).toEqual(['zoe']);
    expect(searchPilots(rows, 'zoé').map((r) => r.slug)).toEqual(['zoe']);
    expect(searchPilots(rows, '')).toHaveLength(2);
    expect(searchPilots(rows, 'xyz')).toHaveLength(0);
  });
});

describe('filterSummary', () => {
  it('est vide sans filtre et ignore les dimensions omises', () => {
    expect(filterSummary(defaultFilters())).toEqual([]);
    const f = { ...defaultFilters(), pilots: ['a'], activity: 'paramoteur' as const };
    expect(filterSummary(f, ['pilots'])).toEqual(['paramoteur']);
  });
  it('décrit période, voiles et sites', () => {
    const f = {
      ...defaultFilters(),
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      wings: ['a', 'b'],
      sites: [3],
    };
    expect(filterSummary(f, [], () => 'Montbron')).toEqual(['2025', '2 voiles', 'Montbron']);
    expect(filterSummary({ ...defaultFilters(), dateFrom: '2025-03-01' })[0]).toContain('depuis le 1');
  });
});

describe('careerBars', () => {
  it('une ligne par année, meilleure année en heures et en vols', () => {
    const flights = [
      makeFlight('2023-05-01', { durationMin: 120 }),
      makeFlight('2024-05-01', { durationMin: 30 }),
      makeFlight('2024-06-01', { durationMin: 30, activity: 'paramoteur' }),
      makeFlight('2024-07-01', { durationMin: 30 }),
    ];
    const bars = careerBars(flights);
    expect(bars.years.map((y) => y.year)).toEqual([2023, 2024]);
    expect(bars.bestHoursYear).toBe(2023);
    expect(bars.bestFlightsYear).toBe(2024);
    expect(bars.years[1]).toMatchObject({ pMin: 60, mMin: 30, pN: 2, mN: 1 });
  });
  it('fonctionne avec une seule année et sans vol', () => {
    expect(careerBars([makeFlight('2024-05-01')]).bestHoursYear).toBe(2024);
    expect(careerBars([])).toEqual({ years: [], bestHoursYear: null, bestFlightsYear: null });
  });
});

describe('yearCards', () => {
  const flights = [
    makeFlight('2025-03-01', { durationMin: 60, site: 'A', siteId: 1 }),
    makeFlight('2025-09-01', { durationMin: 600, site: 'B', siteId: 2 }),
    makeFlight('2026-02-01', { durationMin: 120, site: 'A', siteId: 1 }),
  ];
  it('compare l’année en cours à la même période de l’année précédente', () => {
    const cards = yearCards(flights, '2026-06-10');
    expect(cards.map((c) => c.year)).toEqual([2026, 2025]);
    expect(cards[0]).toMatchObject({ inProgress: true, first: false, flights: 1, sites: 1 });
    // 2026 : 120 min contre 60 min d'ici le 10 juin 2025 : +100 %.
    expect(cards[0]?.deltaPct).toBeCloseTo(100);
    expect(cards[1]).toMatchObject({ first: true, deltaPct: null, inProgress: false });
    expect(cards[1]?.months[2]).toBe(60);
  });
  it('compare une année terminée à l’année entière précédente', () => {
    const cards = yearCards([...flights, makeFlight('2024-01-01', { durationMin: 330 })], '2026-06-10');
    // 2025 : 660 min contre 330 min en 2024.
    expect(cards.find((c) => c.year === 2025)?.deltaPct).toBeCloseTo(100);
  });
});

describe('personalRecords', () => {
  it('rend les six records dans l’ordre, avec le vol concerné', () => {
    const flights = [
      makeFlight('2024-05-01', { durationMin: 90, ceilingM: 1500 }),
      makeFlight('2024-06-01', { durationMin: 30, ceilingM: 2500, varioMax: 5 }),
    ];
    const rec = personalRecords(flights);
    expect(rec.map((r) => r.key)).toEqual(['duree', 'plafond', 'distance', 'vario', 'vitesseMax', 'g']);
    expect(rec[0]?.entry?.value).toBe(90);
    expect(rec[1]?.entry?.value).toBe(2500);
    expect(rec[2]?.entry).toBeNull();
    expect(rec[3]?.entry?.flightKey).toBe(flights[1]?.key);
  });
});

describe('wingTimeline', () => {
  const flights = [
    makeFlight('2024-01-10', { wing: 'daytona' }),
    makeFlight('2024-02-10', { wing: 'daytona' }),
    makeFlight('2024-11-10', { wing: 'leaf' }),
    makeFlight('2024-11-12', { wing: null }),
  ];
  it('couvre les trimestres sans trou et trie par usage', () => {
    const t = wingTimeline(flights);
    expect(t.quarters).toEqual([
      { year: 2024, quarter: 1 },
      { year: 2024, quarter: 2 },
      { year: 2024, quarter: 3 },
      { year: 2024, quarter: 4 },
    ]);
    expect(t.rows.map((r) => r.wing)).toEqual(['daytona', 'leaf']);
    expect(t.rows[0]?.counts).toEqual([2, 0, 0, 0]);
    expect(t.maxCount).toBe(2);
  });
  it('limite le nombre de lignes et compte les voiles cachées', () => {
    const t = wingTimeline(flights, 1);
    expect(t.rows).toHaveLength(1);
    expect(t.hidden).toBe(1);
  });
  it('est vide sans voile', () => {
    expect(wingTimeline([makeFlight('2024-01-01', { wing: null })]).rows).toEqual([]);
  });
  it('niveaux d’intensité', () => {
    expect([0, 1, 4, 6, 9].map((n) => intensityLevel(n, 10))).toEqual([0, 1, 2, 3, 4]);
    expect(intensityLevel(3, 0)).toBe(0);
  });
});
