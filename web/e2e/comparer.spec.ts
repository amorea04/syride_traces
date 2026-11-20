import { expect, test } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();
const count = new Map<string, number>();
for (const f of flights) count.set(f.pilotSlug, (count.get(f.pilotSlug) ?? 0) + 1);
const [first, second] = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
const modeGroup = (page: import('@playwright/test').Page) => page.getByRole('radiogroup', { name: 'Mode de comparaison' });

test.describe('comparer', () => {
  test('mode Pilotes : KPI, courbes et haltères, l’URL reflète le choix et survit au rechargement', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/comparer?mode=pilotes&ids=${first},${second}`);
    await expect(page.getByTestId('compare-page')).toHaveAttribute('data-mode', 'pilotes');
    await expect(page.getByTestId('compare-kpis')).toBeVisible();
    await expect(page.locator('[data-testid="compare-kpis"] > [data-series]')).toHaveCount(2);
    await expect(page.getByTestId('compare-cumul')).toBeVisible();
    await expect(page.getByTestId('compare-dumbbells')).toBeVisible();
    await expect(page.getByTestId('compare-rhythm')).toBeVisible();
    await expect(page.getByTestId('compare-default-note')).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`ids=${first}(%2C|,)${second}`));
    await expect(page.locator('[data-testid="compare-kpis"] > [data-series]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('sans choix, rien n’est sélectionné et un message invite à choisir', async ({ page }) => {
    await page.goto('/comparer');
    await expect(page.getByTestId('compare-problem')).toHaveText('Choisissez au moins 2 pilotes à comparer.');
    await expect(page.getByTestId('compare-default-note')).toHaveCount(0);
    await expect(page.getByTestId('compare-kpis')).toHaveCount(0);
    await modeGroup(page).getByText('Années', { exact: true }).click();
    await expect(page.getByTestId('compare-problem')).toHaveText('Choisissez un pilote, puis au moins 2 de ses années.');
    await modeGroup(page).getByText('Sites', { exact: true }).click();
    await expect(page.getByTestId('compare-problem')).toHaveText('Choisissez au moins 2 sites à comparer.');
  });

  test('changer de mode met l’URL à jour et conserve les filtres globaux', async ({ page }) => {
    await page.goto(`/comparer?activite=parapente&mode=pilotes&ids=${first},${second}`);
    await modeGroup(page).getByText('Sites', { exact: true }).click();
    await expect(page).toHaveURL(/mode=sites/);
    await expect(page).toHaveURL(/activite=parapente/);
    await expect(page.getByTestId('compare-page')).toHaveAttribute('data-mode', 'sites');
    await expect(page).not.toHaveURL(/ids=/);
    await expect(page.getByTestId('compare-problem')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('compare-page')).toHaveAttribute('data-mode', 'sites');

    await modeGroup(page).getByText('Années', { exact: true }).click();
    await expect(page).toHaveURL(/mode=annees/);
    await expect(page.getByTestId('compare-problem')).toBeVisible();
  });

  test('un choix insuffisant est signalé sans planter', async ({ page }) => {
    await page.goto(`/comparer?mode=pilotes&ids=${first}`);
    await expect(page.getByTestId('compare-problem')).toHaveText('Choisissez au moins 2 pilotes à comparer.');
  });
});
