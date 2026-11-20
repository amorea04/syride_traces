import { defineConfig } from '@playwright/test';

/** Les tests e2e tournent sur les données synthétiques (`tests/fixtures/data`), jamais sur les vraies. */
export default defineConfig({
  testDir: './e2e',
  // Le service worker est bloqué : il mettrait en cache les données et fausserait les interceptions réseau (sauf pwa.spec.ts).
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { VITE_DATA_DIR: 'tests/fixtures/data' },
  },
});
