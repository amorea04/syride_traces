import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageErrorBoundary } from '@/router';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../tests/dom-mocks';

function Broken(): never {
  throw new Error('chunk injoignable');
}

function Boundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
}

beforeEach(() => {
  installDomMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('PageErrorBoundary', () => {
  it('après une erreur de chargement, naviguer vers une autre route affiche cette route', async () => {
    render(
      <MantineProvider theme={mantineTheme}>
        <MemoryRouter initialEntries={['/casse']}>
          <Link to="/ok">aller</Link>
          <Routes>
            <Route
              path="/casse"
              element={
                <Boundary>
                  <Broken />
                </Boundary>
              }
            />
            <Route
              path="/ok"
              element={
                <Boundary>
                  <p>Page saine</p>
                </Boundary>
              }
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('aller'));
    expect(await screen.findByText('Page saine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
