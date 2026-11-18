import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightsTable } from '@/components/flights/FlightsTable';
import { defaultFilters } from '@/lib/filters';
import { defaultVisibleColumns } from '@/lib/flightsTable';
import { useFiltersStore } from '@/store/filters';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { makeFlight } from '../../../tests/flightFactory';

const flights = [
  makeFlight('2026-06-09', {
    pilot: 'Tof Torsac',
    pilotSlug: 'tof-torsac',
    site: 'Montbron',
    siteId: 3,
    durationMin: 95,
    ceilingM: 1850,
    incomplete: true,
    source: 'fiche',
    syrideNum: 42,
  }),
  makeFlight('2026-06-02', { pilot: 'j2f', pilotSlug: 'j2f', durationMin: null, syrideNum: 7 }),
];

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderTable(props: Partial<Parameters<typeof FlightsTable>[0]> = {}) {
  const onSortChange = vi.fn();
  render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={['/vols']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <FlightsTable
                  flights={flights}
                  visible={defaultVisibleColumns()}
                  sort={[{ id: 'date', desc: true }]}
                  onSortChange={onSortChange}
                  emptyMessage="Aucun vol pour ces filtres."
                  {...props}
                />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
  return { onSortChange };
}

beforeEach(() => {
  installDomMocks();
  useFiltersStore.setState({ filters: { ...defaultFilters(), activity: 'parapente' } });
  // jsdom ne mesure rien : sans taille de conteneur, le virtualiseur n'affiche aucune ligne.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1200 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FlightsTable', () => {
  it('affiche les lignes avec « – » pour une mesure absente et les indicateurs', () => {
    renderTable();
    const rows = screen.getAllByTestId('flight-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/09\/06\/2026 12:00/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('img', { name: 'Vol incomplet' })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('img', { name: /sans GPX/ })).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole('img', { name: 'Vol incomplet' })).toBeNull();
    // Durée absente du second vol : tiret, jamais 0.
    const cells = within(rows[1]!).getAllByRole('cell');
    expect(cells.some((c) => c.textContent === '–')).toBe(true);
    expect(rows[1]).not.toHaveTextContent('0 min');
  });

  it('le lien Syride a la bonne URL, s’ouvre dans un nouvel onglet et ne navigue pas', () => {
    renderTable();
    const link = within(screen.getAllByTestId('flight-row')[0]!).getByTestId('syride-link');
    expect(link).toHaveAttribute('href', 'https://www.syride.com/fr/pilotes/Tof%20Torsac/42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName(/Voir la trace sur Syride/);
    fireEvent.click(link);
    expect(screen.getByTestId('where')).toHaveTextContent('/vols');
  });

  it('un clic sur la ligne ouvre la fiche en conservant les filtres, Entrée aussi', () => {
    renderTable();
    const row = screen.getAllByTestId('flight-row')[0]!;
    fireEvent.click(row);
    expect(screen.getByTestId('where')).toHaveTextContent(`/vol/${flights[0]!.key}?activite=parapente`);
  });

  it('Entrée sur une ligne focalisée ouvre la fiche', () => {
    renderTable();
    fireEvent.keyDown(screen.getAllByTestId('flight-row')[1]!, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent(`/vol/${flights[1]!.key}`);
  });

  it('un clic sur le pilote va à la page pilote sans ouvrir la fiche', () => {
    renderTable();
    fireEvent.click(screen.getByRole('link', { name: 'Tof Torsac' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pilote/tof-torsac');
  });

  it('clic sur un en-tête : tri demandé, descendant d’abord pour une mesure', () => {
    const { onSortChange } = renderTable();
    fireEvent.click(screen.getByTestId('sort-duration'));
    expect(onSortChange).toHaveBeenCalledWith([{ id: 'duration', desc: true }]);
  });

  it('masque les colonnes non visibles et expose aria-sort', () => {
    renderTable();
    expect(screen.queryByRole('columnheader', { name: /Instrument/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('état vide sobre', () => {
    renderTable({ flights: [] });
    expect(screen.getByText('Aucun vol pour ces filtres.')).toBeInTheDocument();
  });
});
