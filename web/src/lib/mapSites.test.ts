import { describe, expect, it } from 'vitest';
import { makeFlight } from '../../tests/flightFactory';
import {
  aggregateSites,
  boundsOf,
  dominantActivity,
  focusBounds,
  type SiteFeature,
  type SiteLike,
} from '@/lib/mapSites';

const sites: SiteLike[] = [
  { id: 0, name: 'Alpha', lat: 45, lon: 6 },
  { id: 1, name: 'Beta', lat: 43, lon: -1 },
  { id: 2, name: 'Sans coord', lat: null, lon: null },
];
const byId = new Map(sites.map((s) => [s.id, s]));

describe('dominantActivity', () => {
  it('applique le seuil de 80 %', () => {
    expect(dominantActivity(8, 2)).toBe('parapente');
    expect(dominantActivity(2, 8)).toBe('paramoteur');
    expect(dominantActivity(7, 3)).toBe('tout');
    expect(dominantActivity(0, 0)).toBe('tout');
  });
});

describe('boundsOf', () => {
  it('calcule l’emprise ou null', () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        [6, 45],
        [-1, 43],
      ]),
    ).toEqual([-1, 43, 6, 45]);
    expect(boundsOf([[2, 3]])).toEqual([2, 3, 2, 3]);
  });
});

describe('aggregateSites', () => {
  const flights = [
    makeFlight('2024-05-01', { siteId: 0, pilot: 'Alice', pilotSlug: 'a', durationMin: 30 }),
    makeFlight('2024-05-02', { siteId: 0, pilot: 'Bob', pilotSlug: 'b', durationMin: 90 }),
    makeFlight('2024-05-03', { siteId: 0, pilot: 'Bob', pilotSlug: 'b', durationMin: null }),
    makeFlight('2024-05-04', { siteId: 1, activity: 'paramoteur', durationMin: 60 }),
    makeFlight('2024-05-05', { siteId: 2 }),
    makeFlight('2024-05-06', { siteId: null, site: null }),
  ];
  const data = aggregateSites(flights, byId);

  it('agrège par site, trié par vols', () => {
    expect(data.rows.map((r) => r.siteId)).toEqual([0, 1, 2]);
    expect(data.rows[0]).toMatchObject({
      flights: 3,
      minutes: 120,
      pilots: 2,
      parapente: 3,
      paramoteur: 0,
      dominant: 'parapente',
    });
    expect(data.rows[1]).toMatchObject({ dominant: 'paramoteur', paramoteur: 1 });
  });

  it('liste les pilotes du site, du plus assidu au moins assidu, hors du GeoJSON', () => {
    expect(data.rows[0]?.pilotNames).toEqual(['Bob', 'Alice']);
    expect(data.collection.features[0]?.properties).not.toHaveProperty('pilotNames');
  });
  it('exclut les sites sans coordonnées et les compte', () => {
    expect(data.collection.features).toHaveLength(2);
    expect(data.sitesWithoutCoords).toBe(1);
    expect(data.flightsWithoutCoords).toBe(1);
    expect(data.flightsWithoutSite).toBe(1);
  });
  it('place les points aux coordonnées du site [lon, lat]', () => {
    expect(data.collection.features[0]?.geometry.coordinates).toEqual([6, 45]);
    expect(data.collection.features[0]?.properties).not.toHaveProperty('lat');
  });
  it('calcule l’emprise de la sélection', () => {
    expect(data.bounds).toEqual([-1, 43, 6, 45]);
    expect(data.allBounds).toEqual([-1, 43, 6, 45]);
  });
  it('gère la sélection vide', () => {
    const empty = aggregateSites([], byId);
    expect(empty.collection.features).toEqual([]);
    expect(empty.rows).toEqual([]);
    expect(empty.bounds).toBeNull();
  });
});

describe('focusBounds', () => {
  const feature = (id: number, flights: number, coordinates: [number, number]): SiteFeature => ({
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates },
    properties: {
      siteId: id,
      name: String(id),
      flights,
      minutes: 0,
      pilots: 1,
      parapente: flights,
      paramoteur: 0,
      dominant: 'parapente',
    },
  });
  it('écarte un voyage lointain qui pèse moins de 5 % des vols', () => {
    const features = [feature(0, 60, [0.5, 45.6]), feature(1, 37, [1, 46]), feature(2, 3, [-16.7, 28.1])];
    expect(focusBounds(features)).toEqual([0.5, 45.6, 1, 46]);
  });
  it('gère un site unique et l’absence de site', () => {
    expect(focusBounds([feature(0, 1, [2, 3])])).toEqual([2, 3, 2, 3]);
    expect(focusBounds([])).toBeNull();
  });
});
