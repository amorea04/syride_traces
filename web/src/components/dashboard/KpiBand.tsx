import { SimpleGrid } from '@mantine/core';
import { useMemo } from 'react';
import { KpiCard, type KpiDelta } from '@/components/common/KpiCard';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { kpiBand, type KpiId } from '@/lib/dashboard';
import type { Filters } from '@/lib/filters';
import { EMPTY, fmtDate, fmtHm, fmtInt, NBSP } from '@/lib/format';

interface Props {
  /** Sélection courante (filtres globaux appliqués). */
  flights: readonly Flight[];
  /** Tous les vols, pour calculer la période précédente. */
  allFlights: readonly Flight[];
  filters: Filters;
  /** Date de référence (`referenceDate`). */
  today: string;
}

const DELTA_KIND: Record<KpiId, KpiDelta['kind']> = {
  vols: 'volume',
  heures: 'volume',
  sites: 'neutre',
  pilotes: 'neutre',
  distance: 'neutre',
  plafond: 'neutre',
};

/**
 * Vue d'ensemble : six chiffres clés de la sélection. Une variation par rapport à la période
 * précédente équivalente (même durée juste avant) n'apparaît que si une période ou une année est filtrée
 * (masquée pour des années non contiguës).
 */
export function KpiBand({ flights, allFlights, filters, today }: Props) {
  const band = useMemo(
    () => kpiBand(allFlights, flights, filters, today),
    [allFlights, flights, filters, today],
  );
  const { current, deltas, previousPeriod, comparisonKind } = band;
  const delta = (id: KpiId): KpiDelta | undefined =>
    deltas ? { value: deltas[id], kind: DELTA_KIND[id] } : undefined;
  const empty = current.flights === 0;
  const deltaLabel = comparisonKind === 'annee' ? 'vs année précédente' : 'vs période précédente';
  const subtitle = previousPeriod
    ? `Variation par rapport ${comparisonKind === 'annee' ? 'à l’année précédente' : 'à la période précédente équivalente'}, du ${fmtDate(previousPeriod.from, { withYear: true })} au ${fmtDate(previousPeriod.to, { withYear: true })}.`
    : undefined;
  return (
    <Section id="vue-ensemble" title="Vue d’ensemble" subtitle={subtitle}>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="lg" verticalSpacing="md">
        <KpiCard
          label="Vols"
          value={fmtInt(current.flights)}
          delta={delta('vols')}
          deltaLabel={deltaLabel}
          testId="kpi-vols"
        />
        <KpiCard
          label="Heures de vol"
          value={fmtHm(current.minutes)}
          delta={delta('heures')}
          deltaLabel={deltaLabel}
          testId="kpi-heures"
        />
        <KpiCard
          label="Sites"
          value={fmtInt(current.sites)}
          delta={delta('sites')}
          deltaLabel={deltaLabel}
          testId="kpi-sites"
        />
        <KpiCard
          label="Pilotes"
          value={fmtInt(current.pilots)}
          delta={delta('pilotes')}
          deltaLabel={deltaLabel}
          testId="kpi-pilotes"
        />
        <KpiCard
          label="Distance cumulée"
          value={current.distanceKm === null ? EMPTY : `${fmtInt(current.distanceKm)}${NBSP}km`}
          delta={delta('distance')}
          deltaLabel={deltaLabel}
          testId="kpi-distance"
        />
        <KpiCard
          label="Plafond max"
          value={
            current.ceilingM === null || current.ceilingFlightKey === null ? (
              EMPTY
            ) : (
              <FilterLink to={`/vol/${current.ceilingFlightKey}`} inherit>
                {`${fmtInt(current.ceilingM)}${NBSP}m`}
              </FilterLink>
            )
          }
          delta={delta('plafond')}
          deltaLabel={deltaLabel}
          testId="kpi-plafond"
        />
      </SimpleGrid>
      {empty && (
        <div style={{ marginTop: 12 }}>
          <EmptyNote />
        </div>
      )}
    </Section>
  );
}
