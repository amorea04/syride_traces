/**
 * Liste des vols (/vols) : colonnes, recherche, tri, export CSV et mémorisation des préférences.
 * Fonctions pures, sans dépendance à React : la page et le tableau restent minces.
 */
import type { Flight } from '@/data/flight';
import { MEASURES, measureValue, type MeasureId } from '@/lib/metrics';
import { syrideFlightUrl } from '@/lib/syride';

/** Identifiants des colonnes de données (la colonne d'action n'est pas une colonne de données). */
export type ColumnId =
  | 'date'
  | 'pilot'
  | 'activity'
  | 'site'
  | 'wing'
  | 'duration'
  | 'distance'
  | 'ceiling'
  | 'speedMax'
  | 'varioMax'
  | 'gMax'
  | 'instrument'
  | 'mode'
  | 'gain'
  | 'distCum'
  | 'speedAvg'
  | 'source';

export type SortValue = string | number | null;

/** Une cellule d'export : valeur brute et nombre de décimales conservées pour un nombre. */
export interface CsvCell {
  header: string;
  value: (f: Flight) => string | number | null;
  /** Décimales conservées pour un nombre (0 = entier). */
  digits?: number;
}

export interface ColumnSpec {
  id: ColumnId;
  /** Libellé de l'en-tête et du sélecteur de colonnes. */
  label: string;
  /** Largeur en px dans la grille. */
  width: number;
  numeric: boolean;
  /** Visible tant que l'utilisateur n'a rien choisi. */
  defaultVisible: boolean;
  /** Valeur de tri (`null` = absente : toujours en fin de liste). */
  sortValue: (f: Flight) => SortValue;
  /** Colonne(s) de l'export CSV. */
  csv: readonly CsvCell[];
}

const SOURCE_LABELS: Record<Flight['source'], string> = {
  gpx: 'GPX',
  fiche: 'Fiche Syride',
  aucune: 'Aucune',
};

/** Libellé lisible de la provenance des statistiques. */
export function sourceLabel(source: Flight['source']): string {
  return SOURCE_LABELS[source];
}

const measureCsv = (header: string, value: (f: Flight) => number | null, digits: number): CsvCell => ({
  header,
  value,
  digits,
});

/**
 * Mesure de fiche d'un vol : `null` pour un vol incomplet (comme la fiche vol et les agrégats),
 * pour l'affichage, le tri et l'export.
 */
const ficheOf =
  (id: MeasureId) =>
  (f: Flight): number | null =>
    measureValue(f, MEASURES[id]);

/** Clé de tri chronologique : date, puis heure (un vol sans heure passe avant ceux du même jour). */
export function dateSortKey(f: Flight): string {
  return `${f.date} ${f.time ?? ''}`;
}

