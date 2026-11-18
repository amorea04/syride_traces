import { Stack, Text, Title } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { describeFilters } from '@/lib/sites';
import { useFiltersStore } from '@/store/filters';

interface Props {
  title: string;
  /** Phrase sous le titre (rôle de la page). */
  description?: ReactNode;
  /** Filtre de l'entité de la page, ignoré dans « Vue filtrée » (le pilote, le site). */
  omit?: 'pilots' | 'sites';
  children?: ReactNode;
}

/** Titre de page, description et, quand des filtres réduisent la vue, la ligne « Vue filtrée : … ». */
export function PageHeading({ title, description, omit, children }: Props) {
  const { flights, siteById } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const pilotNames = useMemo(() => new Map(flights.map((f) => [f.pilotSlug, f.pilot])), [flights]);
  const labels = describeFilters(
    filters,
    { pilot: (slug) => pilotNames.get(slug) ?? slug, site: (id) => siteById.get(id)?.name ?? `Site ${id}` },
    omit,
  );
  return (
    <Stack gap={4}>
      <title>{`${title} · ${APP_NAME}`}</title>
      <Title order={1} size="h2">
        {title}
      </Title>
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      {labels.length > 0 && (
        <Text size="sm" c="dimmed" data-testid="filtered-view">
          Vue filtrée : {labels.join(', ')}
        </Text>
      )}
      {children}
    </Stack>
  );
}
