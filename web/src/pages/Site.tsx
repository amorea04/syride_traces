import { Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { DetailNav } from '@/components/common/DetailNav';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import { SiteVsOthers } from '@/components/flight/SiteVsOthers';
import { APP_NAME } from '@/components/navigation';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteKpis } from '@/components/site/SiteKpis';
import { SiteLatestFlights } from '@/components/site/SiteLatestFlights';
import { SitePilots } from '@/components/site/SitePilots';
import { SiteRecords } from '@/components/site/SiteRecords';
import { SiteSeasonality } from '@/components/site/SiteSeasonality';
import { useData } from '@/data/DataProvider';
import { flightMatches } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useFilterSummary } from '@/store/useFilterSummary';

/** Identifiant de site d'une URL : entier positif ou nul, sinon `null`. */
function parseSiteId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Page d'un site (ROADMAP §5.5). Elle suit les filtres globaux sauf le filtre de sites : on voit toujours ce site.
 * D12 : seule la position du site apparaît sur la carte.
 */
export function Site() {
  const { id = '' } = useParams();
  const { flights, siteById } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const reduced = useFilterSummary(['sites']);
  const siteId = parseSiteId(id);
  const site = siteId === null ? undefined : siteById.get(siteId);

  // Vols de tous les sites après les autres filtres : population de « Ce site face aux autres » (voulu : cohérent
  // avec la vue filtrée, d'où la mention sous le bloc).
  const scope = useMemo(() => flights.filter((f) => flightMatches(f, filters, 'sites')), [flights, filters]);
  const siteFlights = useMemo(() => scope.filter((f) => f.siteId === siteId), [scope, siteId]);

  if (!site) {
    return (
      <Stack gap="xs" data-testid="site-not-found">
        <title>{`Site introuvable · ${APP_NAME}`}</title>
        <Title order={1} size="h2">
          Site introuvable
        </Title>
        <Text size="sm" c="dimmed">
          Aucun site ne porte l’identifiant « {id} ».
        </Text>
        <Text size="sm">
          <FilterLink to="/sites">Retour à la liste des sites</FilterLink>
        </Text>
      </Stack>
    );
  }

  return (
    <Stack key={site.id} gap={28} data-testid="site-page" data-site-id={site.id}>
      <DetailNav crumbs={[{ label: 'Sites', to: '/sites' }, { label: site.name }]} />
      <SiteHeader site={site} flights={siteFlights} />
      {siteFlights.length === 0 ? (
        <Section id="aucun-vol" title="Vols sur ce site">
          <EmptyNote />
        </Section>
      ) : (
        <>
          <SiteKpis flights={siteFlights} />
          <SiteSeasonality flights={siteFlights} />
          <SitePilots flights={siteFlights} />
          <SiteLatestFlights flights={siteFlights} />
          <SiteRecords flights={siteFlights} />
          <SiteVsOthers
            site={{ id: site.id, name: site.name }}
            referenceFlights={scope}
            showPilotView={false}
            showSiteLink={false}
          />
          {reduced.length > 0 && (
            <Text size="xs" c="dimmed" data-testid="site-vs-others-filtered">
              Comparaison calculée sur la vue filtrée.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
