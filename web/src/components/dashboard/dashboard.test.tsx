import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeltaPill } from '@/components/common/DeltaPill';
import { CollectiveActivity } from '@/components/dashboard/CollectiveActivity';
import { EvolutionChart } from '@/components/dashboard/EvolutionChart';
import { FlightCharacteristics } from '@/components/dashboard/FlightCharacteristics';
import { KpiBand } from '@/components/dashboard/KpiBand';
import { StatChart } from '@/components/dashboard/StatChart';
import { defaultFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const chart = vi.hoisted(() => ({
  props: null as null | { onEvents?: Record<string, (p: unknown) => void>; option: unknown },
}));
vi.mock('echarts-for-react', () => ({
  default: (props: { onEvents?: Record<string, (p: unknown) => void>; option: unknown }) => {
    chart.props = props;
    return <div data-testid="echarts" />;
  },
}));

const TODAY = '2026-06-10';
const flights = [
  makeFlight('2025-05-01', { pilot: 'Alice', pilotSlug: 'alice', ceilingM: 1000, durationMin: 60 }),
  makeFlight('2026-06-02', {
    pilot: 'Alice',
    pilotSlug: 'alice',
    site: 'Mont Test',
    siteId: 4,
    ceilingM: 2200,
    durationMin: 150,
    distKm: 12,
    distCumKm: 20,
  }),
  makeFlight('2026-06-09', {
    pilot: 'Bob',
    pilotSlug: 'bob',
    activity: 'paramoteur',
    site: 'Plaine',
    siteId: 5,
    ceilingM: 800,
    durationMin: 45,
  }),
];

function renderUi(ui: ReactElement) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  installDomMocks();
  chart.props = null;
  useFiltersStore.setState({ filters: defaultFilters() });
  useHighlightStore.setState({ highlight: null });
});
afterEach(cleanup);

describe('DeltaPill', () => {
  it('volume : flèche et pourcentage signé ; neutre ; égalité ; absence', () => {
    const pill = (value: number | null, kind: 'volume' | 'neutre') => {
      cleanup();
      renderUi(<DeltaPill value={value} kind={kind} testId="pill" />);
      return screen.queryByTestId('pill');
    };
    const up = pill(12.4, 'volume');
    expect(up).toHaveTextContent('▲');
    expect(up).toHaveTextContent(/\+12\s%/);
    expect(up?.getAttribute('style')).toContain('--sr-up-text');
    const down = pill(-8, 'neutre');
    expect(down).toHaveTextContent('▼');
    expect(down?.getAttribute('style')).toContain('--sr-ndown-text');
    expect(pill(0.2, 'volume')).toHaveTextContent('=');
    expect(pill(null, 'volume')).toBeNull();
  });
});

describe('KpiBand', () => {
  it('affiche les six KPI sans variation quand aucune période n’est filtrée', () => {
    renderUi(<KpiBand flights={flights} allFlights={flights} filters={defaultFilters()} today={TODAY} />);
    expect(screen.getByTestId('kpi-vols')).toHaveTextContent('3');
    expect(screen.getByTestId('kpi-heures')).toHaveTextContent(/4\sh\s15/);
    expect(screen.getByTestId('kpi-pilotes')).toHaveTextContent('2');
    expect(screen.queryByText('vs période précédente')).not.toBeInTheDocument();
    const link = within(screen.getByTestId('kpi-plafond')).getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining(`/vol/${flights[1]?.key}`));
  });

  it('avec une période filtrée : variation vs période précédente', () => {
    const filters = { ...defaultFilters(), dateFrom: '2026-06-01', dateTo: '2026-06-30' };
    const selection = flights.filter((f) => f.date >= '2026-06-01');
    renderUi(<KpiBand flights={selection} allFlights={flights} filters={filters} today={TODAY} />);
    expect(screen.getAllByText('Pas de comparaison possible').length).toBeGreaterThan(0);
  });

  it('sélection vide', () => {
    renderUi(<KpiBand flights={[]} allFlights={flights} filters={defaultFilters()} today={TODAY} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-vols')).toHaveTextContent('0');
  });
});

describe('CollectiveActivity', () => {
  it('derniers vols avec lien Syride sûr, période et records', () => {
    renderUi(<CollectiveActivity allFlights={flights} filters={defaultFilters()} today={TODAY} />);
    const syride = screen.getAllByRole('link', { name: /Voir la trace sur Syride/ });
    expect(syride).toHaveLength(3);
    for (const a of syride) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(a.getAttribute('href')).toMatch(/^https:\/\/www\.syride\.com\/fr\/pilotes\//);
    }
    expect(screen.getByTestId('season-phrase')).toHaveTextContent(/2025/);
    expect(screen.getByTestId('period-stats')).toBeInTheDocument();
    // Alice : plafond 1000 → 2200 dans la fenêtre = record ; la durée aussi.
    expect(screen.getByTestId('recent-records')).toHaveTextContent('Alice');
    fireEvent.click(screen.getByRole('radio', { name: 'Cette semaine' }));
    expect(screen.getByRole('heading', { name: 'Cette semaine' })).toBeInTheDocument();
  });

  it('suit les filtres sauf la période', () => {
    const filters = { ...defaultFilters(), dateFrom: '2020-01-01', dateTo: '2020-12-31', pilots: ['bob'] };
    renderUi(<CollectiveActivity allFlights={flights} filters={filters} today={TODAY} />);
    const syride = screen.getAllByRole('link', { name: /Voir la trace sur Syride/ });
    expect(syride).toHaveLength(1);
    expect(syride[0]).toHaveAccessibleName(/Bob/);
  });

  it('sélection vide : messages sobres', () => {
    renderUi(<CollectiveActivity allFlights={[]} filters={defaultFilters()} today={TODAY} />);
    expect(screen.getAllByText('Aucun vol pour ces filtres.').length).toBeGreaterThanOrEqual(3);
  });
});

