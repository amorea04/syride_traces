import { Text, useComputedColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import '@/components/map/sitesMap.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilterSearch } from '@/components/FilterLink';
import {
  buildStyle,
  LAYER_CLUSTER,
  LAYER_HEAT,
  LAYER_POINT,
  layerVisibility,
  pointOpacity,
  pointStroke,
  SRC_CLUSTERED,
  SRC_RAW,
  type MapStyle,
} from '@/components/map/sitesLayers';
import { fmtHm, fmtInt, fmtPercent, plural } from '@/lib/format';
import { type Bounds, type SitePointProps, type SitesMapData } from '@/lib/mapSites';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { mapStyleUrl } from '@/theme/map';
import type { StyleLike } from '@/theme/map';
import { colors, type ColorScheme } from '@/theme/tokens';

/** Marge autour de la sélection au cadrage (px), zoom maximal et durée d'animation (ms). */
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 11;
const FIT_DURATION_MS = 150;
/** Zoom de centrage quand la sélection tient en un seul site. */
const SINGLE_SITE_ZOOM = 10;
/** Vue initiale : France métropolitaine. */
const INITIAL_CENTER: [number, number] = [2.5, 46.5];
const INITIAL_ZOOM = 4.5;
// Vite ne sait pas déduire l'URL du worker ESM de MapLibre 6 : on la lui donne.
if (typeof setWorkerUrl === 'function') setWorkerUrl(workerUrl);

const MOBILE_QUERY = '(max-width: 48em)';

type BaseStyle = StyleLike & { glyphs?: string };
/** Fond de secours si le style OpenFreeMap est injoignable : les points restent visibles. */
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

/** Recadre la carte sur une emprise (un seul site : centrage à un zoom fixe). */
function fitBoundsOn(map: MapLibreMap, bounds: Bounds): void {
  const [w, s, e, n] = bounds;
  if (w === e && s === n) {
    map.easeTo({ center: [w, s], zoom: SINGLE_SITE_ZOOM, duration: FIT_DURATION_MS });
  } else {
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: FIT_DURATION_MS },
    );
  }
}

interface PopupActions {
  href: string;
  onNavigate: () => void;
  onFilter: () => void;
}

/** Contenu du popup en éléments DOM (textContent uniquement : aucun nom n'est interprété comme HTML). */
/** Nombre de pseudos listés dans la fenêtre d'un site (comme l'infobulle de l'app Dash, mais bornée). */
const POPUP_MAX_PILOTS = 8;

function buildPopupContent(
  p: SitePointProps,
  pilotNames: readonly string[],
  actions: PopupActions,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'sr-map-popup';
  const add = (tag: string, text: string, className?: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    root.appendChild(el);
    return el;
  };
  add('strong', p.name, 'sr-map-popup-title');
  const total = p.parapente + p.paramoteur;
  add('div', `${fmtInt(p.flights)} vols · ${fmtHm(p.minutes)}`);
  add('div', `${fmtInt(p.pilots)} ${p.pilots > 1 ? 'pilotes' : 'pilote'}`);
  if (pilotNames.length > 0) {
    const shown = pilotNames.slice(0, POPUP_MAX_PILOTS).join(', ');
    const more = pilotNames.length - POPUP_MAX_PILOTS;
    add('div', more > 0 ? `${shown} et ${more} autre${more > 1 ? 's' : ''}` : shown, 'sr-map-popup-pilots');
  }
  if (total > 0)
    add(
      'div',
      `Parapente ${fmtPercent((100 * p.parapente) / total)} · Paramoteur ${fmtPercent((100 * p.paramoteur) / total)}`,
    );
  const row = document.createElement('div');
  row.className = 'sr-map-popup-actions';
  const link = document.createElement('a');
  link.href = actions.href;
  link.textContent = 'Voir le site';
  link.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    actions.onNavigate();
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Filtrer sur ce site';
  button.addEventListener('click', actions.onFilter);
  row.append(link, button);
  root.appendChild(row);
  return root;
}

function siteProps(f: MapGeoJSONFeature): SitePointProps {
  return f.properties as unknown as SitePointProps;
}

