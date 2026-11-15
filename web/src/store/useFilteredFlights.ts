import { useMemo } from 'react';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { applyFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';

/** Vols qui passent les filtres globaux. */
export function useFilteredFlights(): Flight[] {
  const { flights } = useData();
  const filters = useFiltersStore((s) => s.filters);
  return useMemo(() => applyFilters(flights, filters), [flights, filters]);
}
