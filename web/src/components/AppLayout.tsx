import { AppShell, Box, Drawer, ScrollArea, Stack } from '@mantine/core';
import { useDisclosure, useHotkeys, useMediaQuery } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { ActiveFilters } from '@/components/ActiveFilters';
import { AppFooter } from '@/components/AppFooter';
import { AppHeader, useToggleColorScheme } from '@/components/AppHeader';
import { FilterPanel, PILOT_SEARCH_ID } from '@/components/FilterPanel';
import { ShortcutsHelp } from '@/components/ShortcutsHelp';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';

/** En dessous de cette largeur (px) : filtres dans un tiroir du bas plutôt qu'une barre latérale. */
export const MOBILE_MAX_WIDTH = 767;
const NAVBAR_WIDTH = 300;
const HEADER_HEIGHT = 56;
/** Caractères des touches 1, 2, 3 sur un clavier AZERTY, sans Maj. */
const AZERTY_DIGITS = ['&', 'é', '"'] as const;

export function AppLayout() {
  const isMobile =
    useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`, false, { getInitialValueInEffect: false }) ?? false;
  const [sidebarOpen, sidebar] = useDisclosure(true);
  const [drawerOpen, drawer] = useDisclosure(false);
  const setFilters = useFiltersStore((s) => s.setFilters);
  const { toggle: toggleTheme } = useToggleColorScheme();
  const [helpOpen, help] = useDisclosure(false);
  const [wantPilotFocus, setWantPilotFocus] = useState(false);
  const filtersOpen = isMobile ? drawerOpen : sidebarOpen;
  const toggleFilters = isMobile ? drawer.toggle : sidebar.toggle;

  const focusPilotSearch = () => {
    if (!filtersOpen) (isMobile ? drawer.open : sidebar.open)();
    setWantPilotFocus(true);
  };
  const showHelp = () => help.open();
  // Le panneau (ou le tiroir, animé) peut ne pas être monté tout de suite : on réessaie quelques images.
  useEffect(() => {
    if (!wantPilotFocus || !filtersOpen) return;
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      const el = document.getElementById(PILOT_SEARCH_ID);
      if (el) {
        el.focus();
        setWantPilotFocus(false);
      } else if (tries < 60) {
        tries += 1;
        raf = requestAnimationFrame(attempt);
      } else setWantPilotFocus(false);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [wantPilotFocus, filtersOpen]);

  useHotkeys([
    ['t', toggleTheme],
    // Chiffres : sur AZERTY, la rangée du haut donne « & é " » sans Maj et « 1 2 3 » avec Maj.
    ...(['tout', 'parapente', 'paramoteur'] as const).flatMap((activity, i) =>
      [String(i + 1), `shift+${i + 1}`, AZERTY_DIGITS[i]].map(
        (key) => [key, () => setFilters({ activity })] as [string, () => void],
      ),
    ),
    // Sur clavier AZERTY, « / » et « ? » demandent Maj : on accepte les deux états.
    ['/', focusPilotSearch],
    ['shift+/', focusPilotSearch],
    ['?', showHelp],
    ['shift+?', showHelp],
    [
      'Escape',
      () => {
        useHighlightStore.getState().setHighlight(null);
        help.close();
        drawer.close();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
    ],
  ]);

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

      <ShortcutsHelp opened={helpOpen} onClose={help.close} />

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
