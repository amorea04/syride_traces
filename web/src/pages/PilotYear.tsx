import { Alert, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { BilanActions } from '@/components/bilan/BilanActions';
import { BilanComparison } from '@/components/bilan/BilanComparison';
import { BilanContext, type BilanContextValue } from '@/components/bilan/BilanContext';
import { BilanData } from '@/components/bilan/BilanData';
import { BilanFlights } from '@/components/bilan/BilanFlights';
import { BilanGear } from '@/components/bilan/BilanGear';
import { BilanHeader } from '@/components/bilan/BilanHeader';
import { BilanOverview } from '@/components/bilan/BilanOverview';
import { BilanRecords } from '@/components/bilan/BilanRecords';
import { BilanRhythm } from '@/components/bilan/BilanRhythm';
import { BilanStory } from '@/components/bilan/BilanStory';
import { BilanToc } from '@/components/bilan/BilanToc';
import { BilanWhen } from '@/components/bilan/BilanWhen';
import { BilanWhere } from '@/components/bilan/BilanWhere';
import { FilterLink } from '@/components/FilterLink';
import { APP_NAME } from '@/components/navigation';
import { useData, useInsights } from '@/data/DataProvider';
import {
  parseCompareYears,
  pilotFlights,
  pilotYears,
  writeCompareYears,
  yearFlights,
} from '@/lib/bilan';
import { referenceDate } from '@/lib/dashboard';
import { useFilterSummary } from '@/store/useFilterSummary';
import { useFiltersStore } from '@/store/filters';

const DISCIPLINE_LABEL = { tout: 'toutes disciplines', parapente: 'parapente', paramoteur: 'paramoteur' } as const;

/** Page sobre pour un pilote ou une année introuvable. */
function NotFound({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs" data-testid="bilan-not-found">
      <title>{`${title} · ${APP_NAME}`}</title>
      <Title order={1} size="h2">
        {title}
      </Title>
      <Text size="sm">{children}</Text>
    </Stack>
  );
}

/** Liens vers les bilans disponibles d'un pilote. */
function YearLinks({ slug, years }: { slug: string; years: readonly number[] }) {
  return (
    <Group gap="xs" component="span">
      {years.map((y) => (
        <FilterLink key={y} to={`/pilote/${slug}/${y}`}>
          {y}
        </FilterLink>
      ))}
    </Group>
  );
}

/**
 * Bilan pilote × année (§5.4 bis, phase 5B) : le rapport HTML en version interactive.
 * Seul le filtre global « activité » s'applique (discipline du récit) ; l'année vient de l'URL, les années
 * comparées du paramètre `comparer`.
 */
export function PilotYear() {
  const { slug = '', annee = '' } = useParams();
  const year = /^\d{4}$/.test(annee) ? Number(annee) : null;
  const { meta, flights: all } = useData();
  const discipline = useFiltersStore((s) => s.filters.activity);
  const ignored = useFilterSummary(['activity']);
  const [params, setParams] = useSearchParams();

  const availableYears = useMemo(() => pilotYears(all, slug), [all, slug]);
  const pilot = useMemo(() => all.find((f) => f.pilotSlug === slug)?.pilot, [all, slug]);
  const insightsState = useInsights(pilot && year !== null ? slug : undefined, year ?? undefined);
  const refDate = useMemo(() => referenceDate(meta.data_updated_at, all), [meta.data_updated_at, all]);

  const history = useMemo(() => pilotFlights(all, slug, discipline), [all, slug, discipline]);
  const compareYears = useMemo(
    () => (year === null ? [] : parseCompareYears(params, availableYears, year)),
    [params, availableYears, year],
  );
  const setCompareYears = useCallback(
    (years: readonly number[]) => {
      if (year === null) return;
      setParams((prev) => writeCompareYears(prev, years, availableYears, year), { replace: true });
    },
    [setParams, availableYears, year],
  );

  const insights = insightsState.state === 'ready' ? insightsState.insights : null;
  const value = useMemo<BilanContextValue | null>(() => {
    if (!insights || pilot === undefined || year === null) return null;
    const story = insights.by_disc[discipline];
    const flights = yearFlights(history, year, insights.cutoff);
    if (!story || flights.length === 0) return null;
    const compareFlights = new Map(compareYears.map((y) => [y, yearFlights(history, y)] as const));
    return {
      pilot,
      slug,
      year,
      discipline,
      flights,
      history,
      compareYears,
      compareFlights,
      setCompareYears,
      availableYears,
      story,
      insights,
      cutoff: insights.cutoff,
      ongoing: insights.cutoff < `${year}-12-31`,
      refDate,
    };
  }, [insights, pilot, year, discipline, history, compareYears, setCompareYears, availableYears, slug, refDate]);

  if (pilot === undefined) {
    return (
      <NotFound title="Pilote introuvable">
        Aucun pilote ne correspond à « {slug} ». <FilterLink to="/pilotes">Voir la liste des pilotes</FilterLink>
      </NotFound>
    );
  }
  if (year === null || !availableYears.includes(year)) {
    return (
      <NotFound title={`Pas de bilan ${annee} pour ${pilot}`}>
        {pilot} n’a aucun vol en {annee}. Bilans disponibles : <YearLinks slug={slug} years={availableYears} />
      </NotFound>
    );
  }
  if (insightsState.state === 'loading') {
    return (
      <Stack gap="md" data-testid="bilan-loading" aria-busy="true">
        <Skeleton height={220} radius="md" />
        <Skeleton height={140} radius="md" />
        <Skeleton height={320} radius="md" />
      </Stack>
    );
  }
  if (insightsState.state === 'error') {
    return (
      <Alert color="red" title="Impossible de charger le bilan" role="alert" data-testid="bilan-error">
        {insightsState.error.message}
      </Alert>
    );
  }
  if (!value) {
    return (
      <NotFound title={`Bilan ${year} · ${pilot}`}>
        Aucun vol en {DISCIPLINE_LABEL[discipline]} en {year}. Change de discipline dans les filtres, ou choisis une
        autre année : <YearLinks slug={slug} years={availableYears} />
      </NotFound>
    );
  }

  return (
    <BilanContext.Provider value={value}>
      <Stack gap="xl" data-testid="bilan-page" data-slug={slug} data-year={year}>
        <title>{`Bilan ${year} · ${pilot} · ${APP_NAME}`}</title>
        <BilanHeader />
        {ignored.length > 0 && (
          <Text size="sm" c="dimmed" data-testid="bilan-ignored-filters">
            Le bilan porte sur toute l’année et ne tient compte que de la discipline ; filtres ignorés ici :{' '}
            {ignored.join(', ')}.
          </Text>
        )}
        <BilanToc />
        <BilanActions />
        <BilanOverview />
        <BilanStory />
        <BilanRhythm />
        <BilanWhen />
        <BilanWhere />
        <BilanGear />
        <BilanRecords />
        <BilanComparison />
        <BilanFlights />
        <BilanData />
      </Stack>
    </BilanContext.Provider>
  );
}
