import { create } from 'zustand';
import { defaultFilters, type Filters } from '@/lib/filters';

interface FiltersState {
  filters: Filters;
  /** Modifie une partie des filtres (un nouvel objet à chaque appel). */
  setFilters: (patch: Partial<Filters>) => void;
  /** Remplace tous les filtres (utilisé par la synchronisation avec l'URL). */
  replaceAll: (filters: Filters) => void;
  reset: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  filters: defaultFilters(),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  replaceAll: (filters) => set({ filters }),
  reset: () => set({ filters: defaultFilters() }),
}));
