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

  test('plusieurs années non contiguës : URL, compteur, puces, résumé', async ({ page }) => {
    const all = [...new Set(flights.map((f) => f.year))].sort((a, b) => a - b);
    test.skip(all.length < 2, 'au moins deux années nécessaires');
    const picked = [all[0]!, all[all.length - 1]!];
    const expected = flights.filter((f) => picked.includes(f.year)).length;
    await page.goto('/vols');
    const years = page.getByRole('textbox', { name: 'Années' });
    await years.click();
    for (const y of [...picked].reverse()) {
      await page.getByRole('option', { name: String(y), exact: true }).click();
    }
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`[?&]annees=${picked.join(',')}(&|$)`));
    await expect.poll(() => countText(page)).toBe(`${expected} ${expected < 2 ? 'vol' : 'vols'}`);
    for (const y of picked) await expect(page.getByTestId('active-filters')).toContainText(String(y));
    // Le résumé « Vue filtrée » cite les deux années sur une page qui l'affiche.
    await page.getByRole('link', { name: 'Sites', exact: true }).click();
    await expect(page.getByTestId('filtered-view')).toContainText(`${picked[0]}`);
    await expect(page.getByTestId('filtered-view')).toContainText(`${picked[1]}`);
    await expect(page).toHaveURL(new RegExp(`annees=${picked.join(',')}`));

    // L'URL fait foi au rechargement.
    await page.reload();
    await expect(page.getByTestId('active-filters')).toContainText(String(picked[1]));
  });

  test('une année absente des données (URL) reste visible et se décoche', async ({ page }) => {
    await page.goto('/vols?annees=1999');
    await expect(page.getByTestId('active-filters')).toContainText('1999');
    await page.getByRole('textbox', { name: 'Années' }).click({ force: true });
    const option = page.getByRole('option', { name: '1999', exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/annees=/);
  });

  test('les raccourcis de période remplacent la sélection d’années', async ({ page }) => {
    await page.goto(`/vols?annees=${flights[0]!.year}`);
    await expect(page).toHaveURL(/annees=/);
    await page.getByRole('button', { name: 'Cette année', exact: true }).click();
    await expect(page).not.toHaveURL(/annees=/);
    await expect(page).toHaveURL(/[?&]du=/);
  });

  test('la page 404 est servie par le repli SPA', async ({ page }) => {
    await page.goto('/nimporte-quoi');
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
  });
});
