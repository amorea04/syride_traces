import { MultiSelect, Select, SegmentedControl, Text } from '@mantine/core';
import { Section } from '@/components/common/Section';
import { Marker } from '@/components/common/Dumbbell';
import type { SeriesVisual } from '@/components/compare/visuals';
import {
  COMPARE_MODES,
  MAX_SERIES,
  MIN_SERIES,
  type Candidate,
  type CompareMode,
  type Selection,
} from '@/lib/compare';
import { fmtInt } from '@/lib/format';

interface Props {
  mode: CompareMode;
  selection: Selection;
  candidates: readonly Candidate[];
  /** Mode Années : années du pilote choisi. */
  years: readonly number[];
  visuals: readonly SeriesVisual[];
  /** Phrase sous le sélecteur quand la sélection est proposée par défaut. */
  defaultNote: string;
  onModeChange: (mode: CompareMode) => void;
  onIdsChange: (ids: string[]) => void;
  /** Mode Années : changement de pilote (le parent propose ses années récentes). */
  onPilotChange: (slug: string) => void;
}

const HELP: Record<CompareMode, string> = {
  pilotes: `De ${MIN_SERIES} à ${MAX_SERIES} pilotes. Le premier est la référence des écarts.`,
  annees: `Un pilote et de ${MIN_SERIES} à ${MAX_SERIES} années. La première année est la référence des écarts.`,
  sites: `De ${MIN_SERIES} à ${MAX_SERIES} sites. Le premier est la référence des écarts.`,
};

const NOUN: Record<CompareMode, string> = {
  pilotes: 'pilotes',
  annees: 'années',
  sites: 'sites',
};

/** Contrôle segmenté du mode, sélecteurs et légende des séries (couleur et forme de chaque série). */
export function CompareSelector({
  mode,
  selection,
  candidates,
  years,
  visuals,
  defaultNote,
  onModeChange,
  onIdsChange,
  onPilotChange,
}: Props) {
  const data = candidates.map((c) => ({ value: c.value, label: `${c.label} (${fmtInt(c.flights)})` }));
  return (
    <Section
      id="selection"
      title="Sélection"
      subtitle={HELP[mode]}
      actions={
        <SegmentedControl
          size="xs"
          aria-label="Mode de comparaison"
          value={mode}
          onChange={(v) => onModeChange(v as CompareMode)}
          data={COMPARE_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
      }
    >
      {mode === 'annees' ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Select
            label="Pilote"
            data={data}
            value={selection.ids[0] ?? null}
            searchable
            allowDeselect={false}
            onChange={(v) => v && onPilotChange(v)}
            nothingFoundMessage="Aucun pilote"
          />
          <MultiSelect
            label="Années"
            data={years.map((y) => ({ value: String(y), label: String(y) }))}
            value={selection.ids.slice(1)}
            maxValues={MAX_SERIES}
            onChange={(v) => onIdsChange([selection.ids[0] ?? '', ...v])}
            nothingFoundMessage="Aucune année"
            clearable
          />
        </div>
      ) : (
        <MultiSelect
          label={mode === 'pilotes' ? 'Pilotes' : 'Sites'}
          data={data}
          value={selection.ids}
          maxValues={MAX_SERIES}
          searchable
          clearable
          onChange={onIdsChange}
          nothingFoundMessage={`Aucun ${mode === 'pilotes' ? 'pilote' : 'site'}`}
        />
      )}
      {selection.isDefault && (
        <Text size="sm" c="dimmed" mt={8} data-testid="compare-default-note">
          {defaultNote}
        </Text>
      )}
      {selection.problem && (
        <Text size="sm" mt={8} role="status" data-testid="compare-problem">
          {selection.problem}
        </Text>
      )}
      {visuals.length > 0 && (
        <ul
          aria-label={`Légende des ${NOUN[mode]} comparés`}
          style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}
        >
          {visuals.map((v) => (
            <li key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Marker shape={v.shape} color={v.css} size={12} />
              <svg width={28} height={6} aria-hidden="true">
                <line
                  x1={0}
                  x2={28}
                  y1={3}
                  y2={3}
                  stroke={v.css}
                  strokeWidth={2.5}
                  strokeDasharray={v.dash ? v.dash.join(' ') : undefined}
                />
              </svg>
              {v.label}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
