import { useCallback, useMemo } from 'react';
import { CellTooltip } from '@/components/common/CellTooltip';
import { quarterCellTip } from '@/lib/cellTips';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { fmtInt, plural } from '@/lib/format';
import { intensityLevel, wingTimeline } from '@/lib/pilots';
import { useHighlightStore } from '@/store/highlight';

/** Frise des voiles : un carré par trimestre, plus foncé quand la voile est plus utilisée. */
export function WingTimeline({ flights }: { flights: readonly Flight[] }) {
  const timeline = useMemo(() => wingTimeline(flights), [flights]);
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const cols = { gridTemplateColumns: `repeat(${Math.max(timeline.quarters.length, 1)}, minmax(0, 1fr))` };

  // Étiquettes d'années : une par année, sur ses trimestres.
  const yearSpans = useMemo(() => {
    const out: { year: number; start: number; span: number }[] = [];
    timeline.quarters.forEach((q, i) => {
      const last = out[out.length - 1];
      if (last && last.year === q.year) last.span += 1;
      else out.push({ year: q.year, start: i + 1, span: 1 });
    });
    return out;
  }, [timeline.quarters]);

  const resolve = useCallback(
    (el: HTMLElement) => {
      const row = timeline.rows[Number(el.dataset['row'])];
      const q = timeline.quarters[Number(el.dataset['col'])];
      if (!row || !q) return null;
      return quarterCellTip(row.wing, q.year, q.quarter, row.counts[Number(el.dataset['col'])] ?? 0);
    },
    [timeline],
  );

  return (
    <Section
      id="voiles"
      title="Voiles utilisées dans le temps"
      subtitle="Un carré par trimestre, plus foncé quand la voile est plus utilisée."
    >
      {timeline.rows.length === 0 ? (
        <EmptyNote>Aucune voile renseignée pour ces vols.</EmptyNote>
      ) : (
        <CellTooltip resolve={resolve} roving className="pl-wings" testId="wing-timeline">
          <span />
          <div className="pl-wing-years" style={cols} aria-hidden="true">
            {yearSpans.map((y) => (
              <span key={y.year} style={{ gridColumn: `${y.start} / span ${y.span}` }}>
                {y.span >= 2 ? y.year : String(y.year).slice(2)}
              </span>
            ))}
          </div>
          <span />
          {timeline.rows.map((row, r) => {
            const dim = highlight?.kind === 'wing' && highlight.wing !== row.wing;
            return (
              <div
                key={row.wing}
                style={{ display: 'contents' }}
                onMouseEnter={() => setHighlight({ kind: 'wing', wing: row.wing })}
                onMouseLeave={() => setHighlight(null)}
              >
                <span className={`pl-wing-name${dim ? ' pl-wing-dim' : ''}`} title={row.wing}>
                  {row.wing}
                </span>
                <div
                  className={`pl-wing-cells${dim ? ' pl-wing-dim' : ''}`}
                  style={cols}
                  role="group"
                  aria-label={`${row.wing} : ${plural(row.flights, 'vol')}`}
                >
                  {row.counts.map((n, i) => {
                    const q = timeline.quarters[i];
                    const level = intensityLevel(n, timeline.maxCount);
                    return (
                      <i
                        key={i}
                        className="pl-wing-cell"
                        data-level={level}
                        role="img"
                        aria-label={
                          q
                            ? `${row.wing}, ${q.quarter === 1 ? '1ᵉʳ' : `${q.quarter}ᵉ`} trimestre ${q.year} : ${plural(n, 'vol')}`
                            : undefined
                        }
                        data-tip={`${r}-${i}`}
                        data-row={r}
                        data-col={i}
                        style={level > 0 ? { background: `var(--sr-cal-b${level})` } : undefined}
                      />
                    );
                  })}
                </div>
                <b className={`pl-wing-total${dim ? ' pl-wing-dim' : ''}`}>{fmtInt(row.flights)}</b>
              </div>
            );
          })}
        </CellTooltip>
      )}
      {timeline.hidden > 0 && (
        <p className="pl-legend" style={{ marginTop: 8 }}>
          {plural(timeline.hidden, 'autre voile')} moins utilisée{timeline.hidden > 1 ? 's' : ''}, non
          affichée
          {timeline.hidden > 1 ? 's' : ''}.
        </p>
      )}
    </Section>
  );
}
