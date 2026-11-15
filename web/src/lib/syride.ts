/** Liens vers syride.com (lien unique de l'application, cf. brief phase 2). */
const SYRIDE_PILOTS_URL = 'https://www.syride.com/fr/pilotes/';

/** Page d'un pilote : pseudo Syride exact, encodé pour l'URL. */
export function syridePilotUrl(pilot: string): string {
  return `${SYRIDE_PILOTS_URL}${encodeURIComponent(pilot)}`;
}

/** Page d'un vol : `<pseudo exact encodé>/<syride_num>`. */
export function syrideFlightUrl(pilot: string, num: number): string {
  return `${syridePilotUrl(pilot)}/${num}`;
}
