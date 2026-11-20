/** Utilitaires de collections partagés. */

/** Regroupe par clé en conservant l'ordre d'apparition ; les éléments dont la clé est `null` sont écartés. */
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K | null): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const bucket = out.get(key);
    if (bucket) bucket.push(item);
    else out.set(key, [item]);
  }
  return out;
}

/**
 * Les `n` premiers éléments selon `compare`, dans l'ordre : même résultat que `[...items].sort(compare).slice(0, n)`
 * (tri stable), en un seul passage, sans trier toute la liste.
 */
export function topN<T>(items: readonly T[], n: number, compare: (a: T, b: T) => number): T[] {
  const out: T[] = [];
  if (n <= 0) return out;
  for (const item of items) {
    const last = out[out.length - 1];
    if (out.length === n && last !== undefined && compare(item, last) >= 0) continue;
    // Insertion après les égaux : l'ordre d'arrivée départage, comme un tri stable.
    let i = out.length;
    while (i > 0 && compare(item, out[i - 1] as T) < 0) i--;
    out.splice(i, 0, item);
    if (out.length > n) out.pop();
  }
  return out;
}
