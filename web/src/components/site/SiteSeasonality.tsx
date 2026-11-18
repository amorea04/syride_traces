import { Text } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { ChartFrame } from '@/components/common/ChartFrame';
import { Section } from '@/components/common/Section';
import { useScheme } from '@/components/dashboard/shared';
import '@/components/rhythm/rhythm.css';
import type { Flight } from '@/data/flight';
import { fmtInt, MONTHS_LONG, MONTHS_SHORT, NBSP, plural } from '@/lib/format';
import { hoursWindow, matrixLevel } from '@/lib/rhythmBlocks';
import { monthByDiscipline, seasonalityMatrix } from '@/lib/sites';
import { colors } from '@/theme/tokens';

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

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
  const view = useMemo(() => {
    const [lo, hi] = hoursWindow(matrix.counts);
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const peak = Math.max(0, ...matrix.counts.flat());
    const placed = matrix.hourTotals.reduce((s, n) => s + n, 0);
    return { hours, peak, placed };
  }, [matrix]);

  const option = useMemo<EChartsOption>(() => {
    const c = colors[scheme];
    return {
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      legend: { top: 0, data: ['Parapente', 'Paramoteur'] },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
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
      {view.placed === 0 ? (
        <Text size="sm" c="dimmed">
          Aucune heure de décollage connue pour ces vols.
        </Text>
      ) : (
        <div className="sr-scroll">
          <table className="sr-mx" data-testid="season-matrix">
            <caption style={{ position: 'absolute', left: -9999 }}>
              Nombre de vols par mois et heure de décollage
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
              {MONTHS_SHORT.map((label, m) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {view.hours.map((h) => {
                    const n = matrix.counts[m]?.[h] ?? 0;
                    const text = `${MONTHS_LONG[m]}, ${h}${NBSP}h : ${plural(n, 'vol')}`;
                    return (
                      <td
                        key={h}
                        title={text}
                        aria-label={text}
                        style={
                          n > 0
                            ? { background: `var(--sr-cal-${kind}${matrixLevel(n, view.peak)})` }
                            : undefined
                        }
                      />
                    );
                  })}
                  <td className="sr-mx-total">{fmtInt(matrix.monthTotals[m] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {view.hours.map((h) => (
                  <td key={h} className="sr-mx-total" style={{ textAlign: 'center', padding: 0 }}>
                    {fmtInt(matrix.hourTotals[h] ?? 0)}
                  </td>
                ))}
                <td className="sr-mx-total">{fmtInt(flights.length)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
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
