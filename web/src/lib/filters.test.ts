import { describe, expect, it } from 'vitest';
import type { Flight } from '@/data/flight';
import {
  activeShortcut,
  applyFilters,
  availableYears,
  cascadeOptions,
  countActiveFilters,
  defaultFilters,
  filtersEqual,
  hasFilterParams,
  historyModeFor,
  isDefaultFilters,
  lastTwelveMonths,
  parseFilters,
  parseIsoDate,
  periodShortcuts,
  thisYear,
  todayIso,
  writeFilters,
  yearPeriod,
  type Filters,
} from '@/lib/filters';
import { fixtureFlights } from '../../tests/fixtures';

let counter = 0;
function flight(over: Partial<Flight>): Flight {
  counter += 1;
  const date = over.date ?? '2024-06-15';
  return {
    key: `p-${counter}`,
    pilot: 'P',
    pilotSlug: 'p',
    activity: 'parapente',
    date,
    time: null,
    site: null,
    siteId: null,
    wing: null,
    instrument: null,
    mode: null,
    source: 'gpx',
    durationMin: 60,
    distKm: null,
    distCumKm: null,
    speedAvg: null,
    speedMax: null,
    ceilingM: null,
    gainM: null,
    varioMax: null,
    gMax: null,
    incomplete: false,
    syrideNum: counter,
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    weekday: 0,
    season: 'été',
    hour: null,
    dayKey: date,
    ...over,
  };
}

const f = (over: Partial<Filters>): Filters => ({ ...defaultFilters(), ...over });

const SAMPLE: Flight[] = [
  flight({
    pilotSlug: 'a',
    pilot: 'Alice',
    activity: 'parapente',
    date: '2023-05-01',
    wing: 'Rush',
    site: 'Mont',
    siteId: 0,
  }),
  flight({
    pilotSlug: 'a',
    pilot: 'Alice',
    activity: 'paramoteur',
    date: '2024-01-10',
    wing: 'Moteur',
    site: 'Plaine',
    siteId: 1,
  }),
  flight({
    pilotSlug: 'b',
    pilot: 'Bob',
    activity: 'parapente',
    date: '2024-06-15',
    wing: 'Rush',
    site: 'Mont',
    siteId: 0,
  }),
  flight({
    pilotSlug: 'b',
    pilot: 'Bob',
    activity: 'parapente',
    date: '2024-12-31',
    wing: null,
    site: null,
    siteId: null,
  }),
  flight({
    pilotSlug: 'c',
    pilot: 'Zoé',
    activity: 'paramoteur',
    date: '2025-03-03',
    wing: 'Moteur',
    site: 'Plaine',
    siteId: 1,
  }),
];

