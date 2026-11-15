import { Text } from '@mantine/core';
import { useParams } from 'react-router';
import { PageStub } from '@/components/PageStub';
import { useData } from '@/data/DataProvider';

export function Site() {
  const { id = '' } = useParams();
  const { siteById } = useData();
  const site = siteById.get(Number(id));
  return (
    <PageStub title={site?.name ?? 'Site introuvable'} description="Fiche site (phase 5).">
      <Text size="sm">
        Identifiant : <code>{id}</code>
      </Text>
    </PageStub>
  );
}
