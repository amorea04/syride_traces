import { expect, test } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();
const SLUG = 'alpha-test';
const mine = flights.filter((f) => f.pilotSlug === SLUG);
const flight = mine.find((f) => f.siteId !== null)!;
const years = [...new Set(mine.map((f) => f.year))].sort((a, b) => b - a);

const DETAIL_PAGES = [
  { label: 'Vols', path: `/vol/${flight.key}` },
  { label: 'Pilotes', path: `/pilote/${SLUG}` },
  { label: 'Pilotes', path: `/pilote/${SLUG}/${years[0]}` },
  { label: 'Sites', path: `/site/${flight.siteId}` },
];

test.describe('menu actif sur les pages de détail (5C.1)', () => {
  for (const { label, path } of DETAIL_PAGES) {
    test(`${path} souligne « ${label} » et lui seul`, async ({ page }) => {
      await page.goto(path);
      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }
});

test.describe('retour et fermeture (5C.2)', () => {
  test('fil d’Ariane et « Retour » sans historique : liste parente, filtres conservés', async ({ page }) => {
    await page.goto(`/vol/${flight.key}?activite=${flight.activity}`);
    const trail = page.getByRole('navigation', { name: 'Fil d’Ariane' });
    await expect(trail.getByRole('link', { name: 'Vols' })).toHaveAttribute('href', /activite=/);
    await expect(trail.locator('[aria-current="page"]')).toContainText(flight.pilot);
    await page.getByTestId('detail-back').click();
    await expect(page).toHaveURL(new RegExp(`/vols\\?.*activite=${flight.activity}`));
  });

  test('« Retour » avec historique : page précédente de l’application', async ({ page }) => {
    await page.goto('/pilotes');
    await page.getByRole('link', { name: mine[0]!.pilot, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}`));
    await page.getByTestId('detail-back').click();
    await expect(page).toHaveURL(/\/pilotes/);
  });

  test('Échap revient comme « Retour »', async ({ page }) => {
    await page.goto(`/site/${flight.siteId}`);
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/sites(\?|$)/);
  });

  test('« Retour » après un changement de filtre quitte la fiche au lieu de défaire le filtre', async ({
    page,
  }) => {
    test.skip(years.length < 2, 'au moins deux années nécessaires');
    await page.goto('/pilotes');
    await page.getByRole('link', { name: mine[0]!.pilot, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}`));
    for (const y of years.slice(0, 2)) {
      // Focus + flèche bas plutôt qu'un clic au centre du champ (réduit à un pixel de haut une fois une année choisie).
      await page.getByRole('textbox', { name: 'Années' }).focus();
      await page.keyboard.press('ArrowDown');
      await page.getByRole('option', { name: String(y), exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await expect(page).toHaveURL(/annees=/);
    await page.getByTestId('detail-back').click();
    await expect(page).toHaveURL(/\/pilotes/);
  });

  test('Échap ferme d’abord l’infobulle d’une case, puis quitte la page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/pilote/${SLUG}/${years[0]}`);
    const cell = page.locator('[data-testid="calendar-heatmap"] [data-flown="true"]').first();
    await cell.scrollIntoViewIfNeeded();
    await cell.hover();
    await expect(page.getByTestId('cell-tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cell-tooltip')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/${years[0]}`));
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}(\\?|$)`));
  });

  test('Échap ne quitte pas la page quand le tiroir ou une fenêtre est ouvert', async ({ page }) => {
    await page.goto(`/pilote/${SLUG}`);
    await expect(page.getByTestId('pilot-name')).toBeVisible();
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}`));
  });

  test('le bilan : fil « Pilotes › pilote › Bilan », retour vers la page pilote', async ({ page }) => {
    await page.goto(`/pilote/${SLUG}/${years[0]}`);
    const trail = page.getByRole('navigation', { name: 'Fil d’Ariane' });
    await expect(trail.getByRole('link', { name: mine[0]!.pilot })).toBeVisible();
    await expect(trail.locator('[aria-current="page"]')).toHaveText(`Bilan ${years[0]}`);
    await page.getByTestId('detail-back').click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}(\\?|$)`));
  });
});

test.describe('accès au bilan depuis la page pilote (5C.3)', () => {
  test('bouton principal vers la dernière année, menu des autres années, cartes explicites', async ({
    page,
  }) => {
    await page.goto(`/pilote/${SLUG}`);
    const button = page.getByTestId('pilot-bilan-button');
    await expect(button).toHaveText(`Voir le bilan ${years[0]}`);
    if (years.length > 1) {
      await page.getByTestId('pilot-bilan-menu').click();
      await expect(page.getByRole('menuitem')).toHaveCount(years.length - 1);
      await page.keyboard.press('Escape');
    }
    await expect(page.locator(`[data-testid="year-card"][data-year="${years[0]}"]`)).toContainText(
      `Bilan ${years[0]}`,
    );
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/${years[0]}(\\?|$)`));
  });
});
