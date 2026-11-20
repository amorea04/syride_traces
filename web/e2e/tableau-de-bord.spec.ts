import { expect, test, type Page } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

const flights = fixtureFlights();
const total = flights.length;
const nbsp = /[\u00a0\u202f]/g;
const countText = async (page: Page) =>
  ((await page.getByTestId('flight-count').textContent()) ?? '').replace(nbsp, ' ');

const SECTIONS = [
  'vue-ensemble',
  'saison-groupe',
  'repartitions',
  'rythme',
  'quand',
  'materiel',
  'carte-sites',
];

test.describe('tableau de bord', () => {
  test('la page se charge avec ses sections principales', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
    for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toBeAttached();
    // Les graphiques ne sont instanciés qu'à l'approche de l'écran (6.3) : on amène la section à l'écran.
    await page.locator('#repartitions').scrollIntoViewIfNeeded();
    await expect(page.locator('#repartitions canvas').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('le filtre pilote met à jour l’URL et le compteur', async ({ page }) => {
    await page.goto('/');
    const pilot = flights[0]!.pilot;
    const expected = flights.filter((f) => f.pilot === pilot).length;
    await page.getByRole('textbox', { name: 'Pilotes' }).click();
    await page.getByRole('option', { name: new RegExp(`^${pilot}`) }).click();
    await expect(page).toHaveURL(/[?&]pilote=/);
    await expect.poll(() => countText(page)).toBe(`${expected} ${expected > 1 ? 'vols' : 'vol'}`);
    expect(expected).toBeLessThan(total);
  });

  test('un clic sur une barre du graphique Répartitions (axe pilote) ajoute le filtre', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#repartitions');
    await section.scrollIntoViewIfNeeded();
    await page.getByRole('textbox', { name: 'Axe' }).click();
    await page.getByRole('option', { name: 'Pilote', exact: true }).click();
    const canvas = section.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await expect(section.getByRole('img', { name: /par pilote/ })).toBeVisible();
    const box = (await canvas.boundingBox())!;
    // Pas d'instance ECharts accessible depuis la page (le bundle n'expose rien) : on fait un vrai clic sur le canvas.
    // Barres horizontales ; la première (3 pilotes dans 180 px) est centrée vers y = 33 px. Un déplacement préalable
    // est nécessaire pour que zrender repère l'élément survolé avant le clic.
    await expect(async () => {
      await page.mouse.move(box.x + 300, box.y + 30);
      await page.mouse.move(box.x + 305, box.y + 33);
      await page.mouse.click(box.x + 305, box.y + 33);
      await expect(page).toHaveURL(/[?&]pilote=/, { timeout: 500 });
    }).toPass({ timeout: 8_000 });
    await expect.poll(() => countText(page)).not.toBe(`${total} vols`);
  });

  test('la touche t bascule le mode sombre', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
    await page.keyboard.press('t');
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
  });

  test('« ? » ouvre l’aide des raccourcis et Échap la ferme', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeHidden();
  });

  test('un filtre sans vol affiche l’état vide sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?du=2099-01-01');
    await expect.poll(() => countText(page)).toBe('0 vol');
    await expect(page.getByText('Aucun vol pour ces filtres.').first()).toBeVisible();
    await page.locator('#carte-sites').scrollIntoViewIfNeeded();
    expect(errors).toEqual([]);
  });

  test('le bloc Durée des vols se croise selon une mesure ou une catégorie', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const section = page.locator('#nuage');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('heading', { name: 'Durée des vols' })).toBeVisible();
    await expect(section.locator('canvas').first()).toBeVisible();
    const select = section.getByRole('textbox', { name: 'Durée selon' });
    await expect(select).toHaveValue('Plafond');
    await select.click();
    await page.getByRole('option', { name: 'Vitesse moyenne' }).click();
    await expect(section.getByRole('img', { name: /vitesse moyenne en abscisse/ })).toBeVisible();
    await select.click();
    await page.getByRole('option', { name: 'Mois' }).click();
    await expect(section.getByRole('img', { name: /une colonne par mois/ })).toBeVisible();
    await section.getByRole('button', { name: /Voir les données/ }).click();
    await expect(section.getByRole('columnheader', { name: 'Durée médiane' })).toBeVisible();
    await expect(section.getByRole('cell', { name: 'janv.' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('à 360 px rien ne déborde horizontalement', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
    await page.locator('#carte-sites').scrollIntoViewIfNeeded();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
  });

  test('à 1440 px la matrice jour × heure ne déborde pas de sa carte', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('week-hour-matrix')).toBeVisible();
    const fits = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="week-hour-matrix"]');
      const card = document.getElementById('quand');
      if (!m || !card) return false;
      return m.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1;
    });
    expect(fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });
});
