import { describe, expect, it } from 'vitest';
import type { Story } from '@/data/schema.gen';
import {
  beatenByKey,
  bilanCsvName,
  formatRecordValue,
  newSiteIds,
  reachView,
  recordCards,
  recordDelta,
  recordFlightKeys,
  recordRowsCss,
  siteTableRows,
  summaryText,
  wingTableRows,
  zoneBounds,
  zoneSummary,
} from '@/lib/bilanDetails';
import { makeFlight } from '../../tests/flightFactory';

type S = NonNullable<Story>;

const flight = (date: string, over: Parameters<typeof makeFlight>[1] = {}) => makeFlight(date, { pilotSlug: 'p', ...over });

const storyBase = {
  persona: { main: 'regulier', secondary: [], label: 'Régulier', why: 'Tu voles toutes les semaines.' },
  gap: { status: 'avance', ref_year: 2024, ongoing: false, minutes: 60, flights: 1, text: 'Belle forme !', note: '' },
  milestones: [],
  records_beaten: [],
  equivalences: [],
  new_sites: [],
  new_wings: [],
  map_zones: [],
  reach: null,
  texts: {
    synthese: 'S',
    rythme: 'R',
    quand: 'Q',
    ou: 'Où : ici.',
    matos: null,
    records: 'Tu as battu 1 record.',
    meilleure_journee: null,
    journee_type: null,
  },
} as unknown as S;

describe('bilanCsvName', () => {
  it('suit bilan-<slug>-<année>.csv', () => {
    expect(bilanCsvName('adrienm', 2025)).toBe('bilan-adrienm-2025.csv');
  });
});

describe('formats de records', () => {
  it('suit les formats du rapport', () => {
    expect(formatRecordValue('dur', '', 158.1)).toBe('2 h 38 min');
    expect(formatRecordValue('int', 'm', 2721)).toBe('2 721 m');
    expect(formatRecordValue('num', 'g', 2.5)).toBe('2,5 g');
  });
  it('écart : une décimale si l’entier arrondi serait nul', () => {
    expect(recordDelta('int', 'm', 180)).toBe('+180 m');
    expect(recordDelta('int', 'm', 0.4)).toBe('+0,4 m');
    expect(recordDelta('dur', '', 12)).toBe('+12 min');
  });
});

describe('records battus', () => {
  const story = {
    ...storyBase,
    records_beaten: [
      { metric: 'vitesse_max', value: 70, previous: 60, previous_year: 2024, date: '2025-05-01', flight: 'p-1' },
      { metric: 'duree', value: 100, previous: 90, previous_year: 2023, date: '2025-06-01', flight: null },
    ],
  } as S;

  it('range par critère du front et calcule l’écart', () => {
    const map = beatenByKey(story);
    expect(map.get('vitesseMax')).toMatchObject({ previousYear: 2024, delta: 10, flight: 'p-1' });
    expect(map.get('duree')?.flight).toBeNull();
    expect(map.has('g')).toBe(false);
  });

  it('liste les vols qui ont battu un record', () => {
    expect([...recordFlightKeys(story)]).toEqual(['p-1']);
  });

  it('marque le vol record dans le top 5 et situe l’année sinon', () => {
    const a = flight('2025-05-01', { key: 'p-1', speedMax: 70, ceilingM: 1000, durationMin: 50 });
    const b = flight('2025-05-02', { key: 'p-2', speedMax: 50, ceilingM: 1500, durationMin: 100 });
    const old = flight('2024-05-02', { key: 'p-0', ceilingM: 1700, speedMax: 60, durationMin: 90 });
    const cards = recordCards([a, b], [old, a, b], 2025, story);
    const speed = cards.find((c) => c.def.key === 'vitesseMax')!;
    expect(speed.beaten?.previousYear).toBe(2024);
    expect(speed.rows.map((r) => [r.flightKey, r.isNew])).toEqual([
      ['p-1', true],
      ['p-2', false],
    ]);
    const ceiling = cards.find((c) => c.def.key === 'plafond')!;
    expect(ceiling.beaten).toBeNull();
    expect(ceiling.previousBest).toEqual({ value: 1700, year: 2024 });
    // Critère sans mesure : pas de carte.
    expect(cards.some((c) => c.def.key === 'g')).toBe(false);
  });

  it('signale une mesure partielle au-delà de 20 % de vols sans la mesure', () => {
    const flights = [
      flight('2025-05-01', { ceilingM: 1000 }),
      flight('2025-05-02', { ceilingM: null }),
      flight('2025-05-03', { ceilingM: null }),
    ];
    const card = recordCards(flights, flights, 2025, storyBase).find((c) => c.def.key === 'plafond')!;
    expect(card.measured).toEqual({ ok: 1, total: 3 });
    expect(card.partial).toBe(true);
    const full = recordCards([flights[0]!], [flights[0]!], 2025, storyBase).find((c) => c.def.key === 'plafond')!;
    expect(full.partial).toBe(false);
  });
});