export interface SitesMapProps {
  /** Sites agrégés de la sélection courante (`aggregateSites`, calculés une fois par le parent). */
  data: SitesMapData;
  height: number;
  /** Affiche la heatmap des décollages à la place des cercles. */
  heatmap?: boolean;
  /** Appelé au clic sur un site (le popup s'ouvre aussi). */
  onSiteClick?: (siteId: number) => void;
  /** Site mis en avant (les autres sont atténués) ; sinon on suit le surlignage croisé. */
  highlightSiteId?: number | null;
  /** Recadre la carte sur la sélection quand elle change (défaut : oui). */
  fitToSelection?: boolean;
  /** Ouvre la fenêtre d'information au clic sur un site (défaut : oui). */
  popup?: boolean;
  /** Sites cerclés d'or (nouveautés), optionnel. */
  goldSiteIds?: readonly number[];
  /**
   * Cadrage demandé (boutons de zone) : la carte se recadre à chaque nouvel objet, même sur la même emprise.
   * Prioritaire sur `fitToSelection` tant qu'il est renseigné.
   */
  focus?: { bounds: Bounds } | null;
}

/**
 * Carte MapLibre des sites de la sélection (D12 : un point par site, jamais par vol).
 * Cercles groupés en grappes, proportionnels à √vols, colorés par activité dominante ;
 * fond OpenFreeMap recoloré selon le schéma clair/sombre.
 */
