import { Route, Routes } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { About } from '@/pages/About';
import { Compare } from '@/pages/Compare';
import { Dashboard } from '@/pages/Dashboard';
import { Flight } from '@/pages/Flight';
import { Flights } from '@/pages/Flights';
import { NotFound } from '@/pages/NotFound';
import { Pilot } from '@/pages/Pilot';
import { PilotYear } from '@/pages/PilotYear';
import { Pilots } from '@/pages/Pilots';
import { Records } from '@/pages/Records';
import { Site } from '@/pages/Site';
import { Sites } from '@/pages/Sites';

/** Routes de l'application (ROADMAP §3.4 et §5). Le routeur lui-même (`BrowserRouter`) est dans `main.tsx`. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="vols" element={<Flights />} />
        <Route path="vol/:key" element={<Flight />} />
        <Route path="pilotes" element={<Pilots />} />
        <Route path="pilote/:slug" element={<Pilot />} />
        <Route path="pilote/:slug/:annee" element={<PilotYear />} />
        <Route path="sites" element={<Sites />} />
        <Route path="site/:id" element={<Site />} />
        <Route path="comparer" element={<Compare />} />
        <Route path="records" element={<Records />} />
        <Route path="a-propos" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
