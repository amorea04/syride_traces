import { describe, expect, it } from 'vitest';
import { weekHourMatrix } from '@/lib/rhythm';
import {
  calendarKind,
  calendarLevel,
  calendarToken,
  dayMap,
  disciplineShares,
  favoriteSlot,
  flightsOfDay,
  hoursWindow,
  lastMonthsFlights,
  matrixLevel,
  monthGrid,
  monthRange,
  neighborFlownDay,
  partialData,
  scatterPoints,
  weekendShareOf,
  wingRibbon,
  yearEnd,
  yearGrid,
  yearsOf,
} from '@/lib/rhythmBlocks';
import { makeFlight } from '../../tests/flightFactory';

describe('calendrier', () => {
  it('niveaux par paliers fixes du rapport', () => {
    expect([0, 30, 31, 75, 76, 150, 151].map(calendarLevel)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
  it('discipline et jeton', () => {
    expect(calendarKind(['parapente'])).toBe('p');
    expect(calendarKind(['paramoteur'])).toBe('m');
    expect(calendarKind(['parapente', 'paramoteur'])).toBe('b');
    expect(calendarToken({ date: '2025-05-01', n: 1, minutes: 100, disciplines: ['paramoteur'] })).toBe('cal-m3');
  });
  it('années et fin d’année', () => {
    const fl = [makeFlight('2023-05-01'), makeFlight('2025-06-01'), makeFlight('2025-07-01')];
    expect(yearsOf(fl)).toEqual([2025, 2023]);
    expect(yearEnd(2025, '2025-12-28')).toBe('2025-12-28');
    expect(yearEnd(2023, '2025-12-28')).toBe('2023-12-31');
  });
  it('grille annuelle : lundi en haut, semaine du 1er janvier en colonne 0', () => {
    const { cells, columns, monthColumns } = yearGrid(2025); // 1er janvier 2025 = mercredi
    expect(cells).toHaveLength(365);
    expect(cells[0]).toEqual({ iso: '2025-01-01', col: 0, row: 2 });
    expect(cells[5]).toEqual({ iso: '2025-01-06', col: 1, row: 0 });
    expect(cells[364]).toEqual({ iso: '2025-12-31', col: 52, row: 2 });
    expect(columns).toBe(53);
    expect(monthColumns[0]).toBe(0);
    expect(yearGrid(2024).cells).toHaveLength(366);
  });
  it('grille d’un mois', () => {
    const { cells, columns } = monthGrid(2025, 2); // 1er février 2025 = samedi
    expect(cells).toHaveLength(28);
    expect(cells[0]).toEqual({ iso: '2025-02-01', col: 0, row: 5 });
    expect(columns).toBe(5);
  });
  it('jours voisins dans la liste des jours volés', () => {
    const dates = ['2025-05-01', '2025-05-10', '2025-06-01'];
    expect(neighborFlownDay(dates, '2025-05-10', -1)).toBe('2025-05-01');
    expect(neighborFlownDay(dates, '2025-05-10', 1)).toBe('2025-06-01');
    expect(neighborFlownDay(dates, '2025-05-01', -1)).toBeNull();
    expect(neighborFlownDay(dates, '2025-06-01', 1)).toBeNull();
  });
  it('vols du jour triés par heure, jour par jour', () => {
    const a = makeFlight('2025-05-01', { time: '15:00' });
    const b = makeFlight('2025-05-01', { time: '09:30' });
    const c = makeFlight('2025-05-01', { time: null });
    expect(flightsOfDay([a, b, c, makeFlight('2025-05-02')], '2025-05-01')).toEqual([b, a, c]);
    expect(dayMap([a, b]).get('2025-05-01')?.n).toBe(2);
  });
  it('part week-end et parts de disciplines', () => {
    const fl = [makeFlight('2025-05-03'), makeFlight('2025-05-04'), makeFlight('2025-05-05', { activity: 'paramoteur' }), makeFlight('2025-05-06')];
    expect(weekendShareOf(fl)).toBe(0.5);
    expect(weekendShareOf([])).toBe(0);
    expect(disciplineShares(fl)).toEqual({ parapente: 0.75, paramoteur: 0.25, n: 4 });
  });
});

describe('matrice jour × heure', () => {
  it('niveaux selon la part du maximum', () => {
    expect([1, 2, 3, 4].map((n) => matrixLevel(n, 4))).toEqual([1, 2, 3, 4]);
    expect(matrixLevel(1, 0)).toBe(1);
  });
  it('fenêtre d’heures : 8 colonnes minimum, 8 h–18 h sans vol', () => {
    const empty = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    expect(hoursWindow(empty)).toEqual([8, 18]);
    const one = empty.map((r) => [...r]);
    (one[0] as number[])[12] = 1;
    const [lo, hi] = hoursWindow(one);
    expect(hi - lo).toBeGreaterThanOrEqual(7); // comme le rapport, la fenêtre s’élargit des deux côtés à la fois
    expect(lo).toBeLessThanOrEqual(12);
    expect(hi).toBeGreaterThanOrEqual(12);
  });
  it('créneau favori : au moins 3 vols, à égalité le plus long', () => {
    const sat = (time: string, minutes: number) => makeFlight('2025-05-03', { time, durationMin: minutes });
    const fl = [sat('11:00', 10), sat('11:10', 10), sat('11:20', 10), sat('15:00', 50), sat('15:10', 50), sat('15:20', 50)];
    expect(favoriteSlot(weekHourMatrix(fl))).toEqual({ weekday: 5, hour: 15, n: 3 });
    expect(favoriteSlot(weekHourMatrix(fl.slice(0, 2)))).toBeNull();
  });
});

describe('ruban voile × mois', () => {
  it('top des voiles, mois de la sélection, voiles masquées', () => {
    const fl = [
      makeFlight('2025-03-01', { wing: 'A', durationMin: 60 }),
      makeFlight('2025-05-01', { wing: 'A', durationMin: 30 }),
      makeFlight('2025-05-02', { wing: 'B', durationMin: 120 }),
      makeFlight('2025-05-03', { wing: null }),
      makeFlight('2025-05-04', { wing: 'C', durationMin: 5 }),
    ];
    const r = wingRibbon(fl, 2);
    expect(r.months).toEqual([
      { year: 2025, month: 3 },
      { year: 2025, month: 4 },
      { year: 2025, month: 5 },
    ]);
    expect(r.rows.map((x) => x.wing)).toEqual(['B', 'A']);
    expect(r.rows[1]).toMatchObject({ n: [1, 0, 1], minutes: [60, 0, 30], totalN: 2, totalMinutes: 90 });
    expect(r.hidden).toBe(1);
  });
  it('colonnes continues : les mois sans vol sont remplis, de janvier à avril ici', () => {
    const fl = [
      makeFlight('2024-11-05', { wing: 'A', durationMin: 60 }),
      makeFlight('2025-02-10', { wing: 'A', durationMin: 30 }),
    ];
    const r = wingRibbon(fl);
    expect(r.months).toEqual([
      { year: 2024, month: 11 },
      { year: 2024, month: 12 },
      { year: 2025, month: 1 },
      { year: 2025, month: 2 },
    ]);
    expect(r.rows[0]).toMatchObject({ n: [1, 0, 0, 1], minutes: [60, 0, 0, 30] });
  });
  it('sélection vide', () => {
    expect(wingRibbon([])).toEqual({ months: [], rows: [], hidden: 0 });
  });
  it('période d’un mois', () => {
    expect(monthRange(2024, 2)).toEqual(['2024-02-01', '2024-02-29']);
  });
});

describe('nuage et données partielles', () => {
  const fl = [
    makeFlight('2025-05-01', { durationMin: 60, ceilingM: 1500, distKm: 10 }),
    makeFlight('2025-05-02', { durationMin: 0, ceilingM: 1500 }),
    makeFlight('2025-05-03', { durationMin: 30, ceilingM: null, source: 'fiche' }),
    makeFlight('2025-05-04', { durationMin: 30, ceilingM: 0, source: 'aucune' }),
  ];
  it('points : durée et mesure > 0 requises', () => {
    const s = scatterPoints(fl, 'plafond');
    expect(s.points).toHaveLength(1);
    expect(s.missing).toBe(3);
    expect(scatterPoints(fl, 'distance').points).toHaveLength(1);
  });
  it('couverture : seuil de 20 %, répartition des sources', () => {
    const p = partialData(fl, 'plafond');
    expect(p).toMatchObject({ n: 4, missing: 2, missingShare: 0.5, partial: true });
    expect(p.sources).toEqual({ gpx: 2, fiche: 1, aucune: 1 });
    expect(p.missingSources).toEqual({ gpx: 0, fiche: 1, aucune: 1 });
    expect(partialData(fl.slice(0, 1), 'plafond').partial).toBe(false);
    expect(partialData([], 'plafond')).toMatchObject({ n: 0, partial: false });
    const five = [...Array.from({ length: 4 }, () => makeFlight('2025-05-01', { ceilingM: 100 })), makeFlight('2025-05-01')];
    expect(partialData(five, 'plafond').partial).toBe(false); // exactement 20 % : pas au-delà
  });
});

describe('lastMonthsFlights', () => {
  it('garde les 24 derniers mois, finissant au mois du dernier vol', () => {
    const fl = [makeFlight('2022-12-31'), makeFlight('2023-01-01'), makeFlight('2024-12-05')];
    const r = lastMonthsFlights(fl);
    expect(r.flights.map((f) => f.date)).toEqual(['2023-01-01', '2024-12-05']);
    expect(r.truncated).toBe(true);
  });
  it('ne tronque pas une courte sélection ni une sélection vide', () => {
    expect(lastMonthsFlights([makeFlight('2025-01-01')]).truncated).toBe(false);
    expect(lastMonthsFlights([])).toEqual({ flights: [], truncated: false });
  });
});
