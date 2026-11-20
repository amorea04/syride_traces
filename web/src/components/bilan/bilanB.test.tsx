import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mapCalls = vi.hoisted(() => ({ fit: [] as unknown[], ease: [] as unknown[] }));
vi.mock('maplibre-gl', () => {
  class Map {
    touchZoomRotate = { disableRotation: vi.fn() };
    addControl = vi.fn();
    on = vi.fn();
    once = vi.fn((_: string, cb: () => void) => cb());
    remove = vi.fn();
    resize = vi.fn();
    getLayer = vi.fn(() => true);
    getSource = vi.fn();
    setPaintProperty = vi.fn();
    setLayoutProperty = vi.fn();
    fitBounds = vi.fn((...a: unknown[]) => mapCalls.fit.push(a));
    easeTo = vi.fn((...a: unknown[]) => mapCalls.ease.push(a));
    getCanvas = vi.fn(() => ({ style: {} }));
  }
  class NavigationControl {}
  class Popup {}
  return { Map, NavigationControl, Popup, setWorkerUrl: vi.fn() };
});
vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="echarts" /> }));

import { BilanContext, type BilanContextValue } from '@/components/bilan/BilanContext';
import { decodeFlights } from '@/data/flight';
import type { Flight } from '@/data/flight';
import type { InsightsFile, SitesFile } from '@/data/schema.gen';
import { pilotFlights, yearFlights } from '@/lib/bilan';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { fixtureFlightsFile, fixtureInsights, fixtureSitesFile } from '../../../tests/fixtures';
import { readdirSync } from 'node:fs';
import { FIXTURES_DIR } from '../../../tests/fixtures';

const sitesFile: SitesFile = fixtureSitesFile();
const siteById = new Map(sitesFile.sites.map((s) => [s.id, s]));
vi.mock('@/data/DataProvider', () => ({ useData: () => ({ siteById, meta: { data_refreshed_at: '2025-12-30' } }) }));

import { BilanActions } from '@/components/bilan/BilanActions';
import { BilanData } from '@/components/bilan/BilanData';
import { BilanFlights } from '@/components/bilan/BilanFlights';
import { BilanGear } from '@/components/bilan/BilanGear';
import { BilanRecords } from '@/components/bilan/BilanRecords';
import { BilanWhen } from '@/components/bilan/BilanWhen';
import { BilanWhere } from '@/components/bilan/BilanWhere';

const all: Flight[] = decodeFlights(fixtureFlightsFile());
const insightsFile = readdirSync(`${FIXTURES_DIR}/insights`).find((f) => f.startsWith('alpha-test-2025'))!;
const insights: InsightsFile = fixtureInsights(`insights/${insightsFile}`);

function makeContext(over: Partial<BilanContextValue> = {}): BilanContextValue {
  const slug = 'alpha-test';
  const history = pilotFlights(all, slug, 'tout');
  const story = insights.by_disc.tout!;
  const compareYears = [2024];
  return {
    pilot: history[0]!.pilot,
    slug,
    year: 2025,
    discipline: 'tout',
    flights: yearFlights(history, 2025, insights.cutoff),
    history,
    compareYears,
    compareFlights: new Map(compareYears.map((y) => [y, yearFlights(history, y)] as const)),
    setCompareYears: vi.fn(),
    availableYears: [2025, 2024],
    story,
    insights,
    cutoff: insights.cutoff,
    ongoing: false,
    refDate: '2025-12-31',
    ...over,
  };
}

function renderUi(ui: ReactElement, ctx: BilanContextValue = makeContext()) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter>
        <BilanContext.Provider value={ctx}>{ui}</BilanContext.Provider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  installDomMocks();
  mapCalls.fit.length = 0;
  mapCalls.ease.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BilanWhen', () => {
  it('affiche la phrase du récit telle quelle, la matrice, les mois et les saisons', () => {
    const ctx = makeContext();
    renderUi(<BilanWhen />, ctx);
    expect(screen.getByTestId('bilan-texte-quand').textContent).toBe(ctx.story.texts.quand);
    expect(screen.getByTestId('bilan-week-hour-matrix')).toBeInTheDocument();
    expect(screen.getByTestId('bilan-months-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bilan-seasons').children).toHaveLength(4);
    expect(document.getElementById('quand')).toBeInTheDocument();
  });
});

describe('BilanWhere', () => {
  it('liste les zones, cadre la carte au clic et marque les nouveaux sites', async () => {
    const ctx = makeContext();
    renderUi(<BilanWhere />, ctx);
    expect(screen.getByTestId('bilan-texte-ou').textContent).toBe(ctx.story.texts.ou);
    const zones = screen.getAllByTestId('bilan-zone');
    expect(zones).toHaveLength(ctx.story.map_zones.length);
    expect(zones[0]).toHaveTextContent(ctx.story.map_zones[0]!.name);
    await waitFor(() => expect(mapCalls.fit.length + mapCalls.ease.length).toBeGreaterThan(0));
    const before = mapCalls.fit.length + mapCalls.ease.length;
    fireEvent.click(zones[1]!);
    expect(zones[1]).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(mapCalls.fit.length + mapCalls.ease.length).toBeGreaterThan(before));
    fireEvent.click(screen.getByTestId('bilan-zone-all'));
    expect(screen.getByTestId('bilan-zone-all')).toHaveAttribute('aria-pressed', 'true');
    // Nouveau site en or dans le tableau.
    const newSites = ctx.story.new_sites.map((s) => s.site);
    expect(screen.getAllByTestId('bilan-new-site')).toHaveLength(newSites.length);
    expect(screen.getByTestId('bilan-reach')).toHaveTextContent(ctx.story.reach!.main_site);
    // D12 : un tableau de sites, jamais de trace.
    expect(screen.getByTestId('bilan-sites-table')).toBeInTheDocument();
  });
});

