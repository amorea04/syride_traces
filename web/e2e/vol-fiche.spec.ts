import { expect, test } from '@playwright/test';
import { compareFlights } from '../src/lib/flightContext';
import { syrideFlightUrl } from '../src/lib/syride';
import { fixtureFlights, fixtureSitesFile } from '../tests/fixtures';

const flights = fixtureFlights();
const sites = fixtureSitesFile().sites;
const withCoords = new Set(sites.filter((s) => s.lat !== null && s.lon !== null).map((s) => s.id));
const bigSites = new Set(sites.filter((s) => s.flights >= 10).map((s) => s.id));

/** Vols d'un pilote dans l'ordre date, heure, numéro Syride. */
function ordered(slug: string) {
  return flights.filter((f) => f.pilotSlug === slug).sort(compareFlights);
}

/** Un vol au milieu de la liste d'un pilote, sur un grand site avec coordonnées. */
const middle = (() => {
  for (const slug of new Set(flights.map((f) => f.pilotSlug))) {
    const list = ordered(slug);
    for (let i = 1; i < list.length - 1; i += 1) {
      const f = list[i]!;
      if (f.siteId !== null && withCoords.has(f.siteId) && bigSites.has(f.siteId))
        return { flight: f, previous: list[i - 1]!, next: list[i + 1]! };
    }
  }
  throw new Error('Aucun vol de test adapté');
})();

const SECTIONS = ['chiffres', 'contexte', 'moyennes', 'site-face', 'carte-site', 'meme-jour'];

test.describe('fiche vol', () => {
  test('la fiche se charge avec ses sections et sans erreur', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/vol/${middle.flight.key}`);
    await expect(page.getByTestId('flight-title')).toContainText(middle.flight.site!);
    await expect(page.getByTestId('flight-pilot')).toHaveText(middle.flight.pilot);
    for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toBeAttached();
    await expect(page.getByTestId('site-strips')).toBeVisible();
    await expect(page.getByTestId('flight-minimap')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('le bouton Syride a l’URL exacte et s’ouvre dans un nouvel onglet', async ({ page }) => {
    await page.goto(`/vol/${middle.flight.key}`);
    const button = page.getByTestId('syride-button');
    await expect(button).toHaveAttribute(
      'href',
      syrideFlightUrl(middle.flight.pilot, middle.flight.syrideNum),
    );
    await expect(button).toHaveAttribute('target', '_blank');
    await expect(button).toHaveAttribute('rel', /noopener/);
    await expect(button).toContainText('Voir la trace sur Syride');
  });

  test('précédent et suivant naviguent, au lien comme aux flèches', async ({ page }) => {
    await page.goto(`/vol/${middle.flight.key}`);
    const shown = (key: string) =>
      expect(page.getByTestId('flight-page')).toHaveAttribute('data-flight-key', key);
    // Les flèches lisent les voisins de la fiche affichée : on attend son rendu entre deux actions.
    await page.getByTestId('next-flight').click();
    await expect(page).toHaveURL(new RegExp(`/vol/${middle.next.key}$`));
    await shown(middle.next.key);
    await page.getByTestId('previous-flight').click();
    await expect(page).toHaveURL(new RegExp(`/vol/${middle.flight.key}$`));
    await shown(middle.flight.key);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`/vol/${middle.previous.key}$`));
    await shown(middle.previous.key);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`/vol/${middle.flight.key}$`));
  });

  test('les flèches sont inactives dans un champ de saisie', async ({ page }) => {
    await page.goto(`/vol/${middle.flight.key}`);
    await page.getByRole('textbox', { name: 'Pilotes' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`/vol/${middle.flight.key}$`));
  });

  test('les liens sortants conservent les filtres', async ({ page }) => {
    await page.goto(`/vol/${middle.flight.key}?activite=parapente`);
    await expect(page.getByTestId('flight-pilot')).toHaveAttribute(
      'href',
      /\/pilote\/.+\?.*activite=parapente/,
    );
  });

  test('un vol introuvable affiche le message', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/vol/inconnu-0');
    await expect(page.getByRole('heading', { level: 1, name: 'Vol introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: /liste des vols/ })).toHaveAttribute('href', '/vols');
    expect(errors).toEqual([]);
  });

  test('un site sans coordonnées : pas de carte', async ({ page }) => {
    const noCoords = sites.find((s) => s.lat === null)!;
    const f = flights.find((x) => x.siteId === noCoords.id);
    test.skip(!f, 'aucun vol sur un site sans coordonnées');
    await page.goto(`/vol/${f!.key}`);
    await expect(page.getByTestId('minimap-empty')).toBeVisible();
    await expect(page.getByTestId('flight-minimap')).toHaveCount(0);
  });
});
