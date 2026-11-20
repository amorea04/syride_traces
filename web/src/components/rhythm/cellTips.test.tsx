import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dumbbell } from '@/components/common/Dumbbell';
import { CalendarHeatmap } from '@/components/rhythm/CalendarHeatmap';
import { RhythmBlock } from '@/components/rhythm/RhythmBlock';
import { WeekHourMatrix } from '@/components/rhythm/WeekHourMatrix';
import { SiteSeasonality } from '@/components/site/SiteSeasonality';
import { defaultFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

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
  makeFlight('2025-08-03', { time: '14:10', durationMin: 90, site: 'Montbron' }),
  makeFlight('2025-08-03', { time: '14:40', durationMin: 40, site: 'Montbron' }),
  makeFlight('2025-08-04', { time: '11:20', durationMin: 200, site: 'Roche' }),
];

beforeEach(() => {
  installDomMocks();
  useFiltersStore.setState({ filters: defaultFilters() });
  useHighlightStore.setState({ highlight: null });
});
afterEach(cleanup);

describe('matrices à heures : lisibilité', () => {
  it('intitulés d’axes, en-têtes « 8 h » et plage 8 h–20 h', () => {
    wrap(<WeekHourMatrix flights={flights} />);
    expect(screen.getByText('Heure de décollage')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '8 h' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '20 h' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Jour' })).toBeInTheDocument();
  });

  it('la matrice d’un site porte l’intitulé « Mois » et la même grille', () => {
    wrap(<SiteSeasonality flights={flights} />);
    expect(screen.getByText('Heure de décollage')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Mois' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '8 h' })).toBeInTheDocument();
  });

  it('survol et focus d’une case : « Août, entre 14 h et 15 h : 2 vols », sans title natif', () => {
    wrap(<SiteSeasonality flights={flights} />);
    const cell = screen.getByRole('cell', { name: /Août, entre 14\sh et 15\sh/ });
    expect(cell).not.toHaveAttribute('title');
    fireEvent.mouseOver(cell);
    const tip = screen.getByTestId('cell-tooltip');
    expect(tip).toHaveTextContent(/Août, entre 14\sh et 15\sh/);
    expect(tip).toHaveTextContent(/2\svols/);
    expect(cell).toHaveAttribute('data-tip-on', 'true');
    fireEvent.mouseLeave(cell.closest('div')!);
    expect(screen.queryByTestId('cell-tooltip')).toBeNull();
    fireEvent.focus(cell);
    expect(screen.getByTestId('cell-tooltip')).toBeInTheDocument();
    fireEvent.keyDown(cell, { key: 'Escape' });
    expect(screen.queryByTestId('cell-tooltip')).toBeNull();
  });

  it('une seule infobulle pour toute la grille et un seul arrêt de tabulation', () => {
    wrap(<WeekHourMatrix flights={flights} />);
    const cells = document.querySelectorAll<HTMLElement>('[data-tip]');
    expect(cells.length).toBe(7 * 13);
    expect([...cells].filter((c) => c.tabIndex === 0)).toHaveLength(1);
    fireEvent.mouseOver(cells[0]!);
    fireEvent.mouseOver(cells[5]!);
    expect(screen.getAllByTestId('cell-tooltip')).toHaveLength(1);
  });
});

describe('calendrier', () => {
  it('infobulle d’un jour volé : date, vols, disciplines, sites et consigne de clic', () => {
    wrap(<CalendarHeatmap flights={flights} year={2025} end="2025-12-31" onOpenDay={() => {}} />);
    const cell = document.querySelector<HTMLElement>('[data-iso="2025-08-03"]')!;
    expect(cell).not.toHaveAttribute('title');
    fireEvent.focus(cell);
    const tip = screen.getByTestId('cell-tooltip');
    expect(tip).toHaveTextContent(/Dimanche 3\saoût\s2025/);
    expect(tip).toHaveTextContent(/2\svols/);
    expect(tip).toHaveTextContent('Montbron');
    expect(tip).toHaveTextContent('Clic : fiche du jour');
  });

  it('jours de la semaine et mois nommés', () => {
    wrap(<CalendarHeatmap flights={flights} year={2025} end="2025-12-31" onOpenDay={() => {}} />);
    expect(screen.getByText('lun.')).toBeInTheDocument();
    expect(screen.getByText('dim.')).toBeInTheDocument();
    expect(screen.getByText('janv.')).toBeInTheDocument();
  });

  it('mode 12 mois glissants : jours avant la fenêtre absents', () => {
    wrap(
      <CalendarHeatmap flights={flights} year={2026} mode="rolling" end="2026-03-01" onOpenDay={() => {}} />,
    );
    expect(document.querySelectorAll('[data-iso]')).toHaveLength(365);
    expect(document.querySelector('[data-iso="2025-08-03"]')).toHaveAttribute('data-flown', 'true');
    expect(document.querySelector('[data-iso="2025-03-01"]')).toBeNull();
  });

  it('RhythmBlock : 12 derniers mois par défaut avant 6 mois écoulés, année ensuite', () => {
    wrap(<RhythmBlock flights={flights} referenceDate="2025-03-10" />);
    expect(screen.getByTestId('rhythm-year-heading')).toHaveTextContent('les 12 derniers mois');
    cleanup();
    wrap(<RhythmBlock flights={flights} referenceDate="2025-10-10" />);
    expect(screen.getByTestId('rhythm-year-heading')).toHaveTextContent('2025');
  });
});

describe('haltères', () => {
  it('légende au-dessus des lignes et infobulle d’un point', () => {
    wrap(
      <Dumbbell
        series={[
          { id: 'a', label: 'Alice', color: 'red', shape: 'circle', dash: null },
          { id: 'b', label: 'Bob', color: 'blue', shape: 'square', dash: [4, 3] },
        ]}
        rows={[{ id: 'm', label: 'Durée moyenne', values: [30, 60], format: (v) => `${v} min` }]}
        ariaLabel="Test"
      />,
    );
    const legend = screen.getByTestId('dumbbell-legend');
    expect(legend).toHaveTextContent('Alice');
    expect(legend).toHaveTextContent('Bob');
    const dot = document.querySelector<HTMLElement>('.sr-db-dot')!;
    fireEvent.mouseOver(dot);
    expect(screen.getByTestId('cell-tooltip')).toHaveTextContent('Alice');
    expect(screen.getByTestId('cell-tooltip')).toHaveTextContent('Durée moyenne');
  });
});
