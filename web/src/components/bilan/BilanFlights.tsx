import { Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { ColumnPicker } from '@/components/flights/ColumnPicker';
import { FlightsTable } from '@/components/flights/FlightsTable';
import { recordFlightKeys, recordRowsCss } from '@/lib/bilanDetails';
import {
  buildHaystacks,
  DEFAULT_SORT,
  defaultVisibleColumns,
  searchFlights,
  sortFlights,
  sortOnVisible,
  type ColumnId,
  type SortSpec,
} from '@/lib/flightsTable';
import { plural } from '@/lib/format';
import './bilanB.css';

const SCOPE = '.bb-flights';

/**
 * Tous les vols de l'année : le tableau de `/vols` (recherche, tri, colonnes) sur les vols du bilan. Les vols qui ont
 * battu un record cette année ont leur ligne en or (règles CSS générées, `FlightsTable` n'a pas de prop de ligne).
 */
export function BilanFlights() {
  const { flights, story } = useBilan();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [visible, setVisibleState] = useState<ColumnId[]>(() => defaultVisibleColumns().filter((c) => c !== 'pilot'));
  const [sort, setSortState] = useState<SortSpec[]>([...DEFAULT_SORT]);

  const setVisible = useCallback((next: ColumnId[]) => {
    setVisibleState(next);
    setSortState((s) => sortOnVisible(s, next));
  }, []);
  const setSort = useCallback((next: SortSpec[]) => setSortState(sortOnVisible(next, visible)), [visible]);

  const haystacks = useMemo(() => buildHaystacks(flights), [flights]);
  const searched = useMemo(() => searchFlights(flights, haystacks, deferred), [flights, haystacks, deferred]);
  const rows = useMemo(() => sortFlights(searched, sort), [searched, sort]);
  const recordKeys = useMemo(() => recordFlightKeys(story), [story]);
  const goldCss = useMemo(() => recordRowsCss(recordKeys, SCOPE), [recordKeys]);
  const shownRecords = useMemo(() => rows.filter((f) => recordKeys.has(f.key)).length, [rows, recordKeys]);

  return (
    <Section id="vols" title="Tous tes vols">
      <div className="bb-flights">
        {goldCss && <style>{goldCss}</style>}
        <div className="bb-flights-tools">
          <TextInput
            type="search"
            aria-label="Rechercher dans les vols de l’année (site, voile, instrument, mode)"
            placeholder="Site, voile, instrument, mode"
            leftSection={<IconSearch size={16} stroke={1.6} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={{ base: '100%', sm: 320 }}
          />
          <Text size="sm" role="status" data-testid="bilan-flights-count">
            {plural(rows.length, 'vol')}
          </Text>
          <ColumnPicker visible={visible} onChange={setVisible} />
        </div>
        {recordKeys.size > 0 && (
          <Text size="xs" c="dimmed" mb={6} data-testid="bilan-flights-gold-legend">
            Lignes en or&nbsp;: vols où un record personnel a été battu cette année
            {shownRecords > 0 ? ` (${plural(shownRecords, 'vol')} affiché${shownRecords > 1 ? 's' : ''})` : ''}.
          </Text>
        )}
        <FlightsTable
          flights={rows}
          visible={visible}
          sort={sort}
          onSortChange={setSort}
          emptyMessage={deferred.trim() !== '' ? 'Aucun vol ne correspond à cette recherche.' : 'Aucun vol cette année.'}
        />
      </div>
    </Section>
  );
}
