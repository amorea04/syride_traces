import { create } from 'zustand';

/**
 * Surlignage croisé (§5.0) : survoler un site, une voile ou un mois surligne les éléments
 * correspondants ailleurs sur la page (calendrier, carte, ruban, barres). Éphémère : jamais
 * dans l'URL. Un clic, lui, transforme l'élément en filtre global (store `filters`).
 */
export type Highlight =
  | { kind: 'site'; siteId: number }
  | { kind: 'wing'; wing: string }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'pilot'; pilotSlug: string }
  /** Jours surlignés par une tuile du bloc Rythme (série, pause, meilleure semaine). */
  | { kind: 'days'; from: string; to: string };

interface HighlightState {
  highlight: Highlight | null;
  setHighlight: (h: Highlight | null) => void;
}

export const useHighlightStore = create<HighlightState>((set) => ({
  highlight: null,
  setHighlight: (highlight) => set({ highlight }),
}));

/** Vrai si le surlignage courant désigne ce jour (`AAAA-MM-JJ`) : mois, ou plage de jours. */
export function highlightsDay(h: Highlight | null, iso: string): boolean {
  if (!h) return false;
  if (h.kind === 'days') return iso >= h.from && iso <= h.to;
  if (h.kind === 'month') return Number(iso.slice(0, 4)) === h.year && Number(iso.slice(5, 7)) === h.month;
  return false;
}
