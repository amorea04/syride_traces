import { Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { plural } from '@/lib/format';
import { useFilteredFlights } from '@/store/useFilteredFlights';

interface Props {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Page vide titrée : affiche le nombre de vols filtrés, pour vérifier que les filtres fonctionnent. */
export function PageStub({ title, description, children }: Props) {
  const { flights } = useData();
  const filtered = useFilteredFlights();
  return (
    <Stack gap="xs">
      <title>{`${title} · ${APP_NAME}`}</title>
      <Title order={1} size="h2">
        {title}
      </Title>
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      <Text data-testid="flight-count-line" aria-live="polite">
        <strong data-testid="flight-count">{plural(filtered.length, 'vol')}</strong>
        {filtered.length === flights.length
          ? ' au total'
          : ` sélectionnés sur ${plural(flights.length, 'vol')}`}
      </Text>
      {children}
    </Stack>
  );
}
