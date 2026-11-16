/**
 * Agrégation de la sélection par site pour la carte (§5.1 point 11). D12 : la position d'un vol
 * est celle de son site, jamais une coordonnée par vol.
 */
import type { Flight } from '@/data/flight';

/** Part minimale d'une activité pour qu'un site soit dit « parapente » ou « paramoteur ». */
export const DOMINANT_SHARE = 0.8;

export type DominantActivity = 'parapente' | 'paramoteur' | 'tout';

/** Sous-ensemble d'un site dont on a besoin (compatible avec `Site` de `@/data/load`). */
export interface SiteLike {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
}

export interface SiteAgg {
  siteId: number;
  name: string;
  flights: number;
  minutes: number;
  pilots: number;
  /** Pseudos des pilotes du site, du plus au moins assidu (pour la fenêtre du site, pas dans le GeoJSON). */
  pilotNames: string[];
  parapente: number;
  paramoteur: number;
  dominant: DominantActivity;
  lat: number | null;
  lon: number | null;
}

/** Propriétés d'un point de la carte. */
export type SitePointProps = Omit<SiteAgg, 'lat' | 'lon' | 'pilotNames'>;

export interface SiteFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: SitePointProps;
}

export interface SiteCollection {
  type: 'FeatureCollection';
  features: SiteFeature[];
}

/** Emprise [ouest, sud, est, nord]. */
export type Bounds = [number, number, number, number];

export interface SitesMapData {
  collection: SiteCollection;
  /** Tous les sites de la sélection (avec ou sans coordonnées), triés par vols décroissants. */
  rows: SiteAgg[];
  /** Sites de la sélection sans coordonnées (absents de la carte). */
  sitesWithoutCoords: number;
  /** Vols de ces sites. */
  flightsWithoutCoords: number;
  /** Vols sans site rattaché. */
  flightsWithoutSite: number;
  /** Cadrage par défaut : emprise de l'essentiel des vols (voir `FOCUS_TAIL`). */
  bounds: Bounds | null;
  /** Emprise de tous les sites localisés de la sélection. */
  allBounds: Bounds | null;
}

export function dominantActivity(parapente: number, paramoteur: number): DominantActivity {
  const total = parapente + paramoteur;
  if (total === 0) return 'tout';
  if (parapente / total >= DOMINANT_SHARE) return 'parapente';
  if (paramoteur / total >= DOMINANT_SHARE) return 'paramoteur';
  return 'tout';
}

/** Emprise des points ; null s'il n'y en a pas. */
/**
 * Cadrage par défaut : on coupe `FOCUS_TAIL` des vols de chaque côté, en longitude et en latitude
 * (quantiles pondérés par le nombre de vols). Quelques vols à Tenerife, au Maroc ou dans les
 * Dolomites ne dézooment donc pas toute la carte ; ils restent visibles en dézoomant.
 */
export const FOCUS_TAIL = 0.05;

/** Plus petite et plus grande valeur une fois retirée une part `tail` du poids de chaque côté. */
function weightedRange(items: readonly { v: number; w: number }[], tail: number): [number, number] {
  const sorted = [...items].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((acc, it) => acc + it.w, 0);
  const cut = tail * total;
  let lo = sorted[0]!.v;
  let cum = 0;
  for (const it of sorted) {
    cum += it.w;
    if (cum > cut) {
      lo = it.v;
      break;
    }
  }
  let hi = sorted[sorted.length - 1]!.v;
  cum = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    cum += sorted[i]!.w;
    if (cum > cut) {
      hi = sorted[i]!.v;
      break;
    }
  }
  return [lo, hi];
}

/** Emprise qui contient l'essentiel des vols (voir `FOCUS_TAIL`), ou null sans site localisé. */
export function focusBounds(features: readonly SiteFeature[], tail = FOCUS_TAIL): Bounds | null {
  if (features.length === 0) return null;
  const [w, e] = weightedRange(
    features.map((f) => ({ v: f.geometry.coordinates[0], w: f.properties.flights })),
    tail,
  );
  const [s, n] = weightedRange(
    features.map((f) => ({ v: f.geometry.coordinates[1], w: f.properties.flights })),
    tail,
  );
  return [w, s, e, n];
}

export function boundsOf(points: readonly (readonly [number, number])[]): Bounds | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

export function aggregateSites(
  flights: readonly Flight[],
  siteById: ReadonlyMap<number, SiteLike>,
): SitesMapData {
  interface Acc {
    flights: number;
    minutes: number;
    /** Par slug : pseudo affiché et nombre de vols. */
    pilots: Map<string, { name: string; count: number }>;
    parapente: number;
    paramoteur: number;
  }
  const bySite = new Map<number, Acc>();
  let flightsWithoutSite = 0;
  for (const f of flights) {
    if (f.siteId === null || !siteById.has(f.siteId)) {
      flightsWithoutSite += 1;
      continue;
    }
    let acc = bySite.get(f.siteId);
    if (!acc) {
      acc = { flights: 0, minutes: 0, pilots: new Map(), parapente: 0, paramoteur: 0 };
      bySite.set(f.siteId, acc);
    }
    acc.flights += 1;
    acc.minutes += f.durationMin ?? 0;
    const p = acc.pilots.get(f.pilotSlug);
    if (p) p.count += 1;
    else acc.pilots.set(f.pilotSlug, { name: f.pilot, count: 1 });
    if (f.activity === 'parapente') acc.parapente += 1;
    else acc.paramoteur += 1;
  }

  const rows: SiteAgg[] = [];
  for (const [siteId, acc] of bySite) {
    const site = siteById.get(siteId);
    if (!site) continue;
    rows.push({
      siteId,
      name: site.name,
      flights: acc.flights,
      minutes: acc.minutes,
      pilots: acc.pilots.size,
      pilotNames: [...acc.pilots.values()]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
        .map((p) => p.name),
      parapente: acc.parapente,
      paramoteur: acc.paramoteur,
      dominant: dominantActivity(acc.parapente, acc.paramoteur),
      lat: site.lat,
      lon: site.lon,
    });
  }
  rows.sort((a, b) => b.flights - a.flights || a.name.localeCompare(b.name, 'fr'));

  const features: SiteFeature[] = [];
  let sitesWithoutCoords = 0;
  let flightsWithoutCoords = 0;
  for (const row of rows) {
    const { lat, lon } = row;
    const props: SitePointProps = {
      siteId: row.siteId,
      name: row.name,
      flights: row.flights,
      minutes: row.minutes,
      pilots: row.pilots,
      parapente: row.parapente,
      paramoteur: row.paramoteur,
      dominant: row.dominant,
    };
    if (lat === null || lon === null) {
      sitesWithoutCoords += 1;
      flightsWithoutCoords += props.flights;
      continue;
    }
    features.push({
      type: 'Feature',
      id: props.siteId,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: props,
    });
  }
  return {
    collection: { type: 'FeatureCollection', features },
    rows,
    sitesWithoutCoords,
    flightsWithoutCoords,
    flightsWithoutSite,
    bounds: focusBounds(features),
    allBounds: boundsOf(features.map((f) => f.geometry.coordinates)),
  };
}
