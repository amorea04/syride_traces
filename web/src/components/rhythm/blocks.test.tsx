import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { GearBlock } from '@/components/gear/GearBlock';
import { WingRibbon } from '@/components/gear/WingRibbon';
import { defaultFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';
import { CalendarHeatmap } from './CalendarHeatmap';
import { DurationHistogram } from './DurationHistogram';
import { FlightModes } from './FlightModes';
import { FlightScatter } from './FlightScatter';
import { RhythmBlock } from './RhythmBlock';
import { WeekHourMatrix } from './WeekHourMatrix';

// jsdom n'a pas de canvas : on remplace le graphique par un simple marqueur.
vi.mock('echarts-for-react/lib/core', async () => {
  const { createElement } = await import('react');
  return { default: () => createElement('div', { 'data-testid': 'echarts' }) };
});

const wrap = (node: ReactNode) =>
  render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>{node}</MemoryRouter>
    </MantineProvider>,
  );

const flights = [
  makeFlight('2025-05-03', {
    time: '11:10',
    durationMin: 90,
    ceilingM: 1800,
    wing: 'Voile A',
    instrument: 'Vario 1',
    pilot: 'Alice',
  }),
  makeFlight('2025-05-03', {
    time: '11:40',
    durationMin: 40,
    ceilingM: 900,
    wing: 'Voile A',
    pilot: 'Alice',
  }),
  makeFlight('2025-05-04', {
    time: '11:20',
    durationMin: 200,
    ceilingM: 2500,
    wing: 'Voile B',
    mode: 'Treuil',
    pilot: 'Bob',
  }),
  makeFlight('2025-06-10', {
    time: '16:00',
    durationMin: 20,
    activity: 'paramoteur',
    mode: 'Moteur',
    wing: 'Voile B',
    pilot: 'Bob',
    ceilingM: 600,
  }),
];

beforeEach(() => {
  installDomMocks();
  useFiltersStore.setState({ filters: defaultFilters() });
  useHighlightStore.setState({ highlight: null });
});
afterEach(cleanup);

describe('CoverageNotice', () => {
  it('apparaît au-delà de 20 % de vols sans la mesure, avec la répartition', () => {
    wrap(
      <CoverageNotice
        flights={[...flights, makeFlight('2025-07-01', { source: 'fiche' })]}
        measure="distance"
      />,
    );
    const notice = screen.getByTestId('coverage-notice');
    expect(notice).toHaveTextContent('Données partielles');
    expect(notice.getAttribute('aria-label')).toMatch(/trace GPX 4, fiche 1, aucune 0/);
  });
  it('ne rend rien si la mesure est présente ou sans vol', () => {
    wrap(<CoverageNotice flights={flights} measure="plafond" />);
    expect(screen.queryByTestId('coverage-notice')).toBeNull();
    cleanup();
    wrap(<CoverageNotice flights={[]} measure="plafond" />);
    expect(screen.queryByTestId('coverage-notice')).toBeNull();
  });
});

