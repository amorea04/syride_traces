import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CellTooltip } from '@/components/common/CellTooltip';
import type { TipContent } from '@/lib/cellTips';
import { installDomMocks } from '../../../tests/dom-mocks';

beforeEach(() => installDomMocks());
afterEach(cleanup);

const resolveWith =
  (suffix: string) =>
  (el: HTMLElement): TipContent => ({ title: `${el.dataset['tip']}${suffix}`, lines: [] });

const grid = (suffix: string, roving = false, cells = ['a', 'b', 'c']) => (
  <CellTooltip resolve={resolveWith(suffix)} roving={roving}>
    {cells.map((c) => (
      <button key={c} type="button" data-tip={c}>
        {c}
      </button>
    ))}
  </CellTooltip>
);

describe('CellTooltip', () => {
  it('s’ouvre au focus, se ferme à Échap n’importe où dans le document', () => {
    render(grid('1'));
    fireEvent.focus(screen.getByRole('button', { name: 'a' }));
    expect(screen.getByTestId('cell-tooltip')).toHaveTextContent('a1');
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('data-tip-on', 'true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('cell-tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'a' })).not.toHaveAttribute('data-tip-on');
  });
  it('se ferme quand `resolve` change', () => {
    const { rerender } = render(grid('1'));
    fireEvent.focus(screen.getByRole('button', { name: 'a' }));
    expect(screen.getByTestId('cell-tooltip')).toBeInTheDocument();
    rerender(grid('2'));
    expect(screen.queryByTestId('cell-tooltip')).toBeNull();
  });
  it('se ferme quand la case est retirée du document', () => {
    const { rerender } = render(grid('1', false, ['a', 'b']));
    fireEvent.focus(screen.getByRole('button', { name: 'a' }));
    expect(screen.getByTestId('cell-tooltip')).toBeInTheDocument();
    const resolve = resolveWith('1');
    rerender(
      <CellTooltip resolve={resolve}>
        <button type="button" data-tip="b">
          b
        </button>
      </CellTooltip>,
    );
    expect(screen.queryByTestId('cell-tooltip')).toBeNull();
  });
  it('mode roving : un seul arrêt de tabulation, y compris pour les cases ajoutées plus tard', async () => {
    const { rerender } = render(grid('1', true, ['a', 'b']));
    const stops = () => screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(stops().map((b) => b.textContent)).toEqual(['a']);
    fireEvent.focus(screen.getByRole('button', { name: 'b' }));
    expect(stops().map((b) => b.textContent)).toEqual(['b']);
    rerender(grid('1', true, ['a', 'b', 'c']));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(stops().map((b) => b.textContent)).toEqual(['b']);
    expect(screen.getByRole('button', { name: 'c' }).tabIndex).toBe(-1);
  });
});
