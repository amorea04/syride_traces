// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Sw {
  CACHES: Record<'shell' | 'data' | 'tiles', string>;
  TILE_MAX_ENTRIES: number;
  classify(request: { method: string; mode?: string }, url: string, scope: string): string;
  dataFilesOfMeta(meta: unknown): string[];
  initialDataFiles(meta: unknown): string[];
  assetsOfIndex(html: string, scope: string): string[];
  staleDataPaths(cached: string[], current: unknown, previous: unknown): string[];
  urlsToCache(urls: unknown[], scope: string): { url: string; cache: string }[];
  overflow(count: number, max: number): number;
  obsoleteCaches(names: string[]): string[];
  staleAssetPaths(cached: string[], indexAssets: string[]): string[];
  sameAssets(a: string[], b: string[]): boolean;
  cleanResponse(r: unknown): Promise<Response>;
  TILE_PURGE_DELAY_MS: number;
  TILE_PURGE_EVERY: number;
}

/** Charge `public/sw-routing.js` (script classique) dans un faux `self`. */
function load(): Sw {
  const code = readFileSync(join(__dirname, '..', 'public', 'sw-routing.js'), 'utf8');
  const fakeSelf: { SyrideSw?: Sw } = {};
  new Function('self', code)(fakeSelf);
  return fakeSelf.SyrideSw as Sw;
}

const sw = load();
const SCOPE = 'https://exemple.test/';
const get = { method: 'GET' };

describe('service worker : classification des requêtes', () => {
  it('coquille, données et navigation', () => {
    expect(sw.classify(get, `${SCOPE}assets/index-abc.js`, SCOPE)).toBe('asset');
    expect(sw.classify(get, `${SCOPE}data/meta.json`, SCOPE)).toBe('meta');
    expect(sw.classify(get, `${SCOPE}data/flights.0123456789.json`, SCOPE)).toBe('data');
    expect(sw.classify(get, `${SCOPE}data/insights/j2f-2025.0123456789.json`, SCOPE)).toBe('data');
    expect(sw.classify({ method: 'GET', mode: 'navigate' }, `${SCOPE}vols?annee=2025`, SCOPE)).toBe(
      'navigate',
    );
    expect(sw.classify(get, `${SCOPE}manifest.webmanifest`, SCOPE)).toBe('ignore');
    expect(sw.classify(get, `${SCOPE}sw.js`, SCOPE)).toBe('ignore');
  });

  it('tuiles OpenFreeMap : tuiles en cache-first, styles réseau d’abord', () => {
    expect(sw.classify(get, 'https://tiles.openfreemap.org/planet/20250101/5/16/11.pbf', SCOPE)).toBe('tile');
    expect(sw.classify(get, 'https://tiles.openfreemap.org/styles/liberty', SCOPE)).toBe('tile-style');
  });

  it('jamais de cache pour syride.com, un autre domaine ou une méthode non GET', () => {
    expect(sw.classify(get, 'https://www.syride.com/fr/pilotes/j2f/1234', SCOPE)).toBe('ignore');
    expect(sw.classify({ method: 'GET', mode: 'navigate' }, 'https://www.syride.com/', SCOPE)).toBe('ignore');
    expect(sw.classify({ method: 'POST' }, `${SCOPE}data/meta.json`, SCOPE)).toBe('ignore');
    expect(sw.classify(get, 'http://tiles.openfreemap.org/planet/1.pbf', SCOPE)).toBe('ignore');
  });

  it('scope dans un sous-dossier (BASE_URL)', () => {
    const scope = 'https://exemple.test/analyse/';
    expect(sw.classify(get, `${scope}assets/a.js`, scope)).toBe('asset');
    expect(sw.classify(get, `${scope}data/meta.json`, scope)).toBe('meta');
    expect(sw.classify(get, 'https://exemple.test/assets/a.js', scope)).toBe('ignore');
  });
});

