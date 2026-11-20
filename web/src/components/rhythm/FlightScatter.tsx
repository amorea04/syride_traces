import { SegmentedControl, Text, useComputedColorScheme } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilterSearch } from '@/components/FilterLink';
import { ChartFrame } from '@/components/common/ChartFrame';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDateNumeric, fmtDuration, fmtInt, fmtNum, NBSP, plural } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import { SCATTER_LARGE_THRESHOLD, scatterPoints, type ScatterPoint, type ScatterY } from '@/lib/rhythmBlocks';
import { colors } from '@/theme/tokens';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/** Lignes du tableau « Voir les données » : les vols les plus hauts (le nuage complet n'a pas de forme tabulaire lisible). */
const TABLE_ROWS = 100;
const DISCIPLINES = [
  { activity: 'parapente', name: 'Parapente', color: 'p' },
  { activity: 'paramoteur', name: 'Paramoteur', color: 'm' },
] as const;

const Y_META: Record<ScatterY, { label: string; unit: string; format: (v: number) => string }> = {
  plafond: { label: 'Plafond', unit: 'm', format: (v) => `${fmtInt(v)}${NBSP}m` },
  distance: { label: 'Distance', unit: 'km', format: (v) => `${fmtNum(v, 1)}${NBSP}km` },
};

/**
 * Bloc « Durée et plafond » : nuage durée × plafond (bascule « × distance »), un point par vol, couleur = discipline.
 * Un clic sur un point ouvre la fiche du vol. Au-delà de 3 000 points, ECharts passe en mode `large` (tous les points
 * restent tracés, sans animation ni infobulle par point groupé).
 */
export function FlightScatter({ flights }: Props) {
  const scheme = useComputedColorScheme('light');
  const navigate = useNavigate();
  const search = useFilterSearch();
  const [yKey, setYKey] = useState<ScatterY>('plafond');
  const { points, missing } = useMemo(() => scatterPoints(flights, yKey), [flights, yKey]);
  const series = useMemo(
    () => DISCIPLINES.map((d) => points.filter((p) => p.flight.activity === d.activity)),
    [points],
  );
  const meta = Y_META[yKey];
  const large = points.length > SCATTER_LARGE_THRESHOLD;

  const option = useMemo<EChartsOption>(() => {
    const c = colors[scheme];
    return {
      grid: { left: 56, right: 16, top: 24, bottom: 44 },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10 },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (raw: unknown) => {
          const p = raw as { seriesIndex: number; dataIndex: number };
          const point: ScatterPoint | undefined = series[p.seriesIndex]?.[p.dataIndex];
          if (!point) return '';
          const f = point.flight;
          return (
            `<b>${escapeHtml(f.pilot)}</b>, ${fmtDateNumeric(f.date)}<br/>` +
            `${escapeHtml(f.site ?? EMPTY)}<br/>` +
            `Durée ${fmtDuration(point.x)}<br/>${meta.label} ${meta.format(point.y)}`
          );
        },
      },
      xAxis: {
        type: 'value',
        name: 'Durée (h)',
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { formatter: (v: number | string) => fmtNum(Number(v) / 60, Number(v) % 60 === 0 ? 0 : 1) },
        interval: 60,
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: `${meta.label} (${meta.unit})`,
        nameGap: 12,
        axisLabel: { formatter: (v: number | string) => fmtInt(Number(v)) },
      },
      series: DISCIPLINES.map((d, i) => ({
        type: 'scatter' as const,
        name: d.name,
        large,
        largeThreshold: SCATTER_LARGE_THRESHOLD,
        symbolSize: 6,
        itemStyle: { color: c[d.color], opacity: 0.6 },
        emphasis: { itemStyle: { opacity: 1, borderColor: c.text, borderWidth: 1 } },
        data: (series[i] ?? []).map((p) => [p.x, p.y]),
      })),
    };
  }, [series, scheme, large, meta]);

  const tableRows = useMemo(
    () =>
      [...points]
        .sort((a, b) => b.y - a.y)
        .slice(0, TABLE_ROWS)
        .map((p) => [
          fmtDateNumeric(p.flight.date),
          p.flight.pilot,
          p.flight.site ?? EMPTY,
          fmtDuration(p.x),
          meta.format(p.y),
        ]),
    [points, meta],
  );

  const onEvents = useMemo(
    () => ({
      click: (raw: unknown) => {
        const p = raw as { seriesIndex?: number; dataIndex?: number };
        if (p.seriesIndex === undefined || p.dataIndex === undefined) return;
        const point = series[p.seriesIndex]?.[p.dataIndex];
        if (point) void navigate({ pathname: `/vol/${point.flight.key}`, search });
      },
    }),
    [series, navigate, search],
  );

  const title = 'Durée et plafond';
  if (flights.length === 0) {
    return (
      <Section id="nuage" title={title}>
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  return (
    <Section
      id="nuage"
      title={title}
      subtitle="Un point par vol&nbsp;: un clic ouvre la fiche du vol."
      actions={
        <>
          <CoverageNotice flights={flights} measure={yKey} />
          <SegmentedControl
            size="xs"
            aria-label="Mesure en ordonnée"
            value={yKey}
            onChange={(v) => setYKey(v as ScatterY)}
            data={[
              { value: 'plafond', label: '× plafond' },
              { value: 'distance', label: '× distance' },
            ]}
          />
        </>
      }
    >
      {points.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucun vol avec durée et {meta.label.toLowerCase()} connues.
        </Text>
      ) : (
        <ChartFrame
          option={option}
          height={340}
          testId="flight-scatter"
          ariaLabel={`Nuage de points\u00a0: durée du vol en abscisse, ${meta.label.toLowerCase()} en ordonnée, ${plural(points.length, 'vol')} représentés${missing > 0 ? `, ${plural(missing, 'vol')} sans la mesure` : ''}.`}
          onEvents={onEvents}
          table={{
            columns: ['Date', 'Pilote', 'Site', 'Durée', meta.label],
            rows: tableRows,
          }}
          footer={
            <Text size="xs" c="dimmed" mt={4}>
              {plural(points.length, 'vol')} tracé{points.length > 1 ? 's' : ''}
              {missing > 0 ? `, ${plural(missing, 'vol')} sans durée ou sans ${meta.label.toLowerCase()}` : ''}
              {large ? ' (mode grand volume)' : ''}. Le tableau liste les {TABLE_ROWS} valeurs les plus hautes.
            </Text>
          }
        />
      )}
    </Section>
  );
}