/** Les colonnes de données, dans l'ordre d'affichage. */
export const COLUMNS: readonly ColumnSpec[] = [
  {
    id: 'date',
    label: 'Date',
    width: 150,
    numeric: false,
    defaultVisible: true,
    sortValue: dateSortKey,
    csv: [
      { header: 'Date', value: (f) => f.date },
      { header: 'Heure', value: (f) => f.time },
    ],
  },
  {
    id: 'pilot',
    label: 'Pilote',
    width: 150,
    numeric: false,
    defaultVisible: true,
    sortValue: (f) => f.pilot,
    csv: [{ header: 'Pilote', value: (f) => f.pilot }],
  },
  {
    id: 'activity',
    label: 'Activité',
    width: 110,
    numeric: false,
    defaultVisible: true,
    sortValue: (f) => f.activity,
    csv: [{ header: 'Activité', value: (f) => f.activity }],
  },
  {
    id: 'site',
    label: 'Site',
    width: 190,
    numeric: false,
    defaultVisible: true,
    sortValue: (f) => f.site,
    csv: [{ header: 'Site', value: (f) => f.site }],
  },
  {
    id: 'wing',
    label: 'Voile',
    width: 170,
    numeric: false,
    defaultVisible: true,
    sortValue: (f) => f.wing,
    csv: [{ header: 'Voile', value: (f) => f.wing }],
  },
  {
    id: 'duration',
    label: 'Durée',
    width: 110,
    numeric: true,
    defaultVisible: true,
    sortValue: (f) => f.durationMin,
    csv: [measureCsv('Durée (min)', (f) => f.durationMin, 0)],
  },
  {
    id: 'distance',
    label: 'Distance',
    width: 100,
    numeric: true,
    defaultVisible: true,
    sortValue: (f) => f.distKm,
    csv: [measureCsv('Distance (km)', (f) => f.distKm, 1)],
  },
  {
    id: 'ceiling',
    label: 'Plafond',
    width: 95,
    numeric: true,
    defaultVisible: true,
    sortValue: ficheOf('plafond'),
    csv: [measureCsv('Plafond (m)', ficheOf('plafond'), 0)],
  },
  {
    id: 'speedMax',
    label: 'Vitesse max',
    width: 115,
    numeric: true,
    defaultVisible: true,
    sortValue: ficheOf('vitesse_max'),
    csv: [measureCsv('Vitesse max (km/h)', ficheOf('vitesse_max'), 1)],
  },
  {
    id: 'varioMax',
    label: 'Vario max',
    width: 105,
    numeric: true,
    defaultVisible: true,
    sortValue: ficheOf('vario_max'),
    csv: [measureCsv('Vario max (m/s)', ficheOf('vario_max'), 1)],
  },
  {
    id: 'gMax',
    label: 'g max',
    width: 85,
    numeric: true,
    defaultVisible: true,
    sortValue: ficheOf('g_max'),
    csv: [measureCsv('g max', ficheOf('g_max'), 1)],
  },
  {
    id: 'instrument',
    label: 'Instrument',
    width: 150,
    numeric: false,
    defaultVisible: false,
    sortValue: (f) => f.instrument,
    csv: [{ header: 'Instrument', value: (f) => f.instrument }],
  },
  {
    id: 'mode',
    label: 'Mode',
    width: 120,
    numeric: false,
    defaultVisible: false,
    sortValue: (f) => f.mode,
    csv: [{ header: 'Mode', value: (f) => f.mode }],
  },
  {
    id: 'gain',
    label: 'Gain',
    width: 90,
    numeric: true,
    defaultVisible: false,
    sortValue: (f) => f.gainM,
    csv: [measureCsv('Gain (m)', (f) => f.gainM, 0)],
  },
  {
    id: 'distCum',
    label: 'Distance cumulée',
    width: 140,
    numeric: true,
    defaultVisible: false,
    sortValue: ficheOf('distance_cumulee'),
    csv: [measureCsv('Distance cumulée (km)', ficheOf('distance_cumulee'), 1)],
  },
  {
    id: 'speedAvg',
    label: 'Vitesse moyenne',
    width: 140,
    numeric: true,
    defaultVisible: false,
    sortValue: ficheOf('vitesse_moyenne'),
    csv: [measureCsv('Vitesse moyenne (km/h)', ficheOf('vitesse_moyenne'), 1)],
  },
  {
    id: 'source',
    label: 'Source',
    width: 120,
    numeric: false,
    defaultVisible: false,
    sortValue: (f) => f.source,
    csv: [{ header: 'Source', value: (f) => sourceLabel(f.source) }],
  },
];

const COLUMN_BY_ID = new Map<ColumnId, ColumnSpec>(COLUMNS.map((c) => [c.id, c]));

export function columnSpec(id: ColumnId): ColumnSpec {
  const spec = COLUMN_BY_ID.get(id);
  if (!spec) throw new Error(`Colonne inconnue : ${id}`);
  return spec;
}

