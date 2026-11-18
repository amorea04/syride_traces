import { useMemo } from 'react';
import { useData } from '@/data/DataProvider';
import { filterSummary } from '@/lib/filterSummary';
import type { FilterDimension } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';

/** Libellés de la ligne « Vue filtrée » pour les filtres globaux, hors dimensions `omit` (noms d'affichage). */
export function useFilterSummary(omit: readonly FilterDimension[] = []): string[] {
  const { flights, siteById } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const pilotNames = useMemo(() => new Map(flights.map((f) => [f.pilotSlug, f.pilot])), [flights]);
  const omitKey = omit.join(',');
  return useMemo(
    () =>
      filterSummary(
        filters,
        {
          pilot: (slug) => pilotNames.get(slug) ?? slug,
          site: (id) => siteById.get(id)?.name ?? `Site ${id}`,
        },
        omitKey === '' ? [] : (omitKey.split(',') as FilterDimension[]),
      ),
    [filters, pilotNames, siteById, omitKey],
  );
}
