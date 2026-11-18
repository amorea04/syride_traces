import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
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
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="echarts" /> }));
vi.mock('@/data/DataProvider', () => ({
  useData: () => ({
    siteById: new Map([
      [0, { id: 0, name: 'Site A', lat: 45, lon: 6 }],
      [1, { id: 1, name: 'Site B', lat: null, lon: null }],
    ]),
  }),
}));

import { CareerSection } from '@/components/pilot/CareerSection';
import { FavouriteSites } from '@/components/pilot/FavouriteSites';
import { PersonalRecords } from '@/components/pilot/PersonalRecords';
import { PilotCard } from '@/components/pilot/PilotCard';
import { SitesFaceToFace } from '@/components/pilot/SitesFaceToFace';
import { WingTimeline } from '@/components/pilot/WingTimeline';
import { YearCards } from '@/components/pilot/YearCards';
import { pilotSummaries } from '@/lib/pilots';
import { syrideFlightUrl, syridePilotUrl } from '@/lib/syride';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const me = { pilot: 'Tof Torsac', pilotSlug: 'tof' };
const many = (n: number, over: Parameters<typeof makeFlight>[1]) =>
  Array.from({ length: n }, (_, i) => makeFlight(`2025-0${(i % 9) + 1}-10`, { ...me, ...over }));
const flights = [
  makeFlight('2024-05-01', { ...me, durationMin: 90, ceilingM: 1800, wing: 'daytona', siteId: 0, site: 'Site A' }),
  ...many(10, { siteId: 0, site: 'Site A', wing: 'daytona', durationMin: 40, ceilingM: 900 }),
  ...many(10, { siteId: 1, site: 'Site B', wing: 'leaf', durationMin: 20, ceilingM: 500 }),
];

function renderUi(ui: ReactElement) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => installDomMocks());
afterEach(cleanup);

describe('composants pilote', () => {
  it('PilotCard : lien vers la page pilote et profil Syride', () => {
    renderUi(
      <ul>
        <PilotCard row={pilotSummaries(flights)[0]!} />
      </ul>,
    );
    expect(screen.getByRole('link', { name: 'Tof Torsac' })).toHaveAttribute('href', '/pilote/tof');
    const syride = screen.getByRole('link', { name: /Profil de Tof Torsac sur Syride/ });
    expect(syride).toHaveAttribute('href', syridePilotUrl('Tof Torsac'));
    expect(syride).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/21 vols/)).toBeInTheDocument();
  });

  it('YearCards : une carte par année vers le bilan', () => {
    renderUi(<YearCards flights={flights} slug="tof" refDate="2025-12-28" />);
    const cards = screen.getAllByTestId('year-card');
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/pilote/tof/2025', '/pilote/tof/2024']);
    expect(within(cards[1]!).getByText('première année')).toBeInTheDocument();
  });

  it('PersonalRecords : liens fiche et Syride exacts', () => {
    renderUi(<PersonalRecords flights={flights} />);
    const long = screen.getByText('Plus long vol').closest('[data-record]') as HTMLElement;
    const best = flights[0]!;
    expect(within(long).getByTestId('record-flight-link')).toHaveAttribute('href', `/vol/${best.key}`);
    expect(within(long).getByTestId('record-syride-link')).toHaveAttribute(
      'href',
      syrideFlightUrl(best.pilot, best.syrideNum),
    );
    // Aucun record de distance : tiret, sans lien.
    const dist = screen.getByText('Plus loin').closest('[data-record]') as HTMLElement;
    expect(within(dist).queryByTestId('record-flight-link')).toBeNull();
  });

  it('CareerSection : graphique, étoile de la meilleure année et KPI', () => {
    renderUi(<CareerSection flights={flights} />);
    expect(screen.getByTestId('career-chart')).toBeInTheDocument();
    expect(screen.getByTestId('career-best')).toHaveTextContent('Meilleure année : 2025');
    expect(screen.getByTestId('career-kpis')).toHaveTextContent('Années actives');
  });

  it('CareerSection : sélection vide', () => {
    renderUi(<CareerSection flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });

  it('FavouriteSites : tableau des sites avec liens, carte présente', () => {
    renderUi(<FavouriteSites flights={flights} />);
    expect(screen.getByRole('link', { name: 'Site A' })).toHaveAttribute('href', '/site/0');
    expect(screen.getByRole('link', { name: 'Site B' })).toHaveAttribute('href', '/site/1');
    expect(screen.getByTestId('sites-map')).toBeInTheDocument();
  });

  it('SitesFaceToFace : deux sites éligibles, sinon message sobre', () => {
    renderUi(<SitesFaceToFace pilot="Tof Torsac" flights={flights} />);
    expect(screen.getByTestId('pilot-site-strips')).toBeInTheDocument();
    cleanup();
    renderUi(<SitesFaceToFace pilot="Tof Torsac" flights={flights.slice(0, 12)} />);
    expect(screen.getByTestId('sites-face-empty')).toHaveTextContent('Moins de deux sites');
  });

  it('WingTimeline : une ligne par voile, vide sans voile', () => {
    renderUi(<WingTimeline flights={flights} />);
    expect(screen.getByText('daytona')).toBeInTheDocument();
    expect(screen.getByText('leaf')).toBeInTheDocument();
    cleanup();
    renderUi(<WingTimeline flights={[makeFlight('2025-01-01', { wing: null })]} />);
    expect(screen.getByText('Aucune voile renseignée pour ces vols.')).toBeInTheDocument();
  });
});
