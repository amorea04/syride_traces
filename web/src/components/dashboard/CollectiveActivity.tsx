import { SimpleGrid } from '@mantine/core';
import { useMemo } from 'react';
import { GroupSeason } from '@/components/dashboard/GroupSeason';
import { LatestFlights } from '@/components/dashboard/LatestFlights';
import { PeriodActivity } from '@/components/dashboard/PeriodActivity';
import { RecentRecords } from '@/components/dashboard/RecentRecords';
import type { Flight } from '@/data/flight';
import { flightMatches, type Filters } from '@/lib/filters';

interface Props {
  /** Tous les vols : les blocs « à date » ignorent la période filtrée mais suivent les autres filtres. */
  allFlights: readonly Flight[];
  filters: Filters;
  /** Date de référence (`referenceDate`). */
  today: string;
}

/**
 * Activité collective : saison du groupe, mois / semaine, derniers vols, records récents.
 * Suit les filtres globaux sauf la période (les blocs sont « à date »).
 */
export function CollectiveActivity({ allFlights, filters, today }: Props) {
  const base = useMemo(
    () => allFlights.filter((f) => flightMatches(f, filters, 'period')),
    [allFlights, filters],
  );
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl" verticalSpacing="xl" data-testid="collective-activity">
      <GroupSeason flights={base} today={today} />
      <PeriodActivity flights={base} today={today} />
      <LatestFlights flights={base} />
      <RecentRecords flights={base} today={today} />
    </SimpleGrid>
  );
}
