import { useCallback, useEffect, useMemo, useState } from 'react';
import { BilanCumulative } from '@/components/bilan/BilanCumulative';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { CalendarHeatmap } from '@/components/rhythm/CalendarHeatmap';
import { DaySheet } from '@/components/rhythm/DaySheet';
import { clearPendingOpenDay, OPEN_DAY_EVENT, pendingOpenDay } from '@/lib/bilanOverview';
import { EMPTY, fmtDuration, fmtInt, fmtPercent, fmtRange, plural } from '@/lib/format';
import type { DateSpan } from '@/lib/rhythm';
import { computeRhythm } from '@/lib/rhythm';
import { useHighlightStore } from '@/store/highlight';
import '@/components/rhythm/rhythm.css';
import './bilanA.css';

interface TileProps {
  label: string;
  value: string;
  note?: string;
  range?: DateSpan | { start: string; end: string } | null;
}

/** Tuile de rythme ; si elle porte une période, un clic la surligne dans le calendrier (re-clic = efface). */
function Tile({ label, value, note, range }: TileProps) {
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const content = (
    <>
      <div className="sr-tile-label">{label}</div>
      <div className="sr-tile-value">{value}</div>
      {note && <div className="sr-tile-note">{note}</div>}
    </>
  );
  if (!range) return <div className="sr-tile">{content}</div>;
  const active = highlight?.kind === 'days' && highlight.from === range.start && highlight.to === range.end;
  return (
    <button
      type="button"
      className="sr-tile"
      aria-pressed={active}
      onClick={() => setHighlight(active ? null : { kind: 'days', from: range.start, to: range.end })}
    >
      {content}
    </button>
  );
}

/**
 * Rythme (5B.5) : phrase du récit, heures cumulées de l'année contre les années comparées (jalons en or), tuiles
 * série, pause, meilleure semaine et régularité, calendrier jour par jour et fiche du jour. La fiche du jour s'ouvre
 * aussi depuis l'aperçu et la frise (événement `OPEN_DAY_EVENT`).
 */
export function BilanRhythm() {
  const { year, flights, cutoff, story } = useBilan();
  // Jour ouvert, lié au bilan (année + récit de la discipline) pour lequel il a été choisi : un autre bilan l'ignore.
  const [opened, setOpened] = useState<{ iso: string | null; year: number; story: typeof story } | null>(null);
  const openDay = opened && opened.year === year && opened.story === story ? opened.iso : null;
  const setOpenDay = useCallback((iso: string | null) => setOpened({ iso, year, story }), [year, story]);
  const rhythm = useMemo(() => computeRhythm(flights, year, cutoff), [flights, year, cutoff]);

  // Un autre bilan (année ou discipline) : la fiche du jour et le surlignage de période n'ont plus de sens.
  useEffect(() => {
    return () => {
      const { highlight, setHighlight } = useHighlightStore.getState();
      if (highlight?.kind === 'days') setHighlight(null);
    };
  }, [year, story]);

  useEffect(() => {
    const listener = (event: Event) => {
      const iso = (event as CustomEvent<string>).detail;
      if (typeof iso === 'string') {
        event.preventDefault();
        setOpenDay(iso);
      }
    };
    document.addEventListener(OPEN_DAY_EVENT, listener);
    // Demande faite avant l'abonnement (section montée en différé, 6.3) : reprise juste après.
    const pending = pendingOpenDay();
    clearPendingOpenDay();
    if (pending) queueMicrotask(() => setOpenDay(pending));
    return () => document.removeEventListener(OPEN_DAY_EVENT, listener);
  }, [setOpenDay]);

  return (
    <Section
      id="rythme"
      title="Le rythme de l’année"
      subtitle={`Heures de vol cumulées jour par jour, puis une case par jour de ${year} : plus elle est foncée, plus la journée est longue.`}
    >
      {story.texts.rythme && (
        <p className="bl-lead" data-testid="bilan-rythme-text">
          {story.texts.rythme}
        </p>
      )}
      <BilanCumulative />
      {rhythm && (
        <div className="sr-tiles" data-testid="bilan-rhythm-tiles" style={{ margin: '14px 0' }}>
          <Tile
            label="Plus longue série"
            value={rhythm.streak ? plural(rhythm.streak.days, 'jour') : EMPTY}
            note={rhythm.streak ? fmtRange(rhythm.streak.start, rhythm.streak.end) : 'Pas de jours consécutifs'}
            range={rhythm.streak}
          />
          <Tile
            label="Plus longue pause"
            value={rhythm.gap ? plural(rhythm.gap.days, 'jour') : EMPTY}
            note={rhythm.gap ? fmtRange(rhythm.gap.start, rhythm.gap.end) : 'Aucune pause'}
            range={rhythm.gap}
          />
          <Tile
            label="Meilleure semaine"
            value={fmtDuration(rhythm.week.minutes)}
            note={`${fmtRange(rhythm.week.start, rhythm.week.end)}, ${plural(rhythm.week.n, 'vol')}`}
            range={rhythm.week}
          />
          <Tile
            label="Régularité"
            value={fmtPercent((rhythm.weeksActive / Math.max(rhythm.weeksTotal, 1)) * 100)}
            note={`${fmtInt(rhythm.weeksActive)} semaines actives sur ${fmtInt(rhythm.weeksTotal)}`}
          />
        </div>
      )}
      <CalendarHeatmap flights={flights} year={year} end={cutoff} onOpenDay={setOpenDay} />
      <DaySheet iso={openDay} flights={flights} onClose={() => setOpenDay(null)} onChange={setOpenDay} />
    </Section>
  );
}