describe('zones et sites', () => {
  it('cadre une zone sur son emprise, sans jamais lire de vol', () => {
    expect(zoneBounds({ bbox: [5.5, 44.5, 5.9, 45] })).toEqual([5.5, 44.5, 5.9, 45]);
    expect(zoneBounds({ bbox: [2.17, 46.1, 2.17, 46.1] })).toEqual([2.17, 46.1, 2.17, 46.1]);
    expect(zoneBounds({ bbox: [Number.NaN, 1, 2, 3] })).toBeNull();
  });
  it('résume une zone', () => {
    expect(zoneSummary({ flights: 4, minutes: 388.7 })).toBe('4 vols · 6,5 h');
  });
  it('retrouve les sites découverts cette année et marque les lignes', () => {
    const flights = [
      flight('2025-05-01', { site: 'Alpha', siteId: 1, durationMin: 30 }),
      flight('2025-05-02', { site: 'Beta', siteId: 2, durationMin: 90 }),
      flight('2025-05-03', { site: 'Beta', siteId: 2, durationMin: 60 }),
      flight('2025-05-04', { site: null, siteId: null }),
    ];
    const story = { ...storyBase, new_sites: [{ site: 'Alpha', first_date: '2025-05-01', n: 1 }] } as S;
    expect(newSiteIds(story, flights)).toEqual([1]);
    const rows = siteTableRows(flights, story);
    expect(rows.map((r) => [r.site, r.siteId, r.n, r.isNew])).toEqual([
      ['Beta', 2, 2, false],
      ['Alpha', 1, 1, true],
    ]);
    expect(rows[1]!.firstDate).toBe('2025-05-01');
  });
  it('lit la portée', () => {
    expect(reachView(null)).toBeNull();
    expect(reachView({ main_site: 'A', farthest_site: 'B', km: 324.3, main_share: 0.5 })).toEqual({
      main: 'A',
      mainSharePct: 50,
      farthest: { site: 'B', km: 324.3 },
    });
    expect(reachView({ main_site: 'A', farthest_site: null, km: null, main_share: 1 })?.farthest).toBeNull();
  });
});

describe('voiles', () => {
  it('marque les nouvelles voiles', () => {
    const flights = [flight('2025-05-01', { wing: 'Neuve' }), flight('2025-05-02', { wing: 'Ancienne' })];
    const story = { ...storyBase, new_wings: [{ wing: 'Neuve', first_date: '2025-05-01' }] } as S;
    const rows = wingTableRows(flights, story);
    expect(rows.find((r) => r.wing === 'Neuve')).toMatchObject({ isNew: true, firstDate: '2025-05-01' });
    expect(rows.find((r) => r.wing === 'Ancienne')?.isNew).toBe(false);
  });
});

describe('recordRowsCss', () => {
  it('ne produit que des clés sûres', () => {
    const css = recordRowsCss(['a-1', 'x"]{}', 'b_2'], '.s');
    expect(css).toContain('.s .sr-vt-row[data-key="a-1"]');
    expect(css).toContain('data-key="b_2"');
    expect(css).not.toContain('x"');
    expect(recordRowsCss([], '.s')).toBe('');
  });
});

describe('summaryText', () => {
  const flights = [
    flight('2025-05-01', { site: 'A', durationMin: 90, distKm: 12 }),
    flight('2025-05-02', { site: 'B', durationMin: 30, distKm: 8 }),
  ];
  it('résume titre, chiffres, écart, portrait et faits sans réécrire les phrases', () => {
    const text = summaryText({ pilot: 'Zoé', year: 2025, ongoing: false, cutoff: '2025-12-31', flights, story: storyBase });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Bilan 2025 · Zoé');
    expect(lines[1]).toBe('2 vols · 2 h 00 de vol · 2 sites · 20 km');
    expect(lines).toContain('Belle forme !');
    expect(lines).toContain('Régulier : Tu voles toutes les semaines.');
    expect(lines).toContain('Tu as battu 1 record.');
    expect(lines).toContain('Où : ici.');
    // Au plus 3 faits : records, ou, rythme (matos est nul).
    expect(lines.slice(4)).toEqual(['Tu as battu 1 record.', 'Où : ici.', 'R']);
  });
  it('mentionne la date de coupure d’une année en cours et omet ce qui manque', () => {
    const story = { ...storyBase, gap: null, persona: null, texts: { ...storyBase.texts, records: null, ou: null, rythme: null, quand: null } } as S;
    const text = summaryText({ pilot: 'Zoé', year: 2026, ongoing: true, cutoff: '2026-03-04', flights: [flights[0]!], story });
    expect(text.split('\n')[0]).toBe('Bilan 2026 · Zoé (à date du 4 mars 2026)');
    expect(text.split('\n')).toHaveLength(2);
  });
});
