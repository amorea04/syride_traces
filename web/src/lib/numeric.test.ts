import { describe, expect, it } from 'vitest';
import { max, mean, median, numpyRound, positives, rankOf, sum } from '@/lib/numeric';

describe('numpyRound', () => {
  it('arrondit au pair en cas d’égalité, comme np.round', () => {
    expect(numpyRound(0.5)).toBe(0);
    expect(numpyRound(1.5)).toBe(2);
    expect(numpyRound(2.5)).toBe(2);
    expect(numpyRound(12.25, 1)).toBe(12.2);
    expect(numpyRound(64.55, 1)).toBe(64.6);
  });
  it('laisse NaN et infinis tels quels', () => {
    expect(numpyRound(Number.NaN, 1)).toBeNaN();
  });
});

describe('agrégats', () => {
  it('la somme par paires (ordre de numpy) reste égale à la somme simple, à l’arrondi près', () => {
    const values = Array.from({ length: 1000 }, (_, i) => (i % 17) * 1.1 + 0.3);
    expect(sum(values)).toBeCloseTo(
      values.reduce((a, b) => a + b, 0),
      8,
    );
    expect(sum([])).toBe(0);
  });
  it('mean, max et median renvoient null sans valeur', () => {
    expect(mean([])).toBeNull();
    expect(max([])).toBeNull();
    expect(median([])).toBeNull();
  });
  it('médiane paire et impaire', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('positives ignore zéros, négatifs et valeurs absentes', () => {
    expect(positives([0, -1, null, undefined, 2, 3])).toEqual([2, 3]);
  });
});

describe('rankOf', () => {
  it('1 = plus haut, ex æquo au même rang', () => {
    expect(rankOf(10, [10, 8, 12, 10])).toBe(2);
    expect(rankOf(12, [10, 8, 12])).toBe(1);
  });
});
