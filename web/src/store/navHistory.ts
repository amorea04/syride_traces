import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { create } from 'zustand';

/** Une entrée de l'historique de l'application : clé de `location` (unique par entrée) et chemin. */
export interface NavEntry {
  key: string;
  pathname: string;
}

export interface NavHistory {
  entries: NavEntry[];
  /** Position de la page courante dans `entries`. */
  index: number;
}

export type NavType = 'PUSH' | 'REPLACE' | 'POP';

export const emptyNavHistory = (): NavHistory => ({ entries: [], index: -1 });

/**
 * Met à jour la pile des pages visitées : un `PUSH` coupe ce qui suivait la page courante, un `REPLACE` remplace
 * l'entrée courante, un `POP` (retour ou avance du navigateur, `navigate(-n)`) se replace sur l'entrée connue
 * de même clé ; une entrée inconnue (premier rendu, rechargement) repart d'une pile à une seule page.
 */
export function recordNavigation(state: NavHistory, entry: NavEntry, type: NavType): NavHistory {
  const current = state.entries[state.index];
  if (current?.key === entry.key) {
    if (current.pathname === entry.pathname) return state;
    return { ...state, entries: state.entries.map((e, i) => (i === state.index ? entry : e)) };
  }
  if (type === 'PUSH' && state.index >= 0) {
    return { entries: [...state.entries.slice(0, state.index + 1), entry], index: state.index + 1 };
  }
  if (type === 'REPLACE' && state.index >= 0) {
    return { ...state, entries: state.entries.map((e, i) => (i === state.index ? entry : e)) };
  }
  if (type === 'POP') {
    const known = state.entries.findIndex((e) => e.key === entry.key);
    if (known >= 0) return { entries: state.entries.map((e, i) => (i === known ? entry : e)), index: known };
  }
  return { entries: [entry], index: 0 };
}

/**
 * Nombre d'entrées à remonter pour atteindre la page précédente **d'un autre chemin** (les changements de filtre
 * empilent des entrées sur le même chemin) ; `null` s'il n'y en a pas dans l'historique de l'application.
 */
export function backSteps(state: NavHistory): number | null {
  const current = state.entries[state.index];
  if (!current) return null;
  for (let i = state.index - 1; i >= 0; i -= 1) {
    if (state.entries[i]?.pathname !== current.pathname) return state.index - i;
  }
  return null;
}

interface NavHistoryStore extends NavHistory {
  record: (entry: NavEntry, type: NavType) => void;
  reset: () => void;
}

export const useNavHistoryStore = create<NavHistoryStore>((set) => ({
  ...emptyNavHistory(),
  record: (entry, type) =>
    set((s) => {
      const next = recordNavigation({ entries: s.entries, index: s.index }, entry, type);
      return next.entries === s.entries && next.index === s.index ? s : next;
    }),
  reset: () => set(emptyNavHistory()),
}));

/** À monter une fois, dans la mise en page : enregistre chaque page visitée. */
export function useRecordNavigation(): void {
  const { key, pathname } = useLocation();
  const type = useNavigationType();
  const record = useNavHistoryStore((s) => s.record);
  useEffect(() => record({ key, pathname }, type), [record, key, pathname, type]);
}
