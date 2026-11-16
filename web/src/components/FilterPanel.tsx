import {
  Button,
  Group,
  MultiSelect,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  type ComboboxItem,
} from '@mantine/core';
import { useMemo } from 'react';
import { useData } from '@/data/DataProvider';
import {
  ACTIVITY_VALUES,
  activeShortcut,
  availableYears,
  cascadeOptions,
  parseIsoDate,
  periodShortcuts,
  todayIso,
  yearPeriod,
  type ActivityFilter,
  type FilterOption,
} from '@/lib/filters';
import { fmtInt } from '@/lib/format';
import { useFiltersStore } from '@/store/filters';

const ACTIVITY_LABELS: Record<ActivityFilter, string> = {
  tout: 'Tout',
  parapente: 'Parapente',
  paramoteur: 'Paramoteur',
};

/** Nombre maximal d'options affichées d'un coup dans une liste déroulante (la recherche filtre le reste). */
const MAX_VISIBLE_OPTIONS = 100;

function toItems<T extends string | number>(options: FilterOption<T>[]): ComboboxItem[] {
  return options.map((o) => ({ value: String(o.value), label: o.label }));
}

function countsOf<T extends string | number>(options: FilterOption<T>[]): Map<string, number> {
  return new Map(options.map((o) => [String(o.value), o.count]));
}

interface CountedSelectProps {
  id?: string;
  label: string;
  placeholder: string;
  data: ComboboxItem[];
  counts: Map<string, number>;
  value: string[];
  onChange: (value: string[]) => void;
}

/** Identifiant du champ de recherche des pilotes (raccourci « / »). */
export const PILOT_SEARCH_ID = 'filtre-pilotes';

function CountedMultiSelect({ id, label, placeholder, data, counts, value, onChange }: CountedSelectProps) {
  return (
    <MultiSelect
      id={id}
      label={label}
      placeholder={value.length === 0 ? placeholder : undefined}
      data={data}
      value={value}
      onChange={onChange}
      searchable
      clearable
      limit={MAX_VISIBLE_OPTIONS}
      nothingFoundMessage="Aucun résultat"
      clearButtonProps={{ 'aria-label': `Effacer ${label.toLowerCase()}` }}
      renderOption={({ option }) => (
        <Group justify="space-between" wrap="nowrap" w="100%" gap="xs">
          <Text size="sm" truncate>
            {option.label}
          </Text>
          <Text size="xs" c="dimmed">
            {fmtInt(counts.get(option.value) ?? 0)}
          </Text>
        </Group>
      )}
    />
  );
}

/** Contenu de la barre de filtres (utilisé dans la barre latérale desktop et le tiroir mobile). */
export function FilterPanel() {
  const { flights } = useData();
  const filters = useFiltersStore((s) => s.filters);
  const setFilters = useFiltersStore((s) => s.setFilters);

  const options = useMemo(() => cascadeOptions(flights, filters), [flights, filters]);
  const years = useMemo(() => availableYears(flights), [flights]);
  // Recalculés à chaque rendu (peu coûteux) : la date du jour ne reste pas figée si l'onglet reste ouvert.
  const shortcuts = periodShortcuts(todayIso());
  const current = activeShortcut(filters, shortcuts);
  const hasPeriod = filters.dateFrom !== null || filters.dateTo !== null;
  const selectedYear = years.find((y) => {
    const p = yearPeriod(y);
    return p.dateFrom === filters.dateFrom && p.dateTo === filters.dateTo;
  });

  return (
    <Stack gap="md">
      <div>
        <Text component="div" size="sm" fw={500} id="filtre-activite" mb={4}>
          Activité
        </Text>
        <SegmentedControl
          fullWidth
          size="xs"
          aria-labelledby="filtre-activite"
          value={filters.activity}
          onChange={(v) => setFilters({ activity: v as ActivityFilter })}
          data={ACTIVITY_VALUES.map((value) => ({
            value,
            label: (
              <span>
                {ACTIVITY_LABELS[value]}{' '}
                <Text component="span" size="xs" c="dimmed">
                  {fmtInt(options.activity[value])}
                </Text>
              </span>
            ),
          }))}
        />
      </div>

      <CountedMultiSelect
        id={PILOT_SEARCH_ID}
        label="Pilotes"
        placeholder="Tous les pilotes"
        data={toItems(options.pilots)}
        counts={countsOf(options.pilots)}
        value={filters.pilots}
        onChange={(pilots) => setFilters({ pilots })}
      />

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <Text component="legend" size="sm" fw={500} mb={4}>
          Période
        </Text>
        <Group grow gap="xs" align="flex-start">
          <TextInput
            type="date"
            label="Du"
            size="xs"
            value={filters.dateFrom ?? ''}
            max={filters.dateTo ?? undefined}
            onChange={(e) => setFilters({ dateFrom: parseIsoDate(e.currentTarget.value) })}
          />
          <TextInput
            type="date"
            label="Au"
            size="xs"
            value={filters.dateTo ?? ''}
            min={filters.dateFrom ?? undefined}
            onChange={(e) => setFilters({ dateTo: parseIsoDate(e.currentTarget.value) })}
          />
        </Group>
        <Group gap={6} mt="xs">
          {shortcuts.map((s) => (
            <Button
              key={s.id}
              size="compact-xs"
              variant={current?.id === s.id ? 'light' : 'default'}
              aria-pressed={current?.id === s.id}
              onClick={() => {
                // Date relue au clic : l'onglet a pu rester ouvert au-delà de minuit.
                const fresh = periodShortcuts(todayIso()).find((x) => x.id === s.id) ?? s;
                setFilters({ dateFrom: fresh.dateFrom, dateTo: fresh.dateTo });
              }}
            >
              {s.label}
            </Button>
          ))}
          <Select
            size="xs"
            w={110}
            aria-label="Année"
            placeholder="Année…"
            data={years.map(String)}
            value={selectedYear === undefined ? null : String(selectedYear)}
            onChange={(v) => {
              if (v === null) return;
              const p = yearPeriod(Number(v));
              setFilters({ dateFrom: p.dateFrom, dateTo: p.dateTo });
            }}
            comboboxProps={{ withinPortal: true }}
          />
          {hasPeriod && (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => setFilters({ dateFrom: null, dateTo: null })}
            >
              Toute la période
            </Button>
          )}
        </Group>
      </fieldset>

      <CountedMultiSelect
        label="Voiles"
        placeholder="Toutes les voiles"
        data={toItems(options.wings)}
        counts={countsOf(options.wings)}
        value={filters.wings}
        onChange={(wings) => setFilters({ wings })}
      />

      <CountedMultiSelect
        label="Sites"
        placeholder="Tous les sites"
        data={toItems(options.sites)}
        counts={countsOf(options.sites)}
        value={filters.sites.map(String)}
        onChange={(sites) => setFilters({ sites: sites.map(Number) })}
      />
    </Stack>
  );
}
