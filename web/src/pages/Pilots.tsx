import { Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { PilotCard } from '@/components/pilot/PilotCard';
import '@/components/pilot/pilot.css';
import { EmptyNote } from '@/components/dashboard/shared';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { plural } from '@/lib/format';
import { PILOT_SORTS, pilotSummaries, searchPilots, sortPilots, type PilotSortKey } from '@/lib/pilots';
import { useFilteredFlights } from '@/store/useFilteredFlights';

/** Liste des pilotes de la sélection (filtres globaux), triable et filtrable par nom. */
export function Pilots() {
  const { flights: all } = useData();
  const flights = useFilteredFlights();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PilotSortKey>('heures');

  const summaries = useMemo(() => pilotSummaries(flights), [flights]);
  const rows = useMemo(() => sortPilots(searchPilots(summaries, query), sort), [summaries, query, sort]);

  return (
    <Stack gap="lg">
      <title>{`Pilotes · ${APP_NAME}`}</title>
      <div>
        <Title order={1} size="h2">
          Pilotes
        </Title>
        <Text size="sm" c="dimmed" data-testid="pilots-count" aria-live="polite">
          {plural(rows.length, 'pilote')}
          {rows.length !== summaries.length && ` sur ${summaries.length}`}
          {flights.length !== all.length && ' dans la sélection'}
        </Text>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <TextInput
          label="Rechercher un pilote"
          placeholder="Nom du pilote"
          leftSection={<IconSearch size={16} aria-hidden="true" />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          style={{ flex: '1 1 220px', maxWidth: 360 }}
          data-testid="pilots-search"
        />
        <Select
          label="Trier par"
          data={PILOT_SORTS.map((s) => ({ value: s.value, label: s.label }))}
          value={sort}
          allowDeselect={false}
          onChange={(v) => v && setSort(v as PilotSortKey)}
          style={{ flex: '0 1 200px' }}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyNote>{summaries.length === 0 ? 'Aucun vol pour ces filtres.' : 'Aucun pilote ne correspond à la recherche.'}</EmptyNote>
      ) : (
        <ul className="pl-list" style={{ margin: 0, padding: 0 }} data-testid="pilots-list">
          {rows.map((r) => (
            <PilotCard key={r.slug} row={r} />
          ))}
        </ul>
      )}
    </Stack>
  );
}
