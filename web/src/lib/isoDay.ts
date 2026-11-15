/** Arithmétique de jours sur des dates ISO AAAA-MM-JJ, en UTC (aucun fuseau, aucun changement d'heure). */

const MS_PER_DAY = 86_400_000;
/** Le 1er janvier 1970 est un jeudi : jour 3 avec lundi = 0. */
const EPOCH_WEEKDAY = 3;

/** Numéro de jour depuis le 1er janvier 1970 d'une date ISO. */
export function epochDay(iso: string): number {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Date ISO d'un numéro de jour depuis le 1er janvier 1970. */
export function isoOfEpochDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Jour de la semaine d'un numéro de jour, 0 = lundi … 6 = dimanche. */
export function weekdayOfEpochDay(day: number): number {
  return (((day + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

/** Lundi de la semaine (lundi-dimanche) qui contient ce numéro de jour. */
export function mondayOfEpochDay(day: number): number {
  return day - weekdayOfEpochDay(day);
}

/** Nombre de jours du mois (1–12) d'une année. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Jour de la semaine d'une date ISO, 0 = lundi … 6 = dimanche. */
export function weekdayOfIso(iso: string): number {
  return weekdayOfEpochDay(epochDay(iso));
}

/** Lendemain d'une date ISO. */
export function nextIsoDay(iso: string): string {
  return isoOfEpochDay(epochDay(iso) + 1);
}
