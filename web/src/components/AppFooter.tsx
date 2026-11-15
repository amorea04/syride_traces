import { Group, Text } from '@mantine/core';
import { FilterLink } from '@/components/FilterLink';
import { UPDATE_NOTICE } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { fmtDate } from '@/lib/format';

export function AppFooter() {
  const { meta } = useData();
  return (
    <Group component="footer" justify="space-between" gap="xs" px="md" py="md" mt="xl" className="sr-footer">
      <Text size="xs" c="dimmed">
        {UPDATE_NOTICE}
      </Text>
      <Group gap="md">
        <Text size="xs" c="dimmed">
          Données mises à jour le {fmtDate(meta.data_updated_at, { withYear: true })}
        </Text>
        <FilterLink to="/a-propos" size="xs">
          À propos
        </FilterLink>
      </Group>
    </Group>
  );
}
