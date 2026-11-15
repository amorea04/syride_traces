import { weekdayOfIso } from '@/lib/isoDay';
import type { Discipline, FlightsFile } from '@/data/schema.gen';

export type { Discipline };

/** Saisons météorologiques, comme `SEASONS` / `month_season` côté rapport (déc.–fév. = hiver). */
export type Season = 'hiver' | 'printemps' | 'été' | 'automne';

/** Saison par mois, indexée de 0 (janvier) à 11 (décembre). */
const SEASON_BY_MONTH: readonly Season[] = [
  'hiver',
  'hiver',
  'printemps',
  'printemps',
  'printemps',
  'été',
  'été',
  'été',
  'automne',
  'automne',
  'automne',
  'hiver',
];

/** Saison d'un mois 1–12. */
export function seasonOfMonth(month: number): Season {
  const season = SEASON_BY_MONTH[month - 1];
  if (!season) throw new Error(`Mois invalide : ${month}`);
  return season;
}

/** Ligne brute de `flights.json`, dans l'ordre de `columns`. */
export type FlightRow = readonly [
  pilot: number,
  activity: number,
  date: string,
  time: string | null,
  site: number | null,
  wing: number | null,
  instrument: number | null,
  mode: number | null,
  durationMin: number | null,
  distKm: number | null,
  distCumKm: number | null,
  speedAvg: number | null,
  speedMax: number | null,
  ceilingM: number | null,
  gainM: number | null,
  varioMax: number | null,
  gMax: number | null,
  incomplete: boolean,
  source: number,
  syrideNum: number,
];

export type FlightSource = 'gpx' | 'fiche' | 'aucune';

/** Un vol décodé : catégories résolues en chaînes, dérivés calculés une seule fois. */
export interface Flight {
  /** `pilotSlug-syrideNum` : identifiant unique, utilisé dans l'URL /vol/:key. */
  key: string;
  /** Pseudo Syride exact (pour le lien syride.com). */
  pilot: string;
  pilotSlug: string;
  activity: Discipline;
  /** Date ISO AAAA-MM-JJ (toujours présente : le schéma écarte les vols sans date). */
  date: string;
  /** Heure de décollage « HH:MM », ou null. */
  time: string | null;
  site: string | null;
  /** Identifiant du site = index dans `sites.json`. */
  siteId: number | null;
  wing: string | null;
  instrument: string | null;
  mode: string | null;
  source: FlightSource;
  durationMin: number | null;
  distKm: number | null;
  distCumKm: number | null;
  speedAvg: number | null;
  speedMax: number | null;
  ceilingM: number | null;
  gainM: number | null;
  varioMax: number | null;
  gMax: number | null;
  incomplete: boolean;
  syrideNum: number;
  // Dérivés
  year: number;
  /** 1–12. */
  month: number;
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  season: Season;
  /** Heure décimale de décollage (11:30 → 11,5), ou null. */
  hour: number | null;
  /** Jour calendaire (= `date`), clé de regroupement par jour. */
  dayKey: string;
}

/** Heure décimale d'un « HH:MM », ou null. */
export function decimalHour(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}

/** Jour de la semaine, 0 = lundi, d'une date ISO AAAA-MM-JJ (calcul en UTC, sans fuseau). */
export function weekdayOf(isoDate: string): number {
  return weekdayOfIso(isoDate);
}

function pick(table: readonly string[], index: number | null, what: string): string | null {
  if (index === null) return null;
  const value = table[index];
  if (value === undefined) throw new Error(`Index ${what} hors dictionnaire : ${index}`);
  return value;
}

function need(table: readonly string[], index: number, what: string): string {
  const value = pick(table, index, what);
  if (value === null) throw new Error(`Index ${what} manquant`);
  return value;
}

/** Décode le fichier colonnaire en vols. Fonction pure. */
export function decodeFlights(file: FlightsFile): Flight[] {
  const { dict, pilot_slugs: slugs } = file;
  const rows = file.rows as unknown as readonly FlightRow[];
  return rows.map((r): Flight => {
    const [pilotIdx, activityIdx, date, time, siteIdx, wingIdx, instrumentIdx, modeIdx] = r;
    const slug = need(slugs, pilotIdx, 'pilot_slugs');
    const [y = 0, mo = 1] = date.split('-').map(Number);
    return {
      key: `${slug}-${r[19]}`,
      pilot: need(dict.pilot, pilotIdx, 'pilot'),
      pilotSlug: slug,
      activity: need(dict.activity, activityIdx, 'activity') as Discipline,
      date,
      time,
      site: pick(dict.site, siteIdx, 'site'),
      siteId: siteIdx,
      wing: pick(dict.wing, wingIdx, 'wing'),
      instrument: pick(dict.instrument, instrumentIdx, 'instrument'),
      mode: pick(dict.mode, modeIdx, 'mode'),
      source: need(dict.source, r[18], 'source') as FlightSource,
      durationMin: r[8],
      distKm: r[9],
      distCumKm: r[10],
      speedAvg: r[11],
      speedMax: r[12],
      ceilingM: r[13],
      gainM: r[14],
      varioMax: r[15],
      gMax: r[16],
      incomplete: r[17],
      syrideNum: r[19],
      year: y,
      month: mo,
      weekday: weekdayOf(date),
      season: seasonOfMonth(mo),
      hour: decimalHour(time),
      dayKey: date,
    };
  });
}
