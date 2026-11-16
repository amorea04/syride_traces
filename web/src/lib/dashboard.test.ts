import { describe, expect, it } from 'vitest';
import { defaultFilters } from '@/lib/filters';
import {
  characteristics,
  currentPeriodRange,
  dateOfPosition,
  stepValueAt,
  evolution,
  filteredPeriod,
  formatCharacteristic,
  kpiBand,
  latestFlights,
  periodActivity,
  previousPeriod,
  recentRecords,
  referenceDate,
  seasonGap,
  seasonPhrase,
  statBars,
} from '@/lib/dashboard';
import { xOfDate } from '@/lib/rhythm';
import { groupFlights } from '@/lib/stats';
import { makeFlight } from '../../tests/flightFactory';

describe('referenceDate', () => {
  it('prend la date de mise à jour, sinon le dernier vol', () => {
    const flights = [makeFlight('2026-03-01'), makeFlight('2026-05-04')];
    expect(referenceDate('2026-06-10T08:00:00Z', flights)).toBe('2026-06-10');
    expect(referenceDate(null, flights)).toBe('2026-05-04');
  });
});

describe('périodes', () => {
  it('période précédente : même durée juste avant', () => {
    expect(previousPeriod('2026-03-01', '2026-03-31', '2026-06-10')).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
    expect(previousPeriod('2026-01-01', '2026-12-31', '2026-06-10')).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });
  it('dateFrom seul : jusqu’à la date de référence ; dateTo seul ou rien : pas de période', () => {
    expect(filteredPeriod('2026-06-01', null, '2026-06-10')).toEqual({ from: '2026-06-01', to: '2026-06-10' });
    expect(previousPeriod('2026-06-01', null, '2026-06-10')).toEqual({ from: '2026-05-22', to: '2026-05-31' });
    expect(previousPeriod(null, '2026-06-01', '2026-06-10')).toBeNull();
    expect(previousPeriod(null, null, '2026-06-10')).toBeNull();
    expect(filteredPeriod('2026-06-20', '2026-06-10', '2026-06-30')).toBeNull();
  });
});

describe('kpiBand', () => {
  const flights = [
    makeFlight('2026-01-10', { durationMin: 60, ceilingM: 1500, distCumKm: 10, pilot: 'A', pilotSlug: 'a', site: 'S1' }),
    makeFlight('2026-02-10', { durationMin: 60, ceilingM: 2000, distCumKm: 20, pilot: 'A', pilotSlug: 'a', site: 'S2' }),
    makeFlight('2026-02-12', { durationMin: 120, ceilingM: 1000, pilot: 'B', pilotSlug: 'b', site: 'S2' }),
    makeFlight('2025-12-20', { durationMin: 60, ceilingM: 3000, pilot: 'A', pilotSlug: 'a', site: 'S1' }),
  ];
  it('sans période : valeurs seules', () => {
    const r = kpiBand(flights, flights, defaultFilters(), '2026-03-01');
    expect(r.deltas).toBeNull();
    expect(r.current.flights).toBe(4);
    expect(r.current.minutes).toBe(300);
    expect(r.current.sites).toBe(2);
    expect(r.current.pilots).toBe(2);
    expect(r.current.distanceKm).toBe(30);
    expect(r.current.ceilingM).toBe(3000);
    expect(r.current.ceilingFlightKey).toBe(flights[3]?.key);
  });
  it('avec période : variation vs même durée juste avant, filtres hors période conservés', () => {
    const filters = { ...defaultFilters(), dateFrom: '2026-02-01', dateTo: '2026-02-28' };
    const selection = flights.filter((f) => f.date >= '2026-02-01' && f.date <= '2026-02-28');
    const r = kpiBand(flights, selection, filters, '2026-03-01');
    expect(r.previousPeriod).toEqual({ from: '2026-01-04', to: '2026-01-31' });
    expect(r.previous?.flights).toBe(1);
    expect(r.deltas?.vols).toBeCloseTo(100);
    expect(r.deltas?.heures).toBeCloseTo(200);
    expect(r.deltas?.plafond).toBeCloseTo(33.33, 1);
    const onlyB = kpiBand(flights, selection, { ...filters, pilots: ['b'] }, '2026-03-01');
    expect(onlyB.previous?.flights).toBe(0);
    expect(onlyB.deltas?.vols).toBeNull();
  });
  it('sélection vide', () => {
    const r = kpiBand([], [], defaultFilters(), '2026-03-01');
    expect(r.current.flights).toBe(0);
    expect(r.current.ceilingM).toBeNull();
    expect(r.current.distanceKm).toBeNull();
  });
});

