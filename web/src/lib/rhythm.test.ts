import { describe, expect, it } from 'vitest';
import { makeFlight } from '../../tests/flightFactory';
import {
  computeRhythm,
  cumulativeSteps,
  flightModes,
  longestGap,
  longestRun,
  seasonsBreakdown,
  weekHourMatrix,
  xOfDate,
} from '@/lib/rhythm';

// Lundi 3, mardi 4, mercredi 5 mars 2025 ; puis mercredi 12 ; puis samedi 15.
const DATES = ['2025-03-03', '2025-03-04', '2025-03-05', '2025-03-12', '2025-03-15'];
const flights = DATES.map((d) => makeFlight(d));

describe('computeRhythm', () => {
  const rhythm = computeRhythm(flights, 2025, '2025-03-31');

  it('trouve la plus longue série et la plus longue pause', () => {
    expect(rhythm?.streak).toEqual({ days: 3, start: '2025-03-03', end: '2025-03-05' });
    expect(rhythm?.gap).toEqual({ days: 6, start: '2025-03-06', end: '2025-03-11' });
  });

  it('compte les semaines lundi-dimanche, celle du 1er janvier comprise', () => {
    // Le 1er janvier 2025 est un mercredi : la semaine du lundi 30 décembre compte. 30/12 → 31/03 = 14 semaines.
    expect(rhythm?.weeksTotal).toBe(14);
    expect(rhythm?.weeksActive).toBe(2);
    expect(rhythm?.weeksStreak).toBe(2);
  });

  it('retient la meilleure semaine et la part du week-end', () => {
    expect(rhythm?.week).toEqual({ start: '2025-03-03', end: '2025-03-09', minutes: 180, n: 3 });
    expect(rhythm?.weekendShare).toBeCloseTo(1 / 5, 12);
  });

  it('ne compte pas de pause après le dernier vol et rend null sans vol', () => {
    expect(computeRhythm(flights, 2025, '2025-12-31')?.gap?.days).toBe(6);
    expect(computeRhythm([], 2025, '2025-12-31')).toBeNull();
  });

  it('n’annonce pas de série pour des jours isolés', () => {
    const isolated = ['2025-03-03', '2025-03-05'].map((d) => makeFlight(d));
    expect(computeRhythm(isolated, 2025, '2025-03-31')?.streak).toBeNull();
  });

  it('départage à égalité la plus ancienne semaine', () => {
    const tie = ['2025-03-03', '2025-03-10'].map((d) => makeFlight(d));
    expect(computeRhythm(tie, 2025, '2025-03-31')?.week.start).toBe('2025-03-03');
  });
});

describe('longestRun et longestGap', () => {
  it('prennent la première en cas d’égalité', () => {
    expect(longestRun([1, 2, 5, 6])).toEqual({ length: 2, first: 1, last: 2 });
    expect(longestRun([])).toBeNull();
    expect(longestGap(['2025-01-01', '2025-01-03', '2025-01-05'])).toEqual({
      days: 1,
      start: '2025-01-02',
      end: '2025-01-02',
    });
    expect(longestGap(['2025-01-01', '2025-01-02'])).toBeNull();
  });
});

describe('weekHourMatrix', () => {
  it('place les vols par jour et heure entière, et compte ceux sans heure', () => {
    const m = weekHourMatrix([
      makeFlight('2025-03-03', { time: '09:59', durationMin: 30 }), // lundi
      makeFlight('2025-03-03', { time: '09:00', durationMin: null }),
      makeFlight('2025-03-09', { time: null }), // dimanche
    ]);
    expect(m.counts[0]?.[9]).toBe(2);
    expect(m.minutes[0]?.[9]).toBe(30);
    expect(m.missing).toBe(1);
  });
});

describe('autres indicateurs', () => {
  it('courbe cumulée : fin de journée dans l’année', () => {
    expect(xOfDate('2025-01-31')).toBeCloseTo(1 / 12, 12);
    expect(xOfDate('2024-02-29')).toBeCloseTo(2 / 12, 12);
    const steps = cumulativeSteps([
      makeFlight('2025-01-31'),
      makeFlight('2025-01-31'),
      makeFlight('2025-02-28'),
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[1]?.[1]).toBe(3);
  });

  it('saisons : les quatre sont présentes, décembre est en hiver', () => {
    const s = seasonsBreakdown([makeFlight('2025-12-01'), makeFlight('2025-07-14')]);
    expect(s.hiver.n).toBe(1);
    expect(s.été.n).toBe(1);
    expect(s.printemps).toEqual({ n: 0, minutes: 0 });
  });

  it('façons de voler : ordre canonique, puis inconnues, modes vides omis', () => {
    const rows = flightModes([
      makeFlight('2025-01-01', { mode: 'Moteur' }),
      makeFlight('2025-01-02', { mode: 'Zèbre' }),
      makeFlight('2025-01-03', { mode: 'Site' }),
      makeFlight('2025-01-04', { mode: null }),
    ]);
    expect(rows.map((r) => r.mode)).toEqual(['Site', 'Moteur', 'Zèbre']);
  });
});
