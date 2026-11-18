import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
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
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="echarts" /> }));
const holder = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/data/DataProvider', () => ({ useData: () => holder.data }));

import type { Flight } from '@/data/flight';
import type { Site as SiteInfo } from '@/data/load';
import { About } from '@/pages/About';
import { Records } from '@/pages/Records';
import { Site } from '@/pages/Site';
import { Sites } from '@/pages/Sites';
import { useFiltersStore } from '@/store/filters';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const SITES: SiteInfo[] = [
  {
    id: 1,
    name: 'Montbron',
    lat: 45.5,
    lon: 0.5,
    flights: 3,
    pilots: 2,
    activities: { parapente: 3, paramoteur: 0 },
  },
  {
    id: 2,
    name: 'Étang',
    lat: null,
    lon: null,
    flights: 1,
    pilots: 1,
    activities: { parapente: 1, paramoteur: 0 },
  },
];

function flights(): Flight[] {
  return [
    makeFlight('2025-05-01', {
      key: 'a-1',
      pilot: 'Alpha',
      pilotSlug: 'alpha',
      siteId: 1,
      site: 'Montbron',
      durationMin: 90,
      ceilingM: 1200,
    }),
    makeFlight('2025-06-01', {
      key: 'a-2',
      pilot: 'Alpha',
      pilotSlug: 'alpha',
      siteId: 1,
      site: 'Montbron',
      durationMin: 60,
    }),
    makeFlight('2025-06-02', {
      key: 'b-1',
      pilot: 'Bravo',
      pilotSlug: 'bravo',
      siteId: 1,
      site: 'Montbron',
      durationMin: 60,
      ceilingM: 1200,
    }),
    makeFlight('2025-06-03', {
      key: 'b-2',
      pilot: 'Bravo',
      pilotSlug: 'bravo',
      siteId: 2,
      site: 'Étang',
      durationMin: 30,
      wing: 'Voile-Un',
    }),
    makeFlight('2025-06-04', {
      key: 'b-3',
      pilot: 'Bravo',
      pilotSlug: 'bravo',
      siteId: 2,
      site: 'Étang',
      durationMin: 30,
      wing: 'voile un',
    }),
  ];
}

const META = {
  data_updated_at: '2025-12-28',
  generated_at: '2026-01-01T12:00:00Z',
  counts: { flights: 5, pilots: 2, sites: 2, wings: 2, excluded_flights: 3 },
};

function setup(path: string) {
  const list = flights();
  holder.data = { meta: META, flights: list, sites: SITES, siteById: new Map(SITES.map((s) => [s.id, s])) };
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sites" element={<Sites />} />
          <Route path="/site/:id" element={<Site />} />
          <Route path="/records" element={<Records />} />
          <Route path="/a-propos" element={<About />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  installDomMocks();
  useFiltersStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 })),
  );
});
afterEach(cleanup);

describe('page Sites', () => {
  it('liste les sites et filtre sans accents', () => {
    setup('/sites');
    expect(screen.getAllByTestId('site-row')).toHaveLength(2);
    fireEvent.change(screen.getByTestId('sites-search'), { target: { value: 'etang' } });
    const rows = screen.getAllByTestId('site-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId('site-link')).toHaveTextContent('Étang');
  });
  it('trie par clic sur l’en-tête', () => {
    setup('/sites');
    fireEvent.click(screen.getByRole('button', { name: 'Site' }));
    expect(screen.getAllByTestId('site-link')[0]).toHaveTextContent('Étang');
  });
  it('affiche le message de sélection vide', () => {
    useFiltersStore.getState().setFilters({ pilots: ['inconnu'] });
    setup('/sites');
    expect(screen.getAllByText('Aucun vol pour ces filtres.').length).toBeGreaterThan(0);
  });
});

describe('page Site', () => {
  it('affiche les sections du site', () => {
    setup('/site/1');
    expect(screen.getByRole('heading', { level: 1, name: 'Montbron' })).toBeInTheDocument();
    for (const name of [
      'Chiffres du site',
      'Saisonnalité',
      'Pilotes présents',
      'Derniers vols',
      'Records du site',
    ])
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    expect(screen.getAllByTestId('latest-row')).toHaveLength(3);
    expect(screen.getAllByTestId('syride-link')[0]).toHaveAttribute('target', '_blank');
  });
  it('signale un site introuvable avec un lien vers la liste', () => {
    setup('/site/99');
    expect(screen.getByRole('heading', { name: 'Site introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /liste des sites/ })).toHaveAttribute('href', '/sites');
  });
  it('affiche l’en-tête et un message quand les filtres excluent tous les vols', () => {
    useFiltersStore.getState().setFilters({ activity: 'paramoteur' });
    setup('/site/1');
    expect(screen.getByRole('heading', { level: 1, name: 'Montbron' })).toBeInTheDocument();
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
    expect(screen.getByTestId('filtered-view')).toHaveTextContent('paramoteur');
  });
  it('ignore le filtre de sites mais garde les autres', () => {
    useFiltersStore.getState().setFilters({ sites: [2] });
    setup('/site/1');
    expect(screen.getAllByTestId('latest-row')).toHaveLength(3);
    expect(screen.queryByTestId('filtered-view')).toBeNull();
  });
});

describe('page Records', () => {
  it('classe les durées avec ex æquo et or sur le rang 1', () => {
    setup('/records');
    const rows = screen.getAllByTestId('record-row');
    expect(rows.map((r) => r.getAttribute('data-rank'))).toEqual(['1', '2', '2', '4', '4']);
    expect(rows[0]!.querySelector('[data-gold="true"]')).not.toBeNull();
    expect(rows[1]!.querySelector('[data-gold="true"]')).toBeNull();
  });
  it('un seul vol par pilote', () => {
    setup('/records');
    fireEvent.click(screen.getByTestId('one-per-pilot'));
    expect(screen.getAllByTestId('record-row')).toHaveLength(2);
  });
  it('masque les métriques sans donnée', () => {
    setup('/records');
    expect(screen.queryByTestId('tab-distCum')).toBeNull();
    expect(screen.getByTestId('tab-plafond')).toBeInTheDocument();
  });
});

describe('page À propos', () => {
  it('affiche source, glossaire, qualité et crédit', () => {
    setup('/a-propos');
    expect(screen.getByTestId('about-source')).toHaveTextContent('Outil personnel, non affilié à Syride.');
    expect(screen.getByTestId('about-dates')).toHaveTextContent('28');
    expect(screen.getAllByTestId('glossary-metric')).toHaveLength(19);
    expect(screen.getByTestId('q-excluded')).toHaveTextContent('3');
    expect(screen.getByTestId('q-no-coords')).toHaveTextContent('1');
    expect(screen.getByTestId('quality-wings')).toHaveTextContent('Voile-Un');
    expect(screen.getByTestId('about-credit')).toHaveTextContent('Créée par : Adrien Moreau');
  });
});
