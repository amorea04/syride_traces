/** Sources et couches des sites, ajoutées au style recoloré (clair/sombre) du fond de carte. */
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SiteCollection } from '@/lib/mapSites';
import { tuneMapStyle, type StyleLike } from '@/theme/map';
import { colors, type ColorScheme } from '@/theme/tokens';

export type MapStyle = ReturnType<MapLibreMap['getStyle']>;
type Layer = MapStyle['layers'][number];
type Expr = unknown;

export const SRC_CLUSTERED = 'sites';
export const SRC_RAW = 'sites-raw';
export const LAYER_CLUSTER = 'sites-cluster';
export const LAYER_CLUSTER_COUNT = 'sites-cluster-count';
export const LAYER_POINT = 'sites-point';
export const LAYER_HEAT = 'sites-heat';
/** Rayon maximal de regroupement (px) et zoom au-delà duquel on ne regroupe plus. */
const CLUSTER_RADIUS = 40;
const CLUSTER_MAX_ZOOM = 9;
/** Opacité des points non surlignés. */
export const DIM_OPACITY = 0.25;

export interface LayerState {
  heatmap: boolean;
  highlightSiteId: number | null;
}

/** Hex `#rrggbb` → `rgba(r,g,b,a)` (la heatmap a besoin d'une rampe transparente → opaque). */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Opacité d'un point : atténué si un autre site est surligné. */
export function pointOpacity(siteId: number | null): Expr {
  if (siteId === null) return 1;
  return ['case', ['==', ['get', 'siteId'], siteId], 1, DIM_OPACITY];
}

export function layerVisibility(heatmap: boolean) {
  return {
    circles: heatmap ? 'none' : 'visible',
    heat: heatmap ? 'visible' : 'none',
  } as const;
}

/** Construit le style complet : fond recoloré + sources + couches des sites. */
export function buildStyle(
  base: StyleLike & { glyphs?: string },
  scheme: ColorScheme,
  data: SiteCollection,
  state: LayerState,
): MapStyle {
  const c = colors[scheme];
  const tuned = tuneMapStyle(base, scheme);
  const vis = layerVisibility(state.heatmap);
  const hasGlyphs = typeof base.glyphs === 'string';
  const opacity = pointOpacity(state.highlightSiteId);

  const layers: unknown[] = [
    {
      id: LAYER_HEAT,
      type: 'heatmap',
      source: SRC_RAW,
      layout: { visibility: vis.heat },
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'flights'], 0, 0, 5, 0.6, 20, 1],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 14, 10, 40],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 10, 2],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          withAlpha(c.b, 0),
          0.2,
          withAlpha(c.b, 0.4),
          0.5,
          withAlpha(c.b, 0.7),
          1,
          withAlpha(c.b, 0.95),
        ],
      },
    },
    {
      id: LAYER_CLUSTER,
      type: 'circle',
      source: SRC_CLUSTERED,
      filter: ['has', 'point_count'],
      layout: { visibility: vis.circles },
      paint: {
        'circle-color': c.b,
        'circle-opacity': 0.85,
        'circle-stroke-color': c.surface,
        'circle-stroke-width': 1.5,
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'flights']], 3, 12, 20, 24, 60, 36],
      },
    },
    {
      id: LAYER_POINT,
      type: 'circle',
      source: SRC_CLUSTERED,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility: vis.circles },
      paint: {
        'circle-color': ['match', ['get', 'dominant'], 'parapente', c.p, 'paramoteur', c.m, c.b],
        'circle-opacity': ['*', 0.9, opacity],
        'circle-stroke-opacity': opacity,
        'circle-stroke-color': c.surface,
        'circle-stroke-width': 1.5,
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'flights']], 1, 5, 5, 10, 20, 24],
      },
    },
  ];
  if (hasGlyphs) {
    layers.push({
      id: LAYER_CLUSTER_COUNT,
      type: 'symbol',
      source: SRC_CLUSTERED,
      filter: ['has', 'point_count'],
      layout: {
        visibility: vis.circles,
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': c.surface, 'text-halo-width': 0 },
    });
  }

  return {
    ...(tuned as unknown as MapStyle),
    sources: {
      ...(tuned as unknown as MapStyle).sources,
      [SRC_CLUSTERED]: {
        type: 'geojson',
        data: data as never,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: { flights: ['+', ['get', 'flights']] },
      },
      [SRC_RAW]: { type: 'geojson', data: data as never },
    },
    layers: [...(tuned.layers as unknown as Layer[]), ...(layers as Layer[])],
  };
}
