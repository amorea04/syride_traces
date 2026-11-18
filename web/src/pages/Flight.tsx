import { Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { AverageComparison } from '@/components/flight/AverageComparison';
import { ContextRanks } from '@/components/flight/ContextRanks';
import { FlightFigures } from '@/components/flight/FlightFigures';
import { FlightHeader, fmtFlightMoment } from '@/components/flight/FlightHeader';
import { PrevNext } from '@/components/flight/PrevNext';
import { SameDay } from '@/components/flight/SameDay';
import { SiteMiniMap } from '@/components/flight/SiteMiniMap';
import { SiteVsOthers } from '@/components/flight/SiteVsOthers';
import { FilterLink } from '@/components/FilterLink';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { buildFlightContext } from '@/lib/flightContext';
import '@/components/flight/flight.css';

/**
 * Fiche vol (ROADMAP §5.3, D12 : aucune trace). La population de référence est l'ensemble des vols :
 * le contexte d'un vol ne dépend pas des filtres globaux, seuls les liens sortants les conservent.
 */
export function Flight() {
  const { key = '' } = useParams();
  const { flights, siteById } = useData();
  const flight = useMemo(() => flights.find((f) => f.key === key), [flights, key]);
  const context = useMemo(() => (flight ? buildFlightContext(flight, flights) : null), [flight, flights]);

  if (!flight || !context) {
    return (
      <Stack gap="xs" data-testid="flight-not-found">
        <title>{`Vol introuvable · ${APP_NAME}`}</title>
        <Title order={1} size="h2">
          Vol introuvable
        </Title>
        <Text size="sm" c="dimmed">
          Aucun vol ne porte la clé « {key} ».
        </Text>
        <Text size="sm">
          <FilterLink to="/vols">Retour à la liste des vols</FilterLink>
        </Text>
      </Stack>
    );
  }

  const site = flight.siteId === null ? undefined : siteById.get(flight.siteId);
  return (
    <Stack gap={28} data-testid="flight-page" data-flight-key={flight.key}>
      <title>{`${flight.site ?? 'Vol'} · ${flight.pilot} · ${fmtFlightMoment(flight)} · ${APP_NAME}`}</title>
      <FlightHeader flight={flight} />
      <div className="fv-grid">
        <div className="fv-stack">
          <FlightFigures flight={flight} />
          <ContextRanks ranks={context.ranks} />
          <AverageComparison
            comparisons={context.comparisons}
            hasSite={flight.siteId !== null}
            siteName={flight.site}
          />
          <SiteVsOthers flight={flight} allFlights={flights} pilotFlights={context.populations.pilot} />
        </div>
        <div className="fv-stack">
          <PrevNext previous={context.previous} next={context.next} />
          <SiteMiniMap site={site} siteId={flight.siteId} siteName={flight.site} />
          <SameDay flight={flight} sameDay={context.sameDay} />
        </div>
      </div>
    </Stack>
  );
}
