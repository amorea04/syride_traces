import { Table, TextInput, Text } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconSearch } from '@tabler/icons-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDateNumeric, fmtHm, fmtInt, fmtPercent, plural } from '@/lib/format';
import { MEASURES, formatMeasure } from '@/lib/measures';
import {
  filterSiteRows,
  siteTableRows,
  sortSiteRows,
  type SiteSortKey,
  type SiteTableRow,
  type SortDirection,
} from '@/lib/sites';
import { useHighlightStore } from '@/store/highlight';
import './site.css';

interface Column {
  key: SiteSortKey;
  label: string;
  numeric: boolean;
  /** Sens du premier clic : les noms croissants, les mesures décroissantes. */
  firstDirection: SortDirection;
}

const COLUMNS: readonly Column[] = [
  { key: 'name', label: 'Site', numeric: false, firstDirection: 'asc' },
  { key: 'flights', label: 'Vols', numeric: true, firstDirection: 'desc' },
  { key: 'minutes', label: 'Heures', numeric: true, firstDirection: 'desc' },
  { key: 'pilots', label: 'Pilotes', numeric: true, firstDirection: 'desc' },
  { key: 'share', label: 'Parapente / paramoteur', numeric: false, firstDirection: 'desc' },
  { key: 'lastDate', label: 'Dernier vol', numeric: true, firstDirection: 'desc' },
  { key: 'ceiling', label: 'Plafond max', numeric: true, firstDirection: 'desc' },
];

function Share({ row }: { row: SiteTableRow }) {
  if (row.parapenteShare === null) return <>{EMPTY}</>;
  const p = row.parapenteShare;
  return (
    <span
      className="st-share"
      title={`${plural(row.parapente, 'vol')} en parapente, ${plural(row.paramoteur, 'vol')} en paramoteur`}
    >
      <span className="st-share-bar" aria-hidden="true">
        <i style={{ width: `${p}%`, background: 'var(--sr-p)' }} />
        <i style={{ width: `${100 - p}%`, background: 'var(--sr-m)' }} />
      </span>
      {fmtPercent(p)} / {fmtPercent(100 - p)}
    </span>
  );
}

/** Lignes rendues au premier passage (le reste suit en arrière-plan). */
const FIRST_ROWS = 30;

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/** Tableau triable des sites de la sélection, avec recherche sans accents ; le survol d'une ligne surligne le site sur la carte. */
export function SitesTable({ flights }: Props) {
  const { siteById } = useData();
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SiteSortKey; direction: SortDirection }>({
    key: 'flights',
    direction: 'desc',
  });
  const rows = useMemo(() => siteTableRows(flights, siteById), [flights, siteById]);
  const shown = useMemo(
    () => sortSiteRows(filterSiteRows(rows, query), sort.key, sort.direction),
    [rows, query, sort],
  );
  // Premier rendu : les premières lignes seulement ; les ~400 autres suivent dans un rendu de fond découpé en
  // tranches (6.3), sans tâche longue. Un tri ou une recherche garde l'ancienne liste le temps du rendu.
  const rendered = useDeferredValue(shown, shown.slice(0, FIRST_ROWS));

  const toggle = (column: Column) =>
    setSort((s) =>
      s.key === column.key
        ? { key: s.key, direction: s.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: column.firstDirection },
    );

  return (
    <Section
      id="liste-sites"
      title="Liste des sites"
      subtitle={`${plural(rows.length, 'site')} dans la sélection.`}
      actions={
        <TextInput
          size="xs"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Rechercher un site"
          aria-label="Rechercher un site"
          leftSection={<IconSearch size={14} />}
          data-testid="sites-search"
        />
      }
    >
      {flights.length === 0 ? (
        <EmptyNote />
      ) : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover fz="sm" className="sr-tabular" data-testid="sites-table">
              <Table.Thead>
                <Table.Tr>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <Table.Th
                        key={c.key}
                        ta={c.numeric ? 'right' : 'left'}
                        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <button type="button" className="st-th-btn" onClick={() => toggle(c)}>
                          {c.label}
                          {active &&
                            (sort.direction === 'asc' ? (
                              <IconArrowUp size={13} />
                            ) : (
                              <IconArrowDown size={13} />
                            ))}
                        </button>
                      </Table.Th>
                    );
                  })}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rendered.map((r) => (
                  <Table.Tr
                    key={r.siteId}
                    className="st-row"
                    data-testid="site-row"
                    onMouseEnter={() => setHighlight({ kind: 'site', siteId: r.siteId })}
                    onMouseLeave={() => setHighlight(null)}
                  >
                    <Table.Td>
                      <FilterLink to={`/site/${r.siteId}`} data-testid="site-link">
                        {r.name}
                      </FilterLink>
                    </Table.Td>
                    <Table.Td ta="right">{fmtInt(r.flights)}</Table.Td>
                    <Table.Td ta="right">{fmtHm(r.minutes)}</Table.Td>
                    <Table.Td ta="right">{fmtInt(r.pilots)}</Table.Td>
                    <Table.Td>
                      <Share row={r} />
                    </Table.Td>
                    <Table.Td ta="right">{r.lastDate ? fmtDateNumeric(r.lastDate) : EMPTY}</Table.Td>
                    <Table.Td ta="right">
                      {r.ceilingMax === null ? EMPTY : formatMeasure(MEASURES.plafond, r.ceilingMax)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {shown.length === 0 && (
            <Text size="sm" c="dimmed" mt="xs" role="status">
              Aucun site ne correspond à « {query} ».
            </Text>
          )}
        </>
      )}
    </Section>
  );
}
