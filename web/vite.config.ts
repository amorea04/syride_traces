import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv, type Connect, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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
    const file = normalize(join(root, decodeURIComponent(url.slice('/data/'.length))));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), dataDirPlugin(env['VITE_DATA_DIR'])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
