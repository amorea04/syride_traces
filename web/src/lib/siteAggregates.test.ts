import { describe, expect, it } from 'vitest';
import {
  FEW_SITE_FLIGHTS,
  hasFewFlights,
  MIN_SITE_FLIGHTS,
  MIN_SITE_FLIGHTS_FACE_TO_FACE,
  MIN_SITE_FLIGHTS_PILOT,
  parapenteShare,
  positionAmongSites,
  siteAggregates,
  SITE_INDICATORS,
} from '@/lib/siteAggregates';
import { makeFlight } from '../../tests/flightFactory';

function site(siteId: number, n: number, over: Parameters<typeof makeFlight>[1] = {}) {
  return Array.from({ length: n }, (_, i) =>
    makeFlight('2025-05-01', { siteId, site: `S${siteId}`, pilotSlug: `p${i % 2}`, ...over }),
  );
}

describe('siteAggregates', () => {
  it('agrège vols, pilotes, disciplines et moyennes (≤ 0 et null ignorés)', () => {
    const flights = [
      makeFlight('2025-05-01', {
        siteId: 1,
        pilotSlug: 'a',
        durationMin: 60,
        ceilingM: 1000,
        speedAvg: 20,
        distKm: 10,
      }),
      makeFlight('2025-05-02', {
        siteId: 1,
        pilotSlug: 'b',
        activity: 'paramoteur',
        durationMin: 0,
        ceilingM: null,
        speedAvg: null,
        distKm: -1,
      }),
      makeFlight('2025-05-03', { siteId: null, site: null }),
    ];
    const map = siteAggregates(flights);
    expect([...map.keys()]).toEqual([1]);
    expect(map.get(1)).toMatchObject({
      flights: 2,
      pilots: 2,
      parapente: 1,
      paramoteur: 1,
      durationMean: 30,
      ceilingMean: 1000,
      speedMean: 20,
      distanceMean: 10,
      varioMaxMean: null,
    });
  });

  it('un vol incomplet ne compte pas dans les mesures de fiche', () => {
    const f = makeFlight('2025-05-01', { siteId: 1, ceilingM: 900, incomplete: true });
    expect(siteAggregates([f]).get(1)!.ceilingMean).toBeNull();
  });
});

describe('positionAmongSites', () => {
  const flights = [
    ...site(1, 12, { ceilingM: 500, durationMin: 30 }),
    ...site(2, 10, { ceilingM: 1500, durationMin: 90, activity: 'paramoteur' }),
    ...site(3, 11, { ceilingM: 1000, durationMin: 60 }),
    ...site(4, 3, { ceilingM: 9000 }),
  ];
  const aggs = siteAggregates(flights);

  it('refuse un site sous le seuil', () => {
    expect(positionAmongSites(aggs, 4)).toBeNull();
    expect(positionAmongSites(aggs, 99)).toBeNull();
  });

  it('rang, moyenne et médiane des autres, sites sous le seuil exclus', () => {
    const pos = positionAmongSites(aggs, 3)!;
    expect(pos).toMatchObject({ comparedSites: 3, comparedFlights: 33, totalSites: 4, totalFlights: 36 });
    const ceiling = pos.indicators.find((i) => i.id === 'ceiling')!;
    expect(ceiling).toMatchObject({
      value: 1000,
      rank: 2,
      total: 3,
      othersMean: 1000,
      othersMedian: 1000,
      min: 500,
      max: 1500,
    });
    const flightsInd = pos.indicators.find((i) => i.id === 'flights')!;
    expect(flightsInd.rank).toBe(2);
    expect(pos.indicators.map((i) => i.id)).toEqual(SITE_INDICATORS.map((i) => i.id));
  });

  it('ex æquo : même rang ; absence de valeur : rang null', () => {
    const pos = positionAmongSites(aggs, 1)!;
    expect(pos.indicators.find((i) => i.id === 'pilots')).toMatchObject({ rank: 1, total: 3 });
    expect(pos.indicators.find((i) => i.id === 'vario')).toMatchObject({
      value: null,
      rank: null,
      total: 0,
      othersMean: null,
    });
  });

  it('parts de disciplines : ce site et cumul des autres sites comparés', () => {
    const pos = positionAmongSites(aggs, 2)!;
    expect(pos.site).toEqual({ parapente: 0, paramoteur: 10 });
    expect(pos.others).toEqual({ parapente: 23, paramoteur: 0 });
    expect(parapenteShare(pos.others)).toBe(100);
    expect(parapenteShare({ parapente: 0, paramoteur: 0 })).toBe(0);
  });

  it('seuil réglable (vue pilote)', () => {
    expect(positionAmongSites(aggs, 4, 3)).not.toBeNull();
  });
});

describe('« Ses sites face à face » sans seuil (D20)', () => {
  it('la page pilote compte dès 1 vol, la fiche vol et la page site gardent 10', () => {
    expect(MIN_SITE_FLIGHTS_FACE_TO_FACE).toBe(1);
    expect(MIN_SITE_FLIGHTS).toBe(10);
    expect(MIN_SITE_FLIGHTS_PILOT).toBe(10);
  });
  it('un site d’un seul vol est positionné parmi les autres, signalé « peu de vols » sous 3 vols', () => {
    const flights = [
      ...Array.from({ length: 5 }, () => makeFlight('2025-05-01', { siteId: 1, site: 'A' })),
      makeFlight('2025-05-02', { siteId: 2, site: 'B' }),
    ];
    const aggregates = siteAggregates(flights);
    const position = positionAmongSites(aggregates, 2, MIN_SITE_FLIGHTS_FACE_TO_FACE);
    expect(position?.comparedSites).toBe(2);
    expect(positionAmongSites(aggregates, 2, MIN_SITE_FLIGHTS_PILOT)).toBeNull();
    expect(hasFewFlights(1)).toBe(true);
    expect(hasFewFlights(FEW_SITE_FLIGHTS)).toBe(false);
  });
});
