import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created: {
  style: { sources: Record<string, { data: { features: { geometry: { type: string } }[] } }> };
}[] = [];
vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation: vi.fn() };
    addControl = vi.fn();
    remove = vi.fn();
    constructor(options: (typeof created)[number]) {
      created.push(options);
    }
  }
  class NavigationControl {}
  return { Map, NavigationControl, setWorkerUrl: vi.fn() };
});

const holder = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/data/DataProvider', () => ({ useData: () => holder.data }));

import { Flight as FlightPage } from '@/pages/Flight';
import { mantineTheme } from '@/theme';
import type { Flight } from '@/data/flight';
import type { Site } from '@/data/load';
import { syrideFlightUrl } from '@/lib/syride';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const SITE: Site = {
  id: 1,
  name: 'Montbron',
  lat: 45.5,
  lon: 0.5,
  flights: 12,
  pilots: 2,
  activities: { parapente: 12, paramoteur: 0 },
};

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function setup(flights: Flight[], path: string, sites: Site[] = [SITE]) {
  holder.data = { flights, sites, siteById: new Map(sites.map((s) => [s.id, s])) };
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route path="/vol/:key" element={<FlightPage />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

function population() {
  const mine = Array.from({ length: 12 }, (_, i) =>
    makeFlight(`2025-05-${String(i + 1).padStart(2, '0')}`, {
      key: `me-${i + 1}`,
      pilot: 'Jean Paul',
      pilotSlug: 'jean-paul',
      siteId: 1,
      site: 'Montbron',
      syrideNum: 100 + i,
      durationMin: 30 + i * 10,
      ceilingM: 800 + i * 100,
      time: '11:00',
    }),
  );
  const other = makeFlight('2025-05-12', {
    key: 'other-1',
    pilot: 'Autre',
    pilotSlug: 'autre',
    siteId: 1,
    site: 'Montbron',
    syrideNum: 7,
    time: '14:00',
  });
  return [...mine, other];
}

beforeEach(() => {
  installDomMocks();
  created.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 })),
  );
});
afterEach(cleanup);

describe('fiche vol', () => {
  it('affiche les sections et le bouton Syride exact', () => {
    const flights = population();
    setup(flights, '/vol/me-12');
    const f = flights.find((x) => x.key === 'me-12')!;
    const button = screen.getByTestId('syride-button');
    expect(button).toHaveAttribute('href', syrideFlightUrl(f.pilot, f.syrideNum));
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveAttribute('rel', 'noopener noreferrer');
    expect(button).toHaveAccessibleName(/Voir la trace sur Syride/);
    for (const name of [
      'Chiffres du vol',
      'Ce vol dans son contexte',
      'Ce vol face aux moyennes',
      'Position du site',
      'Vols du même jour',
    ])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.getByTestId('flight-ranks')).toHaveTextContent('Plus long vol de Jean Paul');
    expect(screen.getByTestId('flight-source')).toHaveTextContent('GPX');
  });

  it('un site de moins de 10 vols : message sobre, pas de bandes', () => {
    const flights = [makeFlight('2025-05-01', { key: 'a-1', siteId: 1, site: 'Montbron' })];
    setup(flights, '/vol/a-1');
    expect(screen.getByTestId('site-few')).toBeInTheDocument();
    expect(screen.queryByTestId('site-strips')).not.toBeInTheDocument();
  });

  it('un site seul de son espèce (aucun autre site comparable) : message sobre', () => {
    setup(population(), '/vol/me-5');
    expect(screen.getByText(/Aucun autre site de 10 vols ou plus à comparer/)).toBeInTheDocument();
  });

  it('plusieurs sites comparables : bandes, bascule du pilote indisponible avec message', () => {
    const flights = [
      ...population(),
      ...Array.from({ length: 11 }, (_, i) =>
        makeFlight('2024-06-01', {
          key: `z-${i}`,
          pilot: 'Zed',
          pilotSlug: 'zed',
          siteId: 2,
          site: 'Ailleurs',
        }),
      ),
    ];
    setup(flights, '/vol/me-5', [SITE, { ...SITE, id: 2, name: 'Ailleurs', lat: null, lon: null }]);
    expect(screen.getByTestId('site-strips')).toBeInTheDocument();
    expect(screen.getByTestId('pilot-view-unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Ce pilote')).not.toBeInTheDocument();
  });

  it('la bascule « Ce pilote » apparaît quand le pilote a deux sites de 10 vols', () => {
    const own = Array.from({ length: 10 }, (_, i) =>
      makeFlight('2024-06-01', {
        key: `b-${i}`,
        pilot: 'Jean Paul',
        pilotSlug: 'jean-paul',
        siteId: 2,
        site: 'Ailleurs',
      }),
    );
    setup([...population(), ...own], '/vol/me-5', [SITE, { ...SITE, id: 2, name: 'Ailleurs' }]);
    fireEvent.click(screen.getByText('Ce pilote'));
    expect(screen.getByTestId('site-strips')).toBeInTheDocument();
    expect(screen.getByText(/ses/)).toBeInTheDocument();
  });

  it('mini-carte : un seul Point à la position du site', () => {
    setup(population(), '/vol/me-5');
    expect(created).toHaveLength(0); // le style est chargé de façon asynchrone
    expect(screen.getByTestId('flight-minimap')).toHaveAttribute('data-geometry-types', 'Point');
  });

  it('site sans coordonnées : pas de carte, message', () => {
    setup(population(), '/vol/me-5', [{ ...SITE, lat: null, lon: null }]);
    expect(screen.queryByTestId('flight-minimap')).not.toBeInTheDocument();
    expect(screen.getByTestId('minimap-empty')).toBeInTheDocument();
  });

  it('précédent et suivant : liens, flèches du clavier, inactives dans un champ de saisie', () => {
    setup(population(), '/vol/me-5');
    expect(screen.getByTestId('previous-flight')).toHaveAttribute('href', '/vol/me-4');
    expect(screen.getByTestId('next-flight')).toHaveAttribute('href', '/vol/me-6');
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vol/me-5');
    input.remove();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vol/me-6');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vol/me-5');
  });

  it('vols du même jour : même site (tous pilotes) avec lien Syride', () => {
    setup(population(), '/vol/me-12');
    const items = within(screen.getByTestId('same-day')).getAllByTestId('same-day-item');
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByRole('link', { name: /Voir la trace sur Syride/ })).toHaveAttribute(
      'href',
      syrideFlightUrl('Autre', 7),
    );
  });

  it('vol introuvable : message et lien vers la liste', () => {
    setup(population(), '/vol/nope');
    expect(screen.getByRole('heading', { name: 'Vol introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /liste des vols/ })).toHaveAttribute('href', '/vols');
  });

  it('un vol sans mesure affiche « – » et jamais 0', () => {
    const f = makeFlight('2025-05-01', { key: 'x-1', siteId: null, site: null, durationMin: null });
    setup([f], '/vol/x-1');
    expect(
      within(screen.getByRole('heading', { name: 'Chiffres du vol' }).closest('section')!).getAllByText('–')
        .length,
    ).toBeGreaterThan(5);
    expect(screen.getByTestId('minimap-empty')).toBeInTheDocument();
  });
});
