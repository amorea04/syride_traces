import { Group, SegmentedControl, Text, Title } from '@mantine/core';
import { useCallback, useMemo, useState } from 'react';
import { CellTooltip } from '@/components/common/CellTooltip';
import { ribbonCellTip } from '@/lib/cellTips';
import type { Flight } from '@/data/flight';
import { fmtDuration, fmtHours, fmtInt, MONTHS_SHORT, plural } from '@/lib/format';
import { lastMonthsFlights, matrixLevel, monthRange, RIBBON_MONTHS, wingRibbon } from '@/lib/rhythmBlocks';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import './gear.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

type Measure = 'vols' | 'heures';

/**
 * Ruban « voile × mois » : les 8 voiles les plus utilisées en lignes, les mois de la sélection en colonnes, intensité = vols
 * ou heures. Un clic sur une case filtre la voile et le mois ; le survol surligne la voile (ou le mois, sur l'en-tête).
 * Peut s'utiliser seul ; `GearBlock` l'intègre.
 */
export function WingRibbon({ flights }: Props) {
  const [measure, setMeasure] = useState<Measure>('heures');
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const setFilters = useFiltersStore((s) => s.setFilters);
  const windowed = useMemo(() => lastMonthsFlights(flights), [flights]);
  const data = useMemo(() => wingRibbon(windowed.flights), [windowed]);
  const values = (row: (typeof data.rows)[number]) => (measure === 'vols' ? row.n : row.minutes);
  const peak = Math.max(0, ...data.rows.flatMap(values));
  const wingDim = (wing: string) => highlight?.kind === 'wing' && highlight.wing !== wing;
  const monthDim = (year: number, month: number) =>
    highlight?.kind === 'month' && (highlight.year !== year || highlight.month !== month);

  const resolve = useCallback(
    (el: HTMLElement) => {
      const row = data.rows[Number(el.dataset['row'])];
      const m = data.months[Number(el.dataset['col'])];
      if (!row || !m) return null;
      const i = Number(el.dataset['col']);
      return ribbonCellTip(row.wing, m.year, m.month, row.n[i] ?? 0, row.minutes[i] ?? 0);
    },
    [data],
  );

  if (data.rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Aucune voile renseignée pour ces vols.
      </Text>
    );
  }

  const spansYears = new Set(data.months.map((m) => m.year)).size > 1;
  return (
    <div data-testid="wing-ribbon">
      <Group justify="space-between" align="center" mb={6} wrap="wrap">
        <Title order={3} fz={14} fw={650}>
          Voiles au fil des mois
        </Title>
        <SegmentedControl
          size="xs"
          aria-label="Mesure du ruban"
          value={measure}
          onChange={(v) => setMeasure(v as Measure)}
          data={[
            { value: 'heures', label: 'Heures' },
            { value: 'vols', label: 'Vols' },
          ]}
        />
      </Group>
      <Text size="xs" c="dimmed" mb={6} data-testid="ribbon-legend">
        Intensité : {measure === 'vols' ? 'nombre de vols' : 'heures de vol'} (relative au maximum du ruban).
        {windowed.truncated
          ? ` Les ${RIBBON_MONTHS} derniers mois de la sélection sont montrés (jusqu’au dernier vol)\u00a0; les totaux ne portent que sur ces mois.`
          : ''}
      </Text>
      <CellTooltip resolve={resolve} className="sr-gear-wrap">
        <table className="sr-gear-table sr-ribbon">
          <caption style={{ position: 'absolute', left: -9999 }}>
            {measure === 'vols' ? 'Vols' : 'Heures de vol'} par voile et par mois
          </caption>
          <thead>
            <tr>
              <th scope="col">Voile</th>
              {data.months.map((m) => (
                <th
                  key={`${m.year}-${m.month}`}
                  scope="col"
                  style={{ textAlign: 'center', padding: '5px 1px' }}
                  data-dim={monthDim(m.year, m.month)}
                  onMouseEnter={() => setHighlight({ kind: 'month', year: m.year, month: m.month })}
                  onMouseLeave={() => setHighlight(null)}
                  aria-label={`${MONTHS_SHORT[m.month - 1]} ${m.year}`}
                >
                  {MONTHS_SHORT[m.month - 1]?.slice(0, 3)}
                  {spansYears && m.month === 1 ? ` ${String(m.year).slice(2)}` : ''}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, r) => (
              <tr
                key={row.wing}
                data-dim={wingDim(row.wing)}
                onMouseEnter={() => setHighlight({ kind: 'wing', wing: row.wing })}
                onMouseLeave={() => setHighlight(null)}
              >
                <th
                  scope="row"
                  style={{ textAlign: 'left', color: 'var(--sr-text)', fontWeight: 500 }}
                  title={row.wing}
                >
                  <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.wing}
                  </div>
                </th>
                {data.months.map((m, i) => {
                  const value = measure === 'vols' ? (row.n[i] ?? 0) : (row.minutes[i] ?? 0);
                  const label = `${row.wing}, ${MONTHS_SHORT[m.month - 1]} ${m.year} : ${plural(row.n[i] ?? 0, 'vol')}, ${fmtDuration(row.minutes[i] ?? 0)}`;
                  return (
                    <td
                      key={`${m.year}-${m.month}`}
                      className="sr-ribbon-cell"
                      data-dim={monthDim(m.year, m.month)}
                    >
                      <button
                        type="button"
                        className="sr-gear-cell"
                        data-empty={value === 0}
                        disabled={value === 0}
                        aria-hidden={value === 0 ? true : undefined}
                        aria-label={value === 0 ? undefined : `${label}. Filtrer sur cette voile et ce mois.`}
                        data-tip={value === 0 ? undefined : `${r}-${i}`}
                        data-row={r}
                        data-col={i}
                        style={
                          value > 0 ? { background: `var(--sr-cal-b${matrixLevel(value, peak)})` } : undefined
                        }
                        onClick={() => {
                          const [dateFrom, dateTo] = monthRange(m.year, m.month);
                          setFilters({ wings: [row.wing], dateFrom, dateTo, years: [] });
                        }}
                      />
                    </td>
                  );
                })}
                <td>{measure === 'vols' ? fmtInt(row.totalN) : fmtHours(row.totalMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CellTooltip>
      {data.hidden > 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          {plural(data.hidden, 'autre voile', 'autres voiles')} non affichée{data.hidden > 1 ? 's' : ''} (les
          8 plus utilisées sont montrées).
        </Text>
      )}
    </div>
  );
}
