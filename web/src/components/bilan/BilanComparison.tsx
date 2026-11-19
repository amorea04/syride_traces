import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { Dumbbell, type DumbbellRow, type DumbbellSeries } from '@/components/common/Dumbbell';
import { DeltaPill } from '@/components/common/DeltaPill';
import { Section } from '@/components/common/Section';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { DUMBBELL_METRICS, seriesStats, type CompareSeries } from '@/lib/compare';
import { kpiRows } from '@/lib/bilanOverview';
import { fmtDate, plural } from '@/lib/format';
import './bilanA.css';

/**
 * Comparaison (5B.7, 2ᵉ moitié) : tableau des chiffres de l'année contre les années comparées (écarts en %, volumes
 * en vert ou rouge, le reste neutre) et haltères par mesure. Message sobre sans année comparée.
 */
export function BilanComparison() {
  const { year, flights, compareYears, compareFlights, ongoing, cutoff } = useBilan();
  const rows = useMemo(
    () => kpiRows(flights, compareYears, compareFlights),
    [flights, compareYears, compareFlights],
  );
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
  const dbSeries = useMemo<DumbbellSeries[]>(
    () => visuals.map((v) => ({ id: v.id, label: v.label, color: v.css, shape: v.shape, dash: v.dash })),
    [visuals],
  );
  const dbRows = useMemo<DumbbellRow[]>(() => {
    const stats = series.map((s) => seriesStats(s.flights));
    return DUMBBELL_METRICS.map((m) => ({
      id: m.id,
      label: m.label,
      values: stats.map((s) => m.value(s)),
      format: m.format,
    }));
  }, [series]);

  return (
    <Section
      id="comparaison"
      title="Par rapport aux années précédentes"
      subtitle="Les pastilles donnent l’écart en pourcentage de l’année du bilan avec chaque année comparée. Vert et rouge pour les volumes, violet et ambre pour le reste."
    >
      {compareYears.length === 0 ? (
        <p className="bl-empty" data-testid="bilan-compare-empty">
          Aucune année comparée : choisis-en une avec les puces « Comparer avec » en haut de page.
        </p>
      ) : (
        <>
          <div className="bl-cmp-wrap">
            <table className="bl-cmp" data-testid="bilan-compare-table">
              <thead>
                <tr>
                  <th scope="col">Indicateur</th>
                  <th scope="col">{year}</th>
                  {compareYears.flatMap((y) => [
                    <th scope="col" key={`v${y}`}>
                      {y}
                    </th>,
                    <th scope="col" key={`d${y}`}>
                      Écart / {y}
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-kpi={row.id}>
                    <td>{row.label}</td>
                    <td className="bl-cur">
                      {row.notMeasured ? 'non mesuré' : row.text}
                      {row.measuredNote && (
                        <span className="bl-meas">
                          sur {plural(row.measuredNote.ok, 'vol mesuré', 'vols mesurés')}
                          {row.measure && (
                            <>
                              {' '}
                              <CoverageNotice flights={flights} measure={row.measure} />
                            </>
                          )}
                        </span>
                      )}
                    </td>
                    {row.refs.flatMap((ref, i) => {
                      const delta = row.deltas[i];
                      return [
                        <td key={`v${ref.year}`}>{ref.text}</td>,
                        <td key={`d${ref.year}`} data-testid="bilan-compare-delta">
                          {delta?.pct == null ? '–' : <DeltaPill value={delta.pct} kind={row.kind} />}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ongoing && (
            <p className="bl-sub-note">
              {year} est arrêtée au {fmtDate(cutoff, { withYear: true })} ; les années comparées sont prises
              entières.
            </p>
          )}
          <div style={{ marginTop: 18 }}>
            <Dumbbell
              testId="bilan-dumbbells"
              series={dbSeries}
              rows={dbRows}
              ariaLabel={`Comparaison par mesure de ${visuals.map((v) => v.label).join(', ')}`}
            />
          </div>
        </>
      )}
    </Section>
  );
}
