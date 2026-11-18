import { describe, expect, it } from 'vitest';
import { personalRecords } from '@/lib/pilots';
import {
  filterSiteRows,
  foldText,
  latestFlightsOf,
  monthByDiscipline,
  rankedTop,
  RECORD_METRICS,
  seasonalityMatrix,
  siteTableRows,
  sitePilotRows,
  sortSiteRows,
} from '@/lib/sites';
import { makeFlight } from '../../tests/flightFactory';

const SITES = new Map([
  [0, { id: 0, name: 'Montbron', lat: 45, lon: 0.5 }],
  [1, { id: 1, name: 'Étang Bleu', lat: null, lon: null }],
]);

describe('foldText', () => {
  it('ignore casse, accents et espaces de bord', () => {
    expect(foldText('  Étang BLEU ')).toBe('etang bleu');
  });
});

describe('siteTableRows', () => {
  const flights = [
    makeFlight('2025-01-01', { siteId: 0, durationMin: 60, ceilingM: 1200, pilotSlug: 'a' }),
    makeFlight('2025-03-01', {
      siteId: 0,
      durationMin: 30,
      ceilingM: null,
      pilotSlug: 'b',
      activity: 'paramoteur',
    }),
    makeFlight('2025-02-01', { siteId: 1, durationMin: null, pilotSlug: 'a' }),
    makeFlight('2025-02-01', { siteId: null, site: null }),
    makeFlight('2025-02-01', { siteId: 9 }),
  ];
  const rows = siteTableRows(flights, SITES);

  it('agrège par site connu et ignore les autres', () => {
    expect(rows).toHaveLength(2);
    const m = rows.find((r) => r.siteId === 0)!;
    expect(m).toMatchObject({
      flights: 2,
      minutes: 90,
      pilots: 2,
      parapente: 1,
      paramoteur: 1,
      lastDate: '2025-03-01',
    });
    expect(m.parapenteShare).toBe(50);
    expect(m.ceilingMax).toBe(1200);
    expect(rows.find((r) => r.siteId === 1)!.ceilingMax).toBeNull();
  });

  it('trie avec les valeurs absentes toujours en fin', () => {
    expect(sortSiteRows(rows, 'ceiling', 'desc').map((r) => r.siteId)).toEqual([0, 1]);
    expect(sortSiteRows(rows, 'ceiling', 'asc').map((r) => r.siteId)).toEqual([0, 1]);
    expect(sortSiteRows(rows, 'flights', 'asc').map((r) => r.siteId)).toEqual([1, 0]);
    expect(sortSiteRows(rows, 'name', 'asc').map((r) => r.name)).toEqual(['Étang Bleu', 'Montbron']);
  });

  it('filtre sans accents', () => {
    expect(filterSiteRows(rows, 'etang').map((r) => r.siteId)).toEqual([1]);
    expect(filterSiteRows(rows, '')).toHaveLength(2);
    expect(filterSiteRows(rows, 'zzz')).toEqual([]);
  });
});

describe('seasonalityMatrix', () => {
  it('place mois × heure et compte les vols sans heure dans les totaux de mois', () => {
    const m = seasonalityMatrix([
      makeFlight('2025-07-04', { time: '10:30' }),
      makeFlight('2025-07-05', { time: '10:05' }),
      makeFlight('2025-01-05', { time: '15:00' }),
      makeFlight('2025-07-06', { time: null }),
    ]);
    expect(m.counts[6]![10]).toBe(2);
    expect(m.counts[0]![15]).toBe(1);
    expect(m.monthTotals[6]).toBe(3);
    expect(m.hourTotals[10]).toBe(2);
    expect(m.missing).toBe(1);
  });
  it('sépare les disciplines par mois', () => {
    const d = monthByDiscipline([
      makeFlight('2025-07-04'),
      makeFlight('2025-07-05', { activity: 'paramoteur' }),
    ]);
    expect(d.parapente[6]).toBe(1);
    expect(d.paramoteur[6]).toBe(1);
  });
});

