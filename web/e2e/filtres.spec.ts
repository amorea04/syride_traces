import { expect, test } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();
const total = flights.length;
const parapente = flights.filter((f) => f.activity === 'parapente').length;
const nbsp = /[\u00a0\u202f]/g;
const countText = async (page: import('@playwright/test').Page) =>
  ((await page.getByTestId('flight-count').textContent()) ?? '').replace(nbsp, ' ');

test.describe('filtres globaux', () => {
  test('changer l’activité met à jour l’URL et le compteur, puis le retour arrière annule', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await countText(page)).toBe(`${total} vols`);

    await page.locator('label', { hasText: 'Parapente' }).first().click();
    await expect(page).toHaveURL(/[?&]activite=parapente(&|$)/);
    await expect.poll(() => countText(page)).toBe(`${parapente} vols`);
    await expect(page.getByTestId('active-filters')).toContainText('Parapente');

    await page.goBack();
    await expect(page).not.toHaveURL(/activite=/);
    await expect.poll(() => countText(page)).toBe(`${total} vols`);
  });

  test('un filtre dans l’URL est appliqué au chargement et suit la navigation', async ({ page }) => {
    await page.goto('/?activite=parapente');
    await expect.poll(() => countText(page)).toBe(`${parapente} vols`);
    await page.getByRole('link', { name: 'Vols', exact: true }).click();
    await expect(page).toHaveURL(/\/vols\?activite=parapente/);
    await expect.poll(() => countText(page)).toBe(`${parapente} vols`);

    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(page).not.toHaveURL(/activite=/);
    await expect.poll(() => countText(page)).toBe(`${total} vols`);
  });

  test('le raccourci clavier 3 choisit le paramoteur', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/activite=paramoteur/);
  });

  test('la page 404 est servie par le repli SPA', async ({ page }) => {
    await page.goto('/nimporte-quoi');
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
  });
});