describe('seasonGap', () => {
  const flights = [
    makeFlight('2025-01-10', { durationMin: 600 }),
    makeFlight('2025-09-10', { durationMin: 600 }),
    makeFlight('2026-01-15', { durationMin: 1200 }),
    makeFlight('2026-04-01', { durationMin: 60 }),
  ];
  it('compare à date, avance en heures', () => {
    const gap = seasonGap(flights, '2026-05-01');
    expect(gap.minutes).toBe(1260);
    expect(gap.previousMinutes).toBe(600);
    expect(gap.gapMinutes).toBe(660);
    expect(gap.curve[0]).toEqual([0, 0]);
    expect(gap.curve.at(-1)?.[1]).toBeCloseTo(21);
    expect(gap.previousCurve.at(-1)).toEqual([1, 20]);
    expect(seasonPhrase(gap)).toMatch(/^Le groupe a 11\s*h d.avance sur 2025 à date\.$/);
  });
  it('retard, autant, pas de comparaison', () => {
    const late = [makeFlight('2025-02-01', { durationMin: 600 }), makeFlight('2026-02-01', { durationMin: 120 })];
    expect(seasonPhrase(seasonGap(late, '2026-05-01'))).toMatch(/Le groupe a 8\s*h de retard sur 2025/);
    expect(seasonPhrase(seasonGap([makeFlight('2026-02-01')], '2026-05-01'))).toContain('pas de comparaison');
    const even = [makeFlight('2025-02-01', { durationMin: 60 }), makeFlight('2026-02-01', { durationMin: 60 })];
    expect(seasonPhrase(seasonGap(even, '2026-05-01'))).toContain('autant');
    expect(seasonPhrase(seasonGap([], '2026-05-01'))).toContain('Aucun vol');
  });
  it('29 février : comparaison sur le jour et le mois', () => {
    const f = [makeFlight('2027-02-28', { durationMin: 60 }), makeFlight('2027-03-01', { durationMin: 60 })];
    expect(seasonGap(f, '2028-02-29').previousMinutes).toBe(60);
  });
});

describe('position dans l’année', () => {
  it('dateOfPosition inverse xOfDate et stepValueAt lit l’escalier', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-03-31', '2026-12-31', '2024-02-29']) {
      expect(dateOfPosition(xOfDate(iso), Number(iso.slice(0, 4)))).toBe(iso);
    }
    const curve: [number, number][] = [[0, 0], [0.5, 3], [1, 5]];
    expect(stepValueAt(curve, 0.4)).toBe(0);
    expect(stepValueAt(curve, 0.5)).toBe(3);
    expect(stepValueAt(curve, 0.9)).toBe(3);
  });
});

describe('periodActivity', () => {
  const flights = [
    makeFlight('2026-06-08', { pilot: 'A', site: 'X', durationMin: 30 }),
    makeFlight('2026-06-09', { pilot: 'B', site: 'X', durationMin: 90 }),
    makeFlight('2026-06-03', { pilot: 'C', site: 'Y', durationMin: 200 }),
    makeFlight('2026-05-31', { pilot: 'D', site: 'Z', durationMin: 10 }),
  ];
  it('bornes du mois et de la semaine (lundi)', () => {
    expect(currentPeriodRange('2026-06-10', 'mois')).toEqual({ from: '2026-06-01', to: '2026-06-10' });
    expect(currentPeriodRange('2026-06-10', 'semaine')).toEqual({ from: '2026-06-08', to: '2026-06-10' });
  });
  it('statistiques', () => {
    const month = periodActivity(flights, '2026-06-10', 'mois');
    expect(month.pilots).toBe(3);
    expect(month.flights).toBe(3);
    expect(month.minutes).toBe(320);
    expect(month.topSite).toEqual({ site: 'X', flights: 2 });
    expect(month.longest?.value).toBe(200);
    const week = periodActivity(flights, '2026-06-10', 'semaine');
    expect(week.flights).toBe(2);
    expect(week.longest?.value).toBe(90);
    const none = periodActivity(flights, '2026-07-20', 'semaine');
    expect(none.flights).toBe(0);
    expect(none.topSite).toBeNull();
    expect(none.longest).toBeNull();
  });
});

