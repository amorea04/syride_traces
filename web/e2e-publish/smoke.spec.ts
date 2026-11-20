import { expect, test } from '@playwright/test';

/** Pages vérifiées avant publication : chacune doit afficher un nombre sans erreur console. */
const pages = [
  { path: '/', countTestId: 'flight-count' },
  { path: '/vols', countTestId: 'flight-count' },
  { path: '/pilotes', countTestId: 'pilots-count' },
];

for (const { path, countTestId } of pages) {
  test(`${path} se charge avec des données et sans erreur`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const count = page.getByTestId(countTestId);
    await expect(count).toContainText(/\d/);
    expect(((await count.textContent()) ?? '').trim()).not.toBe('');
    expect(errors).toEqual([]);
  });
}
