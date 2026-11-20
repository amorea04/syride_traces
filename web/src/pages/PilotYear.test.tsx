import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomMocks } from '../../tests/dom-mocks';
import { fixtureFlights } from '../../tests/fixtures';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="echarts" /> }));

const insightsState = vi.hoisted(() => ({ current: { state: 'ready', insights: null } as unknown }));
vi.mock('@/data/DataProvider', async () => {
  const { fixtureFlights: flights } = await import('../../tests/fixtures');
  return {
    useData: () => ({ meta: { data_updated_at: '2025-12-28T00:00:00Z' }, flights: flights() }),
    useInsights: () => insightsState.current,
  };
});

import { PilotYear } from '@/pages/PilotYear';
import { mantineTheme } from '@/theme';

const SLUG = 'alpha-test';
const pilot = fixtureFlights().find((f) => f.pilotSlug === SLUG)!.pilot;

function renderPage() {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={[`/pilote/${SLUG}/2025`]}>
        <Routes>
          <Route path="/pilote/:slug/:annee" element={<PilotYear />} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => installDomMocks());
afterEach(cleanup);

describe('PilotYear : récit absent', () => {
  it('insights null alors que le pilote a des vols : message dédié, pas « Aucun vol »', () => {
    insightsState.current = { state: 'ready', insights: null };
    renderPage();
    const msg = screen.getByTestId('bilan-unavailable');
    expect(msg).toHaveTextContent(`Le bilan 2025 de ${pilot} n’est pas encore disponible`);
    expect(msg).toHaveTextContent('relancer l’export');
    expect(screen.queryByText(/Aucun vol en/)).not.toBeInTheDocument();
  });
});
