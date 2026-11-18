import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  candidates,
  comparePool,
  cumulativeCurves,
  dayOfLeapYear,
  deltasVsFirst,
  kpisForMode,
  parseCompareParams,
  pilotYears,
  resolveSelection,
  rhythmSummary,
  seriesStats,
  seriesStyle,
  writeCompareParams,
} from '@/lib/compare';
import { defaultFilters } from '@/lib/filters';
import { makeFlight } from '../../tests/flightFactory';

const mk = (date: string, slug: string, over: Parameters<typeof makeFlight>[1] = {}) =>
  makeFlight(date, { pilot: slug.toUpperCase(), pilotSlug: slug, ...over });

const flights = [
  mk('2024-05-04', 'a', { siteId: 1, site: 'Alpha', durationMin: 60 }),
  mk('2024-05-05', 'a', { siteId: 1, site: 'Alpha', durationMin: 60 }),
  mk('2025-05-03', 'a', { siteId: 2, site: 'Beta', durationMin: 120 }),
  mk('2025-06-03', 'b', { siteId: 1, site: 'Alpha', durationMin: 30 }),
  mk('2025-06-04', 'c', { siteId: 3, site: 'Gamma', durationMin: 30 }),
  mk('2025-06-05', 'c', { siteId: 3, site: 'Gamma', durationMin: 30 }),
  mk('2025-06-06', 'c', { siteId: 3, site: 'Gamma', durationMin: 30 }),
];

describe('paramètres d’URL', () => {
  it('lit le mode et les identifiants, avec valeurs par défaut sûres', () => {
    expect(parseCompareParams(new URLSearchParams('mode=sites&ids=1,2,1'))).toEqual({ mode: 'sites', ids: ['1', '2'] });
    expect(parseCompareParams(new URLSearchParams('mode=zzz'))).toEqual({ mode: 'pilotes', ids: null });
    expect(parseCompareParams(new URLSearchParams('mode=sites&ids='))).toEqual({ mode: 'sites', ids: [] });
  });
  it('écrit sans casser les paramètres de filtre', () => {
    const out = writeCompareParams(new URLSearchParams('activite=paramoteur&ids=x'), { mode: 'pilotes', ids: ['a', 'b'] });
    expect(out.get('activite')).toBe('paramoteur');
    expect(out.get('ids')).toBe('a,b');
    const bare = writeCompareParams(new URLSearchParams('mode=sites&ids=1,2'), { mode: 'pilotes', ids: null });
    expect(bare.toString()).toBe('');
    // `ids` présent mais vide : conservé dans l'URL (sélection vide voulue).
    const empty = writeCompareParams(new URLSearchParams(), { mode: 'sites', ids: [] });
    expect(parseCompareParams(empty)).toEqual({ mode: 'sites', ids: [] });
  });
});

describe('population et sélection', () => {
  it('omet la dimension remplacée par le sélecteur', () => {
    const f = { ...defaultFilters(), pilots: ['a'], dateFrom: '2025-01-01' };
    const pool = comparePool('pilotes', flights, f);
    expect(new Set(pool.map((x) => x.pilotSlug))).toEqual(new Set(['a', 'b', 'c']));
    expect(pool.every((x) => x.year >= 2025)).toBe(true);
  });
  it('mode Années ignore pilotes et période, mode Sites ignore les sites', () => {
    const f = { ...defaultFilters(), pilots: ['a'], dateFrom: '2025-01-01', sites: [1] };
    expect(comparePool('annees', flights, { ...f, sites: [] })).toHaveLength(flights.length);
    expect(comparePool('sites', flights, { ...f, sites: [3] }).every((x) => x.pilotSlug === 'a' && x.year >= 2025)).toBe(true);
  });

  it('propose par défaut les deux plus actifs, en le disant', () => {
    const sel = resolveSelection('pilotes', null, flights);
    expect(sel).toMatchObject({ isDefault: true, valid: true, ids: ['a', 'c'] });
    expect(resolveSelection('sites', null, flights).ids).toEqual(['1', '3']);
  });
  it('respecte une sélection vide (ids présent mais vide) au lieu de reproposer le défaut', () => {
    const pilotes = resolveSelection('pilotes', [], flights);
    expect(pilotes).toMatchObject({ isDefault: false, valid: false, ids: [], problem: 'Choisir 2 à 4 pilotes.' });
    const sites = resolveSelection('sites', [], flights);
    expect(sites).toMatchObject({ isDefault: false, ids: [], problem: 'Choisir 2 à 4 sites.' });
    expect(resolveSelection('annees', [], flights)).toMatchObject({ isDefault: false, valid: false, ids: [] });
  });
  it('mode Années : le défaut est le pilote le plus actif parmi ceux qui ont au moins deux années', () => {
    const data = [
      ...Array.from({ length: 6 }, (_, i) => mk(`2025-05-0${i + 1}`, 'solo')),
      mk('2024-05-01', 'duo'),
      mk('2025-05-01', 'duo'),
      mk('2023-05-01', 'duo'),
    ];
    expect(candidates('annees', data)[0]!.value).toBe('solo');
    expect(resolveSelection('annees', null, data)).toMatchObject({
      isDefault: true,
      valid: true,
      ids: ['duo', '2024', '2025'],
    });
    const onlySingles = [mk('2025-05-01', 'x'), mk('2025-05-02', 'y')];
    expect(resolveSelection('annees', null, onlySingles)).toMatchObject({ isDefault: true, valid: false, ids: [] });
  });
  it('écarte les inconnus, plafonne à 4 et signale l’insuffisance', () => {
    expect(resolveSelection('pilotes', ['a', 'zz'], flights)).toMatchObject({ valid: false, isDefault: false });
    expect(resolveSelection('pilotes', ['a', 'b', 'c'], flights).ids).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: 6 }, (_, i) => mk('2025-01-01', `p${i}`));
    expect(resolveSelection('pilotes', many.map((f) => f.pilotSlug), many).ids).toHaveLength(4);
  });
  it('mode Années : pilote et années, défaut = pilote à plusieurs années', () => {
    expect(resolveSelection('annees', null, flights)).toMatchObject({ valid: true, ids: ['a', '2024', '2025'], isDefault: true });
    expect(resolveSelection('annees', ['a', '2025', '1999'], flights)).toMatchObject({ valid: false });
    expect(resolveSelection('annees', ['a', '2025', '2024'], flights).ids).toEqual(['a', '2024', '2025']);
    expect(pilotYears(flights, 'a')).toEqual([2025, 2024]);
  });
  it('liste les candidats par activité décroissante', () => {
    expect(candidates('pilotes', flights).map((c) => c.value)).toEqual(['a', 'c', 'b']);
  });
});

