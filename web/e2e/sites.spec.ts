import { expect, test } from '@playwright/test';
import { fixtureFlights, fixtureSitesFile } from '../tests/fixtures';

const flights = fixtureFlights();
const sites = fixtureSitesFile().sites;
const flightsBySite = new Map<number, number>();
for (const f of flights)
  if (f.siteId !== null) flightsBySite.set(f.siteId, (flightsBySite.get(f.siteId) ?? 0) + 1);
/** Sites ayant au moins un vol : ceux du tableau. */
const listed = sites.filter((s) => (flightsBySite.get(s.id) ?? 0) > 0);
const big = sites.find((s) => s.lat !== null && (flightsBySite.get(s.id) ?? 0) >= 10)!;
const noCoords = sites.find((s) => s.lat === null)!;

const SECTIONS = ['chiffres', 'saisonnalite', 'pilotes', 'derniers-vols', 'records', 'site-face'];

test.describe('sites', () => {
  test('la liste affiche la carte et un tableau trié, la recherche ignore les accents', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/sites');
    await expect(page.getByRole('heading', { level: 1, name: 'Sites' })).toBeVisible();
    await expect(page.getByTestId('sites-map')).toBeVisible();
    await expect(page.getByTestId('site-row')).toHaveCount(listed.length);
    // Tri par défaut : vols décroissants.
    const expected = [...listed].sort((a, b) => flightsBySite.get(b.id)! - flightsBySite.get(a.id)!);
    await expect(page.getByTestId('site-link').first()).toHaveText(expected[0]!.name);
    await page.getByTestId('sites-search').fill('SANS COORDONNEES');
    await expect(page.getByTestId('site-row')).toHaveCount(1);
    await expect(page.getByTestId('site-link')).toHaveText(noCoords.name);
    expect(errors).toEqual([]);
  });

  test('un clic sur un site ouvre sa page avec toutes ses sections', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/sites');
    await page.getByTestId('site-link').filter({ hasText: big.name }).click();
    await expect(page).toHaveURL(new RegExp(`/site/${big.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: big.name })).toBeVisible();
    for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toBeAttached();
    await expect(page.getByTestId('site-strips')).toBeVisible();
    await expect(page.getByTestId('latest-row').first()).toBeVisible();
    await expect(page.getByTestId('season-matrix')).toBeVisible();
    await expect(page.getByTestId('sites-map')).toBeVisible();
    // Chaque dernier vol renvoie vers Syride dans un nouvel onglet.
    const link = page.getByTestId('syride-link').first();
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.syride\.com\/fr\/pilotes\/.+\/\d+$/);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(errors).toEqual([]);
  });

  test('un site sans coordonnées s’affiche sans carte', async ({ page }) => {
    await page.goto(`/site/${noCoords.id}`);
    await expect(page.getByRole('heading', { level: 1, name: noCoords.name })).toBeVisible();
    await expect(page.getByTestId('minimap-empty')).toBeVisible();
    await expect(page.getByTestId('site-coordinates')).toContainText('Coordonnées inconnues');
  });

  test('les filtres s’appliquent sauf celui de sites, le lien « vols » filtre sur le site', async ({
    page,
  }) => {
    await page.goto(`/site/${big.id}?activite=paramoteur`);
    await expect(page.getByTestId('filtered-view')).toContainText('paramoteur');
    await page.getByTestId('site-flights-link').click();
    await expect(page).toHaveURL(/\/vols\?/);
    await expect(page).toHaveURL(new RegExp(`sites?=${big.id}`));
  });

  test('un site introuvable affiche un message avec un lien vers la liste', async ({ page }) => {
    await page.goto('/site/9999');
    await expect(page.getByTestId('site-not-found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Site introuvable' })).toBeVisible();
    await page.getByRole('link', { name: /liste des sites/ }).click();
    await expect(page).toHaveURL(/\/sites/);
  });
});
