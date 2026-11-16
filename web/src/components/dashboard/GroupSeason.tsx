import { Text } from '@mantine/core';
import type { EChartsOption, LineSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import { EmptyNote, useScheme } from '@/components/dashboard/shared';
import type { Flight } from '@/data/flight';
import { dateOfPosition, seasonGap, seasonPhrase, stepValueAt } from '@/lib/dashboard';
import { fmtDate, fmtHm, fmtNum, MONTHS_SHORT } from '@/lib/format';
import { colors, yearPatterns } from '@/theme/tokens';

interface Props {
  /** Vols suivant les filtres globaux SAUF la période (le bloc est « à date »). */
  flights: readonly Flight[];
  /** Date de référence (`referenceDate`). */
  today: string;
}

const CHART_HEIGHT = 280;
const DASH = yearPatterns.y1.dasharray.split(' ').map(Number);

/** « La saison du groupe » : heures cumulées de l'année de référence contre la précédente, et l'écart à date. */
export function GroupSeason({ flights, today }: Props) {
  const scheme = useScheme();
  const gap = useMemo(() => seasonGap(flights, today), [flights, today]);
  const phrase = seasonPhrase(gap);
  const hasData = flights.length > 0;
  const c = colors[scheme];

  const option = useMemo<EChartsOption>(() => {
    const line = (
      name: string,
      data: [number, number][],
      color: string,
      dashed: boolean,
    ): LineSeriesOption => ({
      name,
      type: 'line',
      step: 'end',
      showSymbol: false,
      data,
      color,
      z: dashed ? 2 : 3,
      lineStyle: { width: dashed ? 2 : 2.75, type: dashed ? DASH : 'solid' },
    });
    return {
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, left: 0, data: [String(gap.year), String(gap.previousYear)] },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', snap: false },
        formatter: (raw) => {
          const items = Array.isArray(raw) ? raw : [raw];
          const x = Number((items[0] as { axisValue?: number } | undefined)?.axisValue ?? 0);
          const lines = [fmtDate(dateOfPosition(x, gap.year))];
          for (const [name, curve] of [
            [String(gap.year), gap.curve],
            [String(gap.previousYear), gap.previousCurve],
          ] as const) {
            if (name === String(gap.year) && x > gap.xToday) continue;
            lines.push(`${name} : ${fmtHm(stepValueAt(curve, x) * 60)}`);
          }
          return lines.join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 1 / 12,
        axisLabel: { formatter: (v: number) => MONTHS_SHORT[Math.round(v * 12)] ?? '', hideOverlap: true },
        splitLine: { show: false },
        axisPointer: { show: true },
      },
      yAxis: { type: 'value', axisPointer: { show: true } },
      series: [
        line(String(gap.previousYear), gap.previousCurve, c.y1, true),
        line(String(gap.year), gap.curve, c.y0, false),
      ],
    };
  }, [gap, c]);

  const table = useMemo<DataTable>(() => {
    const rows: (string | number)[][] = [];
    for (let m = 1; m <= 12; m += 1) {
      const x = m / 12;
      rows.push([
        MONTHS_SHORT[m - 1] ?? '',
        x <= gap.xToday + 1e-9 ? fmtNum(stepValueAt(gap.curve, x), 1) : '–',
        fmtNum(stepValueAt(gap.previousCurve, x), 1),
      ]);
    }
    return {
      columns: ['Fin de mois', `${gap.year} (h)`, `${gap.previousYear} (h)`],
      rows,
    };
  }, [gap]);

  return (
    <Section
      id="saison-groupe"
      title="La saison du groupe"
      subtitle={`Heures cumulées depuis le 1er janvier, ${gap.year} contre ${gap.previousYear}, à la même date.`}
    >
      {hasData ? (
        <>
          <Text fw={650} mb="xs" data-testid="season-phrase">
            {phrase}
          </Text>
          <ChartFrame
            option={option}
            height={CHART_HEIGHT}
            table={table}
            testId="season-chart"
            ariaLabel={`Heures de vol cumulées du groupe depuis le 1er janvier : ${gap.year}, ${fmtHm(gap.minutes)}, contre ${gap.previousYear}, ${fmtHm(gap.previousMinutes)} à la même date. ${phrase}`}
          />
        </>
      ) : (
        <EmptyNote />
      )}
    </Section>
  );
}
