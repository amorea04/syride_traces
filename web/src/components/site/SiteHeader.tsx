import { Anchor, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { SitesMap } from '@/components/map/SitesMap';
import { PageHeading } from '@/components/site/PageHeading';
import { useData } from '@/data/DataProvider';
import type { Site } from '@/data/load';
import type { Flight } from '@/data/flight';
import { writeFilters } from '@/lib/filters';
import { fmtDate, fmtNum, plural } from '@/lib/format';
import { aggregateSites } from '@/lib/mapSites';
import { distinctCount } from '@/lib/numeric';
import { useFiltersStore } from '@/store/filters';
import './site.css';

const MINI_MAP_HEIGHT = 240;
const MINI_MAP_HEIGHT_MOBILE = 200;

/** « 45,6000° N, 0,5000° E ». */
export function fmtCoordinates(lat: number, lon: number): string {
  return `${fmtNum(Math.abs(lat), 4)}° ${lat >= 0 ? 'N' : 'S'}, ${fmtNum(Math.abs(lon), 4)}° ${lon >= 0 ? 'E' : 'O'}`;
}

interface Props {
  site: Site;
  /** Vols du site après filtres (tous sauf le filtre de sites). */
  flights: readonly Flight[];
}

/** En-tête de la page site : nom, coordonnées, chiffres d'identité, mini-carte (la position du site, jamais celle d'un vol). */
export function SiteHeader({ site, flights }: Props) {
  const { flights: allFlights, siteById } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  // La mini-carte montre toujours le site, quels que soient les filtres.
  const mapData = useMemo(
    () =>
      aggregateSites(
        allFlights.filter((f) => f.siteId === site.id),
        siteById,
      ),
    [allFlights, siteById, site.id],
  );
  const dates = useMemo(() => flights.map((f) => f.date).sort(), [flights]);
  const hasCoords = site.lat !== null && site.lon !== null;
  const volsSearch = writeFilters('', { ...filters, sites: [site.id] });

  return (
    <div className="st-head" data-testid="site-header">
      <div style={{ minWidth: 0 }}>
        <PageHeading title={site.name} omit="sites" />
        <ul className="st-facts">
          <li>
            <b>{plural(flights.length, 'vol')}</b> ·{' '}
            <b>{plural(distinctCount(flights.map((f) => f.pilotSlug)), 'pilote')}</b>
          </li>
          {dates.length > 0 && (
            <li>
              Du <b>{fmtDate(dates[0]!, { withYear: true })}</b> au{' '}
              <b>{fmtDate(dates[dates.length - 1]!, { withYear: true })}</b>
            </li>
          )}
          <li data-testid="site-coordinates">
            {hasCoords ? fmtCoordinates(site.lat!, site.lon!) : 'Coordonnées inconnues'}
          </li>
        </ul>
        <Text size="sm" mt="sm">
          <Anchor
            component={Link}
            to={{ pathname: '/vols', search: volsSearch }}
            data-testid="site-flights-link"
          >
            Voir les vols de ce site
          </Anchor>
        </Text>
      </div>
      <div className="st-minimap">
        {hasCoords ? (
          <>
            <SitesMap
              data={mapData}
              height={isMobile ? MINI_MAP_HEIGHT_MOBILE : MINI_MAP_HEIGHT}
              popup={false}
              highlightSiteId={null}
            />
            <Text size="xs" c="dimmed" mt={4}>
              Position du site, jamais celle d’un vol.
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed" role="status" data-testid="minimap-empty">
            La position de {site.name} n’est pas connue : pas de carte.
          </Text>
        )}
      </div>
    </div>
  );
}
