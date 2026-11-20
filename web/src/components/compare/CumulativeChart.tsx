import type { EChartsOption, LineSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import type { SeriesVisual } from '@/components/compare/visuals';
import { EmptyNote, useScheme } from '@/components/dashboard/shared';
import { cumulativeCurves, type CompareMode, type CompareSeries } from '@/lib/compare';
import { fmtDate, fmtNum, MONTHS_SHORT, NBSP } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import { colors } from '@/theme/tokens';

interface Props {
  mode: CompareMode;
  series: readonly CompareSeries[];
  visuals: readonly SeriesVisual[];
  refDate: string;
}

const HEIGHT = 340;
const LONG_SPAN_DAYS = 900;
const MEDIUM_SPAN_DAYS = 200;

const fmtHours = (v: number): string => `${fmtNum(v, 1)}${NBSP}h`;

/** Libellé d'une graduation : l'axe porte un point par jour, on n'étiquette que les débuts de période. */
function tickLabel(iso: string, kind: 'date' | 'jour-annee', spanDays: number): string {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (kind === 'jour-annee' || spanDays <= MEDIUM_SPAN_DAYS) {
    if (day === 1) return MONTHS_SHORT[month - 1] ?? '';
    return '';
  }
  if (spanDays > LONG_SPAN_DAYS) return month === 1 && day === 1 ? iso.slice(0, 4) : '';
  return day === 1 ? `${MONTHS_SHORT[month - 1] ?? ''} ${iso.slice(2, 4)}` : '';
}

/** Date de l'infobulle : « 12 juillet » (jour de l'année) ou « 12 juillet 2025 ». */
const tipDate = (iso: string, kind: 'date' | 'jour-annee'): string =>
  kind === 'jour-annee' ? fmtDate(iso) : fmtDate(iso, { withYear: true });

/** Courbes d'heures cumulées superposées, réticule et infobulle communs : la valeur de chaque série à la date survolée. */
export function CumulativeChart({ mode, series, visuals, refDate }: Props) {
  const scheme = useScheme();
  const c = colors[scheme];
  const data = useMemo(() => cumulativeCurves(mode, series, refDate), [mode, series, refDate]);
  const empty = series.every((s) => s.flights.length === 0);

  const option = useMemo<EChartsOption>(() => {
    const spanDays = data.axis.length;
    const lines = data.series.map((s, i): LineSeriesOption => {
      const visual = visuals[i];
      return {
        name: visual?.label ?? s.id,
        type: 'line',
        data: s.values,
        showSymbol: false,
        symbol: 'none',
        color: visual?.color,
        lineStyle: { width: 2.5, color: visual?.color, type: visual?.dash ?? 'solid' },
        emphasis: { disabled: true },
      };
    });
    return {
      grid: { left: 8, right: 16, top: 16, bottom: mode === 'annees' ? 24 : 64, containLabel: true },
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
          }[];
          const iso = params[0]?.axisValue ?? '';
          const rows = params
            .map((p) => {
              const v = typeof p.value === 'number' ? fmtHours(p.value) : '–';
              const visual = visuals[p.seriesIndex ?? 0];
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${visual?.color ?? c.b};margin-right:6px"></span>${escapeHtml(p.seriesName ?? '')}</span><b>${v}</b></div>`;
            })
            .join('');
          return `<div style="font-weight:650;margin-bottom:4px">${escapeHtml(iso ? tipDate(iso, data.kind) : '')}</div>${rows}`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.axis,
        boundaryGap: false,
        axisTick: { show: false },
        axisLabel: { interval: 0, hideOverlap: true, formatter: (v: string) => tickLabel(v, data.kind, spanDays) },
        axisPointer: { show: true },
      },
      yAxis: { type: 'value', name: 'heures', nameGap: 12 },
      dataZoom:
        mode === 'annees'
          ? []
          : [
              { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false },
              { type: 'slider', xAxisIndex: 0, height: 22, bottom: 8, labelFormatter: '' },
            ],
      series: lines,
    };
  }, [data, visuals, mode, c.b]);

  const table = useMemo<DataTable>(() => {
    const rows: (string | number)[][] = [];
    data.axis.forEach((iso, i) => {
      const lastOfMonth = i === data.axis.length - 1 || data.axis[i + 1]?.slice(0, 7) !== iso.slice(0, 7);
      if (!lastOfMonth) return;
      rows.push([
        data.kind === 'jour-annee' ? `Fin ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? ''}` : `Fin ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`,
        ...data.series.map((s) => {
          const v = s.values[i];
          return v === null || v === undefined ? '–' : fmtHours(v);
        }),
      ]);
    });
    return { columns: ['Date', ...visuals.map((v) => v.label)], rows };
  }, [data, visuals]);

  const shapeKey = [mode, data.axis.length, ...series.map((s) => s.id)].join('|');
  return (
    <Section
      id="cumul"
      title="Heures cumulées"
      subtitle={
        mode === 'annees'
          ? 'Heures de vol cumulées depuis le 1er janvier de chaque année\u00a0; l’année en cours s’arrête à la date des données.'
          : 'Heures de vol cumulées sur la période. Le réticule donne la valeur de chaque série à la même date.'
      }
    >
      {empty ? (
        <EmptyNote />
      ) : (
        <ChartFrame
          key={shapeKey}
          testId="compare-cumul"
          option={option}
          height={HEIGHT}
          table={table}
          ariaLabel={`Heures cumulées de ${visuals.map((v) => v.label).join(', ')}`}
        />
      )}
    </Section>
  );
}
