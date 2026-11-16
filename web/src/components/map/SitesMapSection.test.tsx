import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation: vi.fn() };
    addControl = vi.fn();
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    resize = vi.fn();
    getLayer = vi.fn();
    getSource = vi.fn();
  }
  class NavigationControl {}
  class Popup {}
  return { Map, NavigationControl, Popup, setWorkerUrl: vi.fn() };
});
vi.mock('@/data/DataProvider', () => ({
  useData: () => ({ siteById: new Map([[0, { id: 0, name: 'Site A', lat: 45, lon: 6 }]]) }),
}));

import { SitesMapSection } from '@/components/map/SitesMapSection';
import { mantineTheme } from '@/theme';
import { makeFlight } from '../../../tests/flightFactory';
import { installDomMocks } from '../../../tests/dom-mocks';

function renderSection(flights: ReturnType<typeof makeFlight>[]) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>
        <SitesMapSection flights={flights} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  installDomMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 })),
  );
});
afterEach(cleanup);

describe('SitesMapSection', () => {
  it('affiche le titre, la bascule et le bouton de données', () => {
    renderSection([makeFlight('2024-05-01', { siteId: 0 })]);
    expect(screen.getByRole('heading', { name: 'Carte des sites' })).toBeInTheDocument();
    expect(screen.getByText('Heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('sites-map')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les données' }));
    expect(screen.getByText('Site A')).toBeInTheDocument();
  });

  it('affiche un message sobre sur sélection vide', () => {
    renderSection([]);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
    expect(screen.queryByTestId('sites-map')).not.toBeInTheDocument();
  });
});
