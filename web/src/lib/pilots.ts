/**
 * Pilotes (phase 5, lot A) : résumés pour la liste, filtres de page, années de carrière, records
 * personnels et frise des voiles. Fonctions pures ; les composants restent minces.
 *
 * Conventions : une durée inconnue compte 0 minute (comme `rhythm.ts`), les mesures <= 0 sont déjà `null`.
 */
import type { Discipline, Flight } from '@/data/flight';
import { groupBy } from '@/lib/collections';
import type { FilterDimension, Filters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { normalizeText } from '@/lib/flightsTable';
import { distinctCount, sum } from '@/lib/numeric';
import { RECORD_KEYS, topRecords, type RecordEntry, type RecordKey } from '@/lib/records';
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
// Vue filtrée
// ---------------------------------------------------------------------------

/**
 * Libellés des filtres qui réduisent la vue (« paramoteur », « 2025 », « 2 voiles »…), hors dimensions
 * `omit`. Vide si rien ne réduit la vue.
 */
export function filterSummary(
  filters: Filters,
  omit: readonly FilterDimension[] = [],
  siteName: (id: number) => string = (id) => `site ${id}`,
): string[] {
  const out: string[] = [];
  if (!omit.includes('pilots') && filters.pilots.length > 0) {
    out.push(filters.pilots.length === 1 ? filters.pilots[0]! : `${filters.pilots.length} pilotes`);
  }
  if (!omit.includes('activity') && filters.activity !== 'tout') out.push(filters.activity);
  if (!omit.includes('period') && (filters.dateFrom !== null || filters.dateTo !== null)) {
    const { dateFrom: from, dateTo: to } = filters;
    if (from && to && from.slice(0, 4) === to.slice(0, 4) && from.endsWith('-01-01') && to.endsWith('-12-31')) {
      out.push(from.slice(0, 4));
    } else if (from && to) out.push(`du ${fmtDate(from, { withYear: true })} au ${fmtDate(to, { withYear: true })}`);
    else if (from) out.push(`depuis le ${fmtDate(from, { withYear: true })}`);
    else if (to) out.push(`jusqu’au ${fmtDate(to, { withYear: true })}`);
  }
  if (!omit.includes('wings') && filters.wings.length > 0) {
    out.push(filters.wings.length === 1 ? filters.wings[0]! : `${filters.wings.length} voiles`);
  }
  if (!omit.includes('sites') && filters.sites.length > 0) {
    out.push(filters.sites.length === 1 ? siteName(filters.sites[0]!) : `${filters.sites.length} sites`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Carrière
// ---------------------------------------------------------------------------

export interface CareerBar {
  year: number;
  pMin: number;
  mMin: number;
  pN: number;
  mN: number;
}

export interface CareerBars {
  /** Une ligne par année avec vol, de la plus ancienne à la plus récente. */
  years: CareerBar[];
  /** Année avec le plus d'heures, puis le plus de vols ; à égalité la plus récente. */
  bestHoursYear: number | null;
  bestFlightsYear: number | null;
}

function bestYear(rows: readonly CareerBar[], score: (r: CareerBar) => number): number | null {
  let best: CareerBar | null = null;
  for (const r of rows) if (best === null || score(r) >= score(best)) best = r;
  return best?.year ?? null;
}

/** Barres de la carrière, valable dès une seule année (`computeCareer` en exige deux, pour ses KPI). */
export function careerBars(flights: readonly Flight[]): CareerBars {
  const years: CareerBar[] = [];
  for (const [year, group] of groupBy(flights, (f) => f.year)) {
    const p = group.filter((f) => f.activity === 'parapente');
    const m = group.filter((f) => f.activity === 'paramoteur');
    years.push({ year, pMin: sum(p.map(minutesOf)), mMin: sum(m.map(minutesOf)), pN: p.length, mN: m.length });
  }
  years.sort((a, b) => a.year - b.year);
  return {
    years,
    bestHoursYear: bestYear(years, (r) => r.pMin + r.mMin),
    bestFlightsYear: bestYear(years, (r) => r.pN + r.mN),
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
  const top = topRecords(flights, 1);
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
