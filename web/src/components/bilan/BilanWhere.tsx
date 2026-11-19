import { Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { FilterLink, useFilterSearch } from '@/components/FilterLink';
import { SitesMap } from '@/components/map/SitesMap';
import { useData } from '@/data/DataProvider';
import { newSiteIds, reachView, siteTableRows, zoneBounds, zoneSummary } from '@/lib/bilanDetails';
import { EMPTY, fmtDate, fmtDuration, fmtInt, fmtNum, fmtPercent, NBSP, plural } from '@/lib/format';
import { aggregateSites, type Bounds } from '@/lib/mapSites';
import './bilanB.css';

const MAP_HEIGHT = 460;
const MAP_HEIGHT_MOBILE = 320;

/**
 * Où : phrase du récit, carte des sites de l'année (cercles proportionnels, nouveaux sites cerclés d'or), boutons de
 * cadrage par zone, portée autour du site principal et tableau des sites. D12 : positions des sites uniquement.
 */
export function BilanWhere() {
  const { flights, story } = useBilan();
  const { siteById } = useData();
  const navigate = useNavigate();
  const search = useFilterSearch();
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;

  const data = useMemo(() => aggregateSites(flights, siteById), [flights, siteById]);
  const rows = useMemo(() => siteTableRows(flights, story), [flights, story]);
  const goldIds = useMemo(() => newSiteIds(story, flights), [flights, story]);
  const reach = useMemo(() => reachView(story.reach), [story.reach]);
  const zones = story.map_zones;

  // Zone choisie, par nom (null = tout) : une zone absente du récit courant (autre discipline) retombe sur « Tout ».
  // `seq` force un recadrage même en recliquant sur la zone courante.
  const [view, setView] = useState<{ zone: string | null; seq: number }>({ zone: null, seq: 0 });
  const zone = view.zone === null ? undefined : zones.find((z) => z.name === view.zone);
  const focus = useMemo(() => {
    const bounds: Bounds | null = zone ? zoneBounds(zone) : data.allBounds;
    return bounds ? { bounds } : null;
    // `seq` : un nouveau clic sur la même zone doit produire un nouvel objet `focus`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, view.seq, data.allBounds]);
  const choose = useCallback((name: string | null) => setView((v) => ({ zone: name, seq: v.seq + 1 })), []);

  const openSite = useCallback(
    (siteId: number) => void navigate({ pathname: `/site/${siteId}`, search }),
    [navigate, search],
  );

  const placed = data.collection.features.length > 0;

  return (
    <Section id="ou" title="Où as-tu volé ?">
      {story.texts.ou && (
        <p className="bb-lead" data-testid="bilan-texte-ou">
          {story.texts.ou}
        </p>
      )}

      {placed ? (
        <>
          {zones.length > 1 && (
            <div className="bb-zones" role="group" aria-label="Cadrer la carte sur une zone" data-testid="bilan-zones">
              <button
                type="button"
                className="bb-zone"
                aria-pressed={!zone}
                onClick={() => choose(null)}
                data-testid="bilan-zone-all"
              >
                <span className="bb-zone-name">Tout</span>
                <span className="bb-zone-note">{plural(data.collection.features.length, 'site')}</span>
              </button>
              {zones.map((z) => (
                <button
                  key={z.name}
                  type="button"
                  className="bb-zone"
                  aria-pressed={zone === z}
                  onClick={() => choose(z.name)}
                  data-testid="bilan-zone"
                >
                  <span className="bb-zone-name">{z.name}</span>
                  <span className="bb-zone-note">{zoneSummary(z)}</span>
                </button>
              ))}
            </div>
          )}
          <SitesMap
            data={data}
            height={isMobile ? MAP_HEIGHT_MOBILE : MAP_HEIGHT}
            fitToSelection={false}
            focus={focus}
            goldSiteIds={goldIds}
            popup={false}
            onSiteClick={openSite}
          />
          <div className="bb-legend">
            <span>Un cercle par site ; la taille suit le nombre de vols.</span>
            {goldIds.length > 0 && (
              <span>
                <i className="bb-ring" aria-hidden="true" /> Site découvert cette année
              </span>
            )}
          </div>
          {data.sitesWithoutCoords > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              {plural(data.sitesWithoutCoords, 'site')} sans coordonnées ({plural(data.flightsWithoutCoords, 'vol')}),
              absent{data.sitesWithoutCoords > 1 ? 's' : ''} de la carte.
            </Text>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed" role="status">
          Positions des sites indisponibles pour ces vols.
        </Text>
      )}

      {reach && (
        <div className="bb-reach" data-testid="bilan-reach">
          <div className="sr-tile">
            <div className="sr-tile-label">Site principal</div>
            <div className="sr-tile-value">{reach.main}</div>
            <div className="sr-tile-note">{fmtPercent(reach.mainSharePct)} des vols de l’année</div>
          </div>
          {reach.farthest && (
            <div className="sr-tile">
              <div className="sr-tile-label">Site le plus éloigné</div>
              <div className="sr-tile-value">{reach.farthest.site}</div>
              <div className="sr-tile-note">
                à {fmtNum(reach.farthest.km, reach.farthest.km >= 10 ? 0 : 1)}
                {NBSP}km du site principal
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bb-block">
        <p className="bb-sub">Sites de l’année</p>
        <Table.ScrollContainer minWidth={600}>
          <Table fz="sm" className="sr-tabular" data-testid="bilan-sites-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Site</Table.Th>
                <Table.Th ta="right">Vols</Table.Th>
                <Table.Th ta="right">Temps de vol</Table.Th>
                <Table.Th ta="right">Durée moyenne</Table.Th>
                <Table.Th ta="right">Vitesse moy.</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.site} data-testid="bilan-site-row" data-new={r.isNew}>
                  <Table.Td>
                    {r.siteId !== null ? <FilterLink to={`/site/${r.siteId}`}>{r.site}</FilterLink> : r.site}
                    {r.isNew && (
                      <span
                        className="bb-new"
                        data-testid="bilan-new-site"
                        title={r.firstDate ? `Premier vol le ${fmtDate(r.firstDate, { withYear: true })}` : undefined}
                      >
                        nouveau
                      </span>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{fmtInt(r.n)}</Table.Td>
                  <Table.Td ta="right">{fmtDuration(r.minutes)}</Table.Td>
                  <Table.Td ta="right">{r.n > 0 ? fmtDuration(r.durationMean) : EMPTY}</Table.Td>
                  <Table.Td ta="right">
                    {r.speedAvgMean !== null ? `${fmtNum(r.speedAvgMean, 1)}${NBSP}km/h` : EMPTY}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
    </Section>
  );
}
