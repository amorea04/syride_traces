import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DetailNav,
  hasOpenOverlay,
  shouldLeaveOnEscape,
  type EscapeContext,
} from '@/components/common/DetailNav';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { useNavHistoryStore, useRecordNavigation } from '@/store/navHistory';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';

const free: EscapeContext = { key: 'Escape', editable: false, overlayOpen: false, highlightActive: false };

beforeEach(() => {
  installDomMocks();
  useFiltersStore.getState().reset();
  useHighlightStore.getState().setHighlight(null);
  useNavHistoryStore.getState().reset();
});
afterEach(cleanup);

describe('shouldLeaveOnEscape', () => {
  it('Échap libre : on quitte', () => {
    expect(shouldLeaveOnEscape(free)).toBe(true);
  });
  it('autre touche, modificateur, saisie, fenêtre ou surlignage : on reste', () => {
    expect(shouldLeaveOnEscape({ ...free, key: 'Enter' })).toBe(false);
    expect(shouldLeaveOnEscape({ ...free, ctrlKey: true })).toBe(false);
    expect(shouldLeaveOnEscape({ ...free, editable: true })).toBe(false);
    expect(shouldLeaveOnEscape({ ...free, overlayOpen: true })).toBe(false);
    expect(shouldLeaveOnEscape({ ...free, highlightActive: true })).toBe(false);
  });
});

describe('hasOpenOverlay', () => {
  it('détecte fenêtre, tiroir et menu ouverts', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    expect(hasOpenOverlay(root)).toBe(false);
    root.innerHTML = '<section role="dialog"></section>';
    expect(hasOpenOverlay(root)).toBe(true);
    root.innerHTML = '<div role="menu"></div>';
    expect(hasOpenOverlay(root)).toBe(true);
    // Liste déroulante montée mais cachée : ne compte pas.
    root.innerHTML = '<div style="display: none"><div role="listbox"></div></div>';
    expect(hasOpenOverlay(root)).toBe(false);
    root.remove();
  });
  it('une infobulle de case affichée compte comme ouverte', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-testid="cell-tooltip"></div>';
    expect(hasOpenOverlay(root)).toBe(true);
  });
});

function Where() {
  useRecordNavigation();
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function Go({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      Go {to}
    </button>
  );
}

function renderAt(entries: string[], index?: number) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <DetailNav crumbs={[{ label: 'Vols', to: '/vols' }, { label: '12 juin 2025 · Alice' }]} />
                <Where />
                <Go to="/vol/x" />
                <Go to="/vol/x?annees=2025" />
                <Go to="/vol/x?annees=2024" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('DetailNav', () => {
  it('fil d’Ariane : parents en liens avec les filtres, page courante marquée', () => {
    useFiltersStore.getState().setFilters({ years: [2025] });
    renderAt(['/vol/x']);
    expect(screen.getByRole('link', { name: 'Vols' })).toHaveAttribute('href', '/vols?annees=2025');
    expect(screen.getByText('12 juin 2025 · Alice')).toHaveAttribute('aria-current', 'page');
  });
  it('« Retour » sans historique : liste parente, filtres conservés', () => {
    useFiltersStore.getState().setFilters({ activity: 'parapente' });
    renderAt(['/vol/x']);
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/vols?activite=parapente');
  });
  it('« Retour » avec historique : page précédente', () => {
    renderAt(['/pilotes']);
    fireEvent.click(screen.getByRole('button', { name: 'Go /vol/x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pilotes');
  });
  it('« Retour » après un changement de filtre : quitte la fiche, ne défait pas le filtre', () => {
    renderAt(['/pilotes']);
    fireEvent.click(screen.getByRole('button', { name: 'Go /vol/x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go /vol/x?annees=2025' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go /vol/x?annees=2024' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pilotes');
  });
  it('Échap ne quitte pas tant qu’une infobulle de case est ouverte', () => {
    renderAt(['/vol/x']);
    const tip = document.createElement('div');
    tip.setAttribute('data-testid', 'cell-tooltip');
    document.body.appendChild(tip);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vol/x');
    tip.remove();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vols');
  });
  it('Échap quitte, sauf si une fenêtre est ouverte', () => {
    renderAt(['/vol/x']);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vol/x');
    dialog.remove();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByTestId('where')).toHaveTextContent('/vols');
  });
});
