import { ActionIcon, Tooltip, VisuallyHidden } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconExternalLink,
  IconFileOff,
} from '@tabler/icons-react';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { EmptyNote, useScheme } from '@/components/dashboard/shared';
import { useFilterSearch, FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { COLUMNS, columnSpec, sourceLabel, type ColumnId, type SortSpec } from '@/lib/flightsTable';
import {
  EMPTY,
  fmtDate,
  fmtDateNumeric,
  fmtDuration,
  fmtNum,
  NBSP,
} from '@/lib/format';
import { MEASURES, formatMeasure } from '@/lib/measures';
import { syrideFlightUrl } from '@/lib/syride';
import { disciplineColor } from '@/theme/tokens';
import './flightsTable.css';

/** Hauteur d'une ligne en px (fixe : nécessaire à la virtualisation). */
export const ROW_HEIGHT = 36;
const ACTION_WIDTH = 44;
const OVERSCAN = 12;
const NO_ROWS: Flight[] = [];

const INCOMPLETE_HINT =
  'Vol incomplet\u00a0: la trace ou ses statistiques sont tronquées, les mesures de ce vol sont à prendre avec réserve.';
const NO_GPX_HINT: Record<'fiche' | 'aucune', string> = {
  fiche:
    'Statistiques issues de la fiche Syride, sans fichier GPX\u00a0: elles peuvent différer de celles calculées sur la trace.',
  aucune: 'Aucune statistique disponible pour ce vol (ni fiche Syride ni GPX).',
};

const MEASURE_OF: Partial<Record<ColumnId, keyof typeof MEASURES>> = {
  duration: 'duree',
  distance: 'distance',
  ceiling: 'plafond',
  speedMax: 'vitesseMax',
  varioMax: 'vario',
  gMax: 'g',
  gain: 'gain',
  distCum: 'distance',
  speedAvg: 'vitesseMoyenne',
};

/** Valeur numérique d'une colonne de mesure, affichée avec son unité (« – » si absente). */
function measureText(id: ColumnId, value: number): string {
  if (id === 'duration') return fmtDuration(value);
  if (id === 'distCum') return `${fmtNum(value, 1)}${NBSP}km`;
  const key = MEASURE_OF[id];
  return key ? formatMeasure(MEASURES[key], value) : String(value);
}

const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

interface CellProps {
  id: ColumnId;
  flight: Flight;
  scheme: 'light' | 'dark';
}

function Cell({ id, flight: f, scheme }: CellProps) {
  switch (id) {
    case 'date':
      return (
        <>
          {fmtDateNumeric(f.date)}
          {f.time ? ` ${f.time}` : ''}
          {f.incomplete && (
            <Tooltip label={INCOMPLETE_HINT} multiline w={260} events={{ hover: true, focus: true, touch: true }}>
              <span className="sr-vt-flag" role="img" aria-label="Vol incomplet" tabIndex={0} onKeyDown={stop}>
                <IconAlertTriangle size={14} stroke={1.8} />
              </span>
            </Tooltip>
          )}
          {f.source !== 'gpx' && (
            <Tooltip
              label={NO_GPX_HINT[f.source]}
              multiline
              w={260}
              events={{ hover: true, focus: true, touch: true }}
            >
              <span
                className="sr-vt-flag"
                role="img"
                aria-label={`Statistiques sans GPX (${sourceLabel(f.source)})`}
                tabIndex={0}
                onKeyDown={stop}
              >
                <IconFileOff size={14} stroke={1.8} />
              </span>
            </Tooltip>
          )}
        </>
      );
    case 'pilot':
      return (
        <span onClick={stop} onKeyDown={stop}>
          <FilterLink to={`/pilote/${f.pilotSlug}`} c="inherit" underline="hover">
            {f.pilot}
          </FilterLink>
        </span>
      );
    case 'activity':
      return (
        <>
          <span className="sr-vt-dot" style={{ background: disciplineColor(f.activity, scheme) }} aria-hidden />
          {f.activity === 'parapente' ? 'Parapente' : 'Paramoteur'}
        </>
      );
    case 'site':
      return f.site !== null && f.siteId !== null ? (
        <span onClick={stop} onKeyDown={stop}>
          <FilterLink to={`/site/${f.siteId}`} c="inherit" underline="hover">
            {f.site}
          </FilterLink>
        </span>
      ) : (
        EMPTY
      );
    case 'wing':
      return f.wing ?? EMPTY;
    case 'instrument':
      return f.instrument ?? EMPTY;
    case 'mode':
      return f.mode ?? EMPTY;
    case 'source':
      return sourceLabel(f.source);
    default: {
      const value = columnSpec(id).sortValue(f);
      return typeof value === 'number' ? measureText(id, value) : EMPTY;
    }
  }
}

interface Props {
  /** Vols déjà filtrés, recherchés et triés. */
  flights: readonly Flight[];
  visible: readonly ColumnId[];
  sort: readonly SortSpec[];
  onSortChange: (sort: SortSpec[]) => void;
  emptyMessage: string;
}

/** Tableau virtualisé (TanStack Table pour l'état des colonnes et du tri, TanStack Virtual pour les lignes). */
export function FlightsTable({ flights, visible, sort, onSortChange, emptyMessage }: Props) {
  const scheme = useScheme();
  const navigate = useNavigate();
  const search = useFilterSearch();
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<Flight>[]>(
    () =>
      COLUMNS.map((c) => ({
        id: c.id,
        header: c.label,
        accessorFn: (f: Flight) => c.sortValue(f),
        enableSorting: true,
        // Les mesures et la date se lisent d'abord du plus grand / récent au plus petit.
        sortDescFirst: c.numeric || c.id === 'date',
      })),
    [],
  );
  const columnVisibility = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c.id, visible.includes(c.id)])),
    [visible],
  );
  const sorting = sort as SortingState;
  const handleSorting = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortChange(next.map((s) => ({ id: s.id as ColumnId, desc: s.desc })));
    },
    [sorting, onSortChange],
  );

  // TanStack Table n'est pas mémoïsable par le compilateur React : sans conséquence ici.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    // Le modèle de lignes de TanStack coûte ~130 ms pour 9 600 vols : les lignes sont rendues
    // directement depuis `flights` (déjà triés), TanStack ne gère que colonnes, visibilité et tri.
    data: NO_ROWS,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: handleSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableMultiSort: true,
  });

  const shownColumns = table.getVisibleLeafColumns();
  const gridColumns = `${shownColumns.map((c) => `${columnSpec(c.id as ColumnId).width}px`).join(' ')} ${ACTION_WIDTH}px`;
  const totalWidth = shownColumns.reduce((n, c) => n + columnSpec(c.id as ColumnId).width, ACTION_WIDTH);

  const virtualizer = useVirtualizer({
    count: flights.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // jsdom ne mesure rien : une taille initiale permet de rendre les premières lignes en test.
    initialRect: { width: 1200, height: 600 },
  });

  // Une nouvelle sélection, recherche ou un nouveau tri repart du haut de la liste.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [flights]);

  const open = (f: Flight) => void navigate({ pathname: `/vol/${f.key}`, search });

  if (flights.length === 0) {
    return (
      <div className="sr-vt-empty">
        <EmptyNote>{emptyMessage}</EmptyNote>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="sr-vt-scroll" tabIndex={-1}>
      <div
        role="table"
        aria-label="Liste des vols"
        aria-rowcount={flights.length + 1}
        data-testid="flights-table"
        style={{ width: totalWidth, minWidth: '100%' }}
      >
        <div role="rowgroup">
          <div role="row" className="sr-vt-head" style={{ gridTemplateColumns: gridColumns, width: totalWidth }}>
            {table.getHeaderGroups()[0]?.headers.map((h) => {
              const spec = columnSpec(h.column.id as ColumnId);
              const dir = h.column.getIsSorted();
              const rank = h.column.getSortIndex();
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  className="sr-vt-th"
                  data-numeric={spec.numeric}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    className="sr-vt-sort"
                    data-testid={`sort-${spec.id}`}
                    onClick={h.column.getToggleSortingHandler()}
                    title="Trier (Maj + clic&nbsp;: ajouter un tri secondaire)"
                  >
                    {spec.label}
                    {dir === 'asc' && <IconArrowUp size={13} stroke={2} aria-hidden />}
                    {dir === 'desc' && <IconArrowDown size={13} stroke={2} aria-hidden />}
                    {dir && sort.length > 1 && <sup aria-hidden>{rank + 1}</sup>}
                  </button>
                </div>
              );
            })}
            <div role="columnheader" className="sr-vt-th">
              <VisuallyHidden>Trace sur Syride</VisuallyHidden>
            </div>
          </div>
        </div>
        <div role="rowgroup" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const f = flights[item.index];
            if (!f) return null;
            return (
              <div
                key={f.key}
                role="row"
                aria-rowindex={item.index + 2}
                className="sr-vt-row"
                data-testid="flight-row"
                data-key={f.key}
                tabIndex={0}
                style={{
                  gridTemplateColumns: gridColumns,
                  width: totalWidth,
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start}px)`,
                }}
                onClick={() => open(f)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && e.key === 'Enter') {
                    e.preventDefault();
                    open(f);
                  }
                }}
              >
                {shownColumns.map((c) => {
                  const spec = columnSpec(c.id as ColumnId);
                  return (
                    <div key={c.id} role="cell" className="sr-vt-td" data-numeric={spec.numeric}>
                      <Cell id={spec.id} flight={f} scheme={scheme} />
                    </div>
                  );
                })}
                <div role="cell" className="sr-vt-td">
                  <ActionIcon
                    component="a"
                    href={syrideFlightUrl(f.pilot, f.syrideNum)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtle"
                    color="gray"
                    size="sm"
                    data-testid="syride-link"
                    onClick={stop}
                    onKeyDown={stop}
                    aria-label={`Voir la trace sur Syride\u00a0: vol de ${f.pilot} du ${fmtDate(f.date, { withYear: true })}`}
                  >
                    <IconExternalLink size={15} stroke={1.6} />
                  </ActionIcon>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
