import { Button, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { EmptyNote } from '@/components/dashboard/shared';
import { SitesMap } from '@/components/map/SitesMap';
import '@/components/pilot/pilot.css';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { fmtHm, fmtInt, plural } from '@/lib/format';
import { aggregateSites } from '@/lib/mapSites';
import { useHighlightStore } from '@/store/highlight';

const SHOWN = 8;
const MAP_HEIGHT = 380;
const MAP_HEIGHT_MOBILE = 300;

/** Sites favoris : tableau des sites du pilote et carte de ses sites (un cercle par site, jamais une trace). */
export function FavouriteSites({ flights }: { flights: readonly Flight[] }) {
  const { siteById } = useData();
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  const [all, setAll] = useState(false);
  const data = useMemo(() => aggregateSites(flights, siteById), [flights, siteById]);
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const rows = all ? data.rows : data.rows.slice(0, SHOWN);
  const maxFlights = data.rows[0]?.flights ?? 1;
  const hasMap = data.collection.features.length > 0;

  return (
    <Section
      id="sites-favoris"
      title="Sites favoris"
      subtitle="Cercles proportionnels au nombre de vols. Position des sites, sans trace."
    >
      {data.rows.length === 0 ? (
        <EmptyNote>Aucun site renseigné pour ces vols.</EmptyNote>
      ) : (
        <div className="pl-sites">
          <div data-testid="pilot-sites-table">
            {rows.map((r) => (
              <div
                key={r.siteId}
                className="pl-site-row"
                data-dim={highlight?.kind === 'site' && highlight.siteId !== r.siteId}
                onMouseEnter={() => setHighlight({ kind: 'site', siteId: r.siteId })}
                onMouseLeave={() => setHighlight(null)}
              >
                <FilterLink to={`/site/${r.siteId}`}>
                  {r.name}
                </FilterLink>
                <span className="pl-site-bar" aria-hidden="true">
                  <i style={{ width: `${(100 * r.flights) / maxFlights}%` }} />
                </span>
                <b title={fmtHm(r.minutes)}>{plural(r.flights, 'vol')}</b>
              </div>
            ))}
            {data.rows.length > SHOWN && (
              <Button variant="subtle" size="compact-xs" mt={6} onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? 'Voir moins' : `Voir les ${fmtInt(data.rows.length)} sites`}
              </Button>
            )}
            {data.flightsWithoutSite > 0 && (
              <Text size="xs" c="dimmed" mt={6}>
                {plural(data.flightsWithoutSite, 'vol')} sans site renseigné.
              </Text>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            {hasMap ? (
              <SitesMap data={data} height={isMobile ? MAP_HEIGHT_MOBILE : MAP_HEIGHT} />
            ) : (
              <EmptyNote>Aucun de ses sites n’a de coordonnées : pas de carte.</EmptyNote>
            )}
            {data.sitesWithoutCoords > 0 && hasMap && (
              <Text size="xs" c="dimmed" mt={4}>
                {plural(data.sitesWithoutCoords, 'site')} sans coordonnées, absent
                {data.sitesWithoutCoords > 1 ? 's' : ''} de la carte.
              </Text>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
