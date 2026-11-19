import { Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { DetailNav } from '@/components/common/DetailNav';
import { CareerSection } from '@/components/pilot/CareerSection';
import { FavouriteSites } from '@/components/pilot/FavouriteSites';
import { PersonalRecords } from '@/components/pilot/PersonalRecords';
import { PilotHeader } from '@/components/pilot/PilotHeader';
import { PilotKpis } from '@/components/pilot/PilotKpis';
import { SitesFaceToFace } from '@/components/pilot/SitesFaceToFace';
import { WingTimeline } from '@/components/pilot/WingTimeline';
import { YearCards } from '@/components/pilot/YearCards';
import '@/components/pilot/pilot.css';
import { FilterLink } from '@/components/FilterLink';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { referenceDate } from '@/lib/dashboard';
import { flightMatches } from '@/lib/filters';
import { useFilterSummary } from '@/store/useFilterSummary';
import { useFiltersStore } from '@/store/filters';

/**
 * Page pilote (§5.4). Elle ignore le filtre « pilotes » (elle montre toujours ce pilote) et applique les
 * autres : activité, période, sites, voiles.
 */
export function Pilot() {
  const { slug = '' } = useParams();
  const { meta, flights: all } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const mine = useMemo(() => all.filter((f) => f.pilotSlug === slug), [all, slug]);
  const flights = useMemo(() => mine.filter((f) => flightMatches(f, filters, 'pilots')), [mine, filters]);
  const refDate = useMemo(() => referenceDate(meta.data_updated_at, all), [meta.data_updated_at, all]);
  const reduced = useFilterSummary(['pilots']);

  const pilot = mine[0]?.pilot;
  if (pilot === undefined) {
    return (
      <Stack gap="xs" data-testid="pilot-not-found">
        <title>{`Pilote introuvable · ${APP_NAME}`}</title>
        <Title order={1} size="h2">
          Pilote introuvable
        </Title>
        <Text size="sm">
          Aucun pilote ne correspond à « {slug} ». <FilterLink to="/pilotes">Voir la liste des pilotes</FilterLink>
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xl" data-testid="pilot-page" data-slug={slug}>
      <title>{`${pilot} · ${APP_NAME}`}</title>
      <DetailNav crumbs={[{ label: 'Pilotes', to: '/pilotes' }, { label: pilot }]} />
      <PilotHeader pilot={pilot} slug={slug} flights={flights} reduced={reduced} />
      {flights.length > 0 && (
        <>
          <PilotKpis flights={flights} />
          <div className="pl-two">
            <CareerSection flights={flights} />
            <PersonalRecords flights={flights} />
          </div>
          <YearCards flights={flights} slug={slug} refDate={refDate} />
          <FavouriteSites flights={flights} />
          <SitesFaceToFace pilot={pilot} flights={flights} />
          <WingTimeline flights={flights} />
        </>
      )}
    </Stack>
  );
}
