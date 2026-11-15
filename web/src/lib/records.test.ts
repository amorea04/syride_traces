import { describe, expect, it } from 'vitest';
import { makeFlight } from '../../tests/flightFactory';
import {
  bestFlight,
  computeCareer,
  computeCoverage,
  computeHighlights,
  computeKpis,
  deltaPct,
  durationStats,
  topRecords,
} from '@/lib/records';

describe('computeKpis', () => {
  it('ignore les mesures <= 0 (null), compte une durée inconnue comme 0 minute', () => {
    const k = computeKpis([
      makeFlight('2025-03-03', { ceilingM: 1000, durationMin: 60 }),
      makeFlight('2025-03-03', { ceilingM: null, durationMin: null, site: 'Site B' }),
    ]);
    expect(k.nFlights).toBe(2);
    expect(k.daysFlown).toBe(1);
    expect(k.nSites).toBe(2);
    expect(k.ceilingMean).toBe(1000);
    expect(k.durationMean).toBe(30);
    expect(k.minutes).toBe(60);
    expect(k.distanceTotal).toBeNull();
  });

  it('sans vol : zéros et null', () => {
    const k = computeKpis([]);
    expect(k).toMatchObject({ nFlights: 0, minutes: 0, firstDate: null, durationMean: null });
  });
});

describe('records', () => {
  const flights = [
    makeFlight('2025-01-01', { ceilingM: 2000 }),
    makeFlight('2025-02-01', { ceilingM: 2000 }),
    makeFlight('2025-03-01', { ceilingM: 1500 }),
    makeFlight('2025-04-01', { ceilingM: null }),
  ];

  it('classe par valeur puis date récente, sans les vols non mesurés', () => {
    const top = topRecords(flights, 2).plafond;
    expect(top.map((r) => r.date)).toEqual(['2025-02-01', '2025-01-01']);
    expect(topRecords(flights).vario).toEqual([]);
  });

  it('bestFlight prend le plus ancien à égalité', () => {
    expect(bestFlight(flights, 'plafond')?.date).toBe('2025-01-01');
    expect(bestFlight(flights, 'g')).toBeNull();
  });
});

describe('durationStats', () => {
  it('répartit en tranches et trouve la médiane', () => {
    const s = durationStats([10, 20, 45, 90, 150].map((m) => makeFlight('2025-03-03', { durationMin: m })));
    expect(s.bins).toEqual([1, 1, 1, 1, 1]);
    expect(s.medianBin).toBe(2);
    expect(s.medians.duree).toEqual({ value: 45, count: 5 });
    expect(s.medians.plafond).toEqual({ value: null, count: 0 });
  });
});

describe('computeHighlights', () => {
  it('trouve le mois, le site et le jour phares', () => {
    const h = computeHighlights([
      makeFlight('2025-03-03', { durationMin: 30 }),
      makeFlight('2025-03-10', { durationMin: 120, site: 'Site B' }),
      makeFlight('2025-03-10', { durationMin: 10, site: null }),
    ]);
    expect(h.busiestMonth).toEqual({ index: 2, flights: 3 });
    expect(h.topSite?.site).toBe('Site B');
    expect(h.longestGapDays).toBe(6);
    expect(h.bestDay).toMatchObject({ date: '2025-03-10', n: 2, sites: ['Site B'] });
  });
});

describe('computeCoverage', () => {
  it('compte les mesures, les sources et les vols sans position', () => {
    const c = computeCoverage(
      [
        makeFlight('2025-03-03', { ceilingM: 800, source: 'fiche', siteId: 1 }),
        makeFlight('2025-03-04', { siteId: 0 }),
      ],
      (id) => id === 0,
    );
    expect(c.measured.plafond).toBe(1);
    expect(c.sources).toEqual({ gpx: 1, fiche: 1, aucune: 0 });
    expect(c.noPosition).toBe(1);
    expect(computeCoverage([]).noPosition).toBeNull();
  });
});

describe('computeCareer', () => {
  const flights = [
    makeFlight('2023-05-01', { distKm: 10 }),
    makeFlight('2024-05-01', { activity: 'paramoteur', durationMin: 120, distKm: 20 }),
    makeFlight('2024-09-01'),
    makeFlight('2025-02-01'),
    makeFlight('2025-08-01'),
  ];

  it('cumule jusqu’à l’année du rapport, années postérieures ignorées', () => {
    const c = computeCareer(flights, 2024);
    expect(c?.flights).toBe(3);
    expect(c?.years.map((y) => y.year)).toEqual([2023, 2024]);
    expect(c?.bestYear).toBe(2024);
    expect(c?.distance).toBe(30);
    expect(c?.distanceN).toBe(2);
  });

  it('s’arrête à la date de coupure pour l’année du rapport', () => {
    expect(computeCareer(flights, 2025, [6, 30])?.flights).toBe(4);
    expect(computeCareer(flights, 2023)).toBeNull();
  });
});

describe('deltaPct', () => {
  it('calcule la variation en %, null si non calculable', () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10, 12);
    expect(deltaPct(1, 0)).toBeNull();
    expect(deltaPct(null, 5)).toBeNull();
  });
});
