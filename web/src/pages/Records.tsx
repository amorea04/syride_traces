import { Stack } from '@mantine/core';
import { RecordsTables } from '@/components/records/RecordsTables';
import { PageHeading } from '@/components/site/PageHeading';
import { useFilteredFlights } from '@/store/useFilteredFlights';

/** Records (ROADMAP §5.7) : classements Top 10 par métrique sur la sélection globale, sans médaille. */
export function Records() {
  const flights = useFilteredFlights();
  return (
    <Stack gap={24}>
      <PageHeading
        title="Records"
        description="Meilleures marques de la sélection. Chaque ligne renvoie à la fiche du vol et à sa trace sur Syride."
      />
      <RecordsTables flights={flights} />
    </Stack>
  );
}
