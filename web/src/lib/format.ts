/**
 * Formatage « à la française » : port de `src/rapport/report_format.py` avec `Intl`.
 *
 * Différences assumées avec le Python :
 * - le séparateur de milliers est l'espace fine insécable U+202F (celle d'`Intl` en fr-FR, norme
 *   typographique), le Python utilisant l'espace insécable U+00A0 ; les espaces entre un nombre et
 *   son unité restent des U+00A0 comme en Python ;
 * - les heures d'une durée sont groupées par milliers (« 2 096 h 01 ») ;
 * - les dates ISO sont lues sans fuseau (aucun décalage possible).
 * Les arrondis suivent `round()` de Python (arrondi au pair le plus proche sur les ex æquo).
 */
import { weekdayOf } from '@/data/flight';
import { pythonRound } from '@/lib/numeric';

/** Espace insécable : entre un nombre et son unité. */
export const NBSP = '\u00a0';
/** Espace fine insécable : séparateur de milliers. */
export const THOUSANDS_SEP = '\u202f';
/** Valeur absente. */
export const EMPTY = '–';

export const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;
export const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;
export const DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export const DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'] as const;

/** Arrondi à `digits` décimales, ex æquo au pair (`round()` de Python, cf. `pythonRound`). */
const roundDigits = pythonRound;

const formatters = new Map<number, Intl.NumberFormat>();

function formatter(digits: number): Intl.NumberFormat {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true,
    });
    formatters.set(digits, f);
  }
  return f;
}

/** Normalise les séparateurs d'`Intl` (espaces fines ou insécables diverses) vers `THOUSANDS_SEP`. */
function normalizeSeparators(text: string): string {
  return text.replace(/[\u00a0\u202f\u2009 ]/g, THOUSANDS_SEP).replace(/\u2212/g, '-');
}

/** Entier avec séparateur de milliers : 2450 → « 2 450 ». */
export function fmtInt(value: number): string {
  const rounded = pythonRound(value);
  return normalizeSeparators(formatter(0).format(Object.is(rounded, -0) ? 0 : rounded));
}

/** Décimal avec virgule ; les zéros ne sont pas supprimés (34,0). */
export function fmtNum(value: number, digits = 1): string {
  const rounded = roundDigits(value, digits);
  return normalizeSeparators(formatter(digits).format(Object.is(rounded, -0) ? 0 : rounded));
}

/** Nombre « parlant » : une décimale sous 10 (sans « ,0 » inutile), entier au-dessus : 3,2 ; 4 ; 27. */
export function fmtReadable(value: number): string {
  if (value >= 10 || roundDigits(value, 1) === pythonRound(value)) {
    return fmtInt(value);
  }
  return fmtNum(value, 1);
}

/** Durée en minutes : « 42 h 18 min », « 35 min », « 3 h ». */
export function fmtDuration(minutes: number): string {
  const total = pythonRound(minutes);
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  if (hours === 0) return `${mins}${NBSP}min`;
  if (mins === 0) return `${fmtInt(hours)}${NBSP}h`;
  return `${fmtInt(hours)}${NBSP}h${NBSP}${String(mins).padStart(2, '0')}${NBSP}min`;
}

/** Durée en minutes au format compact « 2 096 h 01 » (heures, minutes sur deux chiffres). */
export function fmtHm(minutes: number): string {
  const total = pythonRound(minutes);
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  return `${fmtInt(hours)}${NBSP}h${NBSP}${String(mins).padStart(2, '0')}`;
}

/** Durée en minutes → heures décimales : « 42,3 h ». */
export function fmtHours(minutes: number, digits = 1): string {
  return `${fmtNum(minutes / 60, digits)}${NBSP}h`;
}

/** Pourcentage : « 12 % » (valeur déjà en pourcents). */
export function fmtPercent(value: number, digits = 0): string {
  return `${fmtNum(value, digits)}${NBSP}%`;
}

/** Variation en % avec signe : « +12 % », « −8 % », « = » si nulle, « – » si inconnue. */
export function fmtSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  const rounded = pythonRound(value);
  if (rounded === 0) return '=';
  const sign = rounded > 0 ? '+' : '\u2212';
  return `${sign}${Math.abs(rounded)}${NBSP}%`;
}

/** « 1 vol », « 61 vols » (0 et 1 au singulier, comme en français). */
export function plural(count: number, singular: string, many?: string): string {
  const word = Math.abs(count) < 2 ? singular : (many ?? `${singular}s`);
  return `${fmtInt(count)}${NBSP}${word}`;
}

/** Applique `formatter` si la valeur existe, sinon « – ». */
export function fmtOrDash<T>(value: T | null | undefined, format: (v: T) => string): string {
  return value === null || value === undefined ? EMPTY : format(value);
}

interface YMD {
  year: number;
  month: number;
  day: number;
}

function parseIso(iso: string): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) throw new Error(`Date ISO invalide : ${iso}`);
  const [, y = '0', m = '1', d = '1'] = match;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

function monthLong(month: number): string {
  return MONTHS_LONG[month - 1] ?? '';
}

/** « 12 juillet », « 12 juillet 2026 », « dimanche 12 juillet 2026 » (date ISO AAAA-MM-JJ). */
export function fmtDate(iso: string, options: { withYear?: boolean; weekday?: boolean } = {}): string {
  const { year, month, day } = parseIso(iso);
  let text = `${day}${NBSP}${monthLong(month)}`;
  if (options.withYear) text += `${NBSP}${year}`;
  if (options.weekday) text = `${DAYS_LONG[weekdayOf(iso)] ?? ''} ${text}`;
  return text;
}

/** « le 3 mars », « du 3 au 7 mars », « du 28 février au 3 mars » (sans année). */
export function fmtRange(start: string, end: string): string {
  if (start === end) return `le ${fmtDate(start)}`;
  const a = parseIso(start);
  const b = parseIso(end);
  if (a.year === b.year && a.month === b.month) return `du ${a.day} au ${fmtDate(end)}`;
  return `du ${fmtDate(start)} au ${fmtDate(end)}`;
}

/** « 12 juil. » */
export function fmtDateShort(iso: string): string {
  const { month, day } = parseIso(iso);
  return `${day}${NBSP}${MONTHS_SHORT[month - 1] ?? ''}`;
}

/** « 12/07/2026 » (colonnes de tableau). */
export function fmtDateNumeric(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}