describe('service worker : données et caches', () => {
  const metaA = {
    files: { flights: 'flights.aaa.json', sites: 'sites.aaa.json' },
    insights: [{ pilot: 'x', year: 2025, file: 'insights/x-2025.aaa.json' }],
  };
  const metaB = {
    files: { flights: 'flights.bbb.json', sites: 'sites.aaa.json' },
    insights: [{ pilot: 'x', year: 2025, file: 'insights/x-2025.bbb.json' }],
  };

  it('liste les fichiers référencés par le meta', () => {
    expect(sw.dataFilesOfMeta(metaA)).toEqual([
      'flights.aaa.json',
      'sites.aaa.json',
      'insights/x-2025.aaa.json',
    ]);
    expect(sw.initialDataFiles(metaA)).toEqual(['flights.aaa.json', 'sites.aaa.json']);
    expect(sw.dataFilesOfMeta(null)).toEqual([]);
  });

  it('purge ce que ni le meta courant ni le précédent ne référencent', () => {
    const cached = [
      'data/meta.json',
      'data/flights.zzz.json',
      'data/flights.aaa.json',
      'data/flights.bbb.json',
      'data/insights/x-2025.aaa.json',
      'data/insights/x-2025.bbb.json',
      'data/insights/y-2024.ccc.json',
    ];
    expect(sw.staleDataPaths(cached, metaB, metaA)).toEqual([
      'data/flights.zzz.json',
      'data/insights/y-2024.ccc.json',
    ]);
    expect(sw.staleDataPaths(cached, metaB, null)).toEqual([
      'data/flights.zzz.json',
      'data/flights.aaa.json',
      'data/insights/x-2025.aaa.json',
      'data/insights/y-2024.ccc.json',
    ]);
  });

  it('retrouve les fichiers de la coquille dans index.html', () => {
    const html = `<script type="module" src="/assets/index-1.js"></script>
      <link rel="modulepreload" href="/assets/navigation-2.js"><link rel="stylesheet" href="/assets/index-3.css">
      <script src="/autre/x.js"></script>`;
    expect(sw.assetsOfIndex(html, 'https://exemple.test/')).toEqual([
      'assets/index-1.js',
      'assets/navigation-2.js',
      'assets/index-3.css',
    ]);
    expect(
      sw.assetsOfIndex('<script src="/analyse/assets/a.js"></script>', 'https://exemple.test/analyse/'),
    ).toEqual(['assets/a.js']);
  });

  it('ne met en cache, parmi les fichiers déjà chargés par la page, que les compilés et les données hashées', () => {
    expect(
      sw.urlsToCache(
        [
          `${SCOPE}assets/Dashboard-1.js`,
          `${SCOPE}assets/Dashboard-1.js`,
          `${SCOPE}data/flights.0123456789.json`,
          `${SCOPE}data/meta.json`,
          'https://www.syride.com/assets/x.js',
          'pas une url',
          42,
          `${SCOPE}icon.svg`,
        ],
        SCOPE,
      ),
    ).toEqual([
      { url: `${SCOPE}assets/Dashboard-1.js`, cache: 'shell' },
      { url: `${SCOPE}data/flights.0123456789.json`, cache: 'data' },
    ]);
  });

  it('plafond FIFO du cache des tuiles', () => {
    expect(sw.TILE_MAX_ENTRIES).toBe(300);
    expect(sw.overflow(299, 300)).toBe(0);
    expect(sw.overflow(300, 300)).toBe(0);
    expect(sw.overflow(303, 300)).toBe(3);
  });

  it('supprime les anciens caches de l’application, pas ceux des autres', () => {
    const { shell, data, tiles } = sw.CACHES;
    expect(sw.obsoleteCaches([shell, data, tiles, 'syride-shell-v0', 'syride-data-v0', 'autre'])).toEqual([
      'syride-shell-v0',
      'syride-data-v0',
    ]);
  });

  it('purge les assets compilés que l’index courant ne référence plus', () => {
    const cached = ['assets/index-old.js', 'assets/index-new.js', 'assets/Chart-old.js', 'offline.html', 'data/x.json'];
    expect(sw.staleAssetPaths(cached, ['assets/index-new.js'])).toEqual([
      'assets/index-old.js',
      'assets/Chart-old.js',
    ]);
    expect(sw.staleAssetPaths([], ['assets/a.js'])).toEqual([]);
  });

  it('détecte un changement de déploiement (même ensemble de fichiers, ordre indifférent)', () => {
    expect(sw.sameAssets(['assets/a.js', 'assets/b.css'], ['assets/b.css', 'assets/a.js'])).toBe(true);
    expect(sw.sameAssets(['assets/a.js'], ['assets/b.js'])).toBe(false);
    expect(sw.sameAssets(['assets/a.js'], ['assets/a.js', 'assets/b.js'])).toBe(false);
  });

  it('purge des tuiles groupée', () => {
    expect(sw.TILE_PURGE_DELAY_MS).toBeGreaterThanOrEqual(1000);
    expect(sw.TILE_PURGE_EVERY).toBeGreaterThan(1);
  });
});

describe('service worker : réponses redirigées', () => {
  it('reconstruit une réponse redirigée (sans indicateur, même contenu)', async () => {
    const fake = {
      redirected: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/html' }),
      blob: () => Promise.resolve(new Blob(['<html></html>'])),
    };
    const clean = await sw.cleanResponse(fake);
    expect(clean.redirected).toBe(false);
    expect(clean.status).toBe(200);
    expect(clean.headers.get('content-type')).toBe('text/html');
    expect(await clean.text()).toBe('<html></html>');
  });

  it('laisse intacte une réponse non redirigée', async () => {
    const r = new Response('ok');
    expect(await sw.cleanResponse(r)).toBe(r);
  });
});
