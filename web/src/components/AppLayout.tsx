import { AppShell, Box, Drawer, ScrollArea, Stack } from '@mantine/core';
import { useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import { Outlet } from 'react-router';
import { ActiveFilters } from '@/components/ActiveFilters';
import { AppFooter } from '@/components/AppFooter';
import { AppHeader, useToggleColorScheme } from '@/components/AppHeader';
import { FilterPanel } from '@/components/FilterPanel';
import { useFiltersStore } from '@/store/filters';

/** En dessous de cette largeur (px) : filtres dans un tiroir du bas plutôt qu'une barre latérale. */
export const MOBILE_MAX_WIDTH = 767;
const NAVBAR_WIDTH = 300;
const HEADER_HEIGHT = 56;

export function AppLayout() {
  const isMobile =
    useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`, false, { getInitialValueInEffect: false }) ?? false;
  const [sidebarOpen, sidebar] = useDisclosure(true);
  const [drawerOpen, drawer] = useDisclosure(false);
  const setFilters = useFiltersStore((s) => s.setFilters);
  const { toggle: toggleTheme } = useToggleColorScheme();

  useHotkeys([
    ['t', toggleTheme],
    ['1', () => setFilters({ activity: 'tout' })],
    ['2', () => setFilters({ activity: 'parapente' })],
    ['3', () => setFilters({ activity: 'paramoteur' })],
    [
      'Escape',
      () => {
        drawer.close();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
    ],
  ]);

  const filtersOpen = isMobile ? drawerOpen : sidebarOpen;
  const toggleFilters = isMobile ? drawer.toggle : sidebar.toggle;

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: NAVBAR_WIDTH, breakpoint: 'sm', collapsed: { mobile: true, desktop: !sidebarOpen } }}
      padding={0}
    >
      <a
        href="#contenu"
        style={{ position: 'absolute', left: -9999 }}
        onFocus={(e) => (e.currentTarget.style.left = '8px')}
        onBlur={(e) => (e.currentTarget.style.left = '-9999px')}
      >
        Aller au contenu
      </a>
      <AppShell.Header component="header">
        <AppHeader filtersOpen={filtersOpen} onToggleFilters={toggleFilters} />
      </AppShell.Header>

      <AppShell.Navbar
        component="aside"
        aria-label="Filtres"
        id={isMobile ? undefined : 'panneau-filtres'}
        style={isMobile ? { display: 'none' } : undefined}
      >
        {!isMobile && sidebarOpen && (
          <ScrollArea p="md" h="100%">
            <FilterPanel />
          </ScrollArea>
        )}
      </AppShell.Navbar>

      {isMobile && (
        <Drawer
          opened={drawerOpen}
          onClose={drawer.close}
          position="bottom"
          size="85%"
          title="Filtres"
          id="panneau-filtres"
          closeButtonProps={{ 'aria-label': 'Fermer les filtres' }}
        >
          <FilterPanel />
        </Drawer>
      )}

      <AppShell.Main
        component="div"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}
      >
        <Box component="main" id="contenu" tabIndex={-1} px="md" pt="md" style={{ flex: 1 }}>
          <Stack gap="md">
            <ActiveFilters />
            <Outlet />
          </Stack>
        </Box>
        <AppFooter />
      </AppShell.Main>
    </AppShell>
  );
}
