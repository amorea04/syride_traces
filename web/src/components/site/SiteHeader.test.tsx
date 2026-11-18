import { MantineProvider } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mapProps = vi.hoisted(() => ({ last: null as null | { data: { collection: { features: unknown[] } } } }));
vi.mock('@/components/map/SitesMap', () => ({
  SitesMap: (props: { data: { collection: { features: unknown[] } } }) => {
    mapProps.last = props;
    return <div data-testid="sites-map" />;
  },
}));
const holder = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/data/DataProvider', () => ({ useData: () => holder.data }));

import type { Site } from '@/data/load';
import { SiteHeader } from '@/components/site/SiteHeader';
import { useFiltersStore } from '@/store/filters';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const site = (over: Partial<Site> = {}): Site => ({
  id: 1,
  name: 'Montbron',
  lat: 45.5,
  lon: 0.5,
  flights: 0,
  pilots: 0,
  activities: { parapente: 0, paramoteur: 0 },
  ...over,
});

function renderHeader(s: Site, flights = [] as ReturnType<typeof makeFlight>[]) {
  holder.data = { flights, siteById: new Map([[s.id, s]]) };
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>
        <SiteHeader site={s} flights={flights} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  installDomMocks();
  useFiltersStore.getState().reset();
  mapProps.last = null;
});
afterEach(cleanup);

describe('SiteHeader', () => {
  it('donne un point à la carte pour un site avec coordonnées et sans vol', () => {
    renderHeader(site());
    expect(mapProps.last?.data.collection.features).toHaveLength(1);
  });
  it('un point aussi quand le site a des vols', () => {
    renderHeader(site(), [makeFlight('2025-05-01', { siteId: 1 }), makeFlight('2025-05-02', { siteId: 1 })]);
    expect(mapProps.last?.data.collection.features).toHaveLength(1);
  });
  it('pas de carte sans coordonnées', () => {
    const { queryByTestId } = renderHeader(site({ lat: null, lon: null }));
    expect(queryByTestId('sites-map')).toBeNull();
  });
});
