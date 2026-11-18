import { expect, test } from '@playwright/test';
import { fixtureMeta } from '../tests/fixtures';

const meta = fixtureMeta();

test.describe('à propos', () => {
  test('affiche la source, le glossaire, la qualité des données et le crédit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/a-propos');
    await expect(page.getByRole('heading', { level: 1, name: 'À propos' })).toBeVisible();
    await expect(page.getByTestId('about-source').getByRole('link', { name: 'syride.com' })).toHaveAttribute(
      'href',
      'https://www.syride.com',
    );
    await expect(page.getByTestId('about-source')).toContainText('Outil personnel, non affilié à Syride.');
    await expect(page.getByTestId('about-dates')).toContainText('28 décembre 2025');
    await expect(page.getByTestId('about-dates')).toContainText('1 janvier 2026');
    await expect(page.getByTestId('about-d12')).toContainText('Aucune trace');
    await expect(page.getByTestId('glossary-metric')).toHaveCount(19);
    await expect(page.getByTestId('glossary-notions')).toContainText('Données partielles');
    await expect(page.getByTestId('q-exported')).toContainText(String(meta.counts.flights));
    await expect(page.getByTestId('q-excluded')).toContainText(String(meta.counts.excluded_flights));
    await expect(page.getByTestId('quality-coverage')).toBeVisible();
    await expect(page.getByTestId('quality-sources')).toBeVisible();
    await expect(page.getByTestId('quality-sites')).toContainText('Sans Coordonnées');
    await expect(page.getByTestId('about-credit')).toHaveText('Créée par : Adrien Moreau');
    expect(errors).toEqual([]);
  });

  test('le crédit n’apparaît pas sur les autres pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Créée par')).toHaveCount(0);
  });
});
