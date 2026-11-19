import { Text } from '@mantine/core';
import type { BarSeriesOption, EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { YearSwatch } from '@/components/bilan/YearSwatch';
import { ChartFrame, type DataTable } from '@/components/common/ChartFrame';
import { HourMatrix } from '@/components/common/HourMatrix';
import { Section } from '@/components/common/Section';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { useScheme } from '@/components/dashboard/shared';
import type { Flight } from '@/data/flight';
import type { CompareSeries } from '@/lib/compare';
import { DAYS_LONG, DAYS_SHORT, fmtHours, MONTHS_SHORT, NBSP, plural } from '@/lib/format';
import { monthDistribution, seasonsBreakdown, SEASONS, weekHourMatrix } from '@/lib/rhythm';
import { favoriteSlot } from '@/lib/rhythmBlocks';
import { colors, yearPatterns } from '@/theme/tokens';
import '@/components/rhythm/rhythm.css';
import './bilanB.css';

const SEASON_LABELS = { hiver: 'Hiver', printemps: 'Printemps', été: 'Été', automne: 'Automne' } as const;

const WEEK_ROWS = DAYS_SHORT.map((short, i) => ({ short, long: DAYS_LONG[i] ?? short }));

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
  const placed = useMemo(
    () => matrix.counts.reduce((s, row) => s + row.reduce((a, n) => a + n, 0), 0),
    [matrix],
  );
  const fav = useMemo(() => favoriteSlot(matrix), [matrix]);
  if (placed === 0) return null;
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
      <HourMatrix
        testId="bilan-week-hour-matrix"
        caption="Nombre de vols par jour de la semaine et heure de décollage"
        rowHeading="Jour"
        rows={WEEK_ROWS}
        counts={matrix.counts}
        minutes={matrix.minutes}
        kind={kind}
        top={fav ? { row: fav.weekday, hour: fav.hour } : null}
      />
      {matrix.missing > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          {plural(matrix.missing, 'vol')} sans heure de décollage connue, non placé
          {matrix.missing > 1 ? 's' : ''}.
        </Text>
      )}
    </div>
  );
}

/** Vols par mois : l'année du bilan et les années comparées côte à côte (couleur + hachures). */
function MonthsChart() {
  const { year, flights, compareYears, compareFlights } = useBilan();
  const scheme = useScheme();
  const c = colors[scheme];
  const series = useMemo<CompareSeries[]>(
    () => [
      { id: String(year), label: String(year), flights, span: null },
      ...compareYears.map((y) => ({
        id: String(y),
        label: String(y),
        flights: compareFlights.get(y) ?? [],
        span: null,
      })),
    ],
    [year, flights, compareYears, compareFlights],
  );
  const visuals = useSeriesVisuals('annees', series);
  const counts = useMemo(() => series.map((s) => monthDistribution(s.flights).flights), [series]);

  const option = useMemo<EChartsOption>(() => {
    const bars = visuals.map((v, i): BarSeriesOption => {
      const color = v.color;
      // Hachures de l'année (jetons y0 à y2) ; au-delà, couleur seule.
      const angle =
        v.colorKey === 'y0' || v.colorKey === 'y1' || v.colorKey === 'y2'
          ? yearPatterns[v.colorKey].hatchAngle
          : null;
      const rotation = angle === null ? null : (angle * Math.PI) / 180;
      return {
        name: v.label,
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
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: [...MONTHS_SHORT] },
      yAxis: { type: 'value', name: 'vols', nameGap: 12, minInterval: 1 },
      series: bars,
    };
  }, [visuals, counts, c]);

  const table = useMemo<DataTable>(
    () => ({
      columns: ['Mois', ...series.map((s) => `${s.label} (vols)`)],
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
        ariaLabel={`Vols par mois en ${series.map((s) => s.label).join(', ')}`}
        footer={
          series.length > 1 ? (
            <div className="bb-legend">
              {visuals.map((v) => (
                <span key={v.id}>
                  <YearSwatch css={v.css} dash={v.dash} />
                  {v.label}
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
    const best = SEASONS.reduce(
      (a, b) => (seasons[b].minutes > seasons[a].minutes ? b : a),
      SEASONS[0] as (typeof SEASONS)[number],
    );
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
            <div className="bb-season-value">
              {seasons[s].minutes > 0 ? fmtHours(seasons[s].minutes) : `0${NBSP}h`}
            </div>
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
