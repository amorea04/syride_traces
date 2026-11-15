import { Text } from '@mantine/core';
import { useParams } from 'react-router';
import { PageStub } from '@/components/PageStub';
import { useData } from '@/data/DataProvider';

export function Pilot() {
  const { slug = '' } = useParams();
  const { flights } = useData();
  const name = flights.find((f) => f.pilotSlug === slug)?.pilot;
  return (
    <PageStub title={name ?? 'Pilote introuvable'} description="Fiche pilote (phase 5).">
      <Text size="sm">
        Identifiant : <code>{slug}</code>
      </Text>
    </PageStub>
  );
}
