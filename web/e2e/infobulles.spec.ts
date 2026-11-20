import { expect, test } from '@playwright/test';
import { fixtureFlights, fixtureSitesFile } from '../tests/fixtures';

const flights = fixtureFlights();
const count = new Map<string, number>();
for (const f of flights) count.set(f.pilotSlug, (count.get(f.pilotSlug) ?? 0) + 1);
const [first, second] = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
const bySite = new Map<number, number>();
for (const f of flights) if (f.siteId !== null) bySite.set(f.siteId, (bySite.get(f.siteId) ?? 0) + 1);
const big = fixtureSitesFile().sites.find((s) => (bySite.get(s.id) ?? 0) >= 10)!;

test.describe('infobulles des grilles', () => {
  test('calendrier : survol puis focus clavier d’une case volée', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    // Section montée à l'approche de l'écran (6.3).
    await page.locator('#rythme').scrollIntoViewIfNeeded();
    const cell = page.locator('[data-testid="calendar-heatmap"] [data-flown="true"]').first();
    await cell.scrollIntoViewIfNeeded();
    await cell.hover();
    const tip = page.getByTestId('cell-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Clic : fiche du jour');
    await expect(tip).toContainText(/\d{4}/);
    await expect(cell).toHaveAttribute('data-tip-on', 'true');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
    await cell.focus();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/\d{4}/);
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    // Le calendrier occupe la largeur de la carte, cases d'au moins 12 px.
    const box = await cell.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(12);
    expect(errors).toEqual([]);
  });

  test('matrice d’un site : intitulés d’axes et infobulle « entre 14 h et 15 h »', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/site/${big.id}`);
    const matrix = page.getByTestId('season-matrix');
    await expect(matrix).toBeVisible();
    await expect(matrix.getByText('Heure de décollage', { exact: true })).toBeVisible();
    await expect(matrix.getByRole('columnheader', { name: /^8\sh$/ })).toBeVisible();
    const cell = matrix.locator('td[data-tip]').first();
    await cell.hover();
    await expect(page.getByTestId('cell-tooltip')).toContainText(/entre \d+\sh et \d+\sh/);
    // Pleine largeur de la carte.
    const fits = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="season-matrix"]')!.getBoundingClientRect();
      const card = document.getElementById('saisonnalite')!.getBoundingClientRect();
      return m.width > card.width * 0.8 && m.right <= card.right + 1;
    });
    expect(fits).toBe(true);
  });

  test('Comparer : légende des haltères et infobulle d’un point', async ({ page }) => {
    await page.goto(`/comparer?mode=pilotes&ids=${first},${second}`);
    const legend = page.getByTestId('compare-dumbbells').getByTestId('dumbbell-legend');
    await expect(legend).toBeVisible();
    await expect(legend.locator('li')).toHaveCount(3);
    await page.getByTestId('compare-dumbbells').locator('.sr-db-dot').first().hover();
    await expect(page.getByTestId('cell-tooltip')).toBeVisible();
  });
});
