import { expect, test } from '@playwright/test';
import { fixtureFlights, fixtureInsights } from '../tests/fixtures';

const SLUG = 'alpha-test';
const flights = fixtureFlights().filter((f) => f.pilotSlug === SLUG);
const pilot = flights[0]!.pilot;
const story = fixtureInsights('insights/alpha-test-2025.2e26af6925.json').by_disc.tout!;
const BILAN = `/pilote/${SLUG}/2025`;

test.describe('bilan pilote × année : en-tête, aperçu, histoire, rythme, comparaison', () => {
  test('s’ouvre depuis la page pilote et affiche ses sections', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/pilote/${SLUG}`);
    await page.locator('[data-testid="year-card"][data-year="2025"]').click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/2025(\\?|$)`));
    await expect(page.getByTestId('bilan-title')).toHaveText(`Bilan 2025 · ${pilot}`);
    for (const id of ['apercu', 'histoire', 'rythme', 'comparaison']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await expect(page.getByTestId('bilan-kpi')).toHaveCount(8);
    await expect(page.getByTestId('bilan-persona')).toContainText(story.persona!.label);
    await expect(page.getByTestId('bilan-gap')).toContainText(story.gap!.text);
    await expect(page.getByTestId('bilan-cumul')).toBeVisible();
    await expect(page.getByTestId('bilan-toc').getByRole('link', { name: 'Histoire' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('la flèche ← change d’année et d’URL, filtres conservés, `comparer` retiré s’il devient invalide', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BILAN}?activite=parapente&comparer=2024`);
    await expect(page.getByTestId('bilan-title')).toHaveText(`Bilan 2025 · ${pilot}`);
    await page.getByTestId('bilan-prev').click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/2024\\?`));
    expect(page.url()).toContain('activite=parapente');
    expect(page.url()).not.toContain('comparer');
    await expect(page.getByTestId('bilan-title')).toHaveText(`Bilan 2024 · ${pilot}`);
    await expect(page.getByTestId('bilan-prev')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('bilan-next').click();
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/2025\\?`));
    expect(errors).toEqual([]);
  });

  test('le sélecteur d’année navigue', async ({ page }) => {
    await page.goto(BILAN);
    await page.getByTestId('bilan-year-select').selectOption('2024');
    await expect(page).toHaveURL(new RegExp(`/pilote/${SLUG}/2024`));
  });

  test('les puces d’années comparées écrivent le paramètre `comparer` de l’URL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BILAN);
    const chip = page.locator('[data-testid="bilan-compare-chip"][data-year="2024"]');
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('bilan-compare-table')).toBeVisible();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(/comparer=(&|$)/);
    await expect(page.getByTestId('bilan-compare-empty')).toBeVisible();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).not.toContain('comparer');
    await expect(page.getByTestId('bilan-compare-table')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('l’équivalence tourne avec le bouton ↻', async ({ page }) => {
    await page.goto(BILAN);
    const eq = page.getByTestId('bilan-equivalence');
    await expect(eq).toContainText(story.equivalences[0]!);
    await page.getByRole('button', { name: 'Autre équivalence' }).click();
    await expect(eq).toContainText(story.equivalences[1]!);
  });

  test('un jalon mène à la fiche du vol', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BILAN);
    const milestones = page.getByTestId('bilan-milestone');
    await expect(milestones).toHaveCount(story.milestones.length);
    const target = story.milestones.find((m) => m.gold && m.flight)!;
    const item = page.locator(`[data-testid="bilan-milestone"]`, { hasText: target.title }).first();
    await expect(item).toHaveAttribute('data-gold', 'true');
    await item.getByTestId('bilan-milestone-link').click();
    await expect(page).toHaveURL(new RegExp(`/vol/${target.flight}(\\?|$)`));
    expect(errors).toEqual([]);
  });

  test('la fiche du jour s’ouvre depuis l’aperçu', async ({ page }) => {
    await page.goto(BILAN);
    await page.getByRole('button', { name: 'Ouvrir la fiche du jour' }).first().click();
    await expect(page.getByTestId('day-sheet-table')).toBeVisible();
  });

  test('aucun débordement horizontal à 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(BILAN);
    await expect(page.getByTestId('bilan-title')).toBeVisible();
    const overflow = await page.evaluate(() =>
      ['[data-testid="bilan-header"]', '[data-testid="bilan-compare-chips"]', '#apercu', '#histoire', '#rythme', '#comparaison'].map(
        (selector) => {
          const el = document.querySelector(selector);
          if (!el) return `${selector} absent`;
          const rect = el.getBoundingClientRect();
          return rect.right > window.innerWidth + 1 || el.scrollWidth > el.clientWidth + 1 ? `${selector} déborde` : null;
        },
      ),
    );
    expect(overflow.filter(Boolean)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('pilote introuvable, année introuvable', async ({ page }) => {
    await page.goto('/pilote/n-existe-pas/2025');
    await expect(page.getByRole('heading', { name: 'Pilote introuvable' })).toBeVisible();
    await page.goto(`/pilote/${SLUG}/1999`);
    await expect(page.getByRole('heading', { name: `Pas de bilan 1999 pour ${pilot}` })).toBeVisible();
    await expect(page.getByRole('link', { name: '2025' })).toBeVisible();
    await page.goto(`/pilote/${SLUG}/abc`);
    await expect(page.getByTestId('bilan-not-found')).toBeVisible();
  });
});
