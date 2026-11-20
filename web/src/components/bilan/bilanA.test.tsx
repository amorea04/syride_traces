import '@testing-library/jest-dom/vitest';
import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="echarts" /> }));

import { BilanComparison } from '@/components/bilan/BilanComparison';
import { BilanContext, type BilanContextValue } from '@/components/bilan/BilanContext';
import { BilanHeader } from '@/components/bilan/BilanHeader';
import { BilanOverview } from '@/components/bilan/BilanOverview';
import { BilanRhythm } from '@/components/bilan/BilanRhythm';
import { BilanStory } from '@/components/bilan/BilanStory';
import { BilanToc } from '@/components/bilan/BilanToc';
import { pilotFlights, yearFlights } from '@/lib/bilan';
import { useHighlightStore } from '@/store/highlight';
import { syrideFlightUrl } from '@/lib/syride';
import { mantineTheme } from '@/theme';
import { installDomMocks } from '../../../tests/dom-mocks';
import { fixtureFlights, fixtureInsights } from '../../../tests/fixtures';

const SLUG = 'alpha-test';
const all = fixtureFlights();
const insights = fixtureInsights('insights/alpha-test-2025.2e26af6925.json');
const history = pilotFlights(all, SLUG, 'tout');
const story = insights.by_disc.tout!;

function makeValue(over: Partial<BilanContextValue> = {}): BilanContextValue {
  const compareYears = [2024];
  return {
    pilot: history[0]!.pilot,
    slug: SLUG,
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
    refDate: '2025-12-28',
    ...over,
  };
}

function renderWith(ui: ReactElement, value = makeValue(), path = `/pilote/${SLUG}/2025`) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <MemoryRouter initialEntries={[path]}>
        <BilanContext.Provider value={value}>{ui}</BilanContext.Provider>
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** Le texte contient la phrase telle quelle (espaces insécables compris : `toHaveTextContent` les normalise). */
const text = (el: HTMLElement): string => el.textContent ?? '';

beforeEach(() => installDomMocks());
afterEach(cleanup);

