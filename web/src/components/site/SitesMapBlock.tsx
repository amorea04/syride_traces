import { Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { useFilterSearch } from '@/components/FilterLink';
import { SitesMap } from '@/components/map/SitesMap';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { plural } from '@/lib/format';
import { aggregateSites } from '@/lib/mapSites';

const MAP_HEIGHT = 560;
const MAP_HEIGHT_MOBILE = 380;

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/** Carte des sites de `/sites` : grande hauteur, un clic ouvre la page du site (D12 : un point par site). */
export function SitesMapBlock({ flights }: Props) {
  const { siteById } = useData();
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  const navigate = useNavigate();
  const search = useFilterSearch();
  const data = useMemo(() => aggregateSites(flights, siteById), [flights, siteById]);
  const open = useCallback(
    (siteId: number) => void navigate({ pathname: `/site/${siteId}`, search }),
    [navigate, search],
  );

  return (
    <Section
      id="carte-sites"
      title="Carte des sites"
      subtitle="Un point par site de décollage ; la taille suit le nombre de vols. Un clic ouvre la page du site."
    >
      {flights.length === 0 ? (
        <EmptyNote />
      ) : (
        <>
          <SitesMap
            data={data}
            height={isMobile ? MAP_HEIGHT_MOBILE : MAP_HEIGHT}
            onSiteClick={open}
            popup={false}
          />
          {data.sitesWithoutCoords > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              {plural(data.sitesWithoutCoords, 'site')} sans coordonnées (
              {plural(data.flightsWithoutCoords, 'vol')}
              ), absent{data.sitesWithoutCoords > 1 ? 's' : ''} de la carte.
            </Text>
          )}
        </>
      )}
    </Section>
  );
}
