import { useComputedColorScheme } from '@mantine/core';
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useMemo, useRef } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import type { Site } from '@/data/load';
import { plural } from '@/lib/format';
import { mapStyleUrl, tuneMapStyle, type StyleLike } from '@/theme/map';
import { colors, type ColorScheme } from '@/theme/tokens';

// Vite ne sait pas déduire l'URL du worker ESM de MapLibre : on la lui donne (comme la carte des sites).
if (typeof setWorkerUrl === 'function') setWorkerUrl(workerUrl);

/** Zoom fixe : on voit la vallée ou le massif du site, pas la France entière. */
export const MINI_MAP_ZOOM = 10;
const SOURCE_ID = 'site';
const LAYER_ID = 'site-point';

type BaseStyle = StyleLike & { glyphs?: string };
const FALLBACK_STYLE: BaseStyle = { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background' }] };

const baseStyleCache = new Map<string, Promise<BaseStyle>>();
function loadBaseStyle(scheme: ColorScheme): Promise<BaseStyle> {
  const url = mapStyleUrl(scheme);
  let p = baseStyleCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Style de carte : HTTP ${r.status}`);
      return r.json() as Promise<BaseStyle>;
    });
    baseStyleCache.set(url, p);
    p.catch(() => baseStyleCache.delete(url));
  }
  return p;
}

export interface SitePointCollection {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }[];
}

/** D12 : un seul `Point`, la position du site. */
export function sitePointCollection(lon: number, lat: number): SitePointCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } }],
  };
}

/** Style complet : fond recoloré, source GeoJSON du site et un cercle. */
export function buildMiniStyle(
  base: BaseStyle,
  scheme: ColorScheme,
  data: SitePointCollection,
): StyleSpecification {
  const tuned = tuneMapStyle(base, scheme);
  const c = colors[scheme];
  return {
    ...tuned,
    sources: {
      ...(tuned['sources'] as Record<string, unknown> | undefined),
      [SOURCE_ID]: { type: 'geojson', data },
    },
    layers: [
      ...tuned.layers,
      {
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': c.accent,
          'circle-stroke-color': c.surface,
          'circle-stroke-width': 2.5,
        },
      },
    ],
  } as unknown as StyleSpecification;
}

interface Props {
  site: Site | undefined;
  siteId: number | null;
  siteName: string | null;
}

/** Carte du site (jamais du vol, D12) : un marqueur, zoom fixe, interactions minimales. */
export function SiteMiniMap({ site, siteId, siteName }: Props) {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const containerRef = useRef<HTMLDivElement>(null);
  const lat = site?.lat ?? null;
  const lon = site?.lon ?? null;
  const hasCoords = lat !== null && lon !== null;
  const data = useMemo(() => (hasCoords ? sitePointCollection(lon, lat) : null), [hasCoords, lat, lon]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data || lat === null || lon === null) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const create = (base: BaseStyle) => {
      if (cancelled) return;
      map = new MapLibreMap({
        container,
        style: buildMiniStyle(base, scheme, data),
        center: [lon, lat],
        zoom: MINI_MAP_ZOOM,
        cooperativeGestures: true,
        keyboard: false,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    };
    loadBaseStyle(scheme).then(create, () => create(FALLBACK_STYLE));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, lat, lon, scheme]);

  return (
    <Section id="carte-site" title="Position du site">
      {!hasCoords || siteId === null ? (
        <p className="fv-note" style={{ margin: 0 }} role="status" data-testid="minimap-empty">
          {siteName
            ? `La position de ${siteName} n’est pas connue : pas de carte.`
            : 'Ce vol n’a pas de site connu : pas de carte.'}
        </p>
      ) : (
        <>
          <div
            ref={containerRef}
            className="fv-map"
            role="region"
            aria-label={`Carte : position du site ${siteName ?? ''}`}
            data-testid="flight-minimap"
            data-geometry-types="Point"
            data-feature-count={data?.features.length}
          />
          <p style={{ margin: '10px 0 0', fontSize: 13 }}>
            <b>{siteName}</b>
            {site && ` · ${plural(site.flights, 'vol')}, ${plural(site.pilots, 'pilote')}`}.{' '}
            <FilterLink to={`/site/${siteId}`} data-testid="minimap-site-link">
              Voir la page du site
            </FilterLink>
          </p>
          <p className="fv-note" style={{ margin: '4px 0 0' }}>
            Position du site, jamais celle du vol.
          </p>
        </>
      )}
    </Section>
  );
}
