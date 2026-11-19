import { Text, useComputedColorScheme } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { ChartFrame } from '@/components/common/ChartFrame';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { fmtDuration, fmtInt, fmtNum, fmtOrDash, fmtPercent, NBSP } from '@/lib/format';
import { DURATION_BIN_LABELS, durationStats, type MedianValue } from '@/lib/records';
import { colors } from '@/theme/tokens';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

function MedianTile({
  label,
  median,
  format,
  total,
}: {
  label: string;
  median: MedianValue;
  format: (v: number) => string;
  total: number;
}) {
  return (
    <div className="sr-tile">
      <div className="sr-tile-label">{label}</div>
      <div className="sr-tile-value">{fmtOrDash(median.value, format)}</div>
      {median.count < total && median.value !== null && (
        <div className="sr-tile-note">sur {fmtInt(median.count)} vols mesurés</div>
      )}
    </div>
  );
}

/** Bloc « Durées » : histogramme des vols par tranche de durée (tranche médiane en accent) et médianes de durée, plafond, vitesse max, distance. */
export function DurationHistogram({ flights }: Props) {
  const scheme = useComputedColorScheme('light');
  const stats = useMemo(() => durationStats(flights), [flights]);
  const total = flights.length;

  const option = useMemo<EChartsOption>(() => {
    const c = colors[scheme];
    return {
      grid: { left: 40, right: 12, top: 16, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => `${fmtInt(Number(v))} vols`,
      },
      xAxis: { type: 'category', data: [...DURATION_BIN_LABELS], axisTick: { show: false } },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { formatter: (v: number | string) => fmtInt(Number(v)) },
      },
      series: [
        {
          type: 'bar',
          name: 'Vols',
          barMaxWidth: 56,
          emphasis: { focus: 'self' },
          data: stats.bins.map((n, i) => ({
            value: n,
            itemStyle: { color: i === stats.medianBin ? c.accent : c.y2 },
          })),
          label: {
            show: true,
            position: 'top',
            formatter: (p: { value?: unknown }) => fmtInt(Number(p.value)),
          },
        },
      ],
    };
  }, [stats, scheme]);

  if (total === 0) {
    return (
      <Section id="durees" title="Durées">
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  const { medians } = stats;
  const medianLabel = stats.medianBin === null ? null : DURATION_BIN_LABELS[stats.medianBin];
  return (
    <Section
      id="durees"
      title="Durées"
      subtitle={
        medianLabel ? `Le vol médian se situe dans la tranche « ${medianLabel} » (en accent).` : undefined
      }
      actions={<CoverageNotice flights={flights} measure="plafond" />}
    >
      <ChartFrame
        option={option}
        height={220}
        testId="duration-histogram"
        ariaLabel={`Histogramme du nombre de vols par tranche de durée : ${DURATION_BIN_LABELS.map((l, i) => `${l} ${fmtInt(stats.bins[i] ?? 0)}`).join(', ')}.`}
        table={{
          columns: ['Durée', 'Vols', 'Part'],
          rows: DURATION_BIN_LABELS.map((l, i) => [
            l,
            fmtInt(stats.bins[i] ?? 0),
            fmtPercent(((stats.bins[i] ?? 0) / total) * 100),
          ]),
        }}
      />
      <div className="sr-tiles" style={{ marginTop: 10 }} data-testid="duration-medians">
        <MedianTile label="Durée médiane" median={medians.duree} format={fmtDuration} total={total} />
        <MedianTile
          label="Plafond médian"
          median={medians.plafond}
          format={(v) => `${fmtInt(v)}${NBSP}m`}
          total={total}
        />
        <MedianTile
          label="Vitesse max médiane"
          median={medians.vitesseMax}
          format={(v) => `${fmtNum(v, 0)}${NBSP}km/h`}
          total={total}
        />
        <MedianTile
          label="Distance médiane"
          median={medians.distance}
          format={(v) => `${fmtNum(v, 1)}${NBSP}km`}
          total={total}
        />
      </div>
    </Section>
  );
}
