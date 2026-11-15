import { decimalHour, seasonOfMonth, weekdayOf, type Flight } from '@/data/flight';

let counter = 0;

/** Vol de test : champs par défaut neutres, dérivés (année, mois, jour, saison, heure) calculés depuis `date` et `time`. */
export function makeFlight(date: string, overrides: Partial<Flight> = {}): Flight {
  counter += 1;
  const [y = 0, m = 1] = date.split('-').map(Number);
  const time = overrides.time === undefined ? '12:00' : overrides.time;
  return {
    key: `p-${counter}`,
    pilot: 'Pilote',
    pilotSlug: 'pilote',
    activity: 'parapente',
    date,
    time,
    site: 'Site A',
    siteId: 0,
    wing: 'Voile A',
    instrument: null,
    mode: 'Site',
    source: 'gpx',
    durationMin: 60,
    distKm: null,
    distCumKm: null,
    speedAvg: null,
    speedMax: null,
    ceilingM: null,
    gainM: null,
    varioMax: null,
    gMax: null,
    incomplete: false,
    syrideNum: counter,
    year: y,
    month: m,
    weekday: weekdayOf(date),
    season: seasonOfMonth(m),
    hour: decimalHour(time),
    dayKey: date,
    ...overrides,
  };
}
