import { Text } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { DAYS_LONG, DAYS_SHORT, fmtInt, NBSP, plural } from '@/lib/format';
import { weekHourMatrix } from '@/lib/rhythm';
import { favoriteSlot, hoursWindow, matrixLevel } from '@/lib/rhythmBlocks';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/** Teinte de la matrice : parapente seul, paramoteur seul, sinon les deux. */
function matrixKind(flights: readonly Flight[]): 'p' | 'm' | 'b' {
  const m = flights.some((f) => f.activity === 'paramoteur');
  const p = flights.some((f) => f.activity === 'parapente');
  if (m && p) return 'b';
  return m ? 'm' : 'p';
}

/**
 * Bloc « Quand vole-t-on ? » : matrice jour de la semaine × heure de décollage (nombre de vols, 4 niveaux relatifs à la
 * cellule maximale), totaux en marge, phrase du créneau favori (au moins 3 vols dans la cellule maximale).
 */
export function WeekHourMatrix({ flights }: Props) {
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

  if (flights.length === 0 || view.total === 0) {
    return (
      <Section id="quand" title="Quand vole-t-on ?">
        <Text size="sm" c="dimmed">
          {flights.length === 0 ? 'Aucun vol pour ces filtres.' : 'Aucune heure de décollage connue pour ces vols.'}
        </Text>
      </Section>
    );
  }

  return (
    <Section
      id="quand"
      title="Quand vole-t-on ?"
      subtitle="Nombre de vols par jour de la semaine et heure de décollage ; plus la case est foncée, plus elle est chargée."
    >
      {fav && (
        <Text size="sm" fw={600} mb="xs" data-testid="matrix-favorite">
          Créneau favori : le {DAYS_LONG[fav.weekday]} entre {fav.hour}
          {NBSP}h et {fav.hour + 1}
          {NBSP}h ({plural(fav.n, 'vol')})
        </Text>
      )}
      <div className="sr-scroll">
        <table className="sr-mx" data-testid="week-hour-matrix">
          <caption className="sr-only" style={{ position: 'absolute', left: -9999 }}>
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
                  const top = fav !== null && fav.weekday === d && fav.hour === h;
                  const label = `${DAYS_LONG[d]} ${h}${NBSP}h : ${plural(n, 'vol')}`;
                  return (
                    <td
                      key={h}
                      title={label}
                      aria-label={label}
                      data-top={top}
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
    </Section>
  );
}
