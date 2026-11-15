/**
 * Style de carte MapLibre : on ne versionne pas un style complet. On charge le style OpenFreeMap
 * « positron » (clair et sombre), puis `tuneMapStyle` le recolore avec les jetons `map-*` :
 * eau, terre et frontières aux teintes de la palette, routes atténuées, étiquettes lisibles.
 * Avantages : le style suit les mises à jour d'OpenFreeMap, le dépôt reste léger, et les couches
 * inconnues restent intactes. Le mode sombre reprend la même base positron recolorée (pas de
 * style « dark » distinct à charger).
 */
import { colors, type ColorScheme } from '@/theme/tokens';

export const OPENFREEMAP_POSITRON_URL = 'https://tiles.openfreemap.org/styles/positron';

/** URL du style de base à charger (identique en clair et en sombre : le sombre est recoloré). */
const STYLE_URLS: Record<ColorScheme, string> = {
  light: OPENFREEMAP_POSITRON_URL,
  dark: OPENFREEMAP_POSITRON_URL,
};

export function mapStyleUrl(scheme: ColorScheme): string {
  return STYLE_URLS[scheme];
}

/** Sous-ensemble du style MapLibre dont on a besoin (évite d'importer les types du moteur). */
export interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface StyleLike {
  layers: StyleLayer[];
  [key: string]: unknown;
}

/** Part de saturation conservée sur les routes : elles restent discrètes. */
const ROAD_OPACITY = 0.55;

function matches(layer: StyleLayer, ...patterns: RegExp[]): boolean {
  const name = `${layer.id} ${layer['source-layer'] ?? ''}`;
  return patterns.some((p) => p.test(name));
}

/** Retourne une copie du style, recolorée selon le schéma. Fonction pure. */
export function tuneMapStyle<T extends StyleLike>(style: T, scheme: ColorScheme): T {
  const c = colors[scheme];
  const layers = style.layers.map((layer): StyleLayer => {
    const paint: Record<string, unknown> = { ...(layer.paint ?? {}) };
    const next: StyleLayer = { ...layer, paint };

    if (layer.type === 'background') {
      paint['background-color'] = c['map-land'];
    } else if (layer.type === 'fill' && matches(layer, /water/i)) {
      paint['fill-color'] = c['map-water'];
    } else if (layer.type === 'line' && matches(layer, /waterway/i)) {
      paint['line-color'] = c['map-water'];
    } else if (layer.type === 'fill' && matches(layer, /landcover|landuse|park|wood|grass|sand/i)) {
      paint['fill-color'] = c['map-land'];
      paint['fill-opacity'] = scheme === 'dark' ? 0.5 : 0.6;
    } else if (layer.type === 'line' && matches(layer, /boundary|admin/i)) {
      paint['line-color'] = c['map-border'];
    } else if (
      layer.type === 'line' &&
      matches(layer, /road|highway|bridge|tunnel|rail|transit|path|aeroway/i)
    ) {
      paint['line-color'] = c['map-border'];
      paint['line-opacity'] = ROAD_OPACITY;
    } else if (layer.type === 'fill' && matches(layer, /building/i)) {
      paint['fill-color'] = c['map-border'];
      paint['fill-opacity'] = 0.3;
    } else if (layer.type === 'symbol') {
      paint['text-color'] = c.muted;
      paint['text-halo-color'] = c['map-land'];
      paint['text-halo-width'] = 1;
    }
    return next;
  });
  return { ...style, layers };
}