describe('latestFlights', () => {
  it('trie par date puis heure décroissantes et limite', () => {
    const a = makeFlight('2026-06-01', { time: '09:00' });
    const b = makeFlight('2026-06-01', { time: '15:00' });
    const c = makeFlight('2026-06-02', { time: null });
    const d = makeFlight('2026-05-01');
    expect(latestFlights([a, d, b, c], 3)).toEqual([c, b, a]);
    expect(latestFlights([], 3)).toEqual([]);
  });
});

describe('recentRecords', () => {
  const base = { pilot: 'A', pilotSlug: 'a' };
  it('record battu dans la fenêtre contre les vols antérieurs', () => {
    const flights = [
      makeFlight('2026-01-01', { ...base, ceilingM: 1000, gMax: 2 }),
      makeFlight('2026-06-01', { ...base, ceilingM: 1500, gMax: 2 }),
      makeFlight('2026-06-05', { ...base, ceilingM: 1800, gMax: 1.5 }),
    ];
    const r = recentRecords(flights, '2026-06-10');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ metric: 'plafond', value: 1800, previous: 1000 });
    expect(r[0]?.flight.date).toBe('2026-06-05');
  });
  it('un premier vol, une égalité, une mesure ≤ 0 ou nulle ne sont pas des records', () => {
    const flights = [
      makeFlight('2026-06-01', { ...base, ceilingM: 1500 }),
      makeFlight('2026-01-01', { pilot: 'B', pilotSlug: 'b', ceilingM: 1000, varioMax: 3 }),
      makeFlight('2026-06-02', { pilot: 'B', pilotSlug: 'b', ceilingM: 1000, varioMax: 0, gMax: null }),
    ];
    expect(recentRecords(flights, '2026-06-10')).toEqual([]);
  });
  it('sépare les disciplines, ignore les vols hors fenêtre et futurs', () => {
    const flights = [
      makeFlight('2026-01-01', { ...base, activity: 'parapente', ceilingM: 3000 }),
      makeFlight('2026-06-02', { ...base, activity: 'paramoteur', ceilingM: 500 }),
      makeFlight('2026-01-02', { ...base, activity: 'paramoteur', ceilingM: 400 }),
      makeFlight('2026-04-01', { ...base, activity: 'parapente', ceilingM: 4000 }),
      makeFlight('2026-07-01', { ...base, activity: 'paramoteur', ceilingM: 9000 }),
    ];
    const r = recentRecords(flights, '2026-06-10');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ activity: 'paramoteur', value: 500, previous: 400 });
  });
});

describe('characteristics', () => {
  it('moyenne, médiane, max ignorent null et ≤ 0 ; le max pointe le vol record', () => {
    const flights = [
      makeFlight('2026-01-01', { durationMin: 60, ceilingM: 1000 }),
      makeFlight('2026-01-02', { durationMin: 120, ceilingM: 3000 }),
      makeFlight('2026-01-03', { durationMin: 180, ceilingM: 0 }),
      makeFlight('2026-01-04', { durationMin: null, ceilingM: null }),
    ];
    const rows = characteristics(flights);
    const duree = rows.find((r) => r.id === 'duree');
    expect(duree).toMatchObject({ count: 3, mean: 120, median: 120, max: 180 });
    expect(duree?.maxFlight?.key).toBe(flights[2]?.key);
    const plafond = rows.find((r) => r.id === 'plafond');
    expect(plafond).toMatchObject({ count: 2, mean: 2000, median: 2000, max: 3000 });
    expect(rows.find((r) => r.id === 'g')).toMatchObject({ count: 0, mean: null, max: null, maxFlight: null });
    expect(formatCharacteristic({ unit: 'min', digits: 0 }, 135)).toMatch(/2.h.15.min/);
  });
  it('sélection vide', () => {
    expect(characteristics([]).every((r) => r.max === null)).toBe(true);
  });
});

