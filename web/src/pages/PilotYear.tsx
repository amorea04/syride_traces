import { Text } from '@mantine/core';
import { useParams } from 'react-router';
import { PageStub } from '@/components/PageStub';
import { useData } from '@/data/DataProvider';

export function PilotYear() {
  const { slug = '', annee = '' } = useParams();
  const { flights } = useData();
  const name = flights.find((f) => f.pilotSlug === slug)?.pilot;
  return (
    <PageStub
      title={`Bilan ${annee}${name ? ` · ${name}` : ''}`}
      description="Bilan pilote × année (phase 5B)."
    >
      <Text size="sm">
        Identifiant : <code>{slug}</code> · année : <code>{annee}</code>
      </Text>
    </PageStub>
  );
}
