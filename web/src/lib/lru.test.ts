import { describe, expect, it } from 'vitest';
import { LruCache } from '@/lib/lru';

describe('LruCache', () => {
  it('évince la clé la moins récemment utilisée', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a devient la plus récente
    c.set('c', 3);
    expect(c.has('b')).toBe(false);
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('réécrire une clé ne grossit pas le cache', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('a', 2);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
  });

  it('refuse une capacité nulle', () => {
    expect(() => new LruCache(0)).toThrow();
  });
});
