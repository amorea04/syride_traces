import { useComputedColorScheme } from '@mantine/core';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { whenNearViewport } from '@/lib/nearViewport';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import type { Site } from '@/data/load';
import { plural } from '@/lib/format';
import { tuneMapStyle } from '@/theme/map';
import { loadMap, type BaseStyle } from '@/theme/map/loader';
import { colors, type ColorScheme } from '@/theme/tokens';

/** Zoom fixe : on voit la vallée ou le massif du site, pas la France entière. */
export const MINI_MAP_ZOOM = 10;
const SOURCE_ID = 'site';
const LAYER_ID = 'site-point';

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
  const [failed, setFailed] = useState(false);
  const hasCoords = lat !== null && lon !== null;
  const data = useMemo(() => (hasCoords ? sitePointCollection(lon, lat) : null), [hasCoords, lat, lon]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data || lat === null || lon === null) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const create = (ml: typeof import('maplibre-gl'), base: BaseStyle) => {
      if (cancelled) return;
      const { Map: MapLibreMap, NavigationControl } = ml;
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
    const stopWaiting = whenNearViewport(container, () => {
      loadMap({
        scheme: () => scheme,
        onReady: create,
        onMapLibreFailed: () => {
          if (!cancelled) setFailed(true);
        },
      });
    });
    return () => {
      stopWaiting();
      cancelled = true;
      map?.remove();
    };
  }, [data, lat, lon, scheme]);

  return (
    <Section id="carte-site" title="Position du site">
      {!hasCoords || siteId === null ? (
        <p className="fv-note" style={{ margin: 0 }} role="status" data-testid="minimap-empty">
          {siteName
            ? `La position de ${siteName} n’est pas connue\u00a0: pas de carte.`
            : 'Ce vol n’a pas de site connu\u00a0: pas de carte.'}
        </p>
      ) : (
        <>
          <div
            ref={containerRef}
            className="fv-map"
            role="region"
            aria-label={`Carte\u00a0: position du site ${siteName ?? ''}`}
            data-testid="flight-minimap"
            data-geometry-types="Point"
            data-feature-count={data?.features.length}
          >
            {failed && (
              <p className="fv-note" style={{ margin: 0, padding: 12 }} role="status" data-testid="minimap-failed">
                Carte indisponible (hors ligne&nbsp;?).
              </p>
            )}
          </div>
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
