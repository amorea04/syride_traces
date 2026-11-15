import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decimalHour, decodeFlights, seasonOfMonth, weekdayOf } from '@/data/flight';
import type { FlightsFile, InsightsFile, MetaFile, SitesFile } from '@/data/schema.gen';

const DIR = join(import.meta.dirname, '../../tests/fixtures/data');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T;
const flightsName = readdirSync(DIR).find((f) => /^flights\.[0-9a-f]+\.json$/.test(f)) ?? '';
const sitesName = readdirSync(DIR).find((f) => /^sites\.[0-9a-f]+\.json$/.test(f)) ?? '';

const flightsFile = read<FlightsFile>(flightsName);
const flights = decodeFlights(flightsFile);

describe('fixtures typées', () => {
  it('se chargent avec les types générés', () => {
    const meta = read<MetaFile>('meta.json');
    const sites = read<SitesFile>(sitesName);
    const insights = readdirSync(join(DIR, 'insights')).map((f) => read<InsightsFile>(`insights/${f}`));
    expect(meta.counts.flights).toBe(flights.length);
    expect(meta.files.flights).toBe(flightsName);
    expect(sites.sites.length).toBe(meta.counts.sites);
    expect(insights.length).toBe(meta.insights.length);
  });
});

describe('decodeFlights', () => {
  it('produit une ligne par vol, avec des clés uniques', () => {
    expect(flights).toHaveLength(flightsFile.rows.length);
    expect(new Set(flights.map((f) => f.key)).size).toBe(flights.length);
  });

  it('décode le premier vol (catégories, clé, dérivés)', () => {
    const f = flights[0];
    expect(f).toMatchObject({
      key: 'zoe-test-1048',
      pilot: 'Zoé Test',
      pilotSlug: 'zoe-test',
      activity: 'paramoteur',
      date: '2024-01-12',
      time: '11:46',
      site: 'Plage Epsilon',
      wing: 'voile trois',
      instrument: 'Instrument B',
      mode: 'Moteur',
      source: 'gpx',
      durationMin: 174.8,
      incomplete: false,
      syrideNum: 1048,
      year: 2024,
      month: 1,
      weekday: 4,
      season: 'hiver',
      dayKey: '2024-01-12',
    });
    expect(f?.hour).toBeCloseTo(11 + 46 / 60);
  });

  it('conserve les valeurs nulles et les vols incomplets', () => {
    const f = flights[2];
    expect(f?.durationMin).toBeNull();
    expect(f?.incomplete).toBe(true);
    expect(
      flights.some((x) => x.site === null || x.wing === null || x.time === null || x.speedAvg === null),
    ).toBe(true);
  });

  it('lie siteId à l’index du dictionnaire', () => {
    for (const f of flights)
      expect(f.site === null ? f.siteId : flightsFile.dict.site[f.siteId ?? -1]).toBe(
        f.site === null ? null : f.site,
      );
  });
});

describe('dérivés', () => {
  it('saisons', () => {
    expect([12, 1, 2, 3, 5, 6, 8, 9, 11].map(seasonOfMonth)).toEqual([
      'hiver',
      'hiver',
      'hiver',
      'printemps',
      'printemps',
      'été',
      'été',
      'automne',
      'automne',
    ]);
    expect(() => seasonOfMonth(13)).toThrow();
  });
  it('jour de la semaine (0 = lundi)', () => {
    expect(weekdayOf('2024-01-15')).toBe(0);
    expect(weekdayOf('2024-01-21')).toBe(6);
  });
  it('heure décimale', () => {
    expect(decimalHour('11:30')).toBe(11.5);
    expect(decimalHour(null)).toBeNull();
  });
});