describe('statBars', () => {
  const flights = [
    makeFlight('2025-03-01', { pilot: 'Zoé', pilotSlug: 'zoe', site: 'S1', siteId: 1, wing: 'W1' }),
    makeFlight('2026-03-02', { pilot: 'Zoé', pilotSlug: 'zoe', site: 'S1', siteId: 1, wing: 'W1' }),
    makeFlight('2026-04-02', { pilot: 'Abel', pilotSlug: 'abel', site: 'S2', siteId: 2, wing: 'W2' }),
  ];
  it('pilote : décroissant, filtre pilote et surlignage', () => {
    const { bars } = statBars(groupFlights(flights, 'pilote'), 'nb_vols', 'pilote', flights);
    expect(bars.map((b) => [b.label, b.value])).toEqual([['Zoé', 2], ['Abel', 1]]);
    expect(bars[0]?.target).toEqual({ pilots: ['zoe'] });
    expect(bars[0]?.highlight).toEqual({ kind: 'pilot', pilotSlug: 'zoe' });
  });
  it('top N, site, voile', () => {
    const r = statBars(groupFlights(flights, 'site'), 'nb_vols', 'site', flights, 1);
    expect(r.bars).toHaveLength(1);
    expect(r.hidden).toBe(1);
    expect(r.bars[0]?.target).toEqual({ sites: [1] });
    const w = statBars(groupFlights(flights, 'voile'), 'nb_vols', 'voile', flights, null);
    expect(w.bars[0]?.target).toEqual({ wings: ['W1'] });
  });
  it('année : chronologique, filtre sur l’année ; mois : pas de filtre', () => {
    const y = statBars(groupFlights(flights, 'annee'), 'nb_vols', 'annee', flights);
    expect(y.bars.map((b) => b.key)).toEqual(['2025', '2026']);
    expect(y.bars[1]?.target).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    const m = statBars(groupFlights(flights, 'mois'), 'nb_vols', 'mois', flights);
    expect(m.bars.map((b) => b.label)).toEqual(['mars', 'avr.']);
    expect(m.bars.every((b) => b.target === null)).toBe(true);
  });
  it('catégories sans valeur écartées ; vide sans plantage', () => {
    const r = statBars(groupFlights(flights, 'pilote'), 'max_plafond', 'pilote', flights);
    expect(r.bars).toEqual([]);
    expect(statBars([], 'nb_vols', 'site', []).bars).toEqual([]);
  });
});

describe('evolution', () => {
  const flights = [
    makeFlight('2026-01-10', { durationMin: 60, pilot: 'A', pilotSlug: 'a', activity: 'parapente' }),
    makeFlight('2026-03-10', { durationMin: 120, pilot: 'B', pilotSlug: 'b', activity: 'paramoteur' }),
    makeFlight('2026-03-11', { durationMin: 60, pilot: 'A', pilotSlug: 'a', activity: 'parapente' }),
  ];
  it('mois sans vol à 0, mensuel puis cumulé', () => {
    const m = evolution(flights, 'none', false);
    expect(m.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(m.series).toHaveLength(1);
    expect(m.series[0]?.hours).toEqual([1, 0, 3]);
    expect(m.series[0]?.flights).toEqual([1, 0, 2]);
    const c = evolution(flights, 'none', true);
    expect(c.series[0]?.hours).toEqual([1, 1, 4]);
    expect(c.series[0]?.flights).toEqual([1, 1, 3]);
  });
  it('par activité et par pilote (top 8 + Autres)', () => {
    const act = evolution(flights, 'activity', false);
    expect(act.series.map((s) => s.name)).toEqual(['Parapente', 'Paramoteur']);
    const many = Array.from({ length: 10 }, (_, i) =>
      makeFlight('2026-01-10', { pilot: `P${i}`, pilotSlug: `p${i}`, durationMin: 60 + i }),
    );
    const byPilot = evolution(many, 'pilot', false);
    expect(byPilot.series).toHaveLength(9);
    expect(byPilot.series.at(-1)?.name).toBe('Autres');
    expect(byPilot.series[0]?.name).toBe('P9');
  });
  it('sélection vide', () => {
    expect(evolution([], 'pilot', true)).toEqual({ months: [], series: [] });
  });
});
