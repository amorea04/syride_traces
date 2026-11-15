import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation, type RouterProviderProps } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useFiltersUrlSync } from '@/store/useFiltersUrlSync';

let router: RouterProviderProps['router'];

function Probe() {
  useFiltersUrlSync();
  const { pathname, search } = useLocation();
  return <output data-testid="loc">{pathname + search}</output>;
}

function mount(initial: string) {
  router = createMemoryRouter([{ path: '*', element: <Probe /> }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
}

const loc = () => router.state.location.pathname + router.state.location.search;

beforeEach(() => {
  useFiltersStore.setState({ filters: defaultFilters() });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('synchronisation filtres ↔ URL', () => {
  it('URL → store au chargement', () => {
    mount('/vols?activite=paramoteur&pilote=j2f&site=3&du=2024-01-01');
    const f = useFiltersStore.getState().filters;
    expect(f).toMatchObject({ activity: 'paramoteur', pilots: ['j2f'], sites: [3], dateFrom: '2024-01-01' });
    expect(loc()).toBe('/vols?activite=paramoteur&pilote=j2f&site=3&du=2024-01-01');
  });

  it('store → URL, défauts absents, autres paramètres conservés', () => {
    mount('/');
    expect(loc()).toBe('/');
    act(() => useFiltersStore.getState().setFilters({ activity: 'parapente' }));
    expect(loc()).toBe('/?activite=parapente');
    act(() => useFiltersStore.getState().reset());
    expect(loc()).toBe('/');
  });

  it('un lien sans paramètres conserve les filtres (réinjectés dans l’URL)', async () => {
    mount('/');
    act(() => useFiltersStore.getState().setFilters({ pilots: ['a'] }));
    await act(() => router.navigate('/sites'));
    expect(loc()).toBe('/sites?pilote=a');
    expect(useFiltersStore.getState().filters.pilots).toEqual(['a']);
  });

  it('retour arrière : l’URL redevient la source de vérité', async () => {
    mount('/');
    act(() => useFiltersStore.getState().setFilters({ activity: 'parapente' }));
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z')); // hors fenêtre de fusion : nouvelle entrée
    act(() => useFiltersStore.getState().setFilters({ activity: 'paramoteur' }));
    expect(loc()).toBe('/?activite=paramoteur');
    await act(() => router.navigate(-1));
    expect(loc()).toBe('/?activite=parapente');
    expect(useFiltersStore.getState().filters.activity).toBe('parapente');
    await act(() => router.navigate(-1));
    expect(loc()).toBe('/');
    expect(useFiltersStore.getState().filters.activity).toBe('tout');
  });

  it('les modifications rapides remplacent l’entrée d’historique', async () => {
    mount('/');
    act(() => useFiltersStore.getState().setFilters({ pilots: ['a'] }));
    act(() => useFiltersStore.getState().setFilters({ pilots: ['a', 'b'] }));
    act(() => useFiltersStore.getState().setFilters({ pilots: ['a', 'b', 'c'] }));
    expect(loc()).toBe('/?pilote=a&pilote=b&pilote=c');
    await act(() => router.navigate(-1));
    expect(loc()).toBe('/');
    expect(useFiltersStore.getState().filters.pilots).toEqual([]);
  });

  it('un lien portant d’autres filtres les adopte', async () => {
    mount('/');
    act(() => useFiltersStore.getState().setFilters({ activity: 'parapente' }));
    await act(() => router.navigate('/vols?activite=paramoteur'));
    expect(useFiltersStore.getState().filters.activity).toBe('paramoteur');
    expect(loc()).toBe('/vols?activite=paramoteur');
  });
});
