import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from '@/components/AppLayout';

// 6.1 : chaque page est un chunk chargé à la demande (ECharts et MapLibre n'entrent pas dans le chunk de démarrage).
const About = lazy(() => import('@/pages/About').then((m) => ({ default: m.About })));
const Compare = lazy(() => import('@/pages/Compare').then((m) => ({ default: m.Compare })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Flight = lazy(() => import('@/pages/Flight').then((m) => ({ default: m.Flight })));
const Flights = lazy(() => import('@/pages/Flights').then((m) => ({ default: m.Flights })));
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })));
const Pilot = lazy(() => import('@/pages/Pilot').then((m) => ({ default: m.Pilot })));
const PilotYear = lazy(() => import('@/pages/PilotYear').then((m) => ({ default: m.PilotYear })));
const Pilots = lazy(() => import('@/pages/Pilots').then((m) => ({ default: m.Pilots })));
const Records = lazy(() => import('@/pages/Records').then((m) => ({ default: m.Records })));
const Site = lazy(() => import('@/pages/Site').then((m) => ({ default: m.Site })));
const Sites = lazy(() => import('@/pages/Sites').then((m) => ({ default: m.Sites })));

/** Repli pendant le chargement d'une page : hauteur réservée, pas de saut de mise en page. */
function PageFallback() {
  return (
    <Center mih="60vh" role="status" aria-label="Chargement de la page">
      <Loader size="sm" color="gray" />
    </Center>
  );
}

/** Chunk de page injoignable (hors ligne sur une page jamais ouverte, déploiement entre-temps) : message plutôt que page blanche. */
class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
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

function page(element: ReactNode) {
  return (
    <PageErrorBoundary>
      <Suspense fallback={<PageFallback />}>{element}</Suspense>
    </PageErrorBoundary>
  );
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
