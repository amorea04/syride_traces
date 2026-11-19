import { useMemo } from 'react';
import { Dumbbell, type DumbbellRow, type DumbbellSeries } from '@/components/common/Dumbbell';
import { Section } from '@/components/common/Section';
import type { SeriesVisual } from '@/components/compare/visuals';
import { DUMBBELL_METRICS, seriesStats, type CompareSeries } from '@/lib/compare';

interface Props {
  series: readonly CompareSeries[];
  visuals: readonly SeriesVisual[];
}

/** Haltères par métrique : chaque ligne a sa propre échelle, du plus petit au plus grand des séries. */
export function CompareDumbbells({ series, visuals }: Props) {
  const stats = useMemo(() => series.map((s) => seriesStats(s.flights)), [series]);
  const dbSeries = useMemo<DumbbellSeries[]>(
    () => visuals.map((v) => ({ id: v.id, label: v.label, color: v.css, shape: v.shape, dash: v.dash })),
    [visuals],
  );
  const rows = useMemo<DumbbellRow[]>(
    () =>
      DUMBBELL_METRICS.map((m) => ({
        id: m.id,
        label: m.label,
        values: stats.map((s) => m.value(s)),
        format: m.format,
      })),
    [stats],
  );
  return (
    <Section
      id="halteres"
      title="Métrique par métrique"
      subtitle="Chaque ligne a sa propre échelle : le point le plus à gauche est la plus petite valeur, le plus à droite la plus grande. Les vols sans mesure (valeur ≤ 0) sont ignorés dans les moyennes."
    >
      <Dumbbell
        testId="compare-dumbbells"
        series={dbSeries}
        rows={rows}
        ariaLabel={`Comparaison par métrique de ${visuals.map((v) => v.label).join(', ')}`}
      />
    </Section>
  );
}
