import { SegmentedControl } from '@mantine/core';
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';
import { useMemo, useState } from 'react';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import { EmptyNote, eventIndex, useScheme } from '@/components/dashboard/shared';
import type { Flight } from '@/data/flight';
import { evolution, monthLabel, OTHERS_KEY, type StackMode } from '@/lib/dashboard';
import { fmtInt, fmtNum, NBSP } from '@/lib/format';
import { useHighlightStore } from '@/store/highlight';
import { categoricalColors, colors, disciplineColor } from '@/theme/tokens';

interface Props {
  /** Sélection courante (filtres globaux appliqués). */
  flights: readonly Flight[];
}

type Measure = 'heures' | 'vols';
type Mode = 'mensuel' | 'cumule';

const HEIGHT = 340;
const DIMMED = 0.25;

function formatValue(measure: Measure, value: number): string {
  return measure === 'heures' ? `${fmtNum(value, 1)}${NBSP}h` : fmtInt(value);
}

/** « Évolution dans le temps » : heures ou vols par mois, mensuel ou cumulé, empilés par activité ou par pilote. */
export function EvolutionChart({ flights }: Props) {
  const scheme = useScheme();
  const [measure, setMeasure] = useState<Measure>('heures');
  const [mode, setMode] = useState<Mode>('mensuel');
  const [stack, setStack] = useState<StackMode>('none');
  const [ownHover, setOwnHover] = useState(false);
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);

  const data = useMemo(() => evolution(flights, stack, mode === 'cumule'), [flights, stack, mode]);
  const c = colors[scheme];

  const seriesColors = useMemo(() => {
    const cat = categoricalColors(scheme);
    return data.series.map((s, i) => {
      if (stack === 'none') return c.accent;
      if (stack === 'activity')
        return disciplineColor(s.key === 'parapente' ? 'parapente' : 'paramoteur', scheme);
      return s.key === OTHERS_KEY ? c.flat : (cat[i] ?? c.flat);
    });
  }, [data.series, stack, scheme, c]);

  const monthHighlight = !ownHover && highlight?.kind === 'month' ? highlight : null;

  const option = useMemo<EChartsOption>(() => {
    const labels = data.months.map(monthLabel);
    const stacked = stack !== 'none';
    const series = data.series.map((s, i): BarSeriesOption | LineSeriesOption => {
      const values = measure === 'heures' ? s.hours : s.flights;
      const color = seriesColors[i] ?? c.accent;
      if (mode === 'cumule') {
        return {
          name: s.name,
          type: 'line',
          data: values,
          color,
          showSymbol: false,
          stack: stacked ? 'total' : undefined,
          areaStyle: { opacity: stacked ? 0.55 : 0.12 },
          lineStyle: { width: 2 },
        };
      }
      return {
        name: s.name,
        type: 'bar',
        data: values.map((value, k) => {
          const ym = data.months[k] ?? '';
          const dimmed =
            monthHighlight !== null &&
            ym !== `${monthHighlight.year}-${String(monthHighlight.month).padStart(2, '0')}`;
          return { value, itemStyle: { color, opacity: dimmed ? DIMMED : 1 } };
        }),
        stack: stacked ? 'total' : undefined,
        barMaxWidth: 24,
        color,
      };
    });
    return {
      grid: { left: 8, right: 16, top: stacked ? 40 : 16, bottom: 64, containLabel: true },
      legend: stacked ? { top: 0, left: 0, type: 'scroll' } : { show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: mode === 'cumule' ? 'cross' : 'line' },
        valueFormatter: (v) => (typeof v === 'number' ? formatValue(measure, v) : String(v ?? '')),
      },
      xAxis: { type: 'category', data: labels, axisLabel: { hideOverlap: true } },
      yAxis: {
        type: 'value',
        name: measure === 'heures' ? 'heures' : 'vols',
        nameGap: 12,
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false },
        { type: 'slider', xAxisIndex: 0, height: 22, bottom: 8 },
      ],
      series,
    };
  }, [data, stack, mode, measure, seriesColors, c, monthHighlight]);

  const table = useMemo<DataTable>(
    () => ({
      columns: ['Mois', ...data.series.map((s) => s.name)],
      rows: data.months.map((ym, k) => [
        monthLabel(ym),
        ...data.series.map((s) => formatValue(measure, (measure === 'heures' ? s.hours : s.flights)[k] ?? 0)),
      ]),
    }),
    [data, measure],
  );

  const onEvents = useMemo(
    () => ({
      mouseover: (p: unknown) => {
        const i = eventIndex(p);
        const ym = i === null ? undefined : data.months[i];
        if (!ym) return;
        setOwnHover(true);
        setHighlight({ kind: 'month', year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) });
      },
      mouseout: () => {
        setOwnHover(false);
        setHighlight(null);
      },
    }),
    [data.months, setHighlight],
  );

  const shapeKey = [
    mode,
    measure,
    stack,
    data.months[0],
    data.months.length,
    ...data.series.map((s) => s.key),
  ].join('|');
  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  return (
    <Section
      id="evolution"
      title="Évolution dans le temps"
      subtitle="Par mois ; les mois sans vol comptent zéro. Glisser le curseur du bas pour zoomer."
      actions={
        <>
          <SegmentedControl
            size="xs"
            aria-label="Mesure"
            value={measure}
            onChange={(v) => setMeasure(v as Measure)}
            data={[
              { value: 'heures', label: 'Heures' },
              { value: 'vols', label: 'Vols' },
            ]}
          />
          <SegmentedControl
            size="xs"
            aria-label="Mensuel ou cumulé"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            data={[
              { value: 'mensuel', label: 'Mensuel' },
              { value: 'cumule', label: 'Cumulé' },
            ]}
          />
          <SegmentedControl
            size="xs"
            aria-label="Empilement"
            value={stack}
            onChange={(v) => setStack(v as StackMode)}
            data={[
              { value: 'none', label: 'Aucun' },
              { value: 'activity', label: 'Par activité' },
              { value: 'pilot', label: 'Par pilote' },
            ]}
          />
        </>
      }
    >
      {data.months.length === 0 || first === undefined || last === undefined ? (
        <EmptyNote />
      ) : (
        <ChartFrame
          // Fusion de l'option (pas de remise à zéro) : un surlignage venu d'un autre bloc ne perd pas le zoom de
          // l'utilisateur. Un changement de forme (séries, mois) remonte le graphique pour éviter les séries fantômes.
          key={shapeKey}
          notMerge={false}
          option={option}
          height={HEIGHT}
          table={table}
          onEvents={onEvents}
          testId="evolution-chart"
          ariaLabel={`${measure === 'heures' ? 'Heures de vol' : 'Nombre de vols'} par mois, ${mode === 'cumule' ? 'cumulé' : 'mensuel'}, de ${monthLabel(first)} à ${monthLabel(last)}${stack === 'activity' ? ', par activité' : stack === 'pilot' ? ', par pilote' : ''}.`}
        />
      )}
    </Section>
  );
}
