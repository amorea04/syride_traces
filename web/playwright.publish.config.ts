import { defineConfig } from '@playwright/test';

/**
 * Smoke test de publication (src/publish.py) : tourne sur le build RÉEL (`dist/` avec les vraies données),
 * déjà construit par `npm run build`. Dossier séparé de `e2e/` : `npm run e2e` ne le ramasse pas.
 */
export default defineConfig({
  testDir: './e2e-publish',
  use: { baseURL: 'http://localhost:4174', serviceWorkers: 'block' },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
