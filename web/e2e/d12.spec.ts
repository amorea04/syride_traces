import { expect, test, type Page } from '@playwright/test';
import { fixtureFlights } from '../tests/fixtures';

/** D12 : aucune trace, aucune polyligne, aucune géométrie de vol. */
const FORBIDDEN_URL = /gpx|igc|kml|track|trace/i;
const LINE_TYPES = new Set(['LineString', 'MultiLineString']);

const flight = fixtureFlights()[0]!;

interface Seen {
  url: string;
  local: boolean;
  json: unknown;
}

/** Enregistre toutes les requêtes ; les réponses JSON locales sont gardées pour inspection. */
function record(page: Page): Seen[] {
  const seen: Seen[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    const local = new URL(url).origin === new URL(page.url() || 'http://localhost:4173').origin;
    let json: unknown = null;
    if (local && /json/.test(response.headers()['content-type'] ?? '')) {
      json = await response.json().catch(() => null);
    }
    seen.push({ url, local, json });
  });
  return seen;
}

/** Cherche, dans un JSON, un objet de géométrie de type ligne (clé `type`) ou une clé `geometry`/`coordinates` d'un vol. */
function hasLineGeometry(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasLineGeometry);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj['type'] === 'string' && LINE_TYPES.has(obj['type']) && 'coordinates' in obj) return true;
    return Object.values(obj).some(hasLineGeometry);
  }
  return false;
}

async function expectClean(seen: Seen[]) {
  const forbidden = seen.filter((s) => FORBIDDEN_URL.test(s.url)).map((s) => s.url);
  expect(forbidden, 'requêtes dont l’URL évoque une trace').toEqual([]);
  const lines = seen.filter((s) => s.local && hasLineGeometry(s.json)).map((s) => s.url);
  expect(lines, 'réponses JSON locales contenant une ligne').toEqual([]);
}

test.describe('contrôle D12', () => {
  test('la fiche vol ne charge ni trace ni géométrie de vol', async ({ page }) => {
    const seen = record(page);
    await page.goto(`/vol/${flight.key}`);
    await expect(page.getByTestId('flight-page')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(
      seen.some((s) => s.local && s.json !== null),
      'des données locales ont bien été vues',
    ).toBe(true);
    await expectClean(seen);
  });

  test('la liste des vols ne charge ni trace ni géométrie de vol', async ({ page }) => {
    const seen = record(page);
    await page.goto('/vols');
    await page.waitForLoadState('networkidle');
    await expectClean(seen);
  });

  test('la mini-carte ne porte que des points et le DOM ne contient aucune polyligne', async ({ page }) => {
    await page.goto(`/vol/${flight.key}`);
    await page.waitForLoadState('networkidle');
    const minimap = page.getByTestId('flight-minimap');
    if ((await minimap.count()) > 0) {
      await expect(minimap).toHaveAttribute('data-geometry-types', 'Point');
      await expect(minimap).toHaveAttribute('data-feature-count', '1');
    }
    const shapes = await page
      .getByTestId('flight-page')
      .locator('polyline, svg path[data-trace], [data-geometry-types*="Line"]')
      .count();
    expect(shapes).toBe(0);
  });
});
