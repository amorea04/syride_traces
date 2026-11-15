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
