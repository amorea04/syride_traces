import { expect, test } from '@playwright/test';

// Les autres e2e bloquent le service worker (playwright.config.ts) ; celui-ci le laisse agir.
test.use({ serviceWorkers: 'allow' });

test.describe('PWA', () => {
  test('le manifest est servi et valide', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.name).toBe('Syride analyse');
    expect(manifest.lang).toBe('fr');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    const sizes = manifest.icons.map(
      (i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`,
    );
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
    }
  });

  test('la page déclare manifest et couleurs de thème', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  });

  test('le service worker s’enregistre et la page se recharge hors ligne', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Attend que le service worker soit actif et qu'il contrôle la page (clients.claim).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve()),
        );
      }
    });
    // L'installation précache la coquille et les données initiales ; la page signale ensuite ses chunks déjà chargés (~3 s).
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const names = await caches.keys();
            const keys = (await Promise.all(names.map(async (n) => (await caches.open(n)).keys()))).flat();
            const urls = keys.map((k) => k.url);
            return {
              data: urls.filter((u) => /\/data\/(flights|sites)\./.test(u)).length,
              page: urls.some((u) => /\/assets\/Dashboard-.*\.js$/.test(u)),
            };
          }),
        { timeout: 15_000 },
      )
      .toEqual({ data: 2, page: true });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();
    await context.setOffline(false);
  });

  test('hors ligne, une page jamais ouverte affiche la coquille et un message, pas une page blanche', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await context.setOffline(true);
    await page.goto('/vols');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('n’a pas pu être chargée');
    await context.setOffline(false);
  });
});