describe('pilotes et derniers vols', () => {
  const flights = [
    makeFlight('2025-01-01', { pilotSlug: 'a', pilot: 'A', durationMin: 10 }),
    makeFlight('2025-01-02', { pilotSlug: 'b', pilot: 'B', durationMin: 90 }),
    makeFlight('2025-01-03', { pilotSlug: 'b', pilot: 'B', durationMin: 10 }),
  ];
  it('classe les pilotes par vols puis heures', () => {
    const rows = sitePilotRows(flights);
    expect(rows.map((r) => r.pilotSlug)).toEqual(['b', 'a']);
    expect(rows[0]).toMatchObject({ flights: 2, minutes: 100, lastDate: '2025-01-03' });
  });
  it('donne les vols les plus récents d’abord, bornés', () => {
    const last = latestFlightsOf(flights, 2);
    expect(last.map((f) => f.date)).toEqual(['2025-01-03', '2025-01-02']);
  });
  it('départage par heure puis numéro Syride', () => {
    const a = makeFlight('2025-01-03', { time: '09:00' });
    const b = makeFlight('2025-01-03', { time: '11:00' });
    expect(latestFlightsOf([a, b], 2)[0]).toBe(b);
  });
});

describe('rankedTop', () => {
  const dur = RECORD_METRICS.find((m) => m.id === 'duree')!.of;
  const flights = [
    makeFlight('2025-01-01', { pilotSlug: 'a', durationMin: 100 }),
    makeFlight('2025-01-02', { pilotSlug: 'a', durationMin: 100 }),
    makeFlight('2025-01-03', { pilotSlug: 'b', durationMin: 80 }),
    makeFlight('2025-01-04', { pilotSlug: 'c', durationMin: 60 }),
    makeFlight('2025-01-05', { pilotSlug: 'c', durationMin: 0 }),
    makeFlight('2025-01-06', { pilotSlug: 'd', durationMin: null }),
  ];
  it('donne le même rang aux ex æquo et saute le suivant', () => {
    const top = rankedTop(flights, dur);
    expect(top.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
    expect(top[0]!.flight.date).toBe('2025-01-02');
  });
  it('ignore les valeurs nulles ou ≤ 0', () => {
    expect(rankedTop(flights, dur)).toHaveLength(4);
  });
  it('garde un vol par pilote, le plus récent à égalité', () => {
    const top = rankedTop(flights, dur, { onePerPilot: true });
    expect(top.map((r) => r.flight.pilotSlug)).toEqual(['a', 'b', 'c']);
    expect(top[0]!.flight.date).toBe('2025-01-02');
    expect(top.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it('départage les ex æquo de façon déterministe, dans les deux sens (date puis numéro Syride)', () => {
    const x = makeFlight('2025-02-01', { pilotSlug: 'p', durationMin: 90, syrideNum: 10 });
    const y = makeFlight('2025-02-01', { pilotSlug: 'p', durationMin: 90, syrideNum: 20 });
    const order = (list: typeof flights) => rankedTop(list, dur).map((r) => r.flight.syrideNum);
    expect(order([x, y])).toEqual([20, 10]);
    expect(order([y, x])).toEqual([20, 10]);
    expect(rankedTop([x, y], dur, { onePerPilot: true })[0]!.flight.syrideNum).toBe(20);
  });
  it('pointe vers le même vol que les records personnels (même pilote, deux vols de même plafond)', () => {
    const old = makeFlight('2025-03-01', { pilotSlug: 'p', ceilingM: 1500, syrideNum: 5, key: 'old' });
    const recent = makeFlight('2025-04-01', { pilotSlug: 'p', ceilingM: 1500, syrideNum: 6, key: 'recent' });
    const sameDayA = makeFlight('2025-05-01', { pilotSlug: 'p', ceilingM: 1600, syrideNum: 7, key: 'a' });
    const sameDayB = makeFlight('2025-05-01', { pilotSlug: 'p', ceilingM: 1600, syrideNum: 8, key: 'b' });
    const ceiling = RECORD_METRICS.find((m) => m.id === 'plafond')!.of;
    for (const list of [[old, recent], [recent, old], [sameDayA, sameDayB], [sameDayB, sameDayA]]) {
      const personal = personalRecords(list).find((r) => r.key === 'plafond')!.entry!;
      const ranked = rankedTop(list, ceiling, { onePerPilot: true })[0]!;
      expect(ranked.flight.key).toBe(personal.flightKey);
      expect(rankedTop(list, ceiling)[0]!.flight.key).toBe(personal.flightKey);
    }
  });
  it('borne le nombre de lignes', () => {
    expect(rankedTop(flights, dur, { top: 2 })).toHaveLength(2);
  });
});