export function SitesMap({
  data,
  height,
  heatmap = false,
  onSiteClick,
  highlightSiteId,
  fitToSelection = true,
  popup: showPopup = true,
  goldSiteIds,
  focus,
}: SitesMapProps) {
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isMobile = useMediaQuery(MOBILE_QUERY) ?? false;
  const navigate = useNavigate();
  const search = useFilterSearch();
  const storeHighlight = useHighlightStore((s) => s.highlight);

  const effectiveHighlight =
    highlightSiteId !== undefined
      ? highlightSiteId
      : storeHighlight?.kind === 'site'
        ? storeHighlight.siteId
        : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [baseFailed, setBaseFailed] = useState(false);
  const baseRef = useRef<BaseStyle>(FALLBACK_STYLE);
  const appliedScheme = useRef<ColorScheme | null>(null);

  // Dernières valeurs, lues par les gestionnaires d'événements créés une seule fois.
  const live = useRef({
    data,
    heatmap,
    effectiveHighlight,
    scheme,
    onSiteClick,
    search,
    navigate,
    isMobile,
    showPopup,
    goldSiteIds,
  });
  useLayoutEffect(() => {
    live.current = {
      data,
      heatmap,
      effectiveHighlight,
      scheme,
      onSiteClick,
      search,
      navigate,
      isMobile,
      showPopup,
      goldSiteIds,
    };
  });

  // Création de la carte (une fois) et nettoyage.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let popup: Popup | null = null;

    const create = (base: BaseStyle) => {
      if (cancelled) return;
      baseRef.current = base;
      const l = live.current;
      appliedScheme.current = l.scheme;
      map = new MapLibreMap({
        container,
        style: buildStyle(base, l.scheme, l.data.collection, {
          heatmap: l.heatmap,
          highlightSiteId: l.effectiveHighlight,
          goldSiteIds: l.goldSiteIds,
        }),
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        cooperativeGestures: l.isMobile,
        attributionControl: { compact: false },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      const m = map;

      m.on('click', LAYER_CLUSTER, async (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const clusterId = f?.properties?.cluster_id as number | undefined;
        const src = m.getSource(SRC_CLUSTERED);
        if (!f || clusterId === undefined || !src || !('getClusterExpansionZoom' in src)) return;
        const zoom = await (
          src as { getClusterExpansionZoom(id: number): Promise<number> }
        ).getClusterExpansionZoom(clusterId);
        const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        m.easeTo({ center: [lon, lat], zoom, duration: FIT_DURATION_MS });
      });

      m.on('click', LAYER_POINT, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = siteProps(f);
        const { coordinates } = f.geometry as unknown as { coordinates: [number, number] };
        live.current.onSiteClick?.(p.siteId);
        if (!live.current.showPopup) return;
        popup?.remove();
        popup = new Popup({ closeButton: true, maxWidth: '280px', offset: 10 })
          .setLngLat(coordinates)
          .setDOMContent(
            buildPopupContent(
              p,
              live.current.data.rows.find((r) => r.siteId === p.siteId)?.pilotNames ?? [],
              {
                href: `/site/${p.siteId}${live.current.search}`,
                onNavigate: () =>
                  void live.current.navigate({ pathname: `/site/${p.siteId}`, search: live.current.search }),
                onFilter: () => {
                  useFiltersStore.getState().setFilters({ sites: [p.siteId] });
                  popup?.remove();
                },
              },
            ),
          )
          .addTo(m);
      });

      for (const layer of [LAYER_CLUSTER, LAYER_POINT]) {
        m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
      }
      m.on('mousemove', LAYER_POINT, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const { siteId } = siteProps(f);
        const cur = useHighlightStore.getState().highlight;
        if (cur?.kind !== 'site' || cur.siteId !== siteId)
          useHighlightStore.getState().setHighlight({ kind: 'site', siteId });
      });
      m.on('mouseleave', LAYER_POINT, () => {
        if (useHighlightStore.getState().highlight?.kind === 'site')
          useHighlightStore.getState().setHighlight(null);
      });

      m.once('load', () => {
        if (!cancelled) setReady(true);
      });
    };

    loadBaseStyle(live.current.scheme).then(
      (base) => create(base),
      () => {
        setBaseFailed(true);
        create(FALLBACK_STYLE);
      },
    );

    return () => {
      cancelled = true;
      popup?.remove();
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Changement de thème : on recharge le style sans recréer la carte.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || appliedScheme.current === scheme) return;
    let cancelled = false;
    appliedScheme.current = scheme;
    loadBaseStyle(scheme)
      .catch(() => baseRef.current)
      .then((base) => {
        if (cancelled || mapRef.current !== map) return;
        baseRef.current = base;
        const l = live.current;
        map.setStyle(
          buildStyle(base, scheme, l.data.collection, {
            heatmap: l.heatmap,
            highlightSiteId: l.effectiveHighlight,
            goldSiteIds: l.goldSiteIds,
          }) as MapStyle,
          { diff: false },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [scheme, ready]);

  // Données.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of [SRC_CLUSTERED, SRC_RAW]) {
      const src = map.getSource(id);
      if (src && 'setData' in src) (src as { setData(d: unknown): void }).setData(data.collection);
    }
  }, [data, ready]);

  // Mode cercles / heatmap et surlignage.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer(LAYER_POINT)) return;
    const vis = layerVisibility(heatmap);
    for (const id of [LAYER_CLUSTER, LAYER_POINT, 'sites-cluster-count'])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis.circles);
    map.setLayoutProperty(LAYER_HEAT, 'visibility', vis.heat);
    const opacity = pointOpacity(effectiveHighlight);
    map.setPaintProperty(LAYER_POINT, 'circle-opacity', ['*', 0.9, opacity] as never);
    map.setPaintProperty(LAYER_POINT, 'circle-stroke-opacity', opacity as never);
  }, [heatmap, effectiveHighlight, ready, scheme]);

  // Contour or des nouveautés.
  const goldKey = goldSiteIds ? goldSiteIds.join(',') : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer(LAYER_POINT)) return;
    const stroke = pointStroke(colors[scheme], live.current.goldSiteIds);
    map.setPaintProperty(LAYER_POINT, 'circle-stroke-color', stroke.color as never);
    map.setPaintProperty(LAYER_POINT, 'circle-stroke-width', stroke.width as never);
  }, [goldKey, ready, scheme]);

  // Cadrage demandé par le parent (boutons de zone).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    fitBoundsOn(map, focus.bounds);
  }, [focus, ready]);

  // Cadrage sur la sélection.
  const boundsKey = data.bounds ? data.bounds.join(',') : '';
  useEffect(() => {
    const map = mapRef.current;
    const bounds: Bounds | null = data.bounds;
    if (!ready || !map || !fitToSelection || !bounds) return;
    fitBoundsOn(map, bounds);
    // `boundsKey` résume `data.bounds`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, fitToSelection, ready]);

  // Redimensionnement quand la hauteur change.
  useEffect(() => {
    mapRef.current?.resize();
  }, [height]);

  return (
    <div>
      <div
        ref={containerRef}
        role="region"
        aria-label={`Carte des sites : ${plural(data.collection.features.length, 'site')} avec coordonnées`}
        style={{ height, width: '100%', borderRadius: 3, overflow: 'hidden' }}
        data-testid="sites-map"
      />
      {baseFailed && (
        <Text size="xs" c="dimmed" mt={4}>
          Fond de carte indisponible : seuls les sites sont affichés.
        </Text>
      )}
    </div>
  );
}
