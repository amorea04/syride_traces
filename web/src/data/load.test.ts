import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataLoadError,
  INSIGHTS_CACHE_SIZE,
  dataBase,
  loadFlights,
  loadInsights,
  loadMeta,
  loadSites,
  onDataChanged,
  resetDataCaches,
} from '@/data/load';
import { FIXTURES_DIR, fixtureMeta } from '../../tests/fixtures';

const calls: string[] = [];

function stubFetch(overrides: Record<string, () => Response> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const rel = url.replace(dataBase(), '');
      const override = overrides[rel];
      if (override) return override();
      try {
        return new Response(readFileSync(join(FIXTURES_DIR, rel), 'utf8'), { status: 200 });
      } catch {
        return new Response('introuvable', { status: 404 });
      }
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
  resetDataCaches();
  stubFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe('chargement', () => {
  it('la base d’URL suit BASE_URL', () => {
    expect(dataBase()).toBe('/data/');
  });

  it('loadMeta lit meta.json sans cache', async () => {
    const meta = await loadMeta();
    expect(meta.counts.flights).toBe(48);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/data/meta.json', { cache: 'no-store' });
  });

  it('loadFlights et loadSites utilisent les noms hashés de meta', async () => {
    const meta = await loadMeta();
    const flights = await loadFlights(meta);
    const sites = await loadSites(meta);
    expect(flights).toHaveLength(meta.counts.flights);
    expect(sites).toHaveLength(meta.counts.sites);
    expect(calls).toContain(`/data/${meta.files.flights}`);
    expect(calls).toContain(`/data/${meta.files.sites}`);
  });

  it('loadFlights sans meta le charge lui-même', async () => {
    expect(await loadFlights()).toHaveLength(48);
    expect(calls[0]).toBe('/data/meta.json');
  });

  it('signale une erreur HTTP', async () => {
    stubFetch({ 'meta.json': () => new Response('', { status: 500 }) });
    await expect(loadMeta()).rejects.toMatchObject({ name: 'DataLoadError', status: 500 });
  });

  it('signale un réseau coupé et un JSON invalide', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(loadMeta()).rejects.toBeInstanceOf(DataLoadError);
    stubFetch({ 'meta.json': () => new Response('<html>', { status: 200 }) });
    await expect(loadMeta()).rejects.toThrow(/JSON valide/);
  });

  it('détecte une page HTML servie à la place d’un fichier (repli SPA)', async () => {
    const meta = await loadMeta();
    stubFetch({
      [meta.files.sites]: () =>
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    });
    await expect(loadSites(meta)).rejects.toMatchObject({
      missing: true,
      message: expect.stringMatching(/introuvable/),
    });
  });

  it('refuse une version de schéma inconnue', async () => {
    const bad = { ...fixtureMeta(), schema_version: 2 };
    stubFetch({ 'meta.json': () => new Response(JSON.stringify(bad)) });
    await expect(loadMeta()).rejects.toThrow(/non prise en charge/);
  });
});

describe('loadInsights', () => {
  it('charge à la demande puis sert le cache', async () => {
    const first = await loadInsights('alpha-test', 2024);
    expect(first?.pilot).toBe('alpha-test');
    expect(first?.year).toBe(2024);
    const n = calls.length;
    await loadInsights('alpha-test', 2024);
    expect(calls).toHaveLength(n);
  });

  it('partage les requêtes simultanées', async () => {
    const [a, b] = await Promise.all([loadInsights('zoe-test', 2025), loadInsights('zoe-test', 2025)]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.includes('zoe-test-2025'))).toHaveLength(1);
  });

  it('renvoie null pour un couple absent de meta', async () => {
    expect(await loadInsights('alpha-test', 1999)).toBeNull();
    expect(await loadInsights('inconnu', 2024)).toBeNull();
  });

  it('ne mémorise pas un échec', async () => {
    const meta = fixtureMeta();
    const entry = meta.insights[0]!;
    stubFetch({ [entry.file]: () => new Response('', { status: 503 }) });
    await expect(loadInsights(entry.pilot, entry.year)).rejects.toBeInstanceOf(DataLoadError);
    stubFetch();
    await expect(loadInsights(entry.pilot, entry.year)).resolves.not.toBeNull();
  });

  it('relit meta.json une fois si le fichier hashé a disparu, puis réessaie avec le nouveau nom', async () => {
    const old = await loadMeta();
    const entry = old.insights[0]!;
    const fresh = {
      ...old,
      generated_at: '2099-01-01T00:00:00Z',
      insights: [{ ...entry, file: 'insights-nouveau.json' }],
    };
    const changed = vi.fn();
    const off = onDataChanged(changed);
    stubFetch({
      'meta.json': () => new Response(JSON.stringify(fresh)),
      [entry.file]: () => new Response('', { status: 404 }),
      'insights-nouveau.json': () => new Response(readFileSync(join(FIXTURES_DIR, entry.file), 'utf8')),
    });
    const result = await loadInsights(entry.pilot, entry.year);
    off();
    expect(result?.pilot).toBe(entry.pilot);
    expect(calls.filter((c) => c.endsWith('meta.json'))).toHaveLength(2);
    expect(calls.at(-1)).toBe('/data/insights-nouveau.json');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ne boucle pas si meta.json est inchangé : l’erreur est propagée après une seule relecture', async () => {
    const old = await loadMeta();
    const entry = old.insights[0]!;
    stubFetch({ [entry.file]: () => new Response('', { status: 404 }) });
    await expect(loadInsights(entry.pilot, entry.year)).rejects.toMatchObject({ status: 404, missing: true });
    expect(calls.filter((c) => c.endsWith('meta.json'))).toHaveLength(2);
    expect(calls.filter((c) => c.endsWith(entry.file))).toHaveLength(1);
  });

  it('évince au-delà de la capacité (LRU)', async () => {
    const base = fixtureMeta();
    const file = base.insights[0]!.file;
    const total = INSIGHTS_CACHE_SIZE + 2;
    const meta = {
      ...base,
      insights: Array.from({ length: total }, (_, i) => ({ pilot: 'p', year: 2000 + i, file })),
    };
    stubFetch({ 'meta.json': () => new Response(JSON.stringify(meta)) });
    for (let i = 0; i < total; i++) await loadInsights('p', 2000 + i);
    expect(calls.filter((c) => c.endsWith(file))).toHaveLength(total);
    await loadInsights('p', 2000 + total - 1); // récent : en cache
    expect(calls.filter((c) => c.endsWith(file))).toHaveLength(total);
    await loadInsights('p', 2000); // le plus ancien : évincé, rechargé
    expect(calls.filter((c) => c.endsWith(file))).toHaveLength(total + 1);
  });
});
