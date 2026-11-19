import { Box, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MOBILE_MAX_WIDTH } from '@/components/AppLayout';
import { CellTooltip } from '@/components/common/CellTooltip';
import type { Flight } from '@/data/flight';
import { calendarDayTip, daySites } from '@/lib/cellTips';
import { DAYS_SHORT, fmtDate, fmtDuration, MONTHS_LONG, MONTHS_SHORT, plural } from '@/lib/format';
import { epochDay, isoOfEpochDay } from '@/lib/isoDay';
import type { DaySummary } from '@/lib/rhythm';
import {
  CALENDAR_LEVEL_LABELS,
  calendarKind,
  calendarToken,
  dayMap,
  monthGrid,
  rollingGrid,
  rollingWindowMonths,
  yearGrid,
  type CalendarKind,
  type GridCell,
} from '@/lib/rhythmBlocks';
import { highlightsDay, useHighlightStore, type Highlight } from '@/store/highlight';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante (toutes années). */
  flights: readonly Flight[];
  year: number;
  /**
   * `year` (défaut) : l'année `year`. `rolling` : les 365 jours jusqu'à `end` (12 mois glissants), `year` est alors ignoré.
   */
  mode?: 'year' | 'rolling';
  /** Dernier jour écoulé de l'année (`AAAA-MM-JJ`) : les jours suivants sont estompés. */
  end: string;
  /** Ouvre la fiche d'un jour volé (Entrée ou clic). */
  onOpenDay: (iso: string) => void;
}

/** Jours de la sélection concernés par un surlignage de site, voile ou pilote (les autres surlignages passent par `highlightsDay`). */
function highlightedFlightDays(flights: readonly Flight[], h: Highlight | null): Set<string> | null {
  if (h === null) return null;
  if (h.kind === 'site') return new Set(flights.filter((f) => f.siteId === h.siteId).map((f) => f.date));
  if (h.kind === 'wing') return new Set(flights.filter((f) => f.wing === h.wing).map((f) => f.date));
  if (h.kind === 'pilot')
    return new Set(flights.filter((f) => f.pilotSlug === h.pilotSlug).map((f) => f.date));
  return null;
}

function dayLabel(iso: string, day: DaySummary | undefined): string {
  const date = fmtDate(iso, { weekday: true, withYear: true });
  return day ? `${date} : ${plural(day.n, 'vol')}, ${fmtDuration(day.minutes)}` : `${date} : aucun vol`;
}

const KIND_LABELS: Record<CalendarKind, string> = {
  p: 'Parapente',
  m: 'Paramoteur',
  b: 'Les deux le même jour',
};
const GAP = 3;

/**
 * Calendrier annuel : une case par jour, intensité = minutes volées dans la journée (4 niveaux, seuils du rapport),
 * teinte = discipline. Grille 53 semaines sur ordinateur, 12 mini-mois sur téléphone. Navigation aux flèches
 * (gauche/droite = semaine, haut/bas = jour), Entrée ou clic ouvre le jour.
 */
