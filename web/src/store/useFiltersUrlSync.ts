import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import {
  filtersEqual,
  hasFilterParams,
  historyModeFor,
  isDefaultFilters,
  parseFilters,
  resolveUrlFilters,
  writeFilters,
  type Filters,
} from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';

/**
 * Synchronise le store des filtres et la query string, dans les deux sens. À monter une seule
 * fois, dans le routeur.
 *
 * - URL → store : au chargement, au retour arrière/avant du navigateur, et pour tout lien qui
 *   porte des paramètres de filtre.
 * - Un lien interne sans paramètre de filtre (PUSH/REPLACE) ne réinitialise pas les filtres : on
 *   réinjecte l'état courant dans l'URL (`replace`).
 * - store → URL : une entrée d'historique par modification, sauf les modifications rapides qui
 *   remplacent l'entrée précédente (cf. `historyModeFor`).
 */
export function useFiltersUrlSync(): void {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const filters = useFiltersStore((s) => s.filters);
  const searchRef = useRef(location.search);
  const lastPushAt = useRef<number | null>(null);
  /** Dernier objet `filters` dont on sait qu'il correspond à l'URL. */
  const synced = useRef<Filters>(useFiltersStore.getState().filters);

  // URL → store.
  useEffect(() => {
    searchRef.current = location.search;
    const { filters: current, replaceAll } = useFiltersStore.getState();
    const fromUrl = parseFilters(location.search);
    if (filtersEqual(fromUrl, current)) {
      synced.current = current;
      return;
    }
    if (navType !== 'POP' && !hasFilterParams(location.search) && !isDefaultFilters(current)) {
      navigate({ search: writeFilters(location.search, current) }, { replace: true });
      return;
    }
    // Hors retour arrière, un paramètre invalide n'efface pas les autres filtres.
    const next = navType === 'POP' ? fromUrl : resolveUrlFilters(location.search, current);
    synced.current = next;
    replaceAll(next);
    // L'URL est corrigée pour refléter l'état réel (valeurs invalides retirées ou remplacées).
    if (!filtersEqual(fromUrl, next)) {
      navigate({ search: writeFilters(location.search, next) }, { replace: true });
    }
    // `navigate` est stable ; on réagit aux changements de position uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Store → URL. On relit le store plutôt que la valeur du rendu : l'effet précédent a pu le
  // remplacer dans le même cycle (chargement, retour arrière).
  useEffect(() => {
    const current = useFiltersStore.getState().filters;
    if (current === synced.current) return;
    synced.current = current;
    if (filtersEqual(parseFilters(searchRef.current), current)) return;
    const now = Date.now();
    const mode = historyModeFor(now, lastPushAt.current);
    if (mode === 'push') lastPushAt.current = now;
    navigate({ search: writeFilters(searchRef.current, current) }, { replace: mode === 'replace' });
  }, [filters, navigate]);
}
