import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconAdjustmentsHorizontal, IconMoon, IconSun } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router';
import { FilterLink, useFilterSearch } from '@/components/FilterLink';
import { APP_NAME, NAV_ITEMS, isNavActive } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { countActiveFilters } from '@/lib/filters';
import { fmtDate } from '@/lib/format';
import { useFiltersStore } from '@/store/filters';

interface Props {
  filtersOpen: boolean;
  onToggleFilters: () => void;
}

/** Hook de bascule clair/sombre (le choix est mémorisé par Mantine dans le stockage local). */
export function useToggleColorScheme(): { scheme: 'light' | 'dark'; toggle: () => void } {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  return { scheme, toggle: () => setColorScheme(scheme === 'light' ? 'dark' : 'light') };
}

export function AppHeader({ filtersOpen, onToggleFilters }: Props) {
  const { meta } = useData();
  const { pathname } = useLocation();
  const search = useFilterSearch();
  const filters = useFiltersStore((s) => s.filters);
  const active = countActiveFilters(filters);
  const { scheme, toggle } = useToggleColorScheme();
  const switchLabel = scheme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair';

  return (
    <Group h="100%" px="md" gap="lg" wrap="nowrap" justify="space-between">
      <Anchor
        component={Link}
        to={{ pathname: '/', search }}
        underline="never"
        c="inherit"
        visibleFrom="sm"
        className="sr-brand"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M3 18 9 7l4 6 2-3 6 8z" fill="var(--sr-accent)" />
        </svg>
        {APP_NAME}
      </Anchor>

      <Box
        component="nav"
        aria-label="Navigation principale"
        style={{ overflowX: 'auto', flex: 1, minWidth: 0 }}
      >
        <Group gap="lg" wrap="nowrap" component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item, pathname);
            return (
              <li key={item.to}>
                <FilterLink
                  to={item.to}
                  nav
                  end={item.to === '/'}
                  isActive={active}
                  underline="never"
                  className="sr-nav-link"
                  size="sm"
                >
                  {item.label}
                </FilterLink>
              </li>
            );
          })}
        </Group>
      </Box>

      <Group gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed" visibleFrom="lg" style={{ whiteSpace: 'nowrap' }}>
          Données au {fmtDate(meta.data_updated_at, { withYear: true })}
        </Text>
        <Button
          variant={filtersOpen ? 'light' : 'default'}
          size="compact-sm"
          leftSection={<IconAdjustmentsHorizontal size={16} aria-hidden />}
          aria-expanded={filtersOpen}
          aria-controls="panneau-filtres"
          onClick={onToggleFilters}
        >
          Filtres{active > 0 ? ` (${active})` : ''}
        </Button>
        <Tooltip label={`${switchLabel} (t)`}>
          <ActionIcon variant="default" aria-label={switchLabel} onClick={toggle}>
            {scheme === 'light' ? <IconMoon size={16} aria-hidden /> : <IconSun size={16} aria-hidden />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
