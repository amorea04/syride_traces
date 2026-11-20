import { describe, expect, it } from 'vitest';
import { groupBy, topN } from '@/lib/collections';

describe('groupBy', () => {
  it('regroupe dans l’ordre d’apparition et écarte les clés nulles', () => {
    const g = groupBy([1, 2, 3, 4, 5], (n) => (n === 5 ? null : n % 2 === 0 ? 'pair' : 'impair'));
    expect([...g]).toEqual([
      ['impair', [1, 3]],
      ['pair', [2, 4]],
    ]);
  });
});

describe('topN', () => {
  it('donne le même résultat qu’un tri stable suivi d’un slice', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ i, v: (i * 37) % 23 }));
    const cmp = (a: { v: number }, b: { v: number }) => b.v - a.v;
    for (const n of [0, 1, 5, 15, 200, 300]) expect(topN(items, n, cmp)).toEqual([...items].sort(cmp).slice(0, n));
  });
});
