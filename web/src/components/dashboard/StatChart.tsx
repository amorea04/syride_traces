import { Button, Group, Select } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import { EMPTY_MESSAGE, EmptyNote, eventIndex, useScheme } from '@/components/dashboard/shared';
import type { Flight } from '@/data/flight';
import {
  formatMetricValue,
  isHorizontalAxis,
  STAT_METRICS,
  STAT_TOP_N,
  statBars,
  type StatBar,
} from '@/lib/dashboard';
import { fmtInt } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import { metricById, type MetricId } from '@/lib/metrics';
import { AXES, AXIS_IDS, groupFlights, type AxisId } from '@/lib/stats';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore, type Highlight } from '@/store/highlight';
import { colors } from '@/theme/tokens';

interface Props {
  /** Sélection courante (filtres globaux appliqués). */
  flights: readonly Flight[];
  defaultMetric?: MetricId;
  defaultAxis?: AxisId;
}

const DIMMED = 0.25;
const HORIZONTAL_ROW_PX = 26;
const VERTICAL_HEIGHT = 300;

function sameTarget(h: Highlight | null, bar: StatBar): boolean {
  const b = bar.highlight;
  if (!h || !b || h.kind !== b.kind) return true;
  if (h.kind === 'pilot' && b.kind === 'pilot') return h.pilotSlug === b.pilotSlug;
  if (h.kind === 'site' && b.kind === 'site') return h.siteId === b.siteId;
  if (h.kind === 'wing' && b.kind === 'wing') return h.wing === b.wing;
  return true;
}

/** « Répartitions » : une statistique (19) selon un axe (8) ; un clic sur une barre ajoute le filtre correspondant. */
export function StatChart({ flights, defaultMetric = 'nb_vols', defaultAxis = 'annee' }: Props) {
  const scheme = useScheme();
  const [metricId, setMetricId] = useState<MetricId>(defaultMetric);
  const [axis, setAxis] = useState<AxisId>(defaultAxis);
  const [showAll, setShowAll] = useState(false);
  const [ownHover, setOwnHover] = useState(false);
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const setFilters = useFiltersStore((s) => s.setFilters);

  const metric = metricById(metricId);
  const horizontal = isHorizontalAxis(axis);
  const rows = useMemo(() => groupFlights(flights, axis), [flights, axis]);
  const { bars, total, hidden } = useMemo(
    () => statBars(rows, metricId, axis, flights, showAll ? null : STAT_TOP_N),
    [rows, metricId, axis, flights, showAll],
  );
  const effectiveHighlight = ownHover ? null : highlight;
  const clickable = bars.some((b) => b.target !== null);
  const c = colors[scheme];

  const height = horizontal ? Math.max(180, bars.length * HORIZONTAL_ROW_PX + 40) : VERTICAL_HEIGHT;

  const option = useMemo<EChartsOption>(() => {
    const data = bars.map((b) => ({
      value: b.value,
      itemStyle: { color: c.accent, opacity: sameTarget(effectiveHighlight, b) ? 1 : DIMMED },
    }));
    const labels = bars.map((b) => b.label);
    const valueAxis = { type: 'value' as const, splitLine: { lineStyle: { color: c.line } } };
    const categoryAxis = {
      type: 'category' as const,
      data: labels,
      axisLabel: { interval: 0, hideOverlap: true, width: horizontal ? 120 : undefined, overflow: 'truncate' as const },
      ...(horizontal ? { inverse: true } : {}),
    };
    return {
      grid: { left: 8, right: horizontal ? 56 : 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const i = eventIndex(p);
          const bar = i === null ? undefined : bars[i];
          return bar ? `${escapeHtml(bar.label)}<br/>${formatMetricValue(metric, bar.value)}` : '';
        },
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: [
        {
          type: 'bar',
          data,
          barMaxWidth: horizontal ? 18 : 40,
          cursor: clickable ? 'pointer' : 'default',
          label: {
            show: horizontal || bars.length <= 12,
            position: horizontal ? 'right' : 'top',
            formatter: (p) => {
              const i = eventIndex(p);
              const bar = i === null ? undefined : bars[i];
              return bar ? formatMetricValue(metric, bar.value) : '';
            },
          },
        },
      ],
    };
  }, [bars, c, effectiveHighlight, horizontal, metric, clickable]);

  const table = useMemo<DataTable>(
    () => ({
      columns: [AXES[axis].label, metric.label],
      rows: bars.map((b) => [b.label, formatMetricValue(metric, b.value)]),
    }),
    [bars, axis, metric],
  );

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const i = eventIndex(p);
        const target = i === null ? null : bars[i]?.target;
        if (target) setFilters(target);
      },
      mouseover: (p: unknown) => {
        const i = eventIndex(p);
        const h = i === null ? null : (bars[i]?.highlight ?? null);
        if (!h) return;
        setOwnHover(true);
        setHighlight(h);
      },
      mouseout: () => {
        setOwnHover(false);
        setHighlight(null);
      },
    }),
    [bars, setFilters, setHighlight],
  );

  const hint = clickable ? ' Cliquer sur une barre ajoute le filtre correspondant.' : '';
  return (
    <Section
      id="repartitions"
      title="Répartitions"
      subtitle={`${metric.label}, par ${AXES[axis].label.toLowerCase()}.${hint}`}
      actions={
        <>
          <Select
            size="xs"
            aria-label="Statistique"
            data={STAT_METRICS.map((m) => ({ value: m.id, label: m.label }))}
            value={metricId}
            onChange={(v) => v && setMetricId(v as MetricId)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            w={{ base: '100%', sm: 270 }}
          />
          <Select
            size="xs"
            aria-label="Axe"
            data={AXIS_IDS.map((id) => ({ value: id, label: AXES[id].label }))}
            value={axis}
            onChange={(v) => {
              if (!v) return;
              setAxis(v as AxisId);
              setShowAll(false);
            }}
            allowDeselect={false}
            w={{ base: '100%', sm: 190 }}
          />
        </>
      }
    >
      {flights.length === 0 || bars.length === 0 ? (
        <EmptyNote>
          {flights.length === 0 ? EMPTY_MESSAGE : 'Aucune valeur pour cette statistique.'}
        </EmptyNote>
      ) : (
        <ChartFrame
            option={option}
            height={height}
            table={table}
            onEvents={onEvents}
            testId="stat-chart"
            ariaLabel={`Diagramme en barres : ${metric.label} par ${AXES[axis].label.toLowerCase()}, ${fmtInt(total)} catégories${hidden > 0 ? `, ${fmtInt(bars.length)} affichées` : ''}.`}
            footer={
              horizontal && total > STAT_TOP_N ? (
                <Group mt={4}>
                  <Button variant="subtle" size="compact-xs" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? `Afficher le top ${STAT_TOP_N}` : `Tout afficher (${fmtInt(total)})`}
                  </Button>
                </Group>
              ) : undefined
            }
        />
      )}
    </Section>
  );
}
