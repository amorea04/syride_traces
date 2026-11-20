// Revue responsive (phase 6.5) : photographie toutes les routes à 360, 768, 1280 et 1920 px, en clair et en sombre.
// Données : uniquement les fixtures synthétiques (`tests/fixtures/data`), jamais les vraies : les captures sont archivables.
// Usage : `npm run build && npm run captures` (serveur `vite preview` lancé et arrêté par le script, port 5193).
// Sortie : web/audits/captures/<route>__<largeur>__<clair|sombre>.jpg + liste des débordements horizontaux sur la sortie standard.
/* global document, window */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'audits', 'captures');
const PORT = 5193;
const BASE = `http://localhost:${PORT}`;
const WIDTHS = [360, 768, 1280, 1920];
const SCHEMES = [
  ['clair', 'light'],
  ['sombre', 'dark'],
];
mkdirSync(out, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  env: { ...process.env, VITE_DATA_DIR: 'tests/fixtures/data' },
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/data/meta.json`)).ok) return;
    } catch {
      /* serveur pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Le serveur de prévisualisation ne répond pas.');
}

let exitCode = 0;
try {
  await waitUp();
  const browser = await chromium.launch();
  // Un vol, son pilote, son année et son site : lus dans les fixtures (clé de vol = `<slug pilote>-<numéro Syride>`).
  const dataDir = join(root, 'tests', 'fixtures', 'data');
  const flightsFile = readdirSync(dataDir).find((n) => /^flights\.[0-9a-f]+\.json$/.test(n));
  const flightsData = JSON.parse(readFileSync(join(dataDir, flightsFile), 'utf8'));
  const col = (name) => flightsData.columns.indexOf(name);
  const row = flightsData.rows.find((r) => r[col('pilot')] !== null && r[col('site')] !== null) ?? flightsData.rows[0];
  const slug = flightsData.pilot_slugs[row[col('pilot')]];
  const flightHref = `/vol/${slug}-${row[col('syride_num')]}`;
  const pilotHref = `/pilote/${slug}`;
  const yearHref = `${pilotHref}/${String(row[col('date')]).slice(0, 4)}`;
  const probe = await (await browser.newContext()).newPage();
  await probe.goto(`${BASE}${flightHref}`);
  const siteHref = await probe.locator('a[href^="/site/"]').first().getAttribute('href');
  await probe.context().close();

  const routes = [
    ['accueil', '/'],
    ['vols', '/vols'],
    ['vol', flightHref],
    ['pilotes', '/pilotes'],
    ['pilote', pilotHref],
    ['bilan', yearHref],
    ['sites', '/sites'],
    ['site', siteHref],
    ['comparer', '/comparer'],
    ['records', '/records'],
    ['a-propos', '/a-propos'],
    ['introuvable', '/page-inexistante'],
  ];

  const overflows = [];
  for (const [scheme, media] of SCHEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 800 : 900 },
        colorScheme: media,
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      for (const [name, path] of routes) {
        await page.goto(`${BASE}${path}`);
        await page.locator('main h1, main h2').first().waitFor({ timeout: 15000 });
        // Fait défiler la page : les cartes ne se chargent qu'à l'approche de l'écran (6.3).
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 40));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(400);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 0) overflows.push(`${name} ${width}px ${scheme} : +${over}px`);
        await page.screenshot({ path: join(out, `${name}__${width}__${scheme}.jpg`), fullPage: true, type: 'jpeg', quality: 50 });
      }
      await context.close();
    }
  }
  await browser.close();
  console.log(overflows.length ? `Débordements horizontaux :\n${overflows.join('\n')}` : 'Aucun débordement horizontal.');
  if (overflows.length) exitCode = 1;
} catch (e) {
  console.error(e);
  exitCode = 2;
} finally {
  stop();
}
process.exit(exitCode);
