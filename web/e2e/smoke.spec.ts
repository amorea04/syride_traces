import { expect, test } from '@playwright/test';

test('la page d’accueil s’ouvre sur les données de test', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByTestId('flight-count')).toContainText('48');
});
