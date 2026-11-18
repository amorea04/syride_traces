/**
 * Pilotes (phase 5, lot A) : résumés pour la liste, filtres de page, années de carrière, records
 * personnels et frise des voiles. Fonctions pures ; les composants restent minces.
 *
 * Conventions : une durée inconnue compte 0 minute (comme `rhythm.ts`), les mesures <= 0 sont déjà `null`.
 */
import type { Discipline, Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import { normalizeText } from '@/lib/flightsTable';
import { distinctCount, sum } from '@/lib/numeric';
import {
  bestCareerYear,
  CAREER_MIN_YEARS,
  careerFromRows,
  careerYearRows,
  RECORD_KEYS,
  topRecords,
  type Career,
  type CareerYear,
  type RecordEntry,
  type RecordKey,
} from '@/lib/records';
import { minutesOf } from '@/lib/rhythm';

// ---------------------------------------------------------------------------
// Liste des pilotes
// ---------------------------------------------------------------------------

export interface PilotSummary {
  slug: string;
  pilot: string;
  flights: number;
  minutes: number;
  /** Discipline qui compte le plus d'heures (à égalité : le plus de vols, puis parapente). */
  mainActivity: Discipline;
  /** Part du parapente dans les heures (0 à 1) ; 0 sans durée. */
  parapenteShare: number;
  firstDate: string;
  lastDate: string;
  firstYear: number;
}

export function pilotSummaries(flights: readonly Flight[]): PilotSummary[] {
  const out: PilotSummary[] = [];
  for (const [slug, group] of groupBy(flights, (f) => f.pilotSlug)) {
    const dates = group.map((f) => f.date).sort();
    const pMin = sum(group.filter((f) => f.activity === 'parapente').map(minutesOf));
    const mMin = sum(group.filter((f) => f.activity === 'paramoteur').map(minutesOf));
    const pN = group.filter((f) => f.activity === 'parapente').length;
    const mN = group.length - pN;
    const parapente = pMin !== mMin ? pMin > mMin : pN >= mN;
    const first = dates[0] as string;
    out.push({
      slug,
      pilot: (group[0] as Flight).pilot,
      flights: group.length,
      minutes: pMin + mMin,
      mainActivity: parapente ? 'parapente' : 'paramoteur',
      parapenteShare: pMin + mMin > 0 ? pMin / (pMin + mMin) : 0,
      firstDate: first,
      lastDate: dates[dates.length - 1] as string,
      firstYear: Number(first.slice(0, 4)),
    });
  }
  return out;
}

export type PilotSortKey = 'heures' | 'vols' | 'dernier' | 'nom';

export const PILOT_SORTS: readonly { value: PilotSortKey; label: string }[] = [
  { value: 'heures', label: 'Heures de vol' },
  { value: 'vols', label: 'Nombre de vols' },
  { value: 'dernier', label: 'Dernier vol' },
  { value: 'nom', label: 'Nom' },
];

const nameCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Tri stable : décroissant pour les volumes et la date, alphabétique pour le nom ; le nom départage. */
export function sortPilots(rows: readonly PilotSummary[], key: PilotSortKey): PilotSummary[] {
  const byName = (a: PilotSummary, b: PilotSummary) => nameCollator.compare(a.pilot, b.pilot);
  const compare: Record<PilotSortKey, (a: PilotSummary, b: PilotSummary) => number> = {
    heures: (a, b) => b.minutes - a.minutes || byName(a, b),
    vols: (a, b) => b.flights - a.flights || byName(a, b),
    dernier: (a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : byName(a, b)),
    nom: byName,
  };
  return [...rows].sort(compare[key]);
}

/** Pilotes dont le pseudo contient tous les mots de la recherche (accents et casse ignorés). */
export function searchPilots(rows: readonly PilotSummary[], query: string): PilotSummary[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...rows];
  return rows.filter((r) => {
    const name = normalizeText(r.pilot);
    return terms.every((t) => name.includes(t));
  });
}

// ---------------------------------------------------------------------------
// Carrière
// ---------------------------------------------------------------------------

export type CareerBar = CareerYear;

export interface CareerBars {
  /** Une ligne par année avec vol, de la plus ancienne à la plus récente. */
  years: CareerBar[];
  /** Année avec le plus d'heures, puis le plus de vols ; à égalité la plus récente (règle de `computeCareer`). */
  bestHoursYear: number | null;
  bestFlightsYear: number | null;
  /** KPI de carrière (`computeCareer`), `null` sous 2 années ; calculés avec les barres, en un seul passage. */
  career: Career | null;
}

/** Barres de la carrière, valables dès une seule année (les KPI de `career` en exigent deux). */
export function careerBars(flights: readonly Flight[]): CareerBars {
  const years = careerYearRows(flights);
  return {
    years,
    bestHoursYear: bestCareerYear(years, (r) => r.pMin + r.mMin),
    bestFlightsYear: bestCareerYear(years, (r) => r.pN + r.mN),
    career: years.length >= CAREER_MIN_YEARS ? careerFromRows(flights, years) : null,
  };
}

// ---------------------------------------------------------------------------
// Cartes par année
// ---------------------------------------------------------------------------

