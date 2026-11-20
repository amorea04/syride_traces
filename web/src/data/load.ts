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
    /** Fichier absent (404) ou remplacé par une page HTML de repli : le nom hashé est probablement périmé. */
    readonly missing = false,
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
    throw new DataLoadError(
      response.status === 404
        ? `Fichier introuvable\u00a0: ${relPath}`
        : `Chargement de ${relPath} : HTTP ${response.status}`,
      url,
      response.status,
      response.status === 404,
    );
  }
  // Un repli SPA mal configuré répond 200 avec index.html pour un fichier absent.
  if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    throw new DataLoadError(`Fichier introuvable\u00a0: ${relPath} (page HTML reçue)`, url, response.status, true);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new DataLoadError(`${relPath} n’est pas un JSON valide`, url, response.status);
  }
}

type DataChangedListener = () => void;
const dataChangedListeners = new Set<DataChangedListener>();

/** Appelle `listener` quand `meta.json` annonce de nouvelles données (`generated_at` différent). */
export function onDataChanged(listener: DataChangedListener): () => void {
  dataChangedListeners.add(listener);
  return () => dataChangedListeners.delete(listener);
}

/** Dernier meta chargé : sert à retrouver les noms hashés des insights. */
let currentMeta: MetaFile | null = null;

/** `meta.json`, toujours relu au serveur (pas de cache). */
export async function loadMeta(): Promise<MetaFile> {
  const meta = await fetchJson<MetaFile>('meta.json', { cache: 'no-store' });
  if (meta.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new DataLoadError(
      `Version de données ${String(meta.schema_version)} non prise en charge (attendue\u00a0: ${SUPPORTED_SCHEMA_VERSION})`,
      `${dataBase()}meta.json`,
    );
  }
  const changed = currentMeta !== null && currentMeta.generated_at !== meta.generated_at;
  currentMeta = meta;
  if (changed) {
    insightsCache.clear();
    for (const listener of dataChangedListeners) listener();
  }
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
  const fetchEntry = (meta: MetaFile): Promise<InsightsFile | null> => {
    const entry = meta.insights.find((i) => i.pilot === pilotSlug && i.year === year);
    return entry ? fetchJson<InsightsFile>(entry.file) : Promise.resolve(null);
  };
  const promise = (async () => {
    const meta = currentMeta ?? (await loadMeta());
    try {
      return await fetchEntry(meta);
    } catch (error) {
      if (!(error instanceof DataLoadError) || !error.missing) throw error;
      // Le nom hashé est peut-être périmé (nouveau déploiement) : on relit meta.json une seule fois.
      // `loadMeta` invalide les caches et prévient les écouteurs si `generated_at` a changé.
      const fresh = await loadMeta();
      if (fresh.generated_at === meta.generated_at) throw error;
      return fetchEntry(fresh);
    }
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
