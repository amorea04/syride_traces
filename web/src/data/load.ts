/**
 * Chargement des données statiques (`public/data/`). Aucune trace : D12.
 * `meta.json` n'est jamais mis en cache ; les autres fichiers portent un hash dans leur nom
 * (cache immuable côté serveur). Les insights sont chargés à la demande, avec un petit LRU.
 */
import { decodeFlights, type Flight } from '@/data/flight';
import type { InsightsFile, MetaFile, SitesFile, FlightsFile } from '@/data/schema.gen';
import { LruCache } from '@/lib/lru';

export type Site = SitesFile['sites'][number];

/** Version du contrat de données comprise par ce front. */
export const SUPPORTED_SCHEMA_VERSION = 1;
/** Nombre de fichiers d'insights gardés en mémoire. */
export const INSIGHTS_CACHE_SIZE = 8;

/** Base d'URL des données (suit `base` de Vite). */
export function dataBase(): string {
  return `${import.meta.env.BASE_URL}data/`;
}

export class DataLoadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

async function fetchJson<T>(relPath: string, init?: RequestInit): Promise<T> {
  const url = `${dataBase()}${relPath}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DataLoadError(`Impossible de joindre ${url}`, url);
  }
  if (!response.ok) {
    throw new DataLoadError(`Chargement de ${relPath} : HTTP ${response.status}`, url, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new DataLoadError(`${relPath} n'est pas un JSON valide`, url, response.status);
  }
}

/** Dernier meta chargé : sert à retrouver les noms hashés des insights. */
let currentMeta: MetaFile | null = null;

/** `meta.json`, toujours relu au serveur (pas de cache). */
export async function loadMeta(): Promise<MetaFile> {
  const meta = await fetchJson<MetaFile>('meta.json', { cache: 'no-store' });
  if (meta.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new DataLoadError(
      `Version de données ${String(meta.schema_version)} non prise en charge (attendue : ${SUPPORTED_SCHEMA_VERSION})`,
      `${dataBase()}meta.json`,
    );
  }
  if (currentMeta && currentMeta.generated_at !== meta.generated_at) insightsCache.clear();
  currentMeta = meta;
  return meta;
}

/** Vols décodés (nom hashé lu dans `meta.files.flights`). */
export async function loadFlights(meta?: MetaFile): Promise<Flight[]> {
  const m = meta ?? (await loadMeta());
  return decodeFlights(await fetchJson<FlightsFile>(m.files.flights));
}

export async function loadSites(meta?: MetaFile): Promise<Site[]> {
  const m = meta ?? (await loadMeta());
  return (await fetchJson<SitesFile>(m.files.sites)).sites;
}

const insightsCache = new LruCache<string, Promise<InsightsFile | null>>(INSIGHTS_CACHE_SIZE);

/**
 * Récit d'un pilote pour une année, ou `null` si le couple n'existe pas. Mis en cache en
 * mémoire (les requêtes simultanées sont partagées ; un échec n'est pas mémorisé).
 */
export function loadInsights(pilotSlug: string, year: number): Promise<InsightsFile | null> {
  const cacheKey = `${pilotSlug}-${year}`;
  const cached = insightsCache.get(cacheKey);
  if (cached) return cached;
  const promise = (async () => {
    const meta = currentMeta ?? (await loadMeta());
    const entry = meta.insights.find((i) => i.pilot === pilotSlug && i.year === year);
    if (!entry) return null;
    return fetchJson<InsightsFile>(entry.file);
  })();
  insightsCache.set(cacheKey, promise);
  promise.catch(() => {
    if (insightsCache.get(cacheKey) === promise) insightsCache.delete(cacheKey);
  });
  return promise;
}

/** Vide l'état mémorisé (tests). */
export function resetDataCaches(): void {
  insightsCache.clear();
  currentMeta = null;
}
