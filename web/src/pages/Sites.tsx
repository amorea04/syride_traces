import { Stack } from '@mantine/core';
import { PageHeading } from '@/components/site/PageHeading';
import { SitesMapBlock } from '@/components/site/SitesMapBlock';
import { SitesTable } from '@/components/site/SitesTable';
import { useFilteredFlights } from '@/store/useFilteredFlights';

/** Sites (ROADMAP §5.5) : carte des sites et tableau triable, sur la sélection globale. */
export function Sites() {
  const flights = useFilteredFlights();
  return (
    <Stack gap={24}>
      <PageHeading
        title="Sites"
        description="Carte et liste des sites de décollage. Un clic ouvre la page du site."
      />
      <SitesMapBlock flights={flights} />
      <SitesTable flights={flights} />
    </Stack>
  );
}
