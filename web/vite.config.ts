import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { loadEnv, type Connect, type HtmlTagDescriptor, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { resolveInside } from './vite.data-path.ts';

const MIME: Record<string, string> = { '.json': 'application/json; charset=utf-8' };

/**
 * Sert `<VITE_DATA_DIR>/` sous `/data/` (dev et preview) à la place de `public/data/`.
 * Sans la variable, rien ne change : les vraies données de `public/data/` sont servies.
 * Exemple e2e/CI : `VITE_DATA_DIR=tests/fixtures/data npm run dev`.
 */
function dataDirPlugin(dataDir: string | undefined): Plugin {
  const root = dataDir ? resolve(dataDir) : null;
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0] ?? '';
    if (!root || !url.startsWith('/data/')) return next();
    const file = resolveInside(root, url.slice('/data/'.length));
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'syride-data-dir',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * Au build, précharge depuis `index.html` les fichiers de données nommés par `meta.json` (vols, sites) : leur
 * téléchargement démarre en parallèle du JS au lieu d'attendre l'exécution de l'appli puis `meta.json` (6.3).
 * `meta.json` lui-même n'est pas préchargé (lu sans cache, `no-store`). Si les données changent sans nouveau build,
 * l'appli suit `meta.json` et le préchargement est seulement perdu. Sans `meta.json`, rien n'est injecté.
 */
function dataPreloadPlugin(dataDir: string | undefined): Plugin {
  let base = '/';
  return {
    name: 'syride-data-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml() {
      const metaPath = resolve(dataDir ?? 'public/data', 'meta.json');
      if (!existsSync(metaPath)) return [];
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { files?: Record<string, unknown> };
      const files = [meta.files?.['flights'], meta.files?.['sites']].filter(
        (f): f is string => typeof f === 'string' && /^[\w.-]+\.json$/.test(f),
      );
      return files.map(
        (file): HtmlTagDescriptor => ({
          tag: 'link',
          // `crossorigin` : même mode (cors, identifiants same-origin) que le `fetch` de `load.ts`, sinon double téléchargement.
          attrs: { rel: 'preload', href: `${base}data/${file}`, as: 'fetch', crossorigin: 'anonymous' },
          injectTo: 'head',
        }),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      dataDirPlugin(env['VITE_DATA_DIR']),
      dataPreloadPlugin(env['VITE_DATA_DIR']),
      // `ANALYZE=1 npm run build` écrit dist/stats.html (jamais produit par défaut : ne pas le publier).
      ...(process.env['ANALYZE']
        ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })]
        : []),
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
