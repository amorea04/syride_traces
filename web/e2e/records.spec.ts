import { expect, test } from '@playwright/test';
import { rankedTop, RECORD_METRICS } from '../src/lib/sites';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();

test.describe('records', () => {
  test('chaque métrique affiche son Top 10 avec des liens Syride bien formés', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/records');
    await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
    for (const metric of RECORD_METRICS) {
      const expected = rankedTop(flights, metric.of);
      if (expected.length === 0) {
        await expect(page.getByTestId(`tab-${metric.id}`)).toHaveCount(0);
        continue;
      }
      await page.getByTestId(`tab-${metric.id}`).click();
      const rows = page.getByTestId('record-row');
      await expect(rows).toHaveCount(expected.length);
      await expect(rows.first()).toHaveAttribute('data-rank', '1');
      await expect(rows.first().locator('[data-gold="true"]')).toHaveCount(1);
      for (const link of await rows.getByTestId('syride-link').all()) {
        await expect(link).toHaveAttribute('href', /^https:\/\/www\.syride\.com\/fr\/pilotes\/[^/]+\/\d+$/);
        await expect(link).toHaveAttribute('target', '_blank');
      }
    }
    // La durée a assez de mesures dans les fixtures pour remplir dix lignes.
    expect(rankedTop(flights, RECORD_METRICS[0]!.of)).toHaveLength(10);
    expect(errors).toEqual([]);
  });

  test('la première ligne renvoie à la fiche du vol et « un seul vol par pilote » réduit la liste', async ({
    page,
  }) => {
    await page.goto('/records');
    const best = rankedTop(flights, RECORD_METRICS[0]!.of)[0]!;
    await expect(page.getByTestId('record-row').first().getByTestId('record-flight-link')).toHaveAttribute(
      'href',
      new RegExp(`/vol/${best.flight.key}`),
    );
    await page.getByTestId('one-per-pilot').check();
    const pilots = new Set(flights.map((f) => f.pilotSlug)).size;
    await expect(page.getByTestId('record-row')).toHaveCount(Math.min(10, pilots));
    await page.getByTestId('record-row').first().getByTestId('record-flight-link').click();
    await expect(page).toHaveURL(/\/vol\//);
  });

  test('les filtres globaux s’appliquent', async ({ page }) => {
    await page.goto('/records?activite=paramoteur');
    await expect(page.getByTestId('filtered-view')).toContainText('paramoteur');
    const expected = rankedTop(
      flights.filter((f) => f.activity === 'paramoteur'),
      RECORD_METRICS[0]!.of,
    );
    await expect(page.getByTestId('record-row')).toHaveCount(expected.length);
  });
});
