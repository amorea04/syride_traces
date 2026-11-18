import { SegmentedControl } from '@mantine/core';
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';
import { useMemo, useState } from 'react';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { KpiCard } from '@/components/common/KpiCard';
import { Section } from '@/components/common/Section';
import { EmptyNote, useScheme } from '@/components/dashboard/shared';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { fmtDuration, fmtHm, fmtInt, fmtNum, NBSP } from '@/lib/format';
import { careerBars } from '@/lib/pilots';
import { computeCareer } from '@/lib/records';
import { colors } from '@/theme/tokens';

type Measure = 'heures' | 'vols';
const HEIGHT = 300;
const STAR_PATH = 'path://M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L2 9h7z';

/** Carrière : barres empilées par année (heures ou vols, parapente et paramoteur), étoile sur la meilleure année, 4 KPI. */
export function CareerSection({ flights }: { flights: readonly Flight[] }) {
  const scheme = useScheme();
  const c = colors[scheme];
  const [measure, setMeasure] = useState<Measure>('heures');
  const bars = useMemo(() => careerBars(flights), [flights]);
  const lastYear = bars.years[bars.years.length - 1]?.year ?? 0;
  const career = useMemo(() => computeCareer(flights, lastYear), [flights, lastYear]);
  const best = measure === 'heures' ? bars.bestHoursYear : bars.bestFlightsYear;

  const value = (y: (typeof bars.years)[number], d: 'p' | 'm'): number =>
    measure === 'heures' ? (d === 'p' ? y.pMin : y.mMin) / 60 : d === 'p' ? y.pN : y.mN;
  const fmtValue = (v: number): string => (measure === 'heures' ? `${fmtNum(v, 1)}${NBSP}h` : fmtInt(v));

  const option = useMemo<EChartsOption>(() => {
    const labels = bars.years.map((y) => String(y.year));
    const totals = bars.years.map((y) => value(y, 'p') + value(y, 'm'));
    const stack = (name: string, d: 'p' | 'm', color: string): BarSeriesOption => ({
      name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 56,
      color,
      itemStyle: { color, borderRadius: 0 },
      data: bars.years.map((y) => value(y, d)),
    });
    const star: LineSeriesOption = {
      name: 'Meilleure année',
      type: 'line',
      data: bars.years.map((y, i) => (y.year === best ? (totals[i] ?? 0) : null)),
      symbol: STAR_PATH,
      symbolSize: 16,
      symbolOffset: [0, -14],
      itemStyle: { color: c.gold },
      lineStyle: { width: 0 },
      tooltip: { show: false },
      silent: true,
      z: 5,
    };
    return {
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v) => (typeof v === 'number' ? fmtValue(v) : String(v ?? '')),
      },
      xAxis: { type: 'category', data: labels },
      yAxis: { type: 'value', name: measure === 'heures' ? 'heures' : 'vols', nameGap: 12 },
      series: [stack('Parapente', 'p', c.p), stack('Paramoteur', 'm', c.m), star],
    };
    // `value` et `fmtValue` ne dépendent que de `measure`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, best, measure, c]);

  const table = useMemo<DataTable>(
    () => ({
      columns: ['Année', 'Parapente', 'Paramoteur', 'Total'],
      rows: bars.years.map((y) => [
        y.year,
        fmtValue(value(y, 'p')),
        fmtValue(value(y, 'm')),
        fmtValue(value(y, 'p') + value(y, 'm')),
      ]),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bars, measure],
  );

  const bestYearRow = bars.years.find((y) => y.year === best);
  return (
    <Section
      id="carriere"
      title="Carrière"
      subtitle={measure === 'heures' ? 'Heures de vol par année.' : 'Nombre de vols par année.'}
      actions={
        bars.years.length > 0 && (
          <SegmentedControl
            size="xs"
            aria-label="Mesure de la carrière"
            value={measure}
            onChange={(v) => setMeasure(v as Measure)}
            data={[
              { value: 'heures', label: 'Heures' },
              { value: 'vols', label: 'Vols' },
            ]}
          />
        )
      }
    >
      {bars.years.length === 0 ? (
        <EmptyNote />
      ) : (
        <>
          <ChartFrame
            testId="career-chart"
            option={option}
            height={HEIGHT}
            table={table}
            ariaLabel={`${measure === 'heures' ? 'Heures de vol' : 'Vols'} par année, parapente et paramoteur empilés`}
            footer={
              <div className="pl-legend">
                <span>
                  <i className="pl-dot" style={{ background: 'var(--sr-p)' }} aria-hidden="true" /> Parapente
                </span>
                <span>
                  <i className="pl-dot" style={{ background: 'var(--sr-m)' }} aria-hidden="true" /> Paramoteur
                </span>
                {bestYearRow && bars.years.length > 1 && (
                  <span data-testid="career-best">
                    <span className="pl-star" aria-hidden="true">
                      ★
                    </span>
                    Meilleure année : {bestYearRow.year} (
                    {measure === 'heures'
                      ? fmtHm(bestYearRow.pMin + bestYearRow.mMin)
                      : `${fmtInt(bestYearRow.pN + bestYearRow.mN)} vols`}
                    )
                  </span>
                )}
              </div>
            }
          />
          {career ? (
            <div className="pl-career-kpis" data-testid="career-kpis">
              <KpiCard
                label="Années actives"
                value={fmtInt(career.years.length)}
                note={`depuis ${career.firstDate.slice(0, 4)}`}
              />
              <KpiCard
                label="Vols"
                value={fmtInt(career.flights)}
                note={`${fmtInt(career.flights / career.years.length)} par an en moyenne`}
              />
              <KpiCard
                label="Heures de vol"
                value={fmtHm(career.minutes)}
                note={`${fmtDuration(career.minutes / Math.max(career.flights, 1))} par vol`}
              />
              <KpiCard
                label="Sites"
                value={fmtInt(career.sites)}
                note={career.distanceN > 0 ? `${fmtInt(career.distance)}${NBSP}km cumulés` : undefined}
              />
            </div>
          ) : (
            <p className="pl-legend" role="status">
              Les chiffres de carrière demandent au moins deux années de vol.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
