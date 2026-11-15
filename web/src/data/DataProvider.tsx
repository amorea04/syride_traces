import { Alert, Button, Container, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Flight } from '@/data/flight';
import { loadFlights, loadInsights, loadMeta, loadSites, onDataChanged, type Site } from '@/data/load';
import type { InsightsFile, MetaFile } from '@/data/schema.gen';

export interface AppData {
  meta: MetaFile;
  flights: Flight[];
  sites: Site[];
  /** Site par identifiant. */
  siteById: ReadonlyMap<number, Site>;
}

type Status = { state: 'loading' } | { state: 'error'; error: Error } | { state: 'ready'; data: AppData };

const DataContext = createContext<AppData | null>(null);

/** Données de l'application ; n'existe que sous `DataProvider`, qui n'affiche ses enfants qu'une fois tout chargé. */
export function useData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData doit être utilisé sous <DataProvider>');
  return data;
}

/** Charge meta, vols et sites une fois ; affiche squelettes pendant le chargement, message et « Réessayer » en cas d'erreur. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await loadMeta();
      const [flights, sites] = await Promise.all([loadFlights(meta), loadSites(meta)]);
      return { meta, flights, sites, siteById: new Map(sites.map((s) => [s.id, s])) } satisfies AppData;
    })().then(
      (data) => {
        if (!cancelled) setStatus({ state: 'ready', data });
      },
      (error: unknown) => {
        if (!cancelled)
          setStatus({ state: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  if (status.state === 'ready')
    return (
      <DataContext.Provider value={status.data}>
        <DataUpdatedBanner />
        {children}
      </DataContext.Provider>
    );
  if (status.state === 'error') return <DataError error={status.error} onRetry={retry} />;
  return <DataSkeleton />;
}

/** Bandeau discret affiché quand `meta.json` annonce des données plus récentes que celles chargées. */
function DataUpdatedBanner() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => onDataChanged(() => setUpdated(true)), []);
  if (!updated) return null;
  return (
    <Alert variant="light" color="gray" py={6} role="status" data-testid="data-updated">
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text size="sm">Les données ont été mises à jour.</Text>
        <Button variant="default" size="compact-xs" onClick={() => window.location.reload()}>
          Recharger
        </Button>
      </Group>
    </Alert>
  );
}

function DataSkeleton() {
  return (
    <Container size="lg" py="xl" role="status" aria-live="polite" aria-busy="true">
      <Text size="sm" c="dimmed" mb="md">
        Chargement des données…
      </Text>
      <Stack gap="md">
        <Skeleton height={36} width="40%" />
        <Group grow gap="md">
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </Group>
        <Skeleton height={260} />
      </Stack>
    </Container>
  );
}

function DataError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Container size="sm" py="xl">
      <Alert
        color="red"
        icon={<IconAlertTriangle size={18} />}
        title="Impossible de charger les données"
        role="alert"
      >
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{error.message}</Text>
          <Button variant="default" size="xs" onClick={onRetry}>
            Réessayer
          </Button>
        </Stack>
      </Alert>
    </Container>
  );
}

type InsightsState =
  { state: 'loading' } | { state: 'error'; error: Error } | { state: 'ready'; insights: InsightsFile | null };

/** Récit d'un pilote pour une année, chargé à la demande (`null` si le couple n'existe pas). */
export function useInsights(pilotSlug: string | undefined, year: number | undefined): InsightsState {
  const [result, setResult] = useState<{ key: string; state: InsightsState }>({
    key: '',
    state: { state: 'loading' },
  });
  const key = pilotSlug !== undefined && year !== undefined ? `${pilotSlug}-${year}` : '';

  useEffect(() => {
    if (pilotSlug === undefined || year === undefined) return;
    let cancelled = false;
    loadInsights(pilotSlug, year).then(
      (insights) => {
        if (!cancelled) setResult({ key, state: { state: 'ready', insights } });
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            key,
            state: { state: 'error', error: error instanceof Error ? error : new Error(String(error)) },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pilotSlug, year, key]);

  return useMemo(() => (result.key === key ? result.state : { state: 'loading' }), [result, key]);
}
