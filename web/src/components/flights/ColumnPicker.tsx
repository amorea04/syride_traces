import { Button, Checkbox, Popover, Stack } from '@mantine/core';
import { IconColumns3 } from '@tabler/icons-react';
import { COLUMNS, defaultVisibleColumns, type ColumnId } from '@/lib/flightsTable';

interface Props {
  visible: readonly ColumnId[];
  onChange: (visible: ColumnId[]) => void;
}

/** Choix des colonnes affichées (au moins une reste cochée). */
export function ColumnPicker({ visible, onChange }: Props) {
  const toggle = (id: ColumnId, checked: boolean) => {
    const next = COLUMNS.filter((c) => (c.id === id ? checked : visible.includes(c.id))).map((c) => c.id);
    if (next.length > 0) onChange(next);
  };
  return (
    <Popover position="bottom-end" shadow="none" withArrow={false}>
      <Popover.Target>
        <Button variant="default" size="sm" leftSection={<IconColumns3 size={16} stroke={1.6} />}>
          Colonnes
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6} role="group" aria-label="Colonnes affichées">
          {COLUMNS.map((c) => (
            <Checkbox
              key={c.id}
              size="xs"
              label={c.label}
              checked={visible.includes(c.id)}
              disabled={visible.length === 1 && visible.includes(c.id)}
              onChange={(e) => toggle(c.id, e.currentTarget.checked)}
            />
          ))}
          <Button variant="subtle" size="compact-xs" onClick={() => onChange(defaultVisibleColumns())}>
            Rétablir les colonnes par défaut
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
