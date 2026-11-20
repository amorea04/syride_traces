import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { AppLayout } from '@/components/AppLayout';

const BASE = import.meta.env.BASE_URL;

// 6.1 : chaque page est un chunk chargé à la demande (ECharts et MapLibre n'entrent pas dans le chunk de démarrage).
const loadAbout = () => import('@/pages/About').then((m) => ({ default: m.About }));
const About = lazy(loadAbout);
const loadCompare = () => import('@/pages/Compare').then((m) => ({ default: m.Compare }));
const Compare = lazy(loadCompare);
const loadDashboard = () => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard }));
const Dashboard = lazy(loadDashboard);
const loadFlight = () => import('@/pages/Flight').then((m) => ({ default: m.Flight }));
const Flight = lazy(loadFlight);
const loadFlights = () => import('@/pages/Flights').then((m) => ({ default: m.Flights }));
const Flights = lazy(loadFlights);
const loadNotFound = () => import('@/pages/NotFound').then((m) => ({ default: m.NotFound }));
const NotFound = lazy(loadNotFound);
const loadPilot = () => import('@/pages/Pilot').then((m) => ({ default: m.Pilot }));
const Pilot = lazy(loadPilot);
const loadPilotYear = () => import('@/pages/PilotYear').then((m) => ({ default: m.PilotYear }));
const PilotYear = lazy(loadPilotYear);
const loadPilots = () => import('@/pages/Pilots').then((m) => ({ default: m.Pilots }));
const Pilots = lazy(loadPilots);
const loadRecords = () => import('@/pages/Records').then((m) => ({ default: m.Records }));
const Records = lazy(loadRecords);
const loadSite = () => import('@/pages/Site').then((m) => ({ default: m.Site }));
const Site = lazy(loadSite);
const loadSites = () => import('@/pages/Sites').then((m) => ({ default: m.Sites }));
const Sites = lazy(loadSites);

/**
 * Lance le téléchargement de la page de l'adresse courante sans attendre les données (6.3) : les deux transferts
 * se font en parallèle au lieu de s'enchaîner. `lazy` réutilise la même promesse d'import.
 */
export function preloadRoute(pathname: string): void {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length - 1) : pathname;
  const seg = path.split('/').filter(Boolean);
  const first = seg[0];
  const loader =
    first === undefined
      ? loadDashboard
      : first === 'vols'
        ? loadFlights
        : first === 'vol'
          ? loadFlight
          : first === 'pilotes'
            ? loadPilots
            : first === 'pilote'
              ? seg.length > 2
                ? loadPilotYear
                : loadPilot
              : first === 'sites'
                ? loadSites
                : first === 'site'
                  ? loadSite
                  : first === 'comparer'
                    ? loadCompare
                    : first === 'records'
                      ? loadRecords
                      : first === 'a-propos'
                        ? loadAbout
                        : null;
  void loader?.().catch(() => undefined);
}

/** Repli pendant le chargement d'une page : pleine hauteur, pour que le pied de page reste hors écran (pas de décalage au chargement). */
function PageFallback() {
  return (
    <Center mih="100dvh" role="status" aria-label="Chargement de la page">
      <Loader size="sm" color="gray" />
    </Center>
  );
}

/** Chunk de page injoignable (hors ligne sur une page jamais ouverte, déploiement entre-temps) : message plutôt que page blanche. */
export class PageErrorBoundary extends Component<
  { children: ReactNode; /** Change à chaque navigation : l'erreur de la route précédente est alors oubliée. */ resetKey?: string },
  { failed: boolean }
> {
  override state = { failed: false };
  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page non chargée', error, info.componentStack);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Center mih="60vh">
        <Stack align="center" gap="xs" role="alert">
          <Text>Cette page n’a pas pu être chargée. Vérifiez votre connexion, puis réessayez.</Text>
          <Button variant="default" size="xs" onClick={() => window.location.reload()}>
            Recharger la page
          </Button>
        </Stack>
      </Center>
    );
  }
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </PageErrorBoundary>
  );
}

function page(element: ReactNode) {
  return <RouteBoundary>{element}</RouteBoundary>;
}

/** Routes de l'application (ROADMAP §3.4 et §5). Le routeur lui-même (`BrowserRouter`) est dans `main.tsx`. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={page(<Dashboard />)} />
        <Route path="vols" element={page(<Flights />)} />
        <Route path="vol/:key" element={page(<Flight />)} />
        <Route path="pilotes" element={page(<Pilots />)} />
        <Route path="pilote/:slug" element={page(<Pilot />)} />
        <Route path="pilote/:slug/:annee" element={page(<PilotYear />)} />
        <Route path="sites" element={page(<Sites />)} />
        <Route path="site/:id" element={page(<Site />)} />
        <Route path="comparer" element={page(<Compare />)} />
        <Route path="records" element={page(<Records />)} />
        <Route path="a-propos" element={page(<About />)} />
        <Route path="*" element={page(<NotFound />)} />
      </Route>
    </Routes>
  );
}
