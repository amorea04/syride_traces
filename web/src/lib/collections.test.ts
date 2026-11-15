import { describe, expect, it } from 'vitest';
import { groupBy } from '@/lib/collections';

describe('groupBy', () => {
  it('regroupe dans l’ordre d’apparition et écarte les clés nulles', () => {
    const g = groupBy([1, 2, 3, 4, 5], (n) => (n === 5 ? null : n % 2 === 0 ? 'pair' : 'impair'));
    expect([...g]).toEqual([
      ['impair', [1, 3]],
      ['pair', [2, 4]],
    ]);
  });
});
