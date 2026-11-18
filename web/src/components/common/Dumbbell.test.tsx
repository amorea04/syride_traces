import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dumbbell, dumbbellPosition, dumbbellRange } from '@/components/common/Dumbbell';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';

const series = [
  { id: 'a', label: 'Alice', color: 'red', shape: 'circle' as const },
  { id: 'b', label: 'Bob', color: 'blue', shape: 'square' as const },
];
const rows = [
  { id: 'duree', label: 'Durée moyenne', values: [30, 60], format: (v: number) => `${v} min` },
  { id: 'vario', label: 'Vario', values: [null, null], format: (v: number) => `${v} m/s` },
  { id: 'vols', label: 'Vols', values: [5, null], format: (v: number) => `${v}` },
];

beforeEach(() => installDomMocks());
afterEach(cleanup);

describe('fonctions de position', () => {
  it('place entre min et max, 50 % si égal', () => {
    expect(dumbbellPosition(30, 30, 60)).toBe(0);
    expect(dumbbellPosition(60, 30, 60)).toBe(100);
    expect(dumbbellPosition(5, 5, 5)).toBe(50);
    expect(dumbbellRange([null, 3, 1])).toEqual({ min: 1, max: 3 });
    expect(dumbbellRange([null])).toBeNull();
  });
});

describe('Dumbbell', () => {
  const renderIt = () =>
    render(
      <MantineProvider theme={mantineTheme}>
        <Dumbbell series={series} rows={rows} ariaLabel="Comparaison test" />
      </MantineProvider>,
    );

  it('affiche une ligne par métrique avec valeurs formatées et sans mesure', () => {
    renderIt();
    expect(screen.getByRole('group', { name: 'Comparaison test' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Durée moyenne : Alice 30 min, Bob 60 min' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vario : Alice sans mesure, Bob sans mesure' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vols : Alice 5, Bob sans mesure' })).toBeInTheDocument();
  });

  it('« Voir les données » bascule vers un tableau', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Voir les données' }));
    expect(screen.getByRole('columnheader', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le graphique' }));
    expect(screen.getByRole('group', { name: 'Comparaison test' })).toBeInTheDocument();
  });
});