describe('applyFilters', () => {
  it('filtres par défaut : tous les vols', () => {
    expect(applyFilters(SAMPLE, defaultFilters())).toHaveLength(5);
    expect(isDefaultFilters(defaultFilters())).toBe(true);
  });
  it('pilotes (union) et activité', () => {
    expect(applyFilters(SAMPLE, f({ pilots: ['a', 'c'] }))).toHaveLength(3);
    expect(applyFilters(SAMPLE, f({ activity: 'paramoteur' }))).toHaveLength(2);
    expect(applyFilters(SAMPLE, f({ pilots: ['a'], activity: 'paramoteur' }))).toHaveLength(1);
  });
  it('période : bornes incluses, ouverte d’un côté', () => {
    expect(applyFilters(SAMPLE, f({ dateFrom: '2024-01-10', dateTo: '2024-12-31' }))).toHaveLength(3);
    expect(applyFilters(SAMPLE, f({ dateFrom: '2024-12-31' }))).toHaveLength(2);
    expect(applyFilters(SAMPLE, f({ dateTo: '2023-05-01' }))).toHaveLength(1);
    expect(applyFilters(SAMPLE, f({ dateFrom: '2025-01-01', dateTo: '2024-01-01' }))).toHaveLength(0);
  });
  it('voiles et sites : écartent les vols sans valeur', () => {
    expect(applyFilters(SAMPLE, f({ wings: ['Rush'] }))).toHaveLength(2);
    expect(applyFilters(SAMPLE, f({ sites: [0, 1] }))).toHaveLength(4);
    expect(applyFilters(SAMPLE, f({ sites: [99] }))).toHaveLength(0);
  });
  it('combine toutes les dimensions (ET entre dimensions)', () => {
    const r = applyFilters(
      SAMPLE,
      f({ pilots: ['b'], wings: ['Rush'], sites: [0], dateFrom: '2024-01-01', activity: 'parapente' }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.date).toBe('2024-06-15');
  });
  it('ne modifie pas l’entrée', () => {
    const copy = [...SAMPLE];
    applyFilters(SAMPLE, f({ pilots: ['a'] }));
    expect(SAMPLE).toEqual(copy);
  });
  it('compte les dimensions actives', () => {
    expect(countActiveFilters(defaultFilters())).toBe(0);
    expect(countActiveFilters(f({ dateFrom: '2024-01-01', dateTo: '2024-02-01', pilots: ['a'] }))).toBe(2);
  });
});

describe('cascadeOptions', () => {
  it('sans filtre : tous les comptes', () => {
    const o = cascadeOptions(SAMPLE, defaultFilters());
    expect(o.activity).toEqual({ tout: 5, parapente: 3, paramoteur: 2 });
    expect(o.pilots.map((p) => [p.value, p.count])).toEqual([
      ['a', 2],
      ['b', 2],
      ['c', 1],
    ]);
    expect(o.wings.map((w) => [w.value, w.count])).toEqual([
      ['Moteur', 2],
      ['Rush', 2],
    ]);
    expect(o.sites.map((s) => [s.value, s.label, s.count])).toEqual([
      [0, 'Mont', 2],
      [1, 'Plaine', 2],
    ]);
  });
  it('chaque dimension ignore son propre filtre mais applique les autres', () => {
    const filters = f({ pilots: ['a'], activity: 'paramoteur' });
    const o = cascadeOptions(SAMPLE, filters);
    // pilotes : filtre activité appliqué, pas le filtre pilotes
    expect(o.pilots.map((p) => [p.value, p.count])).toEqual([
      ['a', 1],
      ['c', 1],
    ]);
    // activité : filtre pilotes appliqué, pas le filtre activité
    expect(o.activity).toEqual({ tout: 2, parapente: 1, paramoteur: 1 });
    // voiles et sites : pilotes ET activité appliqués
    expect(o.wings.map((w) => [w.value, w.count])).toEqual([['Moteur', 1]]);
    expect(o.sites.map((s) => [s.value, s.count])).toEqual([[1, 1]]);
  });
  it('la période restreint les options des autres dimensions', () => {
    const o = cascadeOptions(SAMPLE, f({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }));
    expect(o.pilots.map((p) => [p.value, p.count])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(o.activity.tout).toBe(3);
  });
  it('garde les valeurs sélectionnées même sans vol (compteur 0)', () => {
    const o = cascadeOptions(SAMPLE, f({ pilots: ['inconnu'], wings: ['Fantôme'], sites: [42] }));
    expect(o.pilots.find((p) => p.value === 'inconnu')).toEqual({
      value: 'inconnu',
      label: 'inconnu',
      count: 0,
    });
    expect(o.wings.find((w) => w.value === 'Fantôme')?.count).toBe(0);
    expect(o.sites.find((s) => s.value === 42)).toEqual({ value: 42, label: 'Site 42', count: 0 });
  });
  it('trie les pilotes par nom (insensible aux accents), les sites par compteur', () => {
    const flights = [
      flight({ pilotSlug: 'z', pilot: 'zoé' }),
      flight({ pilotSlug: 'e', pilot: 'Émile' }),
      flight({ pilotSlug: 'a', pilot: 'Alice' }),
      flight({ pilotSlug: 'a', pilot: 'Alice', siteId: 5, site: 'B' }),
      flight({ pilotSlug: 'a', pilot: 'Alice', siteId: 6, site: 'A' }),
      flight({ pilotSlug: 'a', pilot: 'Alice', siteId: 6, site: 'A' }),
    ];
    const o = cascadeOptions(flights, defaultFilters());
    expect(o.pilots.slice(0, 3).map((p) => p.label)).toEqual(['Alice', 'Émile', 'zoé']);
    expect(o.sites.map((s) => s.value)).toEqual([6, 5]);
  });
});

describe('cascade sur les fixtures', () => {
  const flights = fixtureFlights();
  it('la somme des compteurs d’une dimension = vols ayant une valeur', () => {
    const o = cascadeOptions(flights, defaultFilters());
    expect(o.activity.tout).toBe(flights.length);
    expect(o.activity.parapente + o.activity.paramoteur).toBe(flights.length);
    expect(o.pilots.reduce((s, p) => s + p.count, 0)).toBe(flights.length);
    expect(o.sites.reduce((s, p) => s + p.count, 0)).toBe(flights.filter((x) => x.siteId !== null).length);
  });
  it('choisir une option de la cascade donne exactement son compteur', () => {
    const base = f({ activity: 'parapente' });
    const o = cascadeOptions(flights, base);
    for (const site of o.sites) {
      expect(applyFilters(flights, { ...base, sites: [site.value] })).toHaveLength(site.count);
    }
    for (const pilot of o.pilots) {
      expect(applyFilters(flights, { ...base, pilots: [pilot.value] })).toHaveLength(pilot.count);
    }
  });
});

describe('raccourcis de période', () => {
  it('cette année, 12 derniers mois, année N', () => {
    expect(thisYear('2026-11-15')).toMatchObject({ dateFrom: '2026-01-01', dateTo: null });
    expect(lastTwelveMonths('2026-11-15')).toMatchObject({ dateFrom: '2025-11-16', dateTo: '2026-11-15' });
    expect(yearPeriod(2024)).toMatchObject({ dateFrom: '2024-01-01', dateTo: '2024-12-31' });
  });
  it('12 mois depuis un 29 février', () => {
    expect(lastTwelveMonths('2024-02-29').dateFrom).toBe('2023-03-01');
    expect(lastTwelveMonths('2025-01-01').dateFrom).toBe('2024-01-02');
  });
  it('détecte le raccourci actif', () => {
    const shortcuts = periodShortcuts('2026-11-15');
    expect(activeShortcut(f({ dateFrom: '2026-01-01' }), shortcuts)?.id).toBe('annee-courante');
    expect(activeShortcut(f({ dateFrom: '2026-01-02' }), shortcuts)).toBeNull();
  });
  it('années disponibles, récentes d’abord', () => {
    expect(availableYears(SAMPLE)).toEqual([2025, 2024, 2023]);
  });
  it('todayIso suit la date locale', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('query string', () => {
  const full: Filters = {
    pilots: ['j2f', 'tof-torsac'],
    activity: 'paramoteur',
    dateFrom: '2024-01-01',
    dateTo: '2024-12-31',
    wings: ['Ozone Rush 6', 'A, B & C'],
    sites: [12, 7],
  };

  it('défauts absents de l’URL', () => {
    expect(writeFilters('', defaultFilters())).toBe('');
    expect(writeFilters('?activite=tout', defaultFilters())).toBe('');
  });
  it('paramètres courts et lisibles', () => {
    expect(writeFilters('', f({ activity: 'parapente', dateFrom: '2024-01-01' }))).toBe(
      '?activite=parapente&du=2024-01-01',
    );
    expect(writeFilters('', f({ pilots: ['j2f'], sites: [3] }))).toBe('?pilote=j2f&site=3');
  });
  it('aller-retour complet, y compris caractères spéciaux', () => {
    const search = writeFilters('', full);
    expect(parseFilters(search)).toEqual(full);
    expect(parseFilters(search.slice(1))).toEqual(full);
  });
  it('aller-retour pour chaque dimension isolément', () => {
    const cases: Partial<Filters>[] = [
      { pilots: ['a'] },
      { activity: 'parapente' },
      { activity: 'paramoteur' },
      { dateFrom: '2020-02-29' },
      { dateTo: '2020-02-29' },
      { wings: ['é/è?&=#'] },
      { sites: [0] },
    ];
    for (const c of cases) expect(parseFilters(writeFilters('', f(c)))).toEqual(f(c));
  });
  it('conserve l’ordre et les paramètres étrangers', () => {
    const out = writeFilters('?x=1&site=9&pilote=old', f({ sites: [2, 1] }));
    expect(out).toBe('?site=2&site=1&x=1');
    expect(parseFilters(out).sites).toEqual([2, 1]);
  });
  it('ignore les valeurs invalides', () => {
    const p = parseFilters(
      '?activite=vol&du=2024-13-01&au=hier&site=abc&site=4&site=4&site=-1&pilote=&pilote=a&pilote=a',
    );
    expect(p).toEqual(f({ sites: [4], pilots: ['a'] }));
  });
  it('valide les dates du calendrier', () => {
    expect(parseIsoDate('2024-02-29')).toBe('2024-02-29');
    expect(parseIsoDate('2023-02-29')).toBeNull();
    expect(parseIsoDate('2024-1-1')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });
  it('détecte la présence de paramètres de filtre', () => {
    expect(hasFilterParams('?x=1')).toBe(false);
    expect(hasFilterParams('?site=1')).toBe(true);
    expect(hasFilterParams('')).toBe(false);
  });
  it('filtersEqual compare en profondeur', () => {
    expect(filtersEqual(full, { ...full, pilots: [...full.pilots] })).toBe(true);
    expect(filtersEqual(full, { ...full, sites: [7, 12] })).toBe(false);
  });
});

describe('historyModeFor', () => {
  it('push la première fois, replace pour une modification rapide', () => {
    expect(historyModeFor(1000, null)).toBe('push');
    expect(historyModeFor(1500, 1000)).toBe('replace');
    expect(historyModeFor(1800, 1000)).toBe('push');
    expect(historyModeFor(2000, 1000, 5000)).toBe('replace');
  });
});
