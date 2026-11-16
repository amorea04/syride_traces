import { SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { APP_NAME } from '@/components/navigation';
import { CollectiveActivity } from '@/components/dashboard/CollectiveActivity';
import { EvolutionChart } from '@/components/dashboard/EvolutionChart';
import { FlightCharacteristics } from '@/components/dashboard/FlightCharacteristics';
import { KpiBand } from '@/components/dashboard/KpiBand';
import { StatChart } from '@/components/dashboard/StatChart';
import { GearBlock } from '@/components/gear/GearBlock';
import { SitesMapSection } from '@/components/map/SitesMapSection';
import { DurationHistogram } from '@/components/rhythm/DurationHistogram';
import { FlightModes } from '@/components/rhythm/FlightModes';
import { FlightScatter } from '@/components/rhythm/FlightScatter';
import { RhythmBlock } from '@/components/rhythm/RhythmBlock';
import { WeekHourMatrix } from '@/components/rhythm/WeekHourMatrix';
import { useData } from '@/data/DataProvider';
import { referenceDate } from '@/lib/dashboard';
import { plural } from '@/lib/format';
import { useFiltersStore } from '@/store/filters';
import { useFilteredFlights } from '@/store/useFilteredFlights';

/**
 * Tableau de bord (ROADMAP §5.1). Ordre D14 : vue d'ensemble (KPI), puis activité collective
 * (à date, hors filtre de période), puis les blocs d'analyse de la sélection.
 */
export function Dashboard() {
  const { meta, flights: allFlights } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const flights = useFilteredFlights();
  const today = useMemo(() => referenceDate(meta.data_updated_at, allFlights), [meta.data_updated_at, allFlights]);

  return (
    <Stack gap="xl">
      <title>{`Tableau de bord · ${APP_NAME}`}</title>
      <div>
        <Title order={1} size="h2">
          Tableau de bord
        </Title>
        <Text size="sm" c="dimmed" data-testid="flight-count-line" aria-live="polite">
          <strong data-testid="flight-count">{plural(flights.length, 'vol')}</strong>
          {flights.length === allFlights.length
            ? ' au total'
            : ` sélectionnés sur ${plural(allFlights.length, 'vol')}`}
        </Text>
      </div>

      <KpiBand flights={flights} allFlights={allFlights} filters={filters} today={today} />
      <CollectiveActivity allFlights={allFlights} filters={filters} today={today} />
      <FlightCharacteristics flights={flights} />
      <EvolutionChart flights={flights} />
      <StatChart flights={flights} />
      <RhythmBlock flights={flights} referenceDate={today} />
      <WeekHourMatrix flights={flights} />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
        <DurationHistogram flights={flights} />
        <FlightModes flights={flights} />
      </SimpleGrid>
      <GearBlock flights={flights} />
      <FlightScatter flights={flights} />
      <SitesMapSection flights={flights} />
    </Stack>
  );
}
