/**
 * Chargement partagé de MapLibre et du style de base (SitesMap, SiteMiniMap) : import dynamique du moteur
 * (6.1, aucun chunk de démarrage) et du style OpenFreeMap, avec une seule gestion d'erreur.
 */
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyleUrl, type StyleLike } from '@/theme/map';
import type { ColorScheme } from '@/theme/tokens';

export type MapLibre = typeof import('maplibre-gl');
export type BaseStyle = StyleLike & { glyphs?: string };

/** Fond de secours si le style OpenFreeMap est injoignable : les points restent visibles. */
export const FALLBACK_STYLE: BaseStyle = { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background' }] };

/** Charge MapLibre à la demande. Rejette si le chunk est injoignable (hors ligne, déploiement entre-temps). */
export async function loadMapLibre(): Promise<MapLibre> {
  const ml = await import('maplibre-gl');
  // Vite ne sait pas déduire l'URL du worker ESM de MapLibre : on la lui donne.
  if (typeof ml.setWorkerUrl === 'function') ml.setWorkerUrl(workerUrl);
  return ml;
}

const baseStyleCache = new Map<string, Promise<BaseStyle>>();
/** Style de base recolorable ; rejette en cas d'échec (l'appelant se replie sur `FALLBACK_STYLE`). */
export function loadBaseStyle(scheme: ColorScheme): Promise<BaseStyle> {
  const url = mapStyleUrl(scheme);
  let p = baseStyleCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Style de carte\u00a0: HTTP ${r.status}`);
      return r.json() as Promise<BaseStyle>;
    });
    baseStyleCache.set(url, p);
    p.catch(() => baseStyleCache.delete(url));
  }
  return p;
}

/**
 * Charge MapLibre puis le style de base. `onMapLibreFailed` si le moteur est injoignable (aucune carte) ;
 * `onBaseFailed` si seul le fond manque (la carte se crée avec `FALLBACK_STYLE`).
 */
export function loadMap(handlers: {
  scheme: () => ColorScheme;
  onReady: (ml: MapLibre, base: BaseStyle) => void;
  onBaseFailed?: () => void;
  onMapLibreFailed: () => void;
}): void {
  loadMapLibre().then(
    (ml) =>
      loadBaseStyle(handlers.scheme()).then(
        (base) => handlers.onReady(ml, base),
        () => {
          handlers.onBaseFailed?.();
          handlers.onReady(ml, FALLBACK_STYLE);
        },
      ),
    () => handlers.onMapLibreFailed(),
  );
}