describe('RhythmBlock', () => {
  it('affiche les tuiles, le calendrier et ouvre la fiche d’un jour', async () => {
    wrap(<RhythmBlock flights={flights} referenceDate="2025-12-28" />);
    expect(screen.getByRole('heading', { name: 'Rythme' })).toBeInTheDocument();
    const tiles = screen.getByTestId('rhythm-tiles');
    expect(within(tiles).getByText('Plus longue série')).toBeInTheDocument();
    expect(within(tiles).getByText('2 jours')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/samedi 3\smai\s2025/));
    expect(await screen.findByTestId('day-sheet-table')).toHaveTextContent('Alice');
    expect(
      screen.getAllByRole('link', { name: 'Voir le vol de Alice sur Syride (nouvel onglet)' })[0],
    ).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: /Jour volé suivant/ }));
    expect(await screen.findByText(/dimanche 4\smai\s2025/)).toBeInTheDocument();
  });
  it('distingue ce qui porte sur l’année de ce qui porte sur toute la sélection', () => {
    wrap(<RhythmBlock flights={flights} referenceDate="2025-12-28" />);
    expect(screen.getByTestId('rhythm-year-heading')).toHaveTextContent('Sur 2025');
    expect(screen.getByTestId('rhythm-selection-heading')).toHaveTextContent('Sur toute la sélection');
  });
  it('un clic sur une tuile surligne la période, un second l’efface', () => {
    wrap(<RhythmBlock flights={flights} referenceDate="2025-12-28" />);
    const tile = screen.getByRole('button', { name: /Plus longue série/ });
    fireEvent.click(tile);
    expect(useHighlightStore.getState().highlight).toEqual({
      kind: 'days',
      from: '2025-05-03',
      to: '2025-05-04',
    });
    expect(tile).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(tile);
    expect(useHighlightStore.getState().highlight).toBeNull();
  });
  it('navigue aux flèches dans le calendrier', () => {
    wrap(<RhythmBlock flights={flights} referenceDate="2025-12-28" />);
    const first = screen.getByLabelText(/samedi 3\smai\s2025/);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText(/dimanche 4\smai\s2025/));
  });
  it('« 12 derniers mois » choisi puis plus aucun vol dans la fenêtre : retour à la vue par défaut', () => {
    const recent = [makeFlight('2025-05-03')];
    const old = [makeFlight('2023-05-03')];
    const ui = (data: typeof recent) => (
      <MantineProvider theme={mantineTheme}>
        <MemoryRouter>
          <RhythmBlock flights={data} referenceDate="2025-12-28" />
        </MemoryRouter>
      </MantineProvider>
    );
    const { rerender } = render(ui(recent));
    fireEvent.click(screen.getByRole('textbox', { name: 'Période du calendrier' }));
    fireEvent.click(screen.getByRole('option', { name: '12 derniers mois' }));
    expect(screen.getByTestId('rhythm-year-heading')).toHaveTextContent('Sur les 12 derniers mois');
    rerender(ui(old));
    expect(screen.getByTestId('rhythm-year-heading')).toHaveTextContent('Sur 2023');
  });
  it('affiche un message sobre sans vol', () => {
    wrap(<RhythmBlock flights={[]} referenceDate="2025-12-28" />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
  it('mobile, 12 derniers mois : le mois partiel est dessiné, hors fenêtre estompé, un seul arrêt de tabulation', () => {
    installDomMocks({ mobile: true });
    const data = [makeFlight('2025-01-10'), makeFlight('2025-06-05')];
    const { container } = wrap(
      <CalendarHeatmap flights={data} year={2025} mode="rolling" end="2025-12-28" onOpenDay={() => {}} />,
    );
    // Fenêtre : 2024-12-29 à 2025-12-28.
    const cell = (iso: string) => container.querySelector(`[data-iso="${iso}"]`);
    expect(cell('2024-12-29')).not.toBeNull();
    expect(cell('2024-12-31')).not.toBeNull();
    expect(cell('2024-12-28')).toBeNull();
    const dimmed = container.querySelectorAll('[data-out="true"]');
    expect(dimmed.length).toBeGreaterThan(0);
    for (const el of dimmed) {
      expect(el.tagName).not.toBe('BUTTON');
      expect(el).not.toHaveAttribute('data-tip');
      expect(el).not.toHaveAttribute('tabindex');
    }
    const stops = container.querySelectorAll('button[data-iso][tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('data-iso', '2025-01-10');
  });
  it('mobile, sans vol dans la fenêtre : l’arrêt de tabulation est une case dessinée', () => {
    installDomMocks({ mobile: true });
    const { container } = wrap(
      <CalendarHeatmap flights={[]} year={2025} mode="rolling" end="2025-12-28" onOpenDay={() => {}} />,
    );
    const stop = container.querySelector('button[data-iso][tabindex="0"]');
    expect(stop).toHaveAttribute('data-iso', '2024-12-29');
  });
  it('mobile : 12 mini-mois', () => {
    installDomMocks({ mobile: true });
    wrap(<CalendarHeatmap flights={flights} year={2025} end="2025-12-31" onOpenDay={() => {}} />);
    expect(screen.getByRole('group', { name: /mois par mois/ })).toBeInTheDocument();
  });
});

describe('WeekHourMatrix', () => {
  it('donne le créneau favori et les totaux', () => {
    wrap(<WeekHourMatrix flights={[...flights, makeFlight('2025-05-10', { time: '11:30' })]} />);
    expect(screen.getByTestId('matrix-favorite')).toHaveTextContent(/samedi entre 11\sh et 12\sh/);
    expect(screen.getByTestId('week-hour-matrix')).toBeInTheDocument();
  });
  it('sélection vide', () => {
    wrap(<WeekHourMatrix flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});

describe('autres blocs du lot B', () => {
  it('DurationHistogram : médianes et sélection vide', () => {
    wrap(<DurationHistogram flights={flights} />);
    expect(screen.getByTestId('duration-medians')).toHaveTextContent('Durée médiane');
    cleanup();
    wrap(<DurationHistogram flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
  it('FlightModes : barre des modes et parts de disciplines', () => {
    wrap(<FlightModes flights={flights} />);
    expect(screen.getByTestId('flight-modes-bar')).toBeInTheDocument();
    expect(screen.getByTestId('discipline-bar').getAttribute('aria-label')).toMatch(/Parapente 75/);
    cleanup();
    wrap(<FlightModes flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
  it('FlightScatter : rendu et sélection vide', () => {
    wrap(<FlightScatter flights={flights} />);
    expect(screen.getByTestId('flight-scatter')).toBeInTheDocument();
    cleanup();
    wrap(<FlightScatter flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
  it('GearBlock : un clic sur une voile la filtre, le survol la surligne', () => {
    wrap(<GearBlock flights={flights} />);
    const table = screen.getByTestId('wings-table');
    const button = within(table).getByRole('button', { name: /Voile A/ });
    fireEvent.mouseEnter(button.closest('tr') as HTMLElement);
    expect(useHighlightStore.getState().highlight).toEqual({ kind: 'wing', wing: 'Voile A' });
    fireEvent.click(button);
    expect(useFiltersStore.getState().filters.wings).toEqual(['Voile A']);
    expect(screen.getByTestId('instruments-table')).toHaveTextContent('Vario 1');
  });
  it('WingRibbon : un clic filtre la voile et le mois', () => {
    wrap(<WingRibbon flights={flights} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Voile A, mai 2025/ })[0] as HTMLElement);
    const f = useFiltersStore.getState().filters;
    expect(f.wings).toEqual(['Voile A']);
    expect(f.dateFrom).toBe('2025-05-01');
    expect(f.dateTo).toBe('2025-05-31');
  });
  it('GearBlock : limite à 15 voiles avec « Tout afficher » / « Réduire »', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeFlight('2025-05-03', { wing: `Voile ${String(i).padStart(2, '0')}` }),
    );
    wrap(<GearBlock flights={many} />);
    const rows = () => within(screen.getByTestId('wings-table')).getAllByRole('row').length - 1;
    expect(rows()).toBe(15);
    fireEvent.click(screen.getByRole('button', { name: 'Tout afficher (20)' }));
    expect(rows()).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: 'Réduire' }));
    expect(rows()).toBe(15);
  });
  it('WingRibbon : limité aux 24 derniers mois, annoncé dans la légende', () => {
    const long = [makeFlight('2020-01-10'), makeFlight('2023-02-10'), makeFlight('2025-01-10')];
    wrap(<WingRibbon flights={long} />);
    expect(screen.getByTestId('ribbon-legend')).toHaveTextContent('24 derniers mois');
    expect(screen.queryByRole('button', { name: /janv\.? 2020/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /janv\.? 2025/ }).length).toBeGreaterThan(0);
    cleanup();
    wrap(<WingRibbon flights={flights} />);
    expect(screen.getByTestId('ribbon-legend')).not.toHaveTextContent('24 derniers mois');
  });
  it('GearBlock : sélection vide', () => {
    wrap(<GearBlock flights={[]} />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});
