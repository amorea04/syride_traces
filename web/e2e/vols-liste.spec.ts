import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { sortFlights } from '../src/lib/flightsTable';
import { syrideFlightUrl } from '../src/lib/syride';
import { fixtureFlights, fixtureMeta } from '../tests/fixtures';

const flights = fixtureFlights();
const total = flights.length;
const nbsp = /[\u00a0\u202f]/g;
const listCount = async (page: Page) =>
  ((await page.getByTestId('list-count').textContent()) ?? '').replace(nbsp, ' ');
const rowKeys = async (page: Page) =>
  page.getByTestId('flight-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));

test.beforeEach(async ({ page }) => {
  // Préférences mémorisées d'un test précédent : on repart des valeurs par défaut.
  // Une seule fois par onglet, pour que le test de mémorisation survive à un rechargement.
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('e2e-prefs-reset')) return;
    window.sessionStorage.setItem('e2e-prefs-reset', '1');
    window.localStorage.removeItem('sr.flights-table.v1');
  });
});

test.describe('liste des vols', () => {
  test('la page charge : titre, compteur, lignes, tri par défaut (date décroissante)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/vols');
    await expect(page.getByRole('heading', { level: 1, name: 'Vols' })).toBeVisible();
    await expect(page.getByTestId('flights-table')).toBeVisible();
    await expect.poll(() => listCount(page)).toBe(`${total} vols`);
    const expected = sortFlights(flights, [{ id: 'date', desc: true }]).map((f) => f.key);
    const keys = await rowKeys(page);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toEqual(expected.slice(0, keys.length));
    expect(errors).toEqual([]);
  });

  test('la recherche (sans accents ni casse) réduit le compteur', async ({ page }) => {
    await page.goto('/vols');
    const pilot = flights[0]!.pilot;
    const expected = flights.filter((f) =>
      [f.pilot, f.site, f.wing, f.instrument, f.mode].join(' ').toLowerCase().includes(pilot.toLowerCase()),
    ).length;
    await page.getByRole('searchbox').fill(pilot.toUpperCase());
    await expect.poll(() => listCount(page)).toBe(`${expected} ${expected > 1 ? 'vols' : 'vol'}`);
    expect(expected).toBeLessThan(total);
    await page.getByRole('searchbox').fill('zzzz-introuvable');
    await expect.poll(() => listCount(page)).toBe('0 vol');
    await expect(page.getByText('Aucun vol ne correspond à cette recherche.')).toBeVisible();
  });

  test('le tri change l’ordre des lignes, nulls en fin', async ({ page }) => {
    await page.goto('/vols');
    await page.getByTestId('sort-duration').click();
    const desc = sortFlights(flights, [{ id: 'duration', desc: true }]).map((f) => f.key);
    await expect.poll(async () => (await rowKeys(page))[0]).toBe(desc[0]);
    await expect(page.getByRole('columnheader', { name: /Durée/ })).toHaveAttribute('aria-sort', 'descending');
    await page.getByTestId('sort-duration').click();
    const asc = sortFlights(flights, [{ id: 'duration', desc: false }]).map((f) => f.key);
    await expect.poll(async () => (await rowKeys(page))[0]).toBe(asc[0]);
    // Le dernier vol de la liste est un vol sans durée, quel que soit le sens.
    const nulls = flights.filter((f) => f.durationMin === null).length;
    if (nulls > 0) {
      // Liste virtualisée : on descend en bas pour que la dernière ligne soit rendue.
      await page.locator('.sr-vt-scroll').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect.poll(async () => (await rowKeys(page)).at(-1)).toBe(asc.at(-1));
      expect(flights.find((f) => f.key === asc.at(-1))?.durationMin).toBeNull();
    }
  });

  test('un clic sur une ligne ouvre la bonne fiche', async ({ page }) => {
    await page.goto('/vols');
    const first = page.getByTestId('flight-row').first();
    const key = await first.getAttribute('data-key');
    await first.getByRole('cell').first().click();
    await expect(page).toHaveURL(new RegExp(`/vol/${key}(\\?|$)`));
  });

  test('le lien Syride d’une ligne a la bonne URL et ne navigue pas', async ({ page }) => {
    await page.goto('/vols');
    const first = page.getByTestId('flight-row').first();
    const key = await first.getAttribute('data-key');
    const flight = flights.find((x) => x.key === key)!;
    const link = first.getByTestId('syride-link');
    await expect(link).toHaveAttribute('href', syrideFlightUrl(flight.pilot, flight.syrideNum));
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('l’export CSV télécharge la sélection courante', async ({ page }) => {
    await page.goto('/vols');
    const pilot = flights[0]!.pilot;
    await page.getByRole('searchbox').fill(pilot);
    const expected = sortFlights(
      flights.filter((f) =>
        [f.pilot, f.site, f.wing, f.instrument, f.mode].join(' ').toLowerCase().includes(pilot.toLowerCase()),
      ),
      [{ id: 'date', desc: true }],
    );
    await expect.poll(() => listCount(page)).toContain(`${expected.length} `);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe(`vols-${fixtureMeta().data_updated_at}.csv`);
    const path = await download.path();
    const text = await readFile(path, 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split('\r\n').filter((l) => l !== '');
    expect(lines[0]).toBe(
      'Date;Heure;Pilote;Activité;Site;Voile;Durée (min);Distance (km);Plafond (m);Vitesse max (km/h);Vario max (m/s);g max;Lien Syride',
    );
    expect(lines).toHaveLength(expected.length + 1);
    expect(lines[1]!.endsWith(syrideFlightUrl(expected[0]!.pilot, expected[0]!.syrideNum))).toBe(true);
  });

  test('les colonnes masquées par défaut s’ajoutent et le choix est mémorisé', async ({ page }) => {
    await page.goto('/vols');
    await expect(page.getByRole('columnheader', { name: /Instrument/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Colonnes' }).click();
    await page.getByRole('checkbox', { name: 'Instrument' }).check();
    await expect(page.getByRole('columnheader', { name: /Instrument/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('columnheader', { name: /Instrument/ })).toBeVisible();
  });

  test('mobile 360 px : la page ne déborde pas horizontalement', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/vols');
    await expect(page.getByTestId('flights-table')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
