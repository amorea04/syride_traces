import { expect, test } from '@playwright/test';
import { syridePilotUrl } from '../src/lib/syride';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();
const slugs = [...new Set(flights.map((f) => f.pilotSlug))];
/** Pilote avec le plus de vols : la page a toutes ses sections. */
const busiest = slugs
  .map((slug) => ({ slug, list: flights.filter((f) => f.pilotSlug === slug) }))
  .sort((a, b) => b.list.length - a.list.length)[0]!;
const pilotName = busiest.list[0]!.pilot;
const years = [...new Set(busiest.list.map((f) => f.year))].sort((a, b) => b - a);

test.describe('pilotes', () => {
  test('la liste affiche un pilote par carte, se recherche et ouvre la page pilote', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/pilotes');
    const cards = page.getByTestId('pilot-card');
    await expect(cards).toHaveCount(slugs.length);
    const card = page.locator(`[data-testid="pilot-card"][data-slug="${busiest.slug}"]`);
    await expect(card.getByRole('link', { name: `Profil de ${pilotName} sur Syride` })).toHaveAttribute(
      'href',
      syridePilotUrl(pilotName),
    );

    await page.getByTestId('pilots-search').fill('zzzz-inconnu');
    await expect(cards).toHaveCount(0);
    await page.getByTestId('pilots-search').fill(pilotName.toUpperCase().slice(0, 4));
    await expect(card).toBeVisible();

    await card.getByRole('link', { name: pilotName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${busiest.slug}(\\?|$)`));
    await expect(page.getByTestId('pilot-name')).toHaveText(pilotName);
    expect(errors).toEqual([]);
  });

  test('la page pilote affiche carrière, records, sites et voiles ; une carte d’année ouvre le bilan', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/pilote/${busiest.slug}`);
    for (const id of ['carriere', 'records', 'bilans', 'sites-favoris', 'sites-face', 'voiles']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await expect(page.getByTestId('pilot-kpis')).toBeVisible();
    await expect(page.getByTestId('career-chart')).toBeVisible();
    await expect(page.getByTestId('pilot-records').locator('[data-record]')).toHaveCount(6);
    await expect(page.getByTestId('pilot-syride')).toHaveAttribute('href', syridePilotUrl(pilotName));
    await expect(page.getByTestId('year-card')).toHaveCount(years.length);

    await page.locator(`[data-testid="year-card"][data-year="${years[0]}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${busiest.slug}/${years[0]}(\\?|$)`));
    expect(errors).toEqual([]);
  });

  test('un filtre réduit la vue et ses mentions, le filtre pilote est ignoré', async ({ page }) => {
    const other = slugs.find((s) => s !== busiest.slug)!;
    await page.goto(`/pilote/${busiest.slug}?pilote=${other}&activite=paramoteur`);
    await expect(page.getByTestId('pilot-name')).toHaveText(pilotName);
    await expect(page.getByTestId('pilot-filtered')).toContainText('paramoteur');
    await expect(page.getByTestId('pilot-filtered')).not.toContainText(other);
  });

  test('le lien « Voir ses vols » ajoute le filtre pilote', async ({ page }) => {
    await page.goto(`/pilote/${busiest.slug}`);
    await page.getByTestId('pilot-flights-link').click();
    await expect(page).toHaveURL(new RegExp(`/vols\\?.*pilote=${busiest.slug}`));
  });

  test('pilote introuvable', async ({ page }) => {
    await page.goto('/pilote/n-existe-pas');
    await expect(page.getByRole('heading', { name: 'Pilote introuvable' })).toBeVisible();
    await page.getByRole('link', { name: 'Voir la liste des pilotes' }).click();
    await expect(page).toHaveURL(/\/pilotes/);
  });
});
