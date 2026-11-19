import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURES_DIR, fixtureFlights, fixtureInsights } from '../tests/fixtures';

const SLUG = 'alpha-test';
const YEAR = 2025;
const flights = fixtureFlights().filter((f) => f.pilotSlug === SLUG && f.year === YEAR);
const insightsFile = readdirSync(`${FIXTURES_DIR}/insights`).find((f) => f.startsWith(`${SLUG}-${YEAR}.`))!;
const story = fixtureInsights(`insights/${insightsFile}`).by_disc.tout!;
const URL = `/pilote/${SLUG}/${YEAR}`;

test.describe('bilan : quand, où, matos, records, vols, données', () => {
  test('les sections détaillées sont présentes, sans erreur de page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    for (const id of ['quand', 'ou', 'matos', 'records', 'vols', 'donnees']) {
      await expect(page.locator(`section#${id}`)).toBeAttached();
    }
    await expect(page.getByTestId('bilan-actions')).toBeVisible();
    // Les phrases viennent telles quelles des insights.
    await expect(page.getByTestId('bilan-texte-quand')).toHaveText(story.texts.quand!);
    await expect(page.getByTestId('bilan-texte-ou')).toHaveText(story.texts.ou!);
    await expect(page.getByTestId('bilan-texte-records')).toHaveText(story.texts.records!);
    await expect(page.getByTestId('bilan-week-hour-matrix')).toBeAttached();
    await expect(page.getByTestId('bilan-seasons')).toBeAttached();
    await expect(page.getByTestId('bilan-glossary')).toBeAttached();
    expect(errors).toEqual([]);
  });

  test('les boutons de zone recadrent la carte sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    const zones = page.getByTestId('bilan-zone');
    await expect(zones).toHaveCount(story.map_zones.length);
    await expect(page.getByTestId('bilan-zone-all')).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < story.map_zones.length; i += 1) {
      await zones.nth(i).click();
      await expect(zones.nth(i)).toHaveAttribute('aria-pressed', 'true');
      await expect(zones.nth(i)).toContainText(story.map_zones[i]!.name);
    }
    await page.getByTestId('bilan-zone-all').click();
    await expect(page.getByTestId('bilan-zone-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('sites-map')).toBeVisible();
    await expect(page.getByTestId('bilan-new-site')).toHaveCount(story.new_sites.length);
    expect(errors).toEqual([]);
  });

  test('« Nouveau record ! » apparaît pour chaque record battu, avec liens fiche et Syride', async ({ page }) => {
    test.skip(story.records_beaten.length === 0, 'aucun record battu dans les fixtures');
    await page.goto(URL);
    const news = page.getByTestId('bilan-record-new');
    await expect(news).toHaveCount(story.records_beaten.length);
    await expect(news.first()).toHaveText('Nouveau record !');
    await expect(page.getByTestId('bilan-record-gain').first()).toContainText('par rapport à');
    const first = page.getByTestId('bilan-record').first();
    await expect(first.getByTestId('syride-link').first()).toHaveAttribute('href', /syride\.com/);
    await expect(first.getByTestId('syride-link').first()).toHaveAttribute('aria-label', 'Voir la trace sur Syride');
    await first.getByTestId('bilan-record-link').first().click();
    await expect(page).toHaveURL(new RegExp(`/vol/${SLUG}-\\d+`));
  });

  test('l’export CSV télécharge bilan-<slug>-<année>.csv avec une ligne par vol', async ({ page }) => {
    await page.goto(URL);
    const download = page.waitForEvent('download');
    await page.getByTestId('bilan-export-csv').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`bilan-${SLUG}-${YEAR}.csv`);
    const path = await file.path();
    const text = readFileSync(path, 'utf8');
    expect(text.trim().split('\r\n')).toHaveLength(flights.length + 1);
  });

  test('« Copier le lien » copie l’URL courante, filtres et années comparées compris', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${URL}?activite=tout&comparer=`);
    await page.getByTestId('bilan-copy-link').click();
    await expect(page.getByTestId('bilan-copy-link')).toContainText('Copié');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(page.url());
    expect(copied).toContain('comparer=');
  });

  test('« Copier mon résumé » copie un texte brut court', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(URL);
    await page.getByTestId('bilan-copy-summary').click();
    await expect(page.getByTestId('bilan-copy-summary')).toContainText('Copié');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split('\n')[0]).toMatch(new RegExp(`^Bilan ${YEAR} · `));
    expect(text.split('\n').length).toBeLessThanOrEqual(9);
  });

  test('le tableau des vols porte une ligne par vol et met les vols records en or', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('bilan-flights-count')).toHaveText(new RegExp(`^${flights.length}\\s`));
    const recordKeys = [...new Set(story.records_beaten.map((r) => r.flight).filter(Boolean))] as string[];
    test.skip(recordKeys.length === 0, 'aucun vol record dans les fixtures');
    await expect(page.getByTestId('bilan-flights-gold-legend')).toBeVisible();
    const row = page.locator(`.bb-flights [data-testid="flight-row"][data-key="${recordKeys[0]}"]`);
    await expect(row).toBeVisible();
    const shadow = await row.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');
  });

  test('aucune requête vers une trace (D12)', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto(URL);
    await expect(page.locator('section#ou')).toBeAttached();
    const local = urls.filter((u) => u.startsWith('http://localhost'));
    expect(local.filter((u) => /gpx|igc|kml|track|trace/i.test(u))).toEqual([]);
  });
});