/** Colonnes visibles par défaut. */
export function defaultVisibleColumns(): ColumnId[] {
  return COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

// ---------------------------------------------------------------------------------------------
// Recherche

/** Minuscules sans accents ni diacritiques : « Épicéa » et « epicea » se valent. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Texte interrogeable d'un vol : pilote, site, voile, instrument, mode (normalisé). */
export function searchHaystack(f: Flight): string {
  return normalizeText([f.pilot, f.site, f.wing, f.instrument, f.mode].filter(Boolean).join(' '));
}

/** Vols dont le texte contient tous les mots de la recherche (les accents et la casse n'importent pas). */
export function searchFlights(
  flights: readonly Flight[],
  haystacks: ReadonlyMap<Flight, string>,
  query: string,
): readonly Flight[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return flights;
  return flights.filter((f) => {
    const text = haystacks.get(f) ?? searchHaystack(f);
    return terms.every((t) => text.includes(t));
  });
}

/** Index de recherche, calculé une fois par jeu de vols. */
export function buildHaystacks(flights: readonly Flight[]): Map<Flight, string> {
  return new Map(flights.map((f) => [f, searchHaystack(f)]));
}

// ---------------------------------------------------------------------------------------------
// Tri

export interface SortSpec {
  id: ColumnId;
  desc: boolean;
}

/** Tri par défaut : date et heure décroissantes. */
export const DEFAULT_SORT: readonly SortSpec[] = [{ id: 'date', desc: true }];

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Trie sans modifier l'entrée. Plusieurs colonnes possibles (ordre de priorité = ordre de `sort`).
 * Les valeurs absentes (`null`) restent en fin de liste quel que soit le sens ; à égalité complète
 * l'ordre d'origine est conservé (tri stable).
 */
export function sortFlights(flights: readonly Flight[], sort: readonly SortSpec[]): Flight[] {
  const specs = sort.map((s) => ({ spec: columnSpec(s.id), desc: s.desc }));
  if (specs.length === 0) return [...flights];
  const decorated = flights.map((f, index) => ({
    f,
    index,
    values: specs.map(({ spec }) => spec.sortValue(f)),
  }));
  decorated.sort((x, y) => {
    for (let i = 0; i < specs.length; i += 1) {
      const a = x.values[i] ?? null;
      const b = y.values[i] ?? null;
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = compareValues(a, b);
      if (c !== 0) return specs[i]?.desc ? -c : c;
    }
    return x.index - y.index;
  });
  return decorated.map((d) => d.f);
}

// ---------------------------------------------------------------------------------------------
// Export CSV

const CSV_SEPARATOR = ';';
const CSV_NEWLINE = '\r\n';
const CSV_BOM = '﻿';
export const SYRIDE_LINK_HEADER = 'Lien Syride';

/** Début de cellule qu'un tableur interpréterait comme une formule : on le neutralise. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Échappement RFC 4180 : guillemets doublés, cellule entre guillemets si elle contient ; " ou un saut de ligne. */
export function csvEscape(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Nombre à virgule décimale, sans séparateur de milliers, sans zéros inutiles : 1234.5 → « 1234,5 ». */
export function csvNumber(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded).replace('.', ',');
}

function csvValue(cell: CsvCell, f: Flight): string {
  const v = cell.value(f);
  if (v === null) return '';
  // Un nombre n'est pas une formule (« -3,5 ») : il ne passe pas par `csvEscape`.
  if (typeof v === 'number') return csvNumber(v, cell.digits ?? 1);
  return csvEscape(v);
}

/**
 * CSV de la sélection courante : `flights` doit déjà être filtré, recherché et trié ; `columns`
 * donne les colonnes visibles dans l'ordre d'affichage. BOM UTF-8, séparateur « ; », fin de ligne
 * CRLF, colonne finale « Lien Syride ».
 */
export function flightsToCsv(flights: readonly Flight[], columns: readonly ColumnId[]): string {
  const cells = columns.flatMap((id) => columnSpec(id).csv);
  const lines: string[] = [[...cells.map((c) => csvEscape(c.header)), SYRIDE_LINK_HEADER].join(CSV_SEPARATOR)];
  for (const f of flights) {
    lines.push(
      [...cells.map((c) => csvValue(c, f)), csvEscape(syrideFlightUrl(f.pilot, f.syrideNum))].join(
        CSV_SEPARATOR,
      ),
    );
  }
  return CSV_BOM + lines.join(CSV_NEWLINE) + CSV_NEWLINE;
}

/** « vols-2026-08-31.csv » à partir d'une date ISO (début de `meta.data_updated_at`). */
export function csvFileName(isoDate: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(isoDate)?.[0] ?? 'export';
  return `vols-${day}.csv`;
}

// ---------------------------------------------------------------------------------------------
// Préférences mémorisées (localStorage)

export interface TablePrefs {
  sort: SortSpec[];
  /** Colonnes visibles, dans l'ordre des `COLUMNS`. */
  visible: ColumnId[];
}

export const PREFS_STORAGE_KEY = 'sr.flights-table.v1';

export function defaultPrefs(): TablePrefs {
  return { sort: DEFAULT_SORT.map((s) => ({ ...s })), visible: defaultVisibleColumns() };
}

/** Tri restreint aux colonnes visibles (une colonne masquée ne doit plus trier la liste). */
export function sortOnVisible(sort: readonly SortSpec[], visible: readonly ColumnId[]): SortSpec[] {
  return sort.filter((s) => visible.includes(s.id)).map((s) => ({ ...s }));
}

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && COLUMN_BY_ID.has(value as ColumnId);
}

/** Lit des préférences JSON ; tout ce qui est invalide retombe sur les valeurs par défaut. */
export function parsePrefs(raw: string | null): TablePrefs {
  const fallback = defaultPrefs();
  if (!raw) return fallback;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return fallback;
    const { sort, visible } = data as { sort?: unknown; visible?: unknown };
    const prefs = defaultPrefs();
    if (Array.isArray(sort)) {
      const seen = new Set<ColumnId>();
      const clean: SortSpec[] = [];
      for (const s of sort as unknown[]) {
        if (typeof s !== 'object' || s === null) continue;
        const { id, desc } = s as { id?: unknown; desc?: unknown };
        if (isColumnId(id) && typeof desc === 'boolean' && !seen.has(id)) {
          seen.add(id);
          clean.push({ id, desc });
        }
      }
      prefs.sort = clean;
    }
    // Sans ID connu dans la liste sauvegardée (vide ou entièrement périmée), on garde les colonnes par défaut.
    if (Array.isArray(visible)) {
      const wanted = new Set((visible as unknown[]).filter(isColumnId));
      if (wanted.size > 0) prefs.visible = COLUMNS.filter((c) => wanted.has(c.id)).map((c) => c.id);
    }
    // Un tri ne porte que sur des colonnes visibles.
    prefs.sort = sortOnVisible(prefs.sort, prefs.visible);
    return prefs;
  } catch {
    return fallback;
  }
}

export function loadPrefs(): TablePrefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(prefs: TablePrefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage indisponible (navigation privée, quota) : les préférences ne sont simplement pas gardées.
  }
}
