import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => {
  throw new Error('chunk injoignable');
});

import { SiteMiniMap } from '@/components/flight/SiteMiniMap';
import { SitesMap } from '@/components/map/SitesMap';
import type { Site } from '@/data/load';
import type { SitesMapData } from '@/lib/mapSites';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';

beforeEach(() => installDomMocks());
afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );

describe('échec du chunk MapLibre', () => {
  it('mini-carte : message sobre dans le cadre', async () => {
    const site = { id: 1, name: 'Montbron', lat: 45, lon: 0, flights: 3, pilots: 1 } as unknown as Site;
    wrap(<SiteMiniMap site={site} siteId={1} siteName="Montbron" />);
    expect(await screen.findByTestId('minimap-failed')).toHaveTextContent('Carte indisponible');
  });

  it('carte des sites : « Carte indisponible », pas « seuls les sites sont affichés »', async () => {
    const data = { collection: { type: 'FeatureCollection', features: [] }, rows: [], bounds: null };
    wrap(<SitesMap data={data as unknown as SitesMapData} height={300} />);
    expect(await screen.findByTestId('sites-map-failed')).toHaveTextContent('Carte indisponible');
    expect(screen.queryByText(/seuls les sites sont affichés/)).toBeNull();
  });
});
