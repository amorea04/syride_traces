import { ActionIcon, Group, Select, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDuration, fmtHours, fmtInt, fmtPercent, fmtRange, plural } from '@/lib/format';
import { computeRhythm, seasonsBreakdown, SEASONS, type DateSpan } from '@/lib/rhythm';
import { referenceDate, weekendShareOf, yearEnd, yearsOf } from '@/lib/rhythmBlocks';
import { useHighlightStore } from '@/store/highlight';
import { CalendarHeatmap } from './CalendarHeatmap';
import { DaySheet } from './DaySheet';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
  /** Date de référence « aujourd'hui » (`meta.data_updated_at`) ; repli sur le dernier vol de la sélection. */
  referenceDate?: string | null;
}

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
 * Bloc « Rythme » : tuiles (série, pause, meilleure semaine, régularité), calendrier annuel avec
 * sélecteur d'année, saisons et part des vols le week-end. Un clic sur un jour ouvre la `DaySheet`.
 */
export function RhythmBlock({ flights, referenceDate: reference }: Props) {
  const years = useMemo(() => yearsOf(flights), [flights]);
  const [selected, setSelected] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const year = selected !== null && years.includes(selected) ? selected : (years[0] ?? null);
  const ref = useMemo(() => referenceDate(reference ?? undefined, flights), [reference, flights]);
  const end = year === null ? '' : yearEnd(year, ref);
  const rhythm = useMemo(
    () => (year === null ? null : computeRhythm(flights.filter((f) => f.year === year), year, end)),
    [flights, year, end],
  );
  const seasons = useMemo(() => seasonsBreakdown(flights), [flights]);
  const weekend = useMemo(() => weekendShareOf(flights), [flights]);

  if (year === null) {
    return (
      <Section id="rythme" title="Rythme">
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  const index = years.indexOf(year);
  const older = years[index + 1];
  const newer = years[index - 1];
  const totalN = flights.length;

  return (
    <Section
      id="rythme"
      title="Rythme"
      subtitle={`Une case par jour de ${year} ; plus elle est foncée, plus la journée est longue.`}
      actions={
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="default"
            aria-label="Année précédente"
            disabled={older === undefined}
            onClick={() => older !== undefined && setSelected(older)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Select
            aria-label="Année du calendrier"
            data={years.map(String)}
            value={String(year)}
            onChange={(v) => v !== null && setSelected(Number(v))}
            allowDeselect={false}
            w={92}
            size="xs"
          />
          <ActionIcon
            variant="default"
            aria-label="Année suivante"
            disabled={newer === undefined}
            onClick={() => newer !== undefined && setSelected(newer)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      }
    >
      {rhythm && (
        <Text size="xs" c="dimmed" mb={6} data-testid="rhythm-year-heading">
          Sur {year}
        </Text>
      )}
      {rhythm && (
        <div className="sr-tiles" data-testid="rhythm-tiles" style={{ marginBottom: 14 }}>
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

      <CalendarHeatmap flights={flights} year={year} end={end} onOpenDay={setOpenDay} />

      <Text size="xs" c="dimmed" mt={16} mb={6} data-testid="rhythm-selection-heading">
        Sur toute la sélection
      </Text>
      <div className="sr-tiles" data-testid="rhythm-seasons">
        {SEASONS.map((s) => (
          <Tile
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            value={plural(seasons[s].n, 'vol')}
            note={`${fmtHours(seasons[s].minutes)}, ${fmtPercent((seasons[s].n / Math.max(totalN, 1)) * 100)} des vols`}
          />
        ))}
        <Tile
          label="Week-end"
          value={fmtPercent(weekend * 100)}
          note="des vols faits le samedi ou le dimanche"
        />
      </div>

      <DaySheet iso={openDay} flights={flights} onClose={() => setOpenDay(null)} onChange={setOpenDay} />
    </Section>
  );
}