export interface YearCard {
  year: number;
  flights: number;
  minutes: number;
  sites: number;
  /** Minutes par mois (index 0 = janvier). */
  months: number[];
  /** Variation des heures par rapport à l'année précédente (à date pour l'année en cours) ; `null` sans année précédente. */
  deltaPct: number | null;
  /** Année de la date de référence : l'année n'est pas terminée. */
  inProgress: boolean;
  /** Aucune année antérieure dans les données. */
  first: boolean;
}

/** Cartes des années, de la plus récente à la plus ancienne. `refDate` = date de mise à jour des données. */
export function yearCards(flights: readonly Flight[], refDate: string): YearCard[] {
  const byYear = groupBy(flights, (f) => f.year);
  const refYear = Number(refDate.slice(0, 4));
  const refDay = refDate.slice(5);
  const minutesOfYear = (year: number, upTo?: string): number | null => {
    const group = byYear.get(year);
    if (!group) return null;
    return sum(group.filter((f) => upTo === undefined || f.date.slice(5) <= upTo).map(minutesOf));
  };
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const oldest = years[years.length - 1];
  return years.map((year) => {
    const group = byYear.get(year) as Flight[];
    const months = new Array<number>(12).fill(0);
    for (const f of group) months[f.month - 1] = (months[f.month - 1] ?? 0) + minutesOf(f);
    const inProgress = year === refYear;
    const current = inProgress ? minutesOfYear(year, refDay) : minutesOfYear(year);
    const previous = minutesOfYear(year - 1, inProgress ? refDay : undefined);
    return {
      year,
      flights: group.length,
      minutes: sum(group.map(minutesOf)),
      sites: distinctCount(group.map((f) => f.site)),
      months,
      deltaPct: current !== null && previous !== null && previous > 0 ? (100 * (current - previous)) / previous : null,
      inProgress,
      first: year === oldest,
    };
  });
}

// ---------------------------------------------------------------------------
// Records personnels
// ---------------------------------------------------------------------------

export const PERSONAL_RECORD_LABELS: Readonly<Record<RecordKey, string>> = {
  duree: 'Plus long vol',
  plafond: 'Plus haut',
  distance: 'Plus loin',
  vario: 'Vario max',
  vitesseMax: 'Vitesse max',
  g: 'g max',
};

/** Ordre d'affichage : durée, plafond, distance, vario, vitesse, g. */
export const PERSONAL_RECORD_ORDER: readonly RecordKey[] = ['duree', 'plafond', 'distance', 'vario', 'vitesseMax', 'g'];

export interface PersonalRecord {
  key: RecordKey;
  label: string;
  entry: RecordEntry | null;
}

export function personalRecords(flights: readonly Flight[]): PersonalRecord[] {
  // `topRecords` garde l'ordre d'entrée à valeur et date égales : un tri préalable par numéro Syride décroissant
  // aligne le départage sur `compareRanked` (page Records), pour que les deux pages désignent le même vol.
  const ordered = [...flights].sort((a, b) => b.syrideNum - a.syrideNum);
  const top = topRecords(ordered, 1);
  return PERSONAL_RECORD_ORDER.filter((k) => RECORD_KEYS.includes(k)).map((key) => ({
    key,
    label: PERSONAL_RECORD_LABELS[key],
    entry: top[key][0] ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Voiles dans le temps
// ---------------------------------------------------------------------------

export interface Quarter {
  year: number;
  /** 1 à 4. */
  quarter: number;
}

export interface WingTimelineRow {
  wing: string;
  flights: number;
  /** Vols par trimestre, aligné sur `WingTimeline.quarters`. */
  counts: number[];
}

export interface WingTimeline {
  quarters: Quarter[];
  rows: WingTimelineRow[];
  /** Voiles non affichées (au-delà de `maxRows`). */
  hidden: number;
  /** Plus grand nombre de vols dans un trimestre parmi les voiles affichées. */
  maxCount: number;
}

const quarterIndex = (f: Flight): number => f.year * 4 + Math.floor((f.month - 1) / 3);

/** Frise : une ligne par voile (les plus utilisées d'abord), un trimestre par colonne, sans trou entre le premier et le dernier. */
export function wingTimeline(flights: readonly Flight[], maxRows = 12): WingTimeline {
  const withWing = flights.filter((f) => f.wing !== null);
  if (withWing.length === 0) return { quarters: [], rows: [], hidden: 0, maxCount: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of withWing) {
    const q = quarterIndex(f);
    if (q < lo) lo = q;
    if (q > hi) hi = q;
  }
  const quarters: Quarter[] = [];
  for (let q = lo; q <= hi; q += 1) quarters.push({ year: Math.floor(q / 4), quarter: (q % 4) + 1 });
  const all: WingTimelineRow[] = [];
  for (const [wing, group] of groupBy(withWing, (f) => f.wing)) {
    const counts = new Array<number>(quarters.length).fill(0);
    for (const f of group) counts[quarterIndex(f) - lo] = (counts[quarterIndex(f) - lo] ?? 0) + 1;
    all.push({ wing, flights: group.length, counts });
  }
  all.sort((a, b) => b.flights - a.flights || nameCollator.compare(a.wing, b.wing));
  const rows = all.slice(0, maxRows);
  return {
    quarters,
    rows,
    hidden: all.length - rows.length,
    maxCount: Math.max(0, ...rows.flatMap((r) => r.counts)),
  };
}

/** Niveau d'intensité 0 (aucun vol) à 4, proportionnel au plus grand effectif. */
export function intensityLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  return ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
}
