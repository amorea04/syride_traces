import { Text } from '@mantine/core';
import { useMemo } from 'react';
import { HourMatrix } from '@/components/common/HourMatrix';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { DAYS_LONG, DAYS_SHORT, NBSP, plural } from '@/lib/format';
import { weekHourMatrix } from '@/lib/rhythm';
import { favoriteSlot } from '@/lib/rhythmBlocks';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

const WEEK_ROWS = DAYS_SHORT.map((short, i) => ({ short, long: DAYS_LONG[i] ?? short }));

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
  const placed = useMemo(
    () => matrix.counts.reduce((s, row) => s + row.reduce((a, n) => a + n, 0), 0),
    [matrix],
  );
  const fav = useMemo(() => favoriteSlot(matrix), [matrix]);

  if (flights.length === 0 || placed === 0) {
    return (
      <Section id="quand" title="Quand vole-t-on&nbsp;?">
        <Text size="sm" c="dimmed">
          {flights.length === 0
            ? 'Aucun vol pour ces filtres.'
            : 'Aucune heure de décollage connue pour ces vols.'}
        </Text>
      </Section>
    );
  }

  return (
    <Section
      id="quand"
      title="Quand vole-t-on&nbsp;?"
      subtitle="Nombre de vols par jour de la semaine et heure de décollage&nbsp;; plus la case est foncée, plus elle est chargée."
    >
      {fav && (
        <Text size="sm" fw={600} mb="xs" data-testid="matrix-favorite">
          Créneau favori : le {DAYS_LONG[fav.weekday]} entre {fav.hour}
          {NBSP}h et {fav.hour + 1}
          {NBSP}h ({plural(fav.n, 'vol')})
        </Text>
      )}
      <HourMatrix
        testId="week-hour-matrix"
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
    </Section>
  );
}
