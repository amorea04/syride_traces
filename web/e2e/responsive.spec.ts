import { expect, test } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

/** 6.5 : à 360 px de large, aucune route ne doit déborder horizontalement. */
const flights = fixtureFlights();
const SLUG = 'alpha-test';
const flight = flights.filter((f) => f.pilotSlug === SLUG).find((f) => f.siteId !== null)!;
const year = flight.year;

const ROUTES = [
  '/',
  '/vols',
  `/vol/${flight.key}`,
  '/pilotes',
  `/pilote/${SLUG}`,
  `/pilote/${SLUG}/${year}`,
  '/sites',
  `/site/${flight.siteId}`,
  '/comparer',
  '/records',
  '/a-propos',
  '/page-inexistante',
];

test.use({ viewport: { width: 360, height: 800 } });

for (const path of ROUTES) {
  test(`pas de défilement horizontal à 360 px : ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    // Laisse les graphiques et tableaux se mettre en place.
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  });
}
