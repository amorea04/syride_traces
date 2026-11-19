import { Button, Group, Pill } from '@mantine/core';
import { useMemo } from 'react';
import { useData } from '@/data/DataProvider';
import { countActiveFilters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { useFiltersStore } from '@/store/filters';

/** Libellé de la période, ou null si aucune borne. */
export function periodLabel(from: string | null, to: string | null): string | null {
  if (from && to) return `Du ${fmtDate(from, { withYear: true })} au ${fmtDate(to, { withYear: true })}`;
  if (from) return `Depuis le ${fmtDate(from, { withYear: true })}`;
  if (to) return `Jusqu’au ${fmtDate(to, { withYear: true })}`;
  return null;
}

/** Puces des filtres actifs et bouton « Réinitialiser ». N'affiche rien sans filtre. */
export function ActiveFilters() {
  const { flights, siteById } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const setFilters = useFiltersStore((s) => s.setFilters);
  const reset = useFiltersStore((s) => s.reset);

  const pilotNames = useMemo(() => new Map(flights.map((f) => [f.pilotSlug, f.pilot])), [flights]);

  if (countActiveFilters(filters) === 0) return null;
  const period = periodLabel(filters.dateFrom, filters.dateTo);

  const chip = (key: string, label: string, onRemove: () => void) => (
    <Pill
      key={key}
      withRemoveButton
      onRemove={onRemove}
      removeButtonProps={{ 'aria-label': `Retirer le filtre ${label}` }}
    >
      {label}
    </Pill>
  );

  return (
    <Group gap="xs" role="group" aria-label="Filtres actifs" data-testid="active-filters">
      {filters.pilots.map((slug) =>
        chip(`p-${slug}`, pilotNames.get(slug) ?? slug, () =>
          setFilters({ pilots: filters.pilots.filter((p) => p !== slug) }),
        ),
      )}
      {filters.activity !== 'tout' &&
        chip('activite', filters.activity === 'parapente' ? 'Parapente' : 'Paramoteur', () =>
          setFilters({ activity: 'tout' }),
        )}
      {filters.years.map((y) =>
        chip(`a-${y}`, String(y), () => setFilters({ years: filters.years.filter((x) => x !== y) })),
      )}
      {period && chip('periode', period, () => setFilters({ dateFrom: null, dateTo: null }))}
      {filters.wings.map((w) =>
        chip(`w-${w}`, w, () => setFilters({ wings: filters.wings.filter((x) => x !== w) })),
      )}
      {filters.sites.map((id) =>
        chip(`s-${id}`, siteById.get(id)?.name ?? `Site ${id}`, () =>
          setFilters({ sites: filters.sites.filter((x) => x !== id) }),
        ),
      )}
      <Button variant="subtle" size="compact-sm" onClick={reset}>
        Réinitialiser
      </Button>
    </Group>
  );
}