describe('séries et styles', () => {
  it('construit pilotes, sites et années', () => {
    expect(buildSeries('pilotes', ['a', 'c'], flights, '2025-12-28').map((s) => [s.label, s.flights.length])).toEqual([
      ['A', 3],
      ['C', 3],
    ]);
    expect(buildSeries('sites', ['3'], flights, '2025-12-28')[0]?.label).toBe('Gamma');
    const years = buildSeries('annees', ['a', '2024', '2025'], flights, '2025-12-28');
    expect(years.map((s) => s.flights.length)).toEqual([2, 1]);
    expect(years[1]?.span).toEqual({ from: '2025-01-01', to: '2025-12-28' });
    expect(years[0]?.span?.to).toBe('2024-12-31');
  });
  it('donne une couleur et un motif distincts à chaque série', () => {
    const s = [0, 1, 2, 3].map((i) => seriesStyle('pilotes', i));
    expect(s.map((x) => x.colorKey)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(new Set(s.map((x) => JSON.stringify(x.dash))).size).toBe(4);
    expect(seriesStyle('annees', 0).colorKey).toBe('y0');
    expect(seriesStyle('annees', 1).dash).toEqual([7, 4]);
    expect(seriesStyle('annees', 3).colorKey).toBe('c4');
  });
});

describe('chiffres et écarts', () => {
  it('statistiques d’une série', () => {
    const s = seriesStats(flights.filter((f) => f.pilotSlug === 'a'));
    expect(s.kpis.nFlights).toBe(3);
    expect(s.hours).toBeCloseTo(4);
    expect(s.pilots).toBe(1);
    expect(s.parapenteShare).toBe(100);
  });
  it('écarts par rapport à la première série', () => {
    expect(deltasVsFirst([100, 150, 50, null])).toEqual([null, 50, -50, null]);
    expect(deltasVsFirst([0, 5])).toEqual([null, null]);
  });
  it('lignes de KPI selon le mode', () => {
    expect(kpisForMode('sites').map((k) => k.id)).toContain('pilotes');
    expect(kpisForMode('sites').map((k) => k.id)).not.toContain('sites');
    expect(kpisForMode('pilotes').map((k) => k.id)).toContain('sites');
  });
});

describe('rhythmSummary', () => {
  it('régularité, série et week-end', () => {
    const f = [mk('2025-05-03', 'a'), mk('2025-05-04', 'a'), mk('2025-05-19', 'a')]; // sam., dim., lun.
    const r = rhythmSummary(f)!;
    expect(r.weeksActive).toBe(2);
    expect(r.weeksTotal).toBe(4);
    expect(r.regularity).toBeCloseTo(0.5);
    expect(r.streakDays).toBe(2);
    expect(r.weekendShare).toBeCloseTo(2 / 3);
  });
  it('utilise la période fournie et renvoie null sans vol', () => {
    const r = rhythmSummary([mk('2025-05-03', 'a')], { from: '2025-01-01', to: '2025-12-31' })!;
    expect(r.weeksTotal).toBe(53);
    expect(r.streakDays).toBe(1);
    expect(rhythmSummary([])).toBeNull();
  });
});

describe('cumulativeCurves', () => {
  it('modes Pilotes et Sites : un point par jour, valeurs reportées', () => {
    const s = buildSeries('pilotes', ['a', 'b'], flights, '2025-12-28');
    const c = cumulativeCurves('pilotes', s, '2025-12-28');
    expect(c.kind).toBe('date');
    expect(c.axis[0]).toBe('2024-05-04');
    expect(c.axis[c.axis.length - 1]).toBe('2025-06-03');
    const a = c.series[0]!.values;
    expect(a[0]).toBeCloseTo(1);
    expect(a[a.length - 1]).toBeCloseTo(4);
    expect(c.series[1]!.values[0]).toBe(0);
  });
  it('mode Années : axe de 366 jours, l’année en cours s’arrête à la date des données', () => {
    const s = buildSeries('annees', ['a', '2024', '2025'], flights, '2025-05-10');
    const c = cumulativeCurves('annees', s, '2025-05-10');
    expect(c.kind).toBe('jour-annee');
    expect(c.axis).toHaveLength(366);
    expect(c.series[0]!.values[365]).toBeCloseTo(2);
    expect(c.series[1]!.values[dayOfLeapYear('2025-05-10')]).toBeCloseTo(2);
    expect(c.series[1]!.values[dayOfLeapYear('2025-05-11')]).toBeNull();
  });
  it('gère l’absence de vol', () => {
    expect(cumulativeCurves('pilotes', [{ id: 'a', label: 'A', flights: [], span: null }], '2025-01-01').axis).toEqual([]);
  });
});
