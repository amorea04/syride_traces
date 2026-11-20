import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({
  default: () => <div data-testid="echart" />,
}));
vi.mock('@/theme/echarts', () => ({ echartsCore: {}, useEchartsTheme: () => 'x' }));

import { ChartFrame } from '@/components/common/ChartFrame';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { cb: Callback; el: Element | null; disconnected: boolean }[] = [];

beforeEach(() => {
  installDomMocks();
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      rec: (typeof observers)[number];
      constructor(cb: Callback) {
        this.rec = { cb, el: null, disconnected: false };
        observers.push(this.rec);
      }
      observe(el: Element) {
        this.rec.el = el;
      }
      disconnect() {
        this.rec.disconnected = true;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const table = { columns: ['a'], rows: [[1]] };
function renderChart() {
  return render(
    <MantineProvider theme={mantineTheme}>
      <ChartFrame option={{}} ariaLabel="Graphique" height={100} table={table} />
    </MantineProvider>,
  );
}

describe('ChartFrame : instanciation près de l’écran', () => {
  it('l’observateur suit le nouveau nœud après « Voir les données » puis « Voir le graphique »', () => {
    renderChart();
    expect(screen.queryByTestId('echart')).toBeNull();
    fireEvent.click(screen.getByText('Voir les données'));
    fireEvent.click(screen.getByText('Voir le graphique'));
    const live = observers.filter((o) => !o.disconnected);
    expect(live).toHaveLength(1);
    expect(live[0]!.el).toBe(screen.getByRole('img'));
    live[0]!.cb([{ isIntersecting: true }]);
    return screen.findByTestId('echart');
  });

  it('une fois proche, le graphique reste instancié après bascule', async () => {
    renderChart();
    observers[0]!.cb([{ isIntersecting: true }]);
    await screen.findByTestId('echart');
    fireEvent.click(screen.getByText('Voir les données'));
    fireEvent.click(screen.getByText('Voir le graphique'));
    expect(await screen.findByTestId('echart')).toBeInTheDocument();
  });
});
