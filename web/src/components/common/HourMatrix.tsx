import { useCallback, useMemo } from 'react';
import { CellTooltip } from '@/components/common/CellTooltip';
import { fmtInt } from '@/lib/format';
import { hourHeading, matrixCellTip } from '@/lib/cellTips';
import { hoursWindow, matrixLevel } from '@/lib/rhythmBlocks';
import '@/components/rhythm/rhythm.css';

interface Props {
  testId: string;
  /** Légende du tableau pour les lecteurs d'écran. */
  caption: string;
  /** Intitulé de la colonne des lignes : « Mois » ou « Jour ». */
  rowHeading: string;
  /** Libellé court (en-tête de ligne) et long (infobulle) de chaque ligne. */
  rows: readonly { short: string; long: string }[];
  /** [ligne][heure 0–23] : nombre de vols. */
  counts: readonly (readonly number[])[];
  /** [ligne][heure] : minutes de vol, si on les connaît. */
  minutes?: readonly (readonly number[])[] | null;
  /** Total de chaque ligne, si différent de la somme des heures montrées (vols sans heure). */
  rowTotals?: readonly number[];
  /** Total général, si différent de la somme des lignes. */
  total?: number;
  /** Teinte : parapente, paramoteur ou les deux. */
  kind: 'p' | 'm' | 'b';
  /** Case encadrée (créneau favori). */
  top?: { row: number; hour: number } | null;
}

/**
 * Matrice « ligne × heure de décollage » commune (mois × heure d'un site, jour × heure du tableau de bord et du
 * Bilan). Plage 8 h–20 h (élargie si des vols en sortent), pleine largeur de la carte, en-têtes « 8 h » et
 * intitulés d'axes explicites, une seule infobulle par grille, flèches pour passer d'une case à l'autre.
 */
export function HourMatrix({
  testId,
  caption,
  rowHeading,
  rows,
  counts,
  minutes,
  rowTotals,
  total,
  kind,
  top,
}: Props) {
  const view = useMemo(() => {
    const [lo, hi] = hoursWindow(counts);
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const peak = Math.max(0, ...counts.flat());
    const sums = counts.map((row) => hours.reduce((s, h) => s + (row[h] ?? 0), 0));
    const hourTotals = hours.map((h) => counts.reduce((s, row) => s + (row[h] ?? 0), 0));
    return {
      hours,
      peak,
      rowSums: rowTotals ?? sums,
      hourTotals,
      total: total ?? sums.reduce((s, n) => s + n, 0),
    };
  }, [counts, rowTotals, total]);

  const resolve = useCallback(
    (el: HTMLElement) => {
      const r = Number(el.dataset['row']);
      const h = Number(el.dataset['hour']);
      const row = rows[r];
      if (!row) return null;
      return matrixCellTip(row.long, h, counts[r]?.[h] ?? 0, minutes ? (minutes[r]?.[h] ?? 0) : null);
    },
    [rows, counts, minutes],
  );

  return (
    <CellTooltip resolve={resolve} roving className="sr-scroll">
      <table className="sr-mx sr-mx-full" data-testid={testId}>
        <caption style={{ position: 'absolute', left: -9999 }}>{caption}</caption>
        <thead>
          <tr>
            <td className="sr-mx-blank" />
            <th scope="colgroup" colSpan={view.hours.length} className="sr-mx-axis">
              Heure de décollage
            </th>
            <td className="sr-mx-blank" />
          </tr>
          <tr>
            <th scope="col" className="sr-mx-corner">
              {rowHeading}
            </th>
            {view.hours.map((h, i) => (
              <th key={h} scope="col" data-alt={i % 2 === 1}>
                {hourHeading(h)}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.short}>
              <th scope="row">{row.short}</th>
              {view.hours.map((h) => {
                const n = counts[r]?.[h] ?? 0;
                const tip = matrixCellTip(row.long, h, n, minutes ? (minutes[r]?.[h] ?? 0) : null);
                return (
                  <td
                    key={h}
                    data-tip={`${r}-${h}`}
                    data-row={r}
                    data-hour={h}
                    data-top={top?.row === r && top.hour === h}
                    aria-label={`${tip.title} : ${tip.lines[0] ?? ''}`}
                    style={
                      n > 0 ? { background: `var(--sr-cal-${kind}${matrixLevel(n, view.peak)})` } : undefined
                    }
                  />
                );
              })}
              <td className="sr-mx-total">{fmtInt(view.rowSums[r] ?? 0)}</td>
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
    </CellTooltip>
  );
}
