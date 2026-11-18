import { SimpleGrid, Text } from '@mantine/core';
import { Section } from '@/components/common/Section';
import { Marker } from '@/components/common/Dumbbell';
import { KpiCard } from '@/components/common/KpiCard';
import type { SeriesVisual } from '@/components/compare/visuals';
import { deltasVsFirst, kpisForMode, seriesStats, type CompareMode, type CompareSeries } from '@/lib/compare';
import { EMPTY } from '@/lib/format';
import { useMemo } from 'react';

interface Props {
  mode: CompareMode;
  series: readonly CompareSeries[];
  visuals: readonly SeriesVisual[];
}

/** Une colonne par série ; les écarts (pastilles) sont calculés par rapport à la première colonne. */
export function CompareKpis({ mode, series, visuals }: Props) {
  const stats = useMemo(() => series.map((s) => seriesStats(s.flights)), [series]);
  const defs = kpisForMode(mode);
  const deltas = useMemo(
    () => Object.fromEntries(defs.map((d) => [d.id, deltasVsFirst(stats.map((s) => d.value(s)))])),
    [defs, stats],
  );
  const reference = series[0]?.label ?? '';
  return (
    <Section
      id="kpi"
      title="Côte à côte"
      subtitle={`Écarts en pourcentage par rapport à la première colonne (${reference}). Vols, heures et jours volés en vert ou rouge ; le reste est neutre, sans jugement.`}
    >
      <SimpleGrid cols={{ base: 1, xs: 2, md: Math.min(series.length, 4) }} spacing="lg" data-testid="compare-kpis">
        {series.map((s, i) => {
          const stat = stats[i];
          const visual = visuals[i];
          if (!stat || !visual) return null;
          return (
            <div key={s.id} data-series={s.id} style={{ minWidth: 0, borderTop: `3px solid ${visual.css}`, paddingTop: 8 }}>
              <Text fw={650} style={{ display: 'flex', alignItems: 'center', gap: 6, overflowWrap: 'anywhere' }}>
                <Marker shape={visual.shape} color={visual.css} size={12} />
                {s.label}
                {i === 0 && (
                  <Text component="span" size="xs" c="dimmed" fw={400} data-testid="kpi-reference">
                    référence
                  </Text>
                )}
              </Text>
              <div style={{ display: 'grid', gap: 14, marginTop: 10 }}>
                {defs.map((d) => {
                  const v = d.value(stat);
                  const delta = deltas[d.id]?.[i] ?? null;
                  return (
                    <KpiCard
                      key={d.id}
                      testId={`kpi-${d.id}`}
                      label={d.label}
                      value={v === null ? EMPTY : d.format(v)}
                      delta={i === 0 ? undefined : { value: delta, kind: d.kind }}
                      deltaLabel={`vs ${reference}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </SimpleGrid>
    </Section>
  );
}