describe('BilanGear', () => {
  it('marque les nouvelles voiles', () => {
    const ctx = makeContext();
    renderUi(<BilanGear />, ctx);
    expect(screen.getByTestId('bilan-texte-matos').textContent).toBe(ctx.story.texts.matos);
    expect(screen.getAllByTestId('bilan-new-wing')).toHaveLength(ctx.story.new_wings.length);
    expect(screen.getByTestId('bilan-wings-table')).toBeInTheDocument();
  });
});

describe('BilanRecords', () => {
  it('affiche « Nouveau record ! » pour chaque record battu, avec écart et année', () => {
    const ctx = makeContext();
    renderUi(<BilanRecords />, ctx);
    expect(screen.getAllByTestId('bilan-record-new')).toHaveLength(ctx.story.records_beaten.length);
    expect(screen.getAllByTestId('bilan-record-gain')[0]).toHaveTextContent(/par rapport à 2024/);
    const syride = screen.getAllByTestId('syride-link')[0]!;
    expect(syride).toHaveAttribute('aria-label', 'Voir la trace sur Syride');
    expect(syride).toHaveAttribute('rel', 'noopener noreferrer');
    expect(syride).toHaveAttribute('href', expect.stringContaining('syride.com'));
    const link = screen.getAllByTestId('bilan-record-link')[0]!;
    expect(link.getAttribute('href')).toMatch(/^\/vol\/alpha-test-\d+/);
  });
  it('ne rend rien sans aucune mesure', () => {
    const ctx = makeContext({ flights: [{ ...all[0]!, durationMin: null, ceilingM: null, distKm: null, speedMax: null, varioMax: null, gMax: null }] });
    const { container } = renderUi(<BilanRecords />, ctx);
    expect(container.querySelector('#records')).toBeNull();
  });
});

describe('BilanFlights', () => {
  it('liste les vols de l’année et met en or les vols records', () => {
    const ctx = makeContext();
    const { container } = renderUi(<BilanFlights />, ctx);
    expect(screen.getByTestId('bilan-flights-count')).toHaveTextContent(String(ctx.flights.length));
    const style = container.querySelector('.bb-flights style')?.textContent ?? '';
    for (const r of ctx.story.records_beaten) if (r.flight) expect(style).toContain(`data-key="${r.flight}"`);
    expect(screen.getByTestId('bilan-flights-gold-legend')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Rechercher dans les vols/), { target: { value: 'zzzz-inconnu' } });
    return waitFor(() => expect(screen.getByTestId('bilan-flights-count')).toHaveTextContent('0'));
  });
});

describe('BilanData', () => {
  it('affiche la couverture, la date de coupure et le glossaire', () => {
    const ctx = makeContext({ ongoing: true, cutoff: '2025-09-30' });
    renderUi(<BilanData />, ctx);
    expect(screen.getByTestId('bilan-cutoff')).toHaveTextContent(/en cours/);
    expect(screen.getByTestId('bilan-cutoff')).toHaveTextContent(/30\s+septembre/);
    const origin = within(screen.getByTestId('bilan-coverage-origin'));
    expect(origin.getByText('Avec trace GPX')).toBeInTheDocument();
    expect(within(screen.getByTestId('bilan-coverage-measures')).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByTestId('bilan-glossary').querySelectorAll('dt')).toHaveLength(8);
    expect(screen.getByTestId('bilan-about-link')).toHaveAttribute('href', '/a-propos');
  });
});

describe('BilanActions', () => {
  it('copie le lien et le résumé, gère un presse-papiers indisponible', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderUi(<BilanActions />);
    fireEvent.click(screen.getByTestId('bilan-copy-link'));
    await waitFor(() => expect(screen.getByTestId('bilan-copy-link')).toHaveTextContent('Copié'));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    fireEvent.click(screen.getByTestId('bilan-copy-summary'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const summary = (writeText.mock.calls[1] as unknown as [string])[0];
    expect(summary.split('\n')[0]).toMatch(/^Bilan 2025 · /);

    writeText.mockRejectedValueOnce(new Error('refusé'));
    fireEvent.click(screen.getByTestId('bilan-copy-link'));
    await waitFor(() => expect(screen.getByTestId('bilan-copy-link')).toHaveTextContent('Copie impossible'));
  });

  it('exporte un CSV nommé bilan-<slug>-<année>.csv avec une ligne par vol', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const ctx = makeContext();
    renderUi(<BilanActions />, ctx);
    fireEvent.click(screen.getByTestId('bilan-export-csv'));
    expect(names).toEqual(['bilan-alpha-test-2025.csv']);
    const text = await blobs[0]!.text();
    expect(text.trim().split('\r\n')).toHaveLength(ctx.flights.length + 1);
    click.mockRestore();
  });
});

describe('carte : contour or des nouveaux sites', () => {
  it('ne change rien sans site nouveau, sinon un contour or pour les sites listés', async () => {
    const { pointStroke } = await import('@/components/map/sitesLayers');
    const c = { surface: '#fff', gold: '#b58900' };
    expect(pointStroke(c, undefined)).toEqual({ color: '#fff', width: 1.5 });
    expect(pointStroke(c, [])).toEqual({ color: '#fff', width: 1.5 });
    const s = pointStroke(c, [3, 5]);
    expect(JSON.stringify(s.color)).toContain('"literal",[3,5]');
    expect(JSON.stringify(s.color)).toContain('#b58900');
  });
});
