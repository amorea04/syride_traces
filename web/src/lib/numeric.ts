/** Utilitaires numériques purs, partagés par `stats`, `rhythm` et `records`. */

/** Valeur numérique ou absente (mesure inconnue exportée en `null`). */
export type Maybe = number | null | undefined;

/** Valeurs strictement positives, comme `_positive` du rapport et `get_flight_params`. */
export function positives(values: readonly Maybe[]): number[] {
  const out: number[] = [];
  for (const v of values) if (v !== null && v !== undefined && v > 0) out.push(v);
  return out;
}

/** Valeurs renseignées (non nulles), zéros et négatifs conservés : équivalent de pandas qui saute les NaN. */
export function present(values: readonly Maybe[]): number[] {
  const out: number[] = [];
  for (const v of values) if (v !== null && v !== undefined && !Number.isNaN(v)) out.push(v);
  return out;
}

/** Taille de bloc de la sommation par paires de numpy (`PW_BLOCKSIZE`). */
const PAIRWISE_BLOCK = 128;

function pairwiseSum(values: readonly number[], start: number, n: number): number {
  if (n < 8) {
    let total = 0;
    for (let i = 0; i < n; i += 1) total += values[start + i] as number;
    return total;
  }
  if (n <= PAIRWISE_BLOCK) {
    const r = values.slice(start, start + 8) as number[];
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j += 1) r[j] = (r[j] as number) + (values[start + i + j] as number);
    }
    let total =
      (r[0] as number) +
      (r[1] as number) +
      ((r[2] as number) + (r[3] as number)) +
      ((r[4] as number) + (r[5] as number) + ((r[6] as number) + (r[7] as number)));
    for (; i < n; i += 1) total += values[start + i] as number;
    return total;
  }
  let half = Math.floor(n / 2);
  half -= half % 8;
  return pairwiseSum(values, start, half) + pairwiseSum(values, start + half, n - half);
}

/**
 * Somme dans le même ordre que numpy (sommation par paires) : pandas `Series.sum` et `Series.mean` donnent
 * ainsi exactement les mêmes flottants, ce qui compte quand un arrondi tombe sur une égalité (57,85 → 57,8).
 */
export function sum(values: readonly number[]): number {
  return pairwiseSum(values, 0, values.length);
}

/** Moyenne, `null` si la liste est vide (pandas : NaN). */
export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

/** Maximum, `null` si la liste est vide. */
export function max(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let best = values[0] as number;
  for (const v of values) if (v > best) best = v;
  return best;
}

/** Médiane (moyenne des deux valeurs centrales si l'effectif est pair), `null` si vide. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid] as number;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}

/** Moyenne des valeurs strictement positives (`_mean` du rapport). */
export const meanPositive = (values: readonly Maybe[]): number | null => mean(positives(values));
/** Maximum des valeurs strictement positives (`_max` du rapport). */
export const maxPositive = (values: readonly Maybe[]): number | null => max(positives(values));
/** Somme des valeurs strictement positives, `null` s'il n'y en a aucune (`_sum` du rapport). */
export function sumPositive(values: readonly Maybe[]): number | null {
  const p = positives(values);
  return p.length === 0 ? null : sum(p);
}

/** Nombre de valeurs distinctes non nulles (pandas `nunique`, qui ignore les NaN). */
export function distinctCount(values: readonly (string | number | null | undefined)[]): number {
  const seen = new Set<string | number>();
  for (const v of values) if (v !== null && v !== undefined) seen.add(v);
  return seen.size;
}

/** Entier le plus proche, au pair en cas d'égalité (`np.rint`). */
function rint(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Arrondi de `round(valeur, n)` appliqué à un résultat pandas (`np.float64`), comme dans `get_flight_params` :
 * numpy calcule `rint(x * 10^n) / 10^n`, au pair en cas d'égalité. `round(64.55, 1)` donne 64,6, là où le
 * `round` d'un `float` Python (valeur exacte du flottant : 64,5499…) donnerait 64,5, et `toFixed` 64,5.
 */
export function numpyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  const factor = 10 ** digits;
  return rint(x * factor) / factor;
}

/**
 * Arrondi du `round(valeur, n)` d'un `float` Python natif : demi au pair sur la valeur double EXACTE (donc
 * `round(2.675, 2)` = 2,67, `round(0.125, 2)` = 0,12, `round(2.5)` = 2). Sert au formatage d'affichage
 * (`format.ts`, port de `report_format.py`). À ne pas confondre avec `numpyRound` (résultats pandas/numpy).
 */
export function pythonRound(x: number, digits = 0): number {
  const r = pythonRoundSigned(x, digits);
  return r === 0 ? 0 : r; // pas de -0
}

function pythonRoundSigned(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  // `toFixed` donne l'arrondi exact (demi vers le haut) ; seuls les ex æquo exacts demandent un traitement.
  const wide = abs.toFixed(Math.min(100, digits + EXACT_TIE_PROBE));
  const tail = wide.slice(wide.indexOf('.') + 1 + digits);
  if (!/^50*$/.test(tail)) return sign * Number(abs.toFixed(digits));
  // Ex æquo exact : on garde la valeur tronquée si son dernier chiffre est pair, sinon on monte d'un cran.
  const down = abs
    .toFixed(digits + 1)
    .slice(0, -1)
    .replace(/\.$/, '');
  if (Number(down.slice(-1)) % 2 === 0) return sign * Number(down);
  return sign * Number((Number(down) + 10 ** -digits).toFixed(digits));
}

/** Nombre de décimales supplémentaires examinées pour reconnaître un ex æquo exact. */
const EXACT_TIE_PROBE = 30;

/** Comparaison de chaînes par point de code, comme le tri de pandas sur des `str`. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Rang d'une valeur (1 = la plus haute) : les ex æquo partagent le même rang. */
export function rankOf(value: number, values: readonly number[]): number {
  let above = 0;
  for (const v of values) if (v > value) above += 1;
  return above + 1;
}
