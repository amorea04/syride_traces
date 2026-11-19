/**
 * Contenu des infobulles des calendriers, matrices, rubans et haltères (5C.7, 5C.9), et petite géométrie
 * (déplacement aux flèches, placement de la bulle). Fonctions pures : le composant `CellTooltip` ne fait
 * que les afficher.
 */
import type { Flight } from '@/data/flight';
import { fmtDate, fmtDuration, MONTHS_LONG, NBSP, plural } from '@/lib/format';
import type { DaySummary } from '@/lib/rhythm';

export interface TipContent {
  title: string;
  lines: string[];
  /** Consigne en bas de bulle (« Clic : fiche du jour »). */
  hint?: string;
}

const DISCIPLINE_LABELS: Record<string, string> = { parapente: 'Parapente', paramoteur: 'Paramoteur' };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « entre 14 h et 15 h » (espaces insécables). */
export function hourSlot(hour: number): string {
  return `entre ${hour}${NBSP}h et ${hour + 1}${NBSP}h`;
}

/** « 14 h » : en-tête de colonne des matrices. */
export function hourHeading(hour: number): string {
  return `${hour}${NBSP}h`;
}

/** Sites volés chaque jour, du plus fréquenté au moins fréquenté (à égalité : ordre alphabétique). */
export function daySites(flights: readonly Flight[]): Map<string, string[]> {
  const counts = new Map<string, Map<string, number>>();
  for (const f of flights) {
    if (f.site === null) continue;
    const day = counts.get(f.date) ?? new Map<string, number>();
    day.set(f.site, (day.get(f.site) ?? 0) + 1);
    counts.set(f.date, day);
  }
  const out = new Map<string, string[]>();
  for (const [iso, day] of counts) {
    out.set(
      iso,
      [...day.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([name]) => name),
    );
  }
  return out;
}

/** Infobulle d'un jour du calendrier : date, vols, durée, disciplines, sites, consigne de clic si le jour est volé. */
export function calendarDayTip(
  iso: string,
  day: DaySummary | undefined,
  sites: readonly string[] = [],
): TipContent {
  const title = capitalize(fmtDate(iso, { weekday: true, withYear: true }));
  if (!day) return { title, lines: ['Aucun vol'] };
  const lines = [`${plural(day.n, 'vol')} · ${fmtDuration(day.minutes)}`];
  lines.push(day.disciplines.map((d) => DISCIPLINE_LABELS[d] ?? d).join(' et '));
  if (sites.length > 0) lines.push(`${sites.length > 1 ? 'Sites' : 'Site'}${NBSP}: ${sites.join(', ')}`);
  return { title, lines, hint: 'Clic : fiche du jour' };
}

/** Infobulle d'une case de matrice à heures : « Août, entre 14 h et 15 h » puis vols et durée. */
export function matrixCellTip(rowLong: string, hour: number, n: number, minutes: number | null): TipContent {
  const title = `${capitalize(rowLong)}, ${hourSlot(hour)}`;
  if (n === 0) return { title, lines: ['Aucun vol'] };
  return {
    title,
    lines: [minutes === null ? plural(n, 'vol') : `${plural(n, 'vol')} · ${fmtDuration(minutes)}`],
  };
}

/** Infobulle d'une case du ruban voile × mois. */
export function ribbonCellTip(
  wing: string,
  year: number,
  month: number,
  n: number,
  minutes: number,
): TipContent {
  return {
    title: wing,
    lines: [
      `${capitalize(MONTHS_LONG[month - 1] ?? '')} ${year}`,
      `${plural(n, 'vol')} · ${fmtDuration(minutes)}`,
    ],
    hint: 'Clic : filtrer sur cette voile et ce mois',
  };
}

/** Infobulle d'un carré de la frise des voiles (un trimestre). */
export function quarterCellTip(wing: string, year: number, quarter: number, n: number): TipContent {
  return {
    title: wing,
    lines: [
      `${quarter === 1 ? '1ᵉʳ' : `${quarter}ᵉ`} trimestre ${year}`,
      n === 0 ? 'Aucun vol' : plural(n, 'vol'),
    ],
  };
}

/** Infobulle d'un point d'haltère : la série et sa valeur pour la mesure. */
export function dumbbellPointTip(series: string, measure: string, valueText: string): TipContent {
  return { title: series, lines: [`${measure}${NBSP}: ${valueText}`] };
}

/** Infobulle d'un repère d'une bande « ce site face aux autres ». */
export function stripMarkTip(
  kind: 'site' | 'mean' | 'other',
  siteLabel: string,
  valueText: string,
): TipContent {
  if (kind === 'mean')
    return { title: 'Moyenne', lines: [valueText], hint: 'Trait : moyenne des autres sites' };
  if (kind === 'site') return { title: siteLabel, lines: [valueText], hint: 'Point : la valeur de ce site' };
  return {
    title: 'Un autre site',
    lines: [valueText],
    hint: 'La barre va du plus bas au plus haut des sites',
  };
}

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * Indice de la case la plus proche de `from` dans une direction, d'après les rectangles à l'écran (les cases dont le
 * centre est dans le demi-plan visé ; l'écart perpendiculaire compte double). `null` s'il n'y en a pas.
 */
export function nearestInDirection(boxes: readonly Box[], from: number, direction: Direction): number | null {
  const origin = boxes[from];
  if (!origin) return null;
  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  let best: number | null = null;
  let bestScore = Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    const dx = b.x + b.width / 2 - cx;
    const dy = b.y + b.height / 2 - cy;
    const along = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    // Demi-plan visé, en tolérant le demi-gabarit de la case (cases d'une même ligne à quelques pixels près).
    if (along <= Math.min(origin.width, origin.height) / 4) return;
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Position (coins haut-gauche, coordonnées écran) d'une bulle : sous la case, ou au-dessus si elle sortirait de l'écran. */
export function tipPlacement(
  anchor: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
): { left: number; top: number } {
  const margin = 6;
  let left = anchor.x + anchor.width / 2 - tip.width / 2;
  left = Math.max(margin, Math.min(left, viewport.width - tip.width - margin));
  let top = anchor.y + anchor.height + gap;
  if (top + tip.height > viewport.height - margin) top = Math.max(margin, anchor.y - tip.height - gap);
  return { left, top };
}