describe('BilanHeader', () => {
  it('titre, chiffres, portrait et écart : textes du récit tels quels', () => {
    renderWith(<BilanHeader />);
    expect(text(screen.getByTestId('bilan-title'))).toContain(`Bilan 2025 · ${history[0]!.pilot}`);
    expect(screen.getByTestId('bilan-hero-kpis')).toHaveTextContent('vols');
    expect(text(screen.getByTestId('bilan-persona'))).toContain(story.persona!.label);
    expect(text(screen.getByTestId('bilan-persona'))).toContain(story.persona!.why);
    expect(screen.getByTestId('bilan-gap').firstChild?.textContent).toBe(story.gap!.text);
    expect(text(screen.getByTestId('bilan-gap'))).toContain(story.gap!.note);
    expect(screen.queryByTestId('bilan-ongoing')).toBeNull();
  });

  it('année en cours : mention « à date du »', () => {
    renderWith(<BilanHeader />, makeValue({ ongoing: true, cutoff: '2025-11-08' }));
    expect(text(screen.getByTestId('bilan-ongoing'))).toBe('à date du 8\u00a0novembre\u00a02025');
  });

  it('km : note « sur N vols mesurés » seulement si la distance manque à certains vols (comme le rapport)', () => {
    const full = yearFlights(history, 2025, insights.cutoff).map((f) => ({ ...f, distKm: 5 }));
    const partial = full.map((f, i) => (i === 0 ? { ...f, distKm: null } : f));
    renderWith(<BilanHeader />, makeValue({ flights: full }));
    expect(screen.queryByTestId('bilan-hero-km-note')).toBeNull();
    cleanup();
    renderWith(<BilanHeader />, makeValue({ flights: partial }));
    expect(screen.getByTestId('bilan-hero-km-note')).toHaveTextContent(`sur ${full.length - 1} vols mesurés`);
  });

  it('flèches : année précédente liée, suivante inerte ; le lien conserve les filtres de l’URL', () => {
    renderWith(<BilanHeader />, makeValue(), `/pilote/${SLUG}/2025?activite=paramoteur&comparer=`);
    const prev = screen.getByTestId('bilan-prev');
    expect(prev).toHaveAttribute('href', `/pilote/${SLUG}/2024?activite=paramoteur`);
    expect(screen.getByTestId('bilan-next')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('bilan-next').tagName).toBe('SPAN');
  });

  it('équivalence : le bouton ↻ fait tourner les phrases du récit', () => {
    renderWith(<BilanHeader />);
    const eq = () => screen.getByTestId('bilan-equivalence').querySelector('span')?.textContent;
    expect(eq()).toBe(story.equivalences[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Autre équivalence' }));
    expect(eq()).toBe(story.equivalences[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Autre équivalence' }));
    expect(eq()).toBe(story.equivalences[0]);
  });

  it('équivalence : bouton masqué s’il n’y en a qu’une, rien s’il n’y en a aucune', () => {
    const one = { ...story, equivalences: [story.equivalences[0]!] };
    renderWith(<BilanHeader />, makeValue({ story: one }));
    expect(screen.getByTestId('bilan-equivalence')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Autre équivalence' })).toBeNull();
    cleanup();
    renderWith(<BilanHeader />, makeValue({ story: { ...story, equivalences: [] } }));
    expect(screen.queryByTestId('bilan-equivalence')).toBeNull();
  });

  it('puces des années comparées : choix pressé, clic retire', () => {
    const setCompareYears = vi.fn();
    renderWith(<BilanHeader />, makeValue({ setCompareYears }));
    const chip = screen.getByTestId('bilan-compare-chip');
    expect(chip).toHaveAttribute('data-year', '2024');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(setCompareYears).toHaveBeenCalledWith([]);
  });

  it('puces : ajout d’une année, plafond de 2 années comparées', () => {
    const setCompareYears = vi.fn();
    const base = { availableYears: [2026, 2025, 2024, 2023], year: 2026, setCompareYears };
    renderWith(<BilanHeader />, makeValue({ ...base, compareYears: [] }));
    fireEvent.click(screen.getAllByTestId('bilan-compare-chip')[1]!);
    expect(setCompareYears).toHaveBeenCalledWith([2024]);
    cleanup();
    renderWith(<BilanHeader />, makeValue({ ...base, compareYears: [2025, 2024] }));
    const chips = screen.getAllByTestId('bilan-compare-chip');
    expect(chips).toHaveLength(3);
    expect(chips[2]).toBeDisabled();
  });

  it('première année : aucune puce, message sobre', () => {
    renderWith(<BilanHeader />, makeValue({ availableYears: [2025], compareYears: [] }));
    expect(screen.queryByTestId('bilan-compare-chip')).toBeNull();
    expect(screen.getByText('Aucune année précédente à comparer.')).toBeInTheDocument();
  });
});

describe('BilanOverview', () => {
  it('8 cartes avec mini-courbe et une pastille par année comparée ; synthèse du récit', () => {
    renderWith(<BilanOverview />);
    const tiles = screen.getAllByTestId('bilan-kpi');
    expect(tiles.map((t) => t.getAttribute('data-kpi'))).toEqual([
      'vols', 'temps', 'jours', 'sites', 'duree', 'distance', 'plafond', 'vitesse',
    ]);
    for (const tile of tiles) expect(within(tile).getAllByTestId('bilan-kpi-delta')).toHaveLength(1);
    expect(within(tiles[0]!).getByTestId('bilan-spark')).toBeInTheDocument();
    expect(text(screen.getByTestId('bilan-synthese'))).toContain(story.texts.synthese!);
  });

  it('meilleur jour, journée type et vol de l’année avec liens exacts', () => {
    renderWith(<BilanOverview />);
    expect(text(screen.getByTestId('bilan-best-day'))).toContain(story.texts.meilleure_journee!);
    expect(text(screen.getByTestId('bilan-typical-day'))).toContain(story.texts.journee_type!);
    const card = screen.getByTestId('bilan-flight-of-year');
    const link = within(card).getByTestId('bilan-flight-of-year-link');
    const key = link.getAttribute('href')!.replace('/vol/', '');
    const flight = history.find((f) => f.key === key)!;
    expect(flight).toBeDefined();
    const syride = within(card).getByRole('link', { name: 'Voir la trace sur Syride' });
    expect(syride).toHaveAttribute('href', syrideFlightUrl(flight.pilot, flight.syrideNum));
    expect(syride).toHaveAttribute('target', '_blank');
    expect(syride).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('BilanStory', () => {
  it('une entrée par jalon, textes tels quels, or pour les records et nouveautés, liens fiche vol', () => {
    renderWith(<BilanStory />);
    const items = screen.getAllByTestId('bilan-milestone');
    expect(items).toHaveLength(story.milestones.length);
    story.milestones.forEach((m, i) => {
      expect(text(items[i]!)).toContain(m.title);
      expect(items[i]).toHaveAttribute('data-gold', String(m.gold));
      if (m.detail) expect(text(items[i]!)).toContain(m.detail);
      expect(within(items[i]!).getByTestId('bilan-milestone-link')).toHaveAttribute('href', `/vol/${m.flight}`);
    });
    expect(items.some((i) => i.getAttribute('data-gold') === 'true')).toBe(true);
  });

  it('jalon sans vol : fiche du jour s’il y a des vols ce jour-là, sinon non cliquable', () => {
    const day = yearFlights(history, 2025)[0]!.date;
    const milestones = [
      { ...story.milestones[0]!, date: day, flight: null, title: 'Avec jour' },
      { ...story.milestones[0]!, date: '2025-01-01', flight: null, title: 'Sans jour' },
    ];
    renderWith(<BilanStory />, makeValue({ story: { ...story, milestones } }));
    const [withDay, without] = screen.getAllByTestId('bilan-milestone');
    expect(within(withDay!).getByRole('button', { name: 'Ouvrir la fiche du jour' })).toBeInTheDocument();
    expect(within(without!).queryByRole('button')).toBeNull();
    expect(within(without!).queryByRole('link')).toBeNull();
  });

  it('aucun jalon : rien', () => {
    renderWith(<BilanStory />, makeValue({ story: { ...story, milestones: [] } }));
    expect(screen.queryByTestId('bilan-milestones')).toBeNull();
    expect(document.getElementById('histoire')).toBeNull();
  });
});

describe('BilanRhythm', () => {
  it('texte du récit, graphique, tuiles et calendrier', () => {
    renderWith(<BilanRhythm />);
    expect(text(screen.getByTestId('bilan-rythme-text'))).toContain(story.texts.rythme!);
    expect(screen.getByTestId('bilan-cumul')).toBeInTheDocument();
    const tiles = screen.getByTestId('bilan-rhythm-tiles');
    for (const label of ['Plus longue série', 'Plus longue pause', 'Meilleure semaine', 'Régularité']) {
      expect(tiles).toHaveTextContent(label);
    }
    expect(screen.getByRole('button', { name: /Voir les données/ })).toBeInTheDocument();
  });

  it('la fiche du jour s’ouvre depuis l’aperçu (événement partagé)', async () => {
    renderWith(
      <>
        <BilanOverview />
        <BilanRhythm />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la fiche du jour' }));
    });
    expect(await screen.findByTestId('day-sheet-table')).toBeInTheDocument();
  });

  it('le surlignage de période est effacé au démontage', () => {
    const { unmount } = renderWith(<BilanRhythm />);
    act(() => useHighlightStore.getState().setHighlight({ kind: 'days', from: '2025-05-01', to: '2025-05-03' }));
    unmount();
    expect(useHighlightStore.getState().highlight).toBeNull();
  });
});

describe('BilanComparison', () => {
  it('tableau chiffres × années, pastille d’écart par année comparée, haltères', () => {
    renderWith(<BilanComparison />);
    const rows = within(screen.getByTestId('bilan-compare-table')).getAllByRole('row');
    expect(rows).toHaveLength(11);
    expect(screen.getByRole('columnheader', { name: 'Écart / 2024' })).toBeInTheDocument();
    expect(screen.getAllByTestId('bilan-compare-delta')).toHaveLength(10);
    expect(screen.getByTestId('bilan-dumbbells')).toBeInTheDocument();
  });

  it('distance manquante à plus d’un vol sur cinq : « Données partielles » dans le tableau, comme le rapport', () => {
    const flights = yearFlights(history, 2025, insights.cutoff).map((f, i) => ({ ...f, distKm: i === 0 ? 5 : null }));
    renderWith(<BilanComparison />, makeValue({ flights }));
    expect(within(screen.getByTestId('bilan-compare-table')).getByText(/Données partielles/)).toBeInTheDocument();
  });

  it('sans année comparée : message sobre', () => {
    renderWith(<BilanComparison />, makeValue({ compareYears: [], compareFlights: new Map() }));
    expect(screen.getByTestId('bilan-compare-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('bilan-compare-table')).toBeNull();
  });
});

describe('BilanToc', () => {
  it('n’affiche que les ancres présentes dans le DOM, dans l’ordre de la page', () => {
    render(
      <div data-testid="bilan-page">
        <BilanToc />
        <section id="apercu" />
        <section id="rythme" />
        <section id="records" />
      </div>,
    );
    const links = within(screen.getByTestId('bilan-toc')).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#apercu', '#rythme', '#records']);
  });
});
