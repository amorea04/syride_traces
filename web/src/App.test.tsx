import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { resetDataCaches } from '@/data/load';
import { defaultFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../tests/dom-mocks';
import { FIXTURES_DIR, fixtureFlights } from '../tests/fixtures';

// La page d'accueil (tableau de bord) monte des graphiques ECharts (canvas) et une carte MapLibre
// (WebGL), absents de jsdom : on les remplace par des éléments inertes.
// Rendu de l'application entière : 1 à 3 s seul, davantage quand les 46 fichiers tournent en parallèle.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="echarts" /> }));
vi.mock('@/components/map/SitesMap', () => ({ SitesMap: () => <div data-testid="sites-map" /> }));

const flights = fixtureFlights();
const parapente = flights.filter((f) => f.activity === 'parapente').length;

function stubFetch(fail = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (fail) return new Response('', { status: 500 });
      return new Response(readFileSync(join(FIXTURES_DIR, url.replace('/data/', '')), 'utf8'));
    }),
  );
}

function renderApp(path = '/') {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const count = () => screen.getByTestId('flight-count').textContent?.replace(/[\u00a0\u202f]/g, ' ');

beforeEach(() => {
  installDomMocks();
  resetDataCaches();
  useFiltersStore.setState({ filters: defaultFilters() });
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('application', () => {
  it('affiche les squelettes puis la page avec les landmarks et le pied de page', async () => {
    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Données issues de syride.com. Outil personnel, non affilié à Syride.',
    );
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Filtres' })).toBeInTheDocument();
    expect(count()).toBe(`${flights.length} vols`);
  });

  it('un filtre d’URL est appliqué et « Réinitialiser » le retire', async () => {
    renderApp('/vols?activite=parapente');
    await screen.findByRole('heading', { level: 1, name: 'Vols' });
    await waitFor(() => expect(count()).toBe(`${parapente} vols`));
    const chips = screen.getByRole('group', { name: 'Filtres actifs' });
    expect(within(chips).getByText('Parapente')).toBeInTheDocument();
    fireEvent.click(within(chips).getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => expect(count()).toBe(`${flights.length} vols`));
    expect(screen.queryByRole('group', { name: 'Filtres actifs' })).not.toBeInTheDocument();
  });

  it('les raccourcis clavier 1/2/3 changent l’activité', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.keyDown(document.body, { key: '2' });
    await waitFor(() => expect(count()).toBe(`${parapente} vols`));
    fireEvent.keyDown(document.body, { key: '1' });
    await waitFor(() => expect(count()).toBe(`${flights.length} vols`));
  });

  it('les raccourcis 1/2/3 marchent aussi sur AZERTY (« é » sans Maj, « 1 » avec Maj)', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.keyDown(document.body, { key: 'é' });
    await waitFor(() => expect(count()).toBe(`${parapente} vols`));
    fireEvent.keyDown(document.body, { key: '1', shiftKey: true });
    await waitFor(() => expect(count()).toBe(`${flights.length} vols`));
  });

  it('« ? » ouvre l’aide, Échap la ferme et efface le surlignage', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    useHighlightStore.getState().setHighlight({ kind: 'site', siteId: 1 });
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(await screen.findByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useHighlightStore.getState().highlight).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Raccourcis clavier' })).not.toBeInTheDocument());
  });

  it('« / » met le focus sur la recherche de pilotes', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    fireEvent.keyDown(document.body, { key: '/' });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('filtre-pilotes')));
  });

  it('les raccourcis sont ignorés dans un champ de saisie et avec Ctrl', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    const input = document.getElementById('filtre-pilotes') as HTMLElement;
    input.focus();
    fireEvent.keyDown(input, { key: '2' });
    fireEvent.keyDown(document.body, { key: '2', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true, metaKey: true });
    expect(count()).toBe(`${flights.length} vols`);
    expect(screen.queryByRole('dialog', { name: 'Raccourcis clavier' })).not.toBeInTheDocument();
  });

  it('les pages à paramètres et la 404 s’affichent', async () => {
    renderApp('/pilote/alpha-test/2024');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Bilan 2024');
    cleanup();
    renderApp('/n-importe-quoi');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page introuvable' })).toBeInTheDocument();
  });

  it('affiche l’erreur de chargement avec « Réessayer »', async () => {
    stubFetch(true);
    renderApp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('HTTP 500');
    stubFetch();
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
  });
});

describe('mobile', () => {
  it('les filtres s’ouvrent dans un tiroir', async () => {
    installDomMocks({ mobile: true });
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('radio', { name: /Parapente/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filtres/ }));
    expect(await screen.findByRole('dialog', { name: 'Filtres' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Parapente/ })).toBeInTheDocument();
  });
});