export function CalendarHeatmap({ flights, year, mode = 'year', end, onOpenDay }: Props) {
  const mobile =
    useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`, false, { getInitialValueInEffect: false }) ?? false;
  const highlight = useHighlightStore((s) => s.highlight);
  const rolling = mode === 'rolling';
  const rollingView = useMemo(() => (rolling ? rollingGrid(end) : null), [rolling, end]);
  const inView = useCallback(
    (iso: string) => (rollingView ? iso >= rollingView.start && iso <= end : iso.startsWith(`${year}-`)),
    [rollingView, end, year],
  );
  const shown = useMemo(() => flights.filter((f) => inView(f.date)), [flights, inView]);
  const days = useMemo(() => dayMap(shown), [shown]);
  const sitesByDay = useMemo(() => daySites(shown), [shown]);
  const periodLabel = rolling ? 'des 12 derniers mois' : String(year);
  const flightDays = useMemo(() => highlightedFlightDays(flights, highlight), [flights, highlight]);
  const root = useRef<HTMLDivElement>(null);

  const firstFlown = useMemo(
    () => [...days.keys()].sort()[0] ?? (rollingView ? rollingView.start : `${year}-01-01`),
    [days, year, rollingView],
  );
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const tabIso = focusIso !== null && inView(focusIso) ? focusIso : firstFlown;

  const kinds = useMemo(() => {
    const present = new Set<CalendarKind>();
    for (const d of days.values()) present.add(calendarKind(d.disciplines));
    return (['p', 'm', 'b'] as const).filter((k) => present.has(k));
  }, [days]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const iso = target.dataset.iso;
    if (!iso) return;
    const steps: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = isoOfEpochDay(epochDay(iso) + step);
    if (!inView(next)) return;
    setFocusIso(next);
    root.current?.querySelector<HTMLElement>(`[data-iso="${next}"]`)?.focus();
  };

  const resolve = useCallback(
    (el: HTMLElement) => {
      const iso = el.dataset['iso'];
      return iso ? calendarDayTip(iso, days.get(iso), sitesByDay.get(iso)) : null;
    },
    [days, sitesByDay],
  );

  const cell = (c: GridCell, placed: boolean) => {
    const day = days.get(c.iso);
    const future = c.iso > end;
    const position = placed
      ? { gridColumn: c.col + 2, gridRow: c.row + 2 }
      : { gridColumn: c.col + 1, gridRow: c.row + 1 };
    // Hors de la fenêtre (début du premier mois partiel, jours après la fin) : case estompée, sans focus ni infobulle.
    if (!inView(c.iso)) {
      return <span key={c.iso} className="sr-cal-cell" data-out="true" aria-hidden="true" style={position} />;
    }
    let hl: 'on' | 'off' | undefined;
    if (highlight !== null) {
      const on = flightDays ? flightDays.has(c.iso) && day !== undefined : highlightsDay(highlight, c.iso);
      hl = on ? 'on' : 'off';
    }
    return (
      <button
        key={c.iso}
        type="button"
        className="sr-cal-cell"
        data-iso={c.iso}
        data-flown={day !== undefined}
        data-future={future && day === undefined}
        data-hl={hl}
        data-tip={c.iso}
        tabIndex={c.iso === tabIso ? 0 : -1}
        aria-label={dayLabel(c.iso, day)}
        style={{
          background: day ? `var(--sr-${calendarToken(day)})` : undefined,
          ...position,
        }}
        onFocus={() => setFocusIso(c.iso)}
        onClick={() => day !== undefined && onOpenDay(c.iso)}
      />
    );
  };

  let body: ReactNode;
  if (mobile) {
    body = (
      <div
        className="sr-cal-months"
        role="group"
        aria-label={`Calendrier des vols ${periodLabel}, mois par mois`}
      >
        {(rolling
          ? rollingWindowMonths(end)
          : Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }))
        ).map((ym) => {
          const grid = monthGrid(ym.year, ym.month);
          return (
            <figure key={`${ym.year}-${ym.month}`} style={{ margin: 0, minWidth: 0 }}>
              <Text component="figcaption" size="xs" c="dimmed" mb={2}>
                {MONTHS_LONG[ym.month - 1]}
                {rolling ? ` ${ym.year}` : ''}
              </Text>
              <div
                className="sr-cal"
                style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`, gap: 2 }}
              >
                {grid.cells.map((c) => cell(c, false))}
              </div>
            </figure>
          );
        })}
      </div>
    );
  } else {
    const grid = rollingView ?? yearGrid(year);
    const axisMonths: { col: number; label: string }[] = rollingView
      ? rollingView.months.map((m) => ({
          col: m.col,
          label: `${MONTHS_SHORT[m.month]}${m.month === 0 ? ` ${m.year}` : ''}`,
        }))
      : yearGrid(year).monthColumns.map((col, m) => ({ col, label: MONTHS_SHORT[m] ?? '' }));
    body = (
      <div className="sr-scroll">
        <div
          className="sr-cal"
          role="group"
          aria-label={`Calendrier des vols ${periodLabel}, une case par jour, les semaines en colonnes et les jours de la semaine en lignes`}
          style={{
            gridTemplateColumns: `auto repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `auto repeat(7, auto)`,
            gap: GAP,
            // Cases d'au moins 12 px : en dessous, la grille défile plutôt que de rétrécir.
            minWidth: grid.columns * 15 + 36,
            padding: 2,
          }}
        >
          {axisMonths.map((m) => (
            <span
              key={`${m.col}-${m.label}`}
              className="sr-cal-axis"
              style={{ gridColumn: m.col + 2, gridRow: 1 }}
            >
              {m.label}
            </span>
          ))}
          {[0, 2, 4, 6].map((row) => (
            <span
              key={row}
              className="sr-cal-axis"
              style={{ gridColumn: 1, gridRow: row + 2, paddingRight: 4 }}
            >
              {DAYS_SHORT[row]}
            </span>
          ))}
          {grid.cells.map((c) => cell(c, true))}
        </div>
      </div>
    );
  }

  return (
    <Box ref={root} onKeyDown={move} data-testid="calendar-heatmap">
      <CellTooltip resolve={resolve}>{body}</CellTooltip>
      <div className="sr-cal-key" aria-hidden="true">
        {kinds.map((kind) => (
          <span key={kind}>
            {KIND_LABELS[kind]}{' '}
            {[1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="sr-cal-swatch"
                style={{ background: `var(--sr-cal-${kind}${level})` }}
              />
            ))}
          </span>
        ))}
        <span>Plus la case est foncée, plus la journée est longue ({CALENDAR_LEVEL_LABELS.join(' · ')})</span>
      </div>
    </Box>
  );
}
