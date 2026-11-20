import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chart = vi.hoisted(() => ({ option: null as unknown }));
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: { option: unknown }) => {
    chart.option = props.option;
    return <div data-testid="echarts" />;
  },
}));

import { CompareDumbbells } from '@/components/compare/CompareDumbbells';
import { CompareKpis } from '@/components/compare/CompareKpis';
import { CompareRhythm } from '@/components/compare/CompareRhythm';
import { CompareSelector } from '@/components/compare/CompareSelector';
import { CumulativeChart } from '@/components/compare/CumulativeChart';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { buildSeries, resolveSelection, type CompareMode } from '@/lib/compare';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const mk = (date: string, slug: string, over: Parameters<typeof makeFlight>[1] = {}) =>
  makeFlight(date, { pilot: slug.toUpperCase(), pilotSlug: slug, ...over });
const flights = [
  mk('2025-05-03', 'a', { durationMin: 60, ceilingM: 1000 }),
  mk('2025-05-04', 'a', { durationMin: 60, ceilingM: 1200 }),
  mk('2025-05-10', 'b', { durationMin: 30, ceilingM: 800 }),
];

function Harness({ mode = 'pilotes', children }: { mode?: CompareMode; children: (p: ReturnType<typeof setup>) => ReactElement }) {
  const p = setup(mode);
  const visuals = useSeriesVisuals(mode, p.series);
  return children({ ...p, visuals });
}
const IDS: Record<CompareMode, string[]> = { pilotes: ['a', 'b'], annees: ['a', '2024', '2025'], sites: [] };
function setup(mode: CompareMode) {
  const selection = resolveSelection(mode, IDS[mode], flights);
  const series = buildSeries(mode, selection.ids, flights, '2025-12-28');
  return { selection, series, visuals: [] as ReturnType<typeof useSeriesVisuals> };
}
function renderUi(ui: ReactElement) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => installDomMocks());
afterEach(cleanup);

describe('composants de comparaison', () => {
  it('CompareKpis : première colonne en référence, pastilles sur la seconde', () => {
    renderUi(<Harness>{({ series, visuals }) => <CompareKpis mode="pilotes" series={series} visuals={visuals} />}</Harness>);
    const [first, second] = screen.getAllByTestId('compare-kpis')[0]!.children as unknown as HTMLElement[];
    expect(within(first!).getByTestId('kpi-reference')).toBeInTheDocument();
    // 1 vol contre 2 : −50 %.
    expect(within(second!).getAllByText('−50 %')[0]).toBeInTheDocument();
  });

  it('CompareDumbbells et CompareRhythm affichent leurs lignes', () => {
    renderUi(
      <Harness>
        {({ series, visuals }) => (
          <>
            <CompareDumbbells series={series} visuals={visuals} />
            <CompareRhythm series={series} visuals={visuals} />
          </>
        )}
      </Harness>,
    );
    expect(screen.getByText('Plafond moyen')).toBeInTheDocument();
    expect(screen.getByTestId('compare-rhythm')).toHaveTextContent('Part du week-end');
  });

  it('CumulativeChart : une série par sélection, motif de trait et message vide', async () => {
    renderUi(<Harness>{({ series, visuals }) => <CumulativeChart mode="pilotes" series={series} visuals={visuals} refDate="2025-12-28" />}</Harness>);
    await screen.findByTestId('echarts');
    const option = chart.option as { series: { name: string; lineStyle: { type: unknown } }[] };
    expect(option.series.map((s) => s.name)).toEqual(['A', 'B']);
    expect(option.series[0]?.lineStyle.type).toBe('solid');
    expect(option.series[1]?.lineStyle.type).toEqual([7, 4]);
    cleanup();
    renderUi(<CumulativeChart mode="pilotes" series={[{ id: 'a', label: 'A', flights: [], span: null }]} visuals={[]} refDate="2025-12-28" />);
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });

  it('CompareSelector : bascule de mode, sans note de sélection par défaut', () => {
    const onModeChange = vi.fn();
    renderUi(
      <Harness>
        {({ selection, visuals }) => (
          <CompareSelector
            mode="pilotes"
            selection={selection}
            candidates={[
              { value: 'a', label: 'A', flights: 2 },
              { value: 'b', label: 'B', flights: 1 },
            ]}
            years={[]}
            visuals={visuals}
            onModeChange={onModeChange}
            onIdsChange={() => {}}
            onPilotChange={() => {}}
          />
        )}
      </Harness>,
    );
    expect(screen.queryByTestId('compare-default-note')).toBeNull();
    fireEvent.click(screen.getByText('Sites'));
    expect(onModeChange).toHaveBeenCalledWith('sites');
  });
});
