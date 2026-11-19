import { ActionIcon, Group, Select, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDuration, fmtHours, fmtInt, fmtPercent, fmtRange, plural } from '@/lib/format';
import { computeRhythm, seasonsBreakdown, SEASONS, type DateSpan } from '@/lib/rhythm';
import {
  defaultCalendarView,
  rollingStart,
  weekendShareOf,
  yearEnd,
  yearsOf,
  type CalendarView,
} from '@/lib/rhythmBlocks';
import { useHighlightStore } from '@/store/highlight';
import { CalendarHeatmap } from './CalendarHeatmap';
import { DaySheet } from './DaySheet';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
  /** Date de référence « aujourd'hui » (`referenceDate` de `lib/dashboard`). */
  referenceDate: string;
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
  const [selected, setSelected] = useState<CalendarView | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const hasRollingFlights = useMemo(() => {
    const from = rollingStart(reference);
    return flights.some((f) => f.date >= from && f.date <= reference);
  }, [flights, reference]);
  // Choix de l'utilisateur s'il est encore valable, sinon vue par défaut (12 derniers mois en début d'année).
  const view = useMemo<CalendarView | null>(() => {
    if (selected?.kind === 'rolling' && hasRollingFlights) return selected;
    if (selected?.kind === 'year' && years.includes(selected.year)) return selected;
    return defaultCalendarView(years[0] ?? null, reference);
  }, [selected, years, reference, hasRollingFlights]);
  const rolling = view?.kind === 'rolling';
  const year = view === null ? null : view.kind === 'year' ? view.year : Number(reference.slice(0, 4));
  const end = view === null ? '' : view.kind === 'rolling' ? reference : yearEnd(view.year, reference);
  const start = rolling ? rollingStart(end) : undefined;
  const rhythm = useMemo(() => {
    if (view === null || year === null) return null;
    const inPeriod = flights.filter((f) =>
      rolling ? f.date >= (start ?? '') && f.date <= end : f.year === year,
    );
    return computeRhythm(inPeriod, year, end, start);
  }, [flights, view, year, end, start, rolling]);
  const seasons = useMemo(() => seasonsBreakdown(flights), [flights]);
  const weekend = useMemo(() => weekendShareOf(flights), [flights]);

  if (view === null || year === null) {
    return (
      <Section id="rythme" title="Rythme">
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  // Ordre des choix : 12 derniers mois, puis les années de la plus récente à la plus ancienne.
  const choices: CalendarView[] = [
    { kind: 'rolling' },
    ...years.map((y): CalendarView => ({ kind: 'year', year: y })),
  ];
  const keyOf = (v: CalendarView): string => (v.kind === 'rolling' ? 'rolling' : String(v.year));
  const index = choices.findIndex((c) => keyOf(c) === keyOf(view));
  const earlier = choices[index + 1];
  const later = choices[index - 1];
  const periodName = rolling ? 'les 12 derniers mois' : String(year);
  const totalN = flights.length;

  return (
    <Section
      id="rythme"
      title="Rythme"
      subtitle={
        <>
          Une case par jour sur <b>{rolling ? 'les 12 derniers mois' : year}</b>, les semaines en colonnes ;
          plus la case est foncée, plus la journée est longue.
        </>
      }
      actions={
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="default"
            aria-label="Année précédente"
            disabled={earlier === undefined}
            onClick={() => earlier !== undefined && setSelected(earlier)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Select
            aria-label="Période du calendrier"
            data={choices.map((c) => ({
              value: keyOf(c),
              label: c.kind === 'rolling' ? '12 derniers mois' : String(c.year),
            }))}
            value={keyOf(view)}
            onChange={(v) => {
              if (v === null) return;
              setSelected(v === 'rolling' ? { kind: 'rolling' } : { kind: 'year', year: Number(v) });
            }}
            allowDeselect={false}
            w={rolling ? 150 : 100}
            size="xs"
          />
          <ActionIcon
            variant="default"
            aria-label="Année suivante"
            disabled={later === undefined}
            onClick={() => later !== undefined && setSelected(later)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      }
    >
      <Text size="xs" c="dimmed" mb={6} data-testid="rhythm-year-heading">
        Sur {periodName}
      </Text>
      {rhythm && (
        <div className="sr-tiles" data-testid="rhythm-tiles" style={{ marginBottom: 14 }}>
          <Tile
            label="Plus longue série"
            value={rhythm.streak ? plural(rhythm.streak.days, 'jour') : EMPTY}
            note={
              rhythm.streak ? fmtRange(rhythm.streak.start, rhythm.streak.end) : 'Pas de jours consécutifs'
            }
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

      <CalendarHeatmap
        flights={flights}
        year={year}
        mode={rolling ? 'rolling' : 'year'}
        end={end}
        onOpenDay={setOpenDay}
      />

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
