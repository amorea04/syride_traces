import { defineConfig } from '@playwright/test';

/** Les tests e2e tournent sur les données synthétiques (`tests/fixtures/data`), jamais sur les vraies. */
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { VITE_DATA_DIR: 'tests/fixtures/data' },
  },
});
