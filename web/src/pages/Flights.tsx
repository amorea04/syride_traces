import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconDownload, IconSearch } from '@tabler/icons-react';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ColumnPicker } from '@/components/flights/ColumnPicker';
import { FlightsTable } from '@/components/flights/FlightsTable';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import {
  buildHaystacks,
  csvFileName,
  flightsToCsv,
  loadPrefs,
  savePrefs,
  searchFlights,
  sortFlights,
  sortOnVisible,
  type ColumnId,
  type SortSpec,
  type TablePrefs,
} from '@/lib/flightsTable';
import { plural } from '@/lib/format';
import { useFilteredFlights } from '@/store/useFilteredFlights';

/** Télécharge un texte en fichier, sans appel réseau. */
function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Le téléchargement démarre après le clic : l'URL est révoquée une fois la main rendue au navigateur.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Liste des vols (ROADMAP §5.2) : sélection filtrée, recherche, tri, colonnes, export CSV. */
export function Flights() {
  const { meta, flights: allFlights } = useData();
  const filtered = useFilteredFlights();
  const filtersActive = filtered.length !== allFlights.length;
  const [prefs, setPrefs] = useState<TablePrefs>(loadPrefs);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const update = useCallback((change: (prev: TablePrefs) => TablePrefs) => {
    setPrefs((prev) => {
      const next = change(prev);
      savePrefs(next);
      return next;
    });
  }, []);
  const setSort = useCallback(
    (sort: SortSpec[]) => update((prev) => ({ ...prev, sort: sortOnVisible(sort, prev.visible) })),
    [update],
  );
  // Masquer une colonne la retire aussi du tri (état et stockage restent cohérents).
  const setVisible = useCallback(
    (visible: ColumnId[]) => update((prev) => ({ visible, sort: sortOnVisible(prev.sort, visible) })),
    [update],
  );

  const haystacks = useMemo(() => buildHaystacks(allFlights), [allFlights]);
  const searched = useMemo(
    () => searchFlights(filtered, haystacks, deferredQuery),
    [filtered, haystacks, deferredQuery],
  );
  const rows = useMemo(() => sortFlights(searched, prefs.sort), [searched, prefs.sort]);

  const exportCsv = () =>
    downloadText(csvFileName(meta.data_updated_at), flightsToCsv(rows, prefs.visible));

  const searching = deferredQuery.trim() !== '';
  const emptyMessage = searching ? 'Aucun vol ne correspond à cette recherche.' : 'Aucun vol pour ces filtres.';

  return (
    <Stack gap="md">
      <title>{`Vols · ${APP_NAME}`}</title>
      <div>
        <Title order={1} size="h2">
          Vols
        </Title>
        <Text size="sm" c="dimmed" data-testid="flight-count-line" aria-live="polite">
          <strong data-testid="flight-count">{plural(filtered.length, 'vol')}</strong>
          {filtersActive ? ` sélectionnés sur ${plural(allFlights.length, 'vol')}` : ' au total'}
        </Text>
      </div>

      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Group gap="sm" align="center" wrap="wrap">
          <TextInput
            type="search"
            aria-label="Rechercher un vol (pilote, site, voile, instrument, mode)"
            placeholder="Pilote, site, voile, instrument, mode"
            leftSection={<IconSearch size={16} stroke={1.6} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={{ base: '100%', sm: 340 }}
          />
          <Text size="sm" role="status" data-testid="list-count">
            {plural(rows.length, 'vol')}
          </Text>
        </Group>
        <Group gap="xs">
          <ColumnPicker visible={prefs.visible} onChange={setVisible} />
          <Button
            variant="default"
            size="sm"
            leftSection={<IconDownload size={16} stroke={1.6} />}
            onClick={exportCsv}
            disabled={rows.length === 0}
            data-testid="export-csv"
          >
            Exporter en CSV
          </Button>
        </Group>
      </Group>

      <FlightsTable
        flights={rows}
        visible={prefs.visible}
        sort={prefs.sort}
        onSortChange={setSort}
        emptyMessage={emptyMessage}
      />
    </Stack>
  );
}
