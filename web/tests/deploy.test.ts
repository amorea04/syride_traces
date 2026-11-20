// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC = join(__dirname, '..', 'public');
const redirects = readFileSync(join(PUBLIC, '_redirects'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '' && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/));
const router = readFileSync(join(__dirname, '..', 'src', 'router.tsx'), 'utf8');

describe('déploiement Cloudflare Pages', () => {
  it('pas de repli global : /data et /assets absents doivent rester en 404', () => {
    expect(redirects.some(([from]) => from === '/*')).toBe(false);
    expect(redirects.some(([from]) => from?.startsWith('/data') || from?.startsWith('/assets'))).toBe(false);
    expect(existsSync(join(PUBLIC, '404.html'))).toBe(true);
  });

  it('chaque route de l’application est réécrite vers / (index.html)', () => {
    const routes = [...router.matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1] as string);
    expect(routes.length).toBeGreaterThan(5);
    const sources = new Set(redirects.map(([from]) => from));
    for (const route of routes) {
      const first = route.split('/')[0] as string;
      const rule = route.includes(':') ? `/${first}/*` : `/${first}`;
      expect(sources.has(rule), rule).toBe(true);
    }
    for (const [, to, status] of redirects) {
      expect([to, status]).toEqual(['/', '200']);
    }
  });
});