describe('FlightCharacteristics', () => {
  it('le maximum est un lien vers le vol record', () => {
    renderUi(<FlightCharacteristics flights={flights} />);
    const row = screen.getByRole('row', { name: /Plafond/ });
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining(`/vol/${flights[1]?.key}`),
    );
    expect(screen.getByRole('row', { name: /g max/ })).toHaveTextContent('–');
  });
  it('sélection vide', () => {
    renderUi(<FlightCharacteristics flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});

describe('StatChart', () => {
  it('un clic sur une barre pilote pose le filtre', () => {
    renderUi(<StatChart flights={flights} defaultAxis="pilote" />);
    expect(screen.getByTestId('echarts')).toBeInTheDocument();
    chart.props?.onEvents?.click?.({ dataIndex: 0 });
    expect(useFiltersStore.getState().filters.pilots).toEqual(['alice']);
  });
  it('axe année : le clic filtre l’année ; axe mois : aucune action', () => {
    renderUi(<StatChart flights={flights} defaultAxis="annee" />);
    chart.props?.onEvents?.click?.({ dataIndex: 1 });
    expect(useFiltersStore.getState().filters).toMatchObject({ years: [2026], dateFrom: null, dateTo: null });
    cleanup();
    useFiltersStore.setState({ filters: defaultFilters() });
    renderUi(<StatChart flights={flights} defaultAxis="mois" />);
    chart.props?.onEvents?.click?.({ dataIndex: 0 });
    expect(useFiltersStore.getState().filters).toEqual(defaultFilters());
  });
  it('l’infobulle échappe le nom de la catégorie (pas de HTML injecté)', () => {
    const evil = [makeFlight('2026-06-01', { pilot: '<img src=x onerror=alert(1)>', pilotSlug: 'evil' })];
    renderUi(<StatChart flights={evil} defaultAxis="pilote" />);
    const option = chart.props?.option as {
      tooltip: { formatter: (p: unknown) => string };
    };
    const html = option.tooltip.formatter({ dataIndex: 0 });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('le survol surligne le site puis se retire', () => {
    renderUi(<StatChart flights={flights} defaultAxis="site" />);
    chart.props?.onEvents?.mouseover?.({ dataIndex: 0 });
    expect(useHighlightStore.getState().highlight?.kind).toBe('site');
    chart.props?.onEvents?.mouseout?.({});
    expect(useHighlightStore.getState().highlight).toBeNull();
  });
  it('« Voir les données » et « Tout afficher » au-delà de 15 sites', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeFlight('2026-06-01', { site: `Site ${i}`, siteId: i }),
    );
    renderUi(<StatChart flights={many} defaultAxis="site" />);
    fireEvent.click(screen.getByRole('button', { name: /Tout afficher \(20\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Voir les données' }));
    expect(screen.getAllByRole('row')).toHaveLength(21);
  });
  it('sélection vide', () => {
    renderUi(<StatChart flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});

describe('EvolutionChart', () => {
  it('affiche le graphique et le tableau, avec empilement par pilote', () => {
    renderUi(<EvolutionChart flights={flights} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Par pilote' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Cumulé' }));
    expect(screen.getByRole('img', { name: /cumulé.*par pilote/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les données' }));
    // 2025-05 → 2026-06 : 14 mois.
    expect(screen.getAllByRole('row')).toHaveLength(15);
  });
  it('un surlignage de mois fusionne l’option sans réinitialiser le zoom', () => {
    renderUi(<EvolutionChart flights={flights} />);
    const props = chart.props as unknown as {
      notMerge?: boolean;
      option: { dataZoom: Record<string, unknown>[] };
    };
    expect(props.notMerge).toBe(false);
    for (const z of props.option.dataZoom) {
      expect(z).not.toHaveProperty('start');
      expect(z).not.toHaveProperty('end');
    }
    act(() => useHighlightStore.getState().setHighlight({ kind: 'month', year: 2026, month: 6 }));
    const after = chart.props as unknown as { notMerge?: boolean };
    expect(after.notMerge).toBe(false);
  });
  it('sélection vide', () => {
    renderUi(<EvolutionChart flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});
