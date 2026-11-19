import type { EChartsOption, LineSeriesOption, ScatterSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { YearSwatch } from '@/components/bilan/YearSwatch';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { useScheme } from '@/components/dashboard/shared';
import { cumulativeCurves, type CompareSeries } from '@/lib/compare';
import { milestonePoints } from '@/lib/bilanOverview';
import { fmtDate, fmtNum, MONTHS_SHORT, NBSP } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import { colors } from '@/theme/tokens';
import './bilanA.css';

const HEIGHT = 320;
const fmtHoursText = (v: number): string => `${fmtNum(v, 1)}${NBSP}h`;

/**
 * Heures cumulées de l'année du bilan (arrêtée à la coupure) superposées aux années comparées (entières), sur un
 * axe « jour de l'année », réticule commun et losanges sur les jalons (or pour les records et nouveautés).
 */
export function BilanCumulative() {
  const { year, flights, compareYears, compareFlights, story, cutoff } = useBilan();
  const scheme = useScheme();
  const c = colors[scheme];

  const series = useMemo<CompareSeries[]>(
    () => [
      { id: String(year), label: String(year), flights, span: null },
      ...compareYears.map((y) => ({ id: String(y), label: String(y), flights: compareFlights.get(y) ?? [], span: null })),
    ],
    [year, flights, compareYears, compareFlights],
  );
  const visuals = useSeriesVisuals('annees', series);
  const data = useMemo(() => cumulativeCurves('annees', series, cutoff), [series, cutoff]);
  const points = useMemo(() => {
    const main = data.series[0];
    return main ? milestonePoints(story.milestones, data.axis, main.values) : [];
  }, [data, story.milestones]);

  const option = useMemo<EChartsOption>(() => {
    const lines = data.series.map(
      (s, i): LineSeriesOption => ({
        name: visuals[i]?.label ?? s.id,
        type: 'line',
        data: s.values,
        showSymbol: false,
        symbol: 'none',
        color: visuals[i]?.color,
        lineStyle: { width: i === 0 ? 3 : 2.5, color: visuals[i]?.color, type: visuals[i]?.dash ?? 'solid' },
        emphasis: { disabled: true },
      }),
    );
    const diamonds: ScatterSeriesOption = {
      name: 'Jalons',
      type: 'scatter',
      z: 5,
      silent: true,
      data: points.map((p) => ({
        value: [p.axis, p.hours],
        symbol: p.gold ? 'diamond' : 'circle',
        symbolSize: p.gold ? 13 : 6,
        itemStyle: p.gold
          ? { color: c.gold, borderColor: c.surface, borderWidth: 1 }
          : { color: c.surface, borderColor: c.muted, borderWidth: 1.5 },
      })),
    };
    const titlesByAxis = new Map(points.map((p) => [p.axis, p]));
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 24, containLabel: true },
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', snap: true },
        formatter: (raw) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as {
            axisValue?: string;
            seriesName?: string;
            value?: unknown;
            seriesIndex?: number;
            seriesType?: string;
          }[];
          const iso = params[0]?.axisValue ?? '';
          const rows = params
            .filter((p) => p.seriesType === 'line')
            .map((p) => {
              const v = typeof p.value === 'number' ? fmtHoursText(p.value) : '–';
              const color = visuals[p.seriesIndex ?? 0]?.color ?? c.b;
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px"></span>${escapeHtml(p.seriesName ?? '')}</span><b>${v}</b></div>`;
            })
            .join('');
          const milestone = titlesByAxis.get(iso);
          const marks = milestone
            ? milestone.titles
                .map((t) => `<div style="margin-top:4px;color:${milestone.gold ? c['gold-text'] : c.muted}">◆ ${escapeHtml(t)}</div>`)
                .join('')
            : '';
          return `<div style="font-weight:650;margin-bottom:4px">${escapeHtml(iso ? fmtDate(iso) : '')}</div>${rows}${marks}`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.axis,
        boundaryGap: false,
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          hideOverlap: true,
          formatter: (v: string) => (v.slice(8, 10) === '01' ? (MONTHS_SHORT[Number(v.slice(5, 7)) - 1] ?? '') : ''),
        },
        axisPointer: { show: true },
      },
      yAxis: { type: 'value', name: 'heures', nameGap: 12 },
      series: [...lines, diamonds],
    };
  }, [data, visuals, points, c]);

  const table = useMemo<DataTable>(() => {
    const rows: (string | number)[][] = [];
    data.axis.forEach((iso, i) => {
      const lastOfMonth = i === data.axis.length - 1 || data.axis[i + 1]?.slice(0, 7) !== iso.slice(0, 7);
      if (!lastOfMonth) return;
      rows.push([
        `Fin ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? ''}`,
        ...data.series.map((s) => {
          const v = s.values[i];
          return v === null || v === undefined ? '–' : fmtHoursText(v);
        }),
      ]);
    });
    return { columns: ['Date', ...visuals.map((v) => v.label)], rows };
  }, [data, visuals]);

  const shapeKey = series.map((s) => s.id).join('|');
  return (
    <ChartFrame
      key={shapeKey}
      testId="bilan-cumul"
      option={option}
      height={HEIGHT}
      table={table}
      ariaLabel={`Heures cumulées de ${visuals.map((v) => v.label).join(', ')} sur l’année, avec ${points.length} jalons`}
      footer={
        <div className="bl-cumul-key">
          {visuals.map((v) => (
            <span key={v.id}>
              <YearSwatch css={v.css} dash={v.dash} />
              {v.label}
              {v.id === String(year) && cutoff < `${year}-12-31` ? ` (à date du ${fmtDate(cutoff)})` : ''}
            </span>
          ))}
          {points.some((p) => p.gold) && (
            <span>
              <span style={{ color: 'var(--sr-gold)' }} aria-hidden="true">
                ◆
              </span>
              records et nouveautés
            </span>
          )}
        </div>
      }
    />
  );
}
