import { Text } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { ChartFrame } from '@/components/common/ChartFrame';
import { HourMatrix } from '@/components/common/HourMatrix';
import { Section } from '@/components/common/Section';
import { useScheme } from '@/components/dashboard/shared';
import '@/components/rhythm/rhythm.css';
import type { Flight } from '@/data/flight';
import { fmtInt, MONTHS_LONG, MONTHS_SHORT, plural } from '@/lib/format';
import { monthByDiscipline, seasonalityMatrix } from '@/lib/sites';
import { colors } from '@/theme/tokens';

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

const MONTH_ROWS = MONTHS_SHORT.map((short, i) => ({ short, long: MONTHS_LONG[i] ?? short }));

/** Teinte de la matrice : parapente seul, paramoteur seul, sinon les deux. */
function kindOf(flights: readonly Flight[]): 'p' | 'm' | 'b' {
  const m = flights.some((f) => f.activity === 'paramoteur');
  const p = flights.some((f) => f.activity === 'parapente');
  if (m && p) return 'b';
  return m ? 'm' : 'p';
}

/** Saisonnalité d'un site : matrice mois × heure de décollage (4 niveaux, totaux en marge) et barres par mois. */
export function SiteSeasonality({ flights }: Props) {
  const scheme = useScheme();
  const matrix = useMemo(() => seasonalityMatrix(flights), [flights]);
  const kind = useMemo(() => kindOf(flights), [flights]);
  const byMonth = useMemo(() => monthByDiscipline(flights), [flights]);
  const placed = useMemo(() => matrix.hourTotals.reduce((s, n) => s + n, 0), [matrix]);

  const option = useMemo<EChartsOption>(() => {
    const c = colors[scheme];
    return {
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      legend: { top: 0, data: ['Parapente', 'Paramoteur'] },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: [...MONTHS_SHORT] },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        { name: 'Parapente', type: 'bar', stack: 'vols', data: byMonth.parapente, itemStyle: { color: c.p } },
        {
          name: 'Paramoteur',
          type: 'bar',
          stack: 'vols',
          data: byMonth.paramoteur,
          itemStyle: { color: c.m },
        },
      ],
    };
  }, [byMonth, scheme]);

  const table = useMemo(
    () => ({
      columns: ['Mois', 'Parapente', 'Paramoteur', 'Total'],
      rows: MONTHS_LONG.map((m, i) => [
        m,
        fmtInt(byMonth.parapente[i] ?? 0),
        fmtInt(byMonth.paramoteur[i] ?? 0),
        fmtInt(matrix.monthTotals[i] ?? 0),
      ]),
    }),
    [byMonth, matrix],
  );

  if (flights.length === 0) return null;

  return (
    <Section
      id="saisonnalite"
      title="Saisonnalité"
      subtitle="Nombre de vols par mois et heure de décollage, toutes années confondues ; plus la case est foncée, plus elle est chargée."
    >
      {placed === 0 ? (
        <Text size="sm" c="dimmed">
          Aucune heure de décollage connue pour ces vols.
        </Text>
      ) : (
        <HourMatrix
          testId="season-matrix"
          caption="Nombre de vols par mois et heure de décollage"
          rowHeading="Mois"
          rows={MONTH_ROWS}
          counts={matrix.counts}
          minutes={matrix.minutes}
          rowTotals={matrix.monthTotals}
          total={flights.length}
          kind={kind}
        />
      )}
      {matrix.missing > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          {plural(matrix.missing, 'vol')} sans heure de décollage connue, non placé
          {matrix.missing > 1 ? 's' : ''} dans la matrice.
        </Text>
      )}
      <Text fw={650} size="sm" mt="lg" mb={4}>
        Vols par mois
      </Text>
      <ChartFrame
        option={option}
        height={220}
        ariaLabel="Barres du nombre de vols par mois sur ce site, parapente et paramoteur empilés"
        table={table}
        testId="season-bars"
      />
    </Section>
  );
}
