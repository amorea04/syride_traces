import { Stack, Text, Title } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CompareDumbbells } from '@/components/compare/CompareDumbbells';
import { CompareKpis } from '@/components/compare/CompareKpis';
import { CompareRhythm } from '@/components/compare/CompareRhythm';
import { CompareSelector } from '@/components/compare/CompareSelector';
import { CumulativeChart } from '@/components/compare/CumulativeChart';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { EmptyNote } from '@/components/dashboard/shared';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import {
  buildSeries,
  candidates as candidatesOf,
  comparePool,
  type CompareParams,
  parseCompareParams,
  pilotYears,
  resolveSelection,
  writeCompareParams,
  MIN_SERIES,
  type CompareMode,
} from '@/lib/compare';
import { referenceDate } from '@/lib/dashboard';
import type { FilterDimension } from '@/lib/filters';
import { useFilterSummary } from '@/store/useFilterSummary';
import { useFiltersStore } from '@/store/filters';

/** Dimensions des filtres globaux que le sélecteur de la page remplace, par mode. */
const REPLACED: Record<CompareMode, FilterDimension[]> = {
  pilotes: ['pilots'],
  annees: ['pilots', 'period'],
  sites: ['sites'],
};

/** Comparer (§5.6) : pilotes, années d'un pilote ou sites, synchronisés dans l'URL (`?mode=…&ids=…`). */
export function Compare() {
  const { meta, flights: all } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const [params, setParams] = useSearchParams();
  const { mode, ids } = useMemo(() => parseCompareParams(params), [params]);

  const pool = useMemo(() => comparePool(mode, all, filters), [mode, all, filters]);
  const selection = useMemo(() => resolveSelection(mode, ids, pool), [mode, ids, pool]);
  const candidates = useMemo(() => candidatesOf(mode, pool), [mode, pool]);
  const refDate = useMemo(() => referenceDate(meta.data_updated_at, all), [meta.data_updated_at, all]);
  const series = useMemo(
    () => (selection.valid ? buildSeries(mode, selection.ids, pool, refDate) : []),
    [selection, mode, pool, refDate],
  );
  const visuals = useSeriesVisuals(mode, series);
  const years = useMemo(
    () => (mode === 'annees' && selection.ids[0] ? pilotYears(pool, selection.ids[0]) : []),
    [mode, selection.ids, pool],
  );
  const reduced = useFilterSummary(REPLACED[mode]);

  const write = useCallback(
    (next: CompareParams) => setParams(writeCompareParams(params, next)),
    [params, setParams],
  );
  const onPilotChange = useCallback(
    (slug: string) => {
      const recent = pilotYears(pool, slug).slice(0, MIN_SERIES).reverse().map(String);
      write({ mode: 'annees', ids: [slug, ...recent] });
    },
    [pool, write],
  );

  return (
    <Stack gap="xl" data-testid="compare-page" data-mode={mode}>
      <title>{`Comparer · ${APP_NAME}`}</title>
      <div>
        <Title order={1} size="h2">
          Comparer
        </Title>
        <Text size="sm" c="dimmed">
          Valeurs côte à côte, sans classement.
          {reduced.length > 0 && <> Vue filtrée : {reduced.join(', ')}.</>}
        </Text>
      </div>

      <CompareSelector
        mode={mode}
        selection={selection}
        candidates={candidates}
        years={years}
        visuals={visuals}
        onModeChange={(m) => write({ mode: m, ids: null })}
        onIdsChange={(next) => write({ mode, ids: next })}
        onPilotChange={onPilotChange}
      />

      {pool.length === 0 ? (
        <EmptyNote />
      ) : selection.valid ? (
        <>
          <CompareKpis mode={mode} series={series} visuals={visuals} />
          <CumulativeChart mode={mode} series={series} visuals={visuals} refDate={refDate} />
          <CompareDumbbells series={series} visuals={visuals} />
          <CompareRhythm series={series} visuals={visuals} />
        </>
      ) : (
        <Text size="sm" role="status" data-testid="compare-problem">
          {selection.problem}
        </Text>
      )}
    </Stack>
  );
}
