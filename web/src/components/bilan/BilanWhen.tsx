import { Text } from '@mantine/core';
import type { BarSeriesOption, EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import { useScheme } from '@/components/dashboard/shared';
import type { Flight } from '@/data/flight';
import { DAYS_LONG, DAYS_SHORT, fmtHours, fmtInt, MONTHS_SHORT, NBSP, plural } from '@/lib/format';
import { monthDistribution, seasonsBreakdown, SEASONS, weekHourMatrix } from '@/lib/rhythm';
import { favoriteSlot, hoursWindow, matrixLevel } from '@/lib/rhythmBlocks';
import { yearPatterns } from '@/theme/tokens';
import { colors, type ColorKey } from '@/theme/tokens';
import '@/components/rhythm/rhythm.css';
import './bilanB.css';

const SEASON_LABELS = { hiver: 'Hiver', printemps: 'Printemps', été: 'Été', automne: 'Automne' } as const;
const YEAR_KEYS: readonly ColorKey[] = ['y0', 'y1', 'y2'];

/** Teinte de la matrice : parapente seul, paramoteur seul, sinon les deux. */
function matrixKind(flights: readonly Flight[]): 'p' | 'm' | 'b' {
  const m = flights.some((f) => f.activity === 'paramoteur');
  const p = flights.some((f) => f.activity === 'parapente');
  if (m && p) return 'b';
  return m ? 'm' : 'p';
}

/** Matrice jour de la semaine × heure de décollage (mêmes règles et mêmes classes que `WeekHourMatrix`). */
function Matrix({ flights }: { flights: readonly Flight[] }) {
  const matrix = useMemo(() => weekHourMatrix(flights), [flights]);
  const kind = useMemo(() => matrixKind(flights), [flights]);
  const view = useMemo(() => {
    const [lo, hi] = hoursWindow(matrix.counts);
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const peak = Math.max(0, ...matrix.counts.flat());
    const dayTotals = matrix.counts.map((row) => hours.reduce((s, h) => s + (row[h] ?? 0), 0));
    const hourTotals = hours.map((h) => matrix.counts.reduce((s, row) => s + (row[h] ?? 0), 0));
    return { hours, peak, dayTotals, hourTotals, total: dayTotals.reduce((s, n) => s + n, 0) };
  }, [matrix]);
  const fav = useMemo(() => favoriteSlot(matrix), [matrix]);
  if (view.total === 0) return null;
  return (
    <div className="bb-block">
      <p className="bb-sub">Vols par jour de la semaine et heure de décollage</p>
      {fav && (
        <Text size="sm" fw={600} mb="xs" data-testid="bilan-matrix-favorite">
          Créneau favori : le {DAYS_LONG[fav.weekday]} entre {fav.hour}
          {NBSP}h et {fav.hour + 1}
          {NBSP}h ({plural(fav.n, 'vol')})
        </Text>
      )}
      <div className="sr-scroll">
        <table className="sr-mx" data-testid="bilan-week-hour-matrix">
          <caption style={{ position: 'absolute', left: -9999 }}>
            Nombre de vols par jour de la semaine et heure de décollage
          </caption>
          <thead>
            <tr>
              <td style={{ background: 'transparent' }} />
              {view.hours.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {DAYS_SHORT.map((day, d) => (
              <tr key={day}>
                <th scope="row">{day}</th>
                {view.hours.map((h) => {
                  const n = matrix.counts[d]?.[h] ?? 0;
                  const label = `${DAYS_LONG[d]} ${h}${NBSP}h : ${plural(n, 'vol')}`;
                  return (
                    <td
                      key={h}
                      title={label}
                      aria-label={label}
                      data-top={fav !== null && fav.weekday === d && fav.hour === h}
                      style={n > 0 ? { background: `var(--sr-cal-${kind}${matrixLevel(n, view.peak)})` } : undefined}
                    />
                  );
                })}
                <td className="sr-mx-total">{fmtInt(view.dayTotals[d] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {view.hours.map((h, i) => (
                <td key={h} className="sr-mx-total" style={{ textAlign: 'center', padding: 0 }}>
                  {fmtInt(view.hourTotals[i] ?? 0)}
                </td>
              ))}
              <td className="sr-mx-total">{fmtInt(view.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {matrix.missing > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          {plural(matrix.missing, 'vol')} sans heure de décollage connue, non placé{matrix.missing > 1 ? 's' : ''}.
        </Text>
      )}
    </div>
  );
}

/** Style CSS d'un échantillon de légende : couleur de l'année et hachures de son motif. */
function swatchStyle(index: number, color: string): React.CSSProperties {
  const angle = [null, 45, 135][index] ?? null;
  if (angle === null) return { background: color };
  return {
    background: `repeating-linear-gradient(${angle}deg, ${color} 0 3px, transparent 3px 6px)`,
    boxShadow: `inset 0 0 0 1px ${color}`,
  };
}

/** Vols par mois : l'année du bilan et les années comparées côte à côte (couleur + hachures). */
function MonthsChart() {
  const { year, flights, compareYears, compareFlights } = useBilan();
  const scheme = useScheme();
  const c = colors[scheme];
  const series = useMemo(
    () => [
      { year, flights },
      ...compareYears.map((y) => ({ year: y, flights: compareFlights.get(y) ?? [] })),
    ],
    [year, flights, compareYears, compareFlights],
  );
  const counts = useMemo(() => series.map((s) => monthDistribution(s.flights).flights), [series]);
  const hatch = useMemo(
    () => [null, Math.PI / 4, -Math.PI / 4] as const,
    [],
  );
  const colorOf = (i: number): string => c[YEAR_KEYS[i] ?? 'y2'];

  const option = useMemo<EChartsOption>(() => {
    const bars = series.map((s, i): BarSeriesOption => {
      const color = c[YEAR_KEYS[i] ?? 'y2'];
      const rotation = hatch[i] ?? null;
      return {
        name: String(s.year),
        type: 'bar',
        barMaxWidth: 16,
        color,
        itemStyle: {
          color,
          ...(rotation === null
            ? {}
            : {
                decal: {
                  symbol: 'rect',
                  symbolSize: 1,
                  rotation,
                  dashArrayX: [1, 0],
                  dashArrayY: [yearPatterns.hatchWidth, yearPatterns.hatchGap],
                  color: c.surface,
                },
              }),
        },
        data: counts[i] ?? [],
      };
    });
    return {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      legend: { show: false },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: [...MONTHS_SHORT] },
      yAxis: { type: 'value', name: 'vols', nameGap: 12, minInterval: 1 },
      series: bars,
    };
  }, [series, counts, hatch, c]);

  const table = useMemo<DataTable>(
    () => ({
      columns: ['Mois', ...series.map((s) => `${s.year} (vols)`)],
      rows: MONTHS_SHORT.map((m, i) => [m, ...counts.map((n) => n[i] ?? 0)]),
    }),
    [series, counts],
  );

  return (
    <div className="bb-block">
      <p className="bb-sub">Vols par mois</p>
      <ChartFrame
        testId="bilan-months-chart"
        option={option}
        height={260}
        table={table}
        ariaLabel={`Vols par mois en ${series.map((s) => s.year).join(', ')}`}
        footer={
          series.length > 1 ? (
            <div className="bb-legend">
              {series.map((s, i) => (
                <span key={s.year}>
                  <i className="bb-swatch" style={swatchStyle(i, colorOf(i))} aria-hidden="true" />
                  {s.year}
                </span>
              ))}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

/** Saisons : heures et vols (année du bilan), la dominante encadrée. */
function Seasons({ flights }: { flights: readonly Flight[] }) {
  const seasons = useMemo(() => seasonsBreakdown(flights), [flights]);
  const top = useMemo(() => {
    const best = SEASONS.reduce((a, b) => (seasons[b].minutes > seasons[a].minutes ? b : a), SEASONS[0] as (typeof SEASONS)[number]);
    return seasons[best].minutes > 0 ? best : null;
  }, [seasons]);
  return (
    <div className="bb-block">
      <p className="bb-sub">Saisons</p>
      <div className="bb-seasons" data-testid="bilan-seasons">
        {SEASONS.map((s) => (
          <div key={s} className="bb-season" data-top={s === top}>
            <div className="bb-season-name">
              {SEASON_LABELS[s]}
              {s === top ? ' · dominante' : ''}
            </div>
            <div className="bb-season-value">{seasons[s].minutes > 0 ? fmtHours(seasons[s].minutes) : `0${NBSP}h`}</div>
            <div className="bb-season-note">{plural(seasons[s].n, 'vol')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Quand : phrase du récit, matrice jour × heure, vols par mois (années comparées superposées) et saisons de l'année.
 * Les composants du tableau de bord portent leur propre section ; on réutilise ici leurs calculs et leurs classes.
 */
export function BilanWhen() {
  const { flights, story } = useBilan();
  return (
    <Section id="quand" title="Quand vole-t-on ?">
      {story.texts.quand && (
        <p className="bb-lead" data-testid="bilan-texte-quand">
          {story.texts.quand}
        </p>
      )}
      <Matrix flights={flights} />
      <MonthsChart />
      <Seasons flights={flights} />
    </Section>
  );
}
