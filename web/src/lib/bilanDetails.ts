/**
 * Bilan pilote × année, sections « détails » (quand, où, matos, records, vols, actions, données).
 * Fonctions pures. Les phrases viennent des insights ; ici seulement du marquage (nouveautés, records battus),
 * du cadrage de carte et de la mise en forme de valeurs, avec les règles de `report_html.py` (RECORD_LABELS,
 * `_record_delta`, `partial_pill`).
 */
import type { Flight } from '@/data/flight';
import type { Story } from '@/data/schema.gen';
import { fmtDate, fmtDuration, fmtHm, fmtHours, fmtInt, fmtNum, NBSP, plural } from '@/lib/format';
import { COVERAGE_NOTICE_THRESHOLD } from '@/lib/rhythmBlocks';
import { MEASURES } from '@/lib/measures';
import type { Bounds } from '@/lib/mapSites';
import {
  bestFlight,
  computeKpis,
  siteRows,
  topRecords,
  wingRows,
  type RecordEntry,
  type RecordKey,
  type SiteRow,
  type WingRow,
} from '@/lib/records';

type StoryOf = NonNullable<Story>;

// ---------------------------------------------------------------------------
// Fichier CSV
// ---------------------------------------------------------------------------

/** Nom du fichier exporté par la barre d'actions : `bilan-<slug>-<année>.csv`. */
export function bilanCsvName(slug: string, year: number): string {
  return `bilan-${slug}-${year}.csv`;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

type ValueKind = 'int' | 'dur' | 'num';

export interface RecordCardDef {
  key: RecordKey;
  /** Clé du critère dans `story.records_beaten[].metric`. */
  beatenMetric: StoryOf['records_beaten'][number]['metric'];
  title: string;
  unit: string;
  kind: ValueKind;
  /** Libellé de la mesure pour la pastille « Données partielles » (absent pour la durée, toujours connue). */
  measureName: string | null;
}

/** Ordre et formats de `RECORD_LABELS` du rapport. */
export const RECORD_CARDS: readonly RecordCardDef[] = [
  { key: 'duree', beatenMetric: 'duree', title: 'Vol le plus long', unit: '', kind: 'dur', measureName: null },
  { key: 'distance', beatenMetric: 'distance', title: 'Plus longue distance', unit: 'km', kind: 'int', measureName: 'Distance' },
  { key: 'plafond', beatenMetric: 'plafond', title: 'Plus haut', unit: 'm', kind: 'int', measureName: 'Plafond' },
  { key: 'vitesseMax', beatenMetric: 'vitesse_max', title: 'Vitesse max', unit: 'km/h', kind: 'int', measureName: 'Vitesse max' },
  { key: 'vario', beatenMetric: 'vario', title: 'Meilleur vario', unit: 'm/s', kind: 'num', measureName: 'Vario max' },
  { key: 'g', beatenMetric: 'g', title: 'Facteur g maximal', unit: 'g', kind: 'num', measureName: 'Facteur g' },
];

/** `_fmt_value` du rapport : valeur formatée suivie de son unité. */
export function formatRecordValue(kind: ValueKind, unit: string, value: number): string {
  const text = kind === 'int' ? fmtInt(value) : kind === 'dur' ? fmtDuration(value) : fmtNum(value, 1);
  return unit ? `${text}${NBSP}${unit}` : text;
}

/** `_record_delta` : écart d'un record battu, « +180 m », « +12 min » (une décimale si l'entier arrondi serait nul). */
export function recordDelta(kind: ValueKind, unit: string, delta: number): string {
  const k = kind === 'int' && delta < 0.95 ? 'num' : kind;
  return `+${formatRecordValue(k, unit, delta)}`;
}

export interface BeatenRecord {
  value: number;
  previous: number;
  previousYear: number;
  delta: number;
  date: string;
  /** Clé du vol (`/vol/:key`), `null` si inconnue. */
  flight: string | null;
}

/** Records battus (`story.records_beaten`) rangés par critère. */
export function beatenByKey(story: Pick<StoryOf, 'records_beaten'>): Map<RecordKey, BeatenRecord> {
  const byMetric = new Map(RECORD_CARDS.map((c) => [c.beatenMetric as string, c.key] as const));
  const out = new Map<RecordKey, BeatenRecord>();
  for (const r of story.records_beaten) {
    const key = byMetric.get(r.metric);
    if (!key) continue;
    out.set(key, {
      value: r.value,
      previous: r.previous,
      previousYear: r.previous_year,
      delta: r.value - r.previous,
      date: r.date,
      flight: r.flight,
    });
  }
  return out;
}

/** Clés des vols qui ont battu au moins un record cette année. */
export function recordFlightKeys(story: Pick<StoryOf, 'records_beaten'>): Set<string> {
  const keys = new Set<string>();
  for (const r of story.records_beaten) if (r.flight) keys.add(r.flight);
  return keys;
}

export interface RecordCard {
  def: RecordCardDef;
  rows: (RecordEntry & { rank: number; isNew: boolean })[];
  beaten: BeatenRecord | null;
  /** Meilleur vol des années précédentes (situe l'année quand aucun record n'est battu). */
  previousBest: { value: number; year: number } | null;
  /** Vols de l'année où la mesure existe (> 0) et vols de l'année. */
  measured: { ok: number; total: number };
  /** Plus de 20 % des vols sans la mesure : pastille « Données partielles ». */
  partial: boolean;
}

/**
 * Cartes « Tes records » : top 5 de chaque critère sur les vols de l'année (`topRecords`, comme `_records`),
 * records battus de l'insight, meilleur vol des années antérieures (`compute_records_history`).
 * Une carte sans mesure n'existe pas (comme dans le rapport).
 */
export function recordCards(
  flights: readonly Flight[],
  history: readonly Flight[],
  year: number,
  story: Pick<StoryOf, 'records_beaten'>,
): RecordCard[] {
  const tops = topRecords(flights, 5);
  const beaten = beatenByKey(story);
  const past = history.filter((f) => f.year < year);
  const cards: RecordCard[] = [];
  for (const def of RECORD_CARDS) {
    const entries = tops[def.key];
    if (entries.length === 0) continue;
    const b = beaten.get(def.key) ?? null;
    const measure = MEASURES[measureIdOf(def.key)];
    const ok = flights.filter((f) => (measure.of(f) ?? 0) > 0).length;
    const prev = b ? null : bestFlight(past, def.key);
    cards.push({
      def,
      rows: entries.map((e, i) => ({
        ...e,
        rank: i + 1,
        isNew: b !== null && (b.flight !== null ? e.flightKey === b.flight : i === 0),
      })),
      beaten: b,
      previousBest: prev ? { value: prev.value, year: prev.year } : null,
      measured: { ok, total: flights.length },
      partial: def.measureName !== null && flights.length > 0 && (flights.length - ok) / flights.length > COVERAGE_NOTICE_THRESHOLD,
    });
  }
  return cards;
}

function measureIdOf(key: RecordKey): keyof typeof MEASURES {
  switch (key) {
    case 'plafond':
      return 'plafond';
    case 'vitesseMax':
      return 'vitesseMax';
    case 'distance':
      return 'distance';
    case 'vario':
      return 'vario';
    case 'g':
      return 'g';
    case 'duree':
      return 'duree';
  }
}

// ---------------------------------------------------------------------------
// Où : carte, zones, sites
// ---------------------------------------------------------------------------

export type Zone = StoryOf['map_zones'][number];

/** Emprise d'une zone (`bbox` = positions des sites de la zone, jamais d'un vol) ; `null` si elle est inutilisable. */
export function zoneBounds(zone: Pick<Zone, 'bbox'>): Bounds | null {
  const [w, s, e, n] = zone.bbox;
  if (![w, s, e, n].every(Number.isFinite)) return null;
  return [Math.min(w, e), Math.min(s, n), Math.max(w, e), Math.max(s, n)];
}

/** « 4 vols · 6,5 h » : détail d'un bouton de zone. */
export function zoneSummary(zone: Pick<Zone, 'flights' | 'minutes'>): string {
  return `${plural(zone.flights, 'vol')} · ${fmtHours(zone.minutes)}`;
}

/** Identifiants des sites découverts cette année (`story.new_sites`), retrouvés par leur nom dans les vols de l'année. */
export function newSiteIds(story: Pick<StoryOf, 'new_sites'>, flights: readonly Flight[]): number[] {
  const names = new Set(story.new_sites.map((s) => s.site));
  const ids = new Set<number>();
  for (const f of flights) if (f.site !== null && f.siteId !== null && names.has(f.site)) ids.add(f.siteId);
  return [...ids].sort((a, b) => a - b);
}

export interface SiteTableRow extends SiteRow {
  /** `null` si le nom ne correspond à aucun identifiant de site. */
  siteId: number | null;
  isNew: boolean;
  /** Date du premier vol sur ce site (nouveaux sites seulement). */
  firstDate: string | null;
}

/** Tableau des sites de l'année (ordre du rapport : minutes, vols, nom), nouveaux sites marqués. */
export function siteTableRows(flights: readonly Flight[], story: Pick<StoryOf, 'new_sites'>): SiteTableRow[] {
  const ids = new Map<string, number>();
  for (const f of flights) if (f.site !== null && f.siteId !== null && !ids.has(f.site)) ids.set(f.site, f.siteId);
  const fresh = new Map(story.new_sites.map((s) => [s.site, s.first_date] as const));
  return siteRows(flights).map((r) => ({
    ...r,
    siteId: ids.get(r.site) ?? null,
    isNew: fresh.has(r.site),
    firstDate: fresh.get(r.site) ?? null,
  }));
}

export interface ReachView {
  main: string;
  /** Part des vols sur le site principal, en pourcents (0 à 100). */
  mainSharePct: number;
  farthest: { site: string; km: number } | null;
}

/** Portée autour du site principal (`story.reach`) ; `null` avec un seul site. */
export function reachView(reach: StoryOf['reach']): ReachView | null {
  if (!reach) return null;
  return {
    main: reach.main_site,
    mainSharePct: reach.main_share * 100,
    farthest:
      reach.farthest_site !== null && reach.km !== null ? { site: reach.farthest_site, km: reach.km } : null,
  };
}

// ---------------------------------------------------------------------------
// Matos
// ---------------------------------------------------------------------------

export interface WingTableRow extends WingRow {
  isNew: boolean;
  firstDate: string | null;
}

/** Voiles de l'année (ordre du rapport), nouvelles voiles marquées (`story.new_wings`). */
export function wingTableRows(flights: readonly Flight[], story: Pick<StoryOf, 'new_wings'>): WingTableRow[] {
  const fresh = new Map(story.new_wings.map((w) => [w.wing, w.first_date] as const));
  return wingRows(flights).map((r) => ({ ...r, isNew: fresh.has(r.wing), firstDate: fresh.get(r.wing) ?? null }));
}

// ---------------------------------------------------------------------------
// Vols
// ---------------------------------------------------------------------------

/** Sélecteur CSS qui met en or les lignes des vols records (clés `pilote-numéro`, validées avant injection). */
export function recordRowsCss(keys: Iterable<string>, scope: string): string {
  const safe = [...keys].filter((k) => /^[a-z0-9_-]+$/i.test(k));
  if (safe.length === 0) return '';
  return `${safe.map((k) => `${scope} .sr-vt-row[data-key="${k}"]`).join(',\n')} { background: var(--sr-gold-bg); box-shadow: inset 3px 0 0 var(--sr-gold); }`;
}

// ---------------------------------------------------------------------------
// Résumé à copier
// ---------------------------------------------------------------------------

export interface SummaryInput {
  pilot: string;
  year: number;
  ongoing: boolean;
  cutoff: string;
  flights: readonly Flight[];
  story: StoryOf;
}

/** Faits repris des phrases du récit, dans l'ordre : au plus 3, jamais réécrits. */
const FACT_KEYS = ['records', 'ou', 'matos', 'rythme', 'quand'] as const;
export const SUMMARY_MAX_FACTS = 3;

/**
 * Résumé en texte brut, court : titre, 4 chiffres clés, écart, portrait et 2 ou 3 faits.
 * Les phrases viennent telles quelles des insights ; les lignes absentes sont omises.
 */
export function summaryText({ pilot, year, ongoing, cutoff, flights, story }: SummaryInput): string {
  const k = computeKpis(flights);
  const lines: string[] = [`Bilan ${year} · ${pilot}${ongoing ? ` (à date du ${fmtDate(cutoff, { withYear: true })})` : ''}`];
  const figures = [
    plural(k.nFlights, 'vol'),
    `${fmtHm(k.minutes)}${NBSP}de vol`,
    plural(k.nSites, 'site'),
  ];
  if (k.distanceTotal !== null && k.distanceTotal > 0) figures.push(`${fmtInt(k.distanceTotal)}${NBSP}km`);
  lines.push(figures.join(' · '));
  if (story.gap) lines.push(story.gap.text);
  if (story.persona) lines.push(story.persona.why ? `${story.persona.label} : ${story.persona.why}` : story.persona.label);
  const facts = FACT_KEYS.map((key) => story.texts[key]).filter((t): t is string => !!t);
  lines.push(...facts.slice(0, SUMMARY_MAX_FACTS));
  return lines.join('\n');
}
