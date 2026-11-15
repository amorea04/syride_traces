import { Text } from '@mantine/core';
import { useParams } from 'react-router';
import { PageStub } from '@/components/PageStub';
import { useData } from '@/data/DataProvider';
import { fmtDate } from '@/lib/format';

export function Flight() {
  const { key = '' } = useParams();
  const { flights } = useData();
  const flight = flights.find((f) => f.key === key);
  return (
    <PageStub
      title={flight ? `Vol du ${fmtDate(flight.date, { withYear: true })}` : 'Vol introuvable'}
      description="Fiche vol (phase 4)."
    >
      <Text size="sm">
        Clé : <code>{key}</code>
        {flight ? ` · ${flight.pilot}` : ' · aucun vol ne porte cette clé.'}
      </Text>
    </PageStub>
  );
}
