import { KpiCard } from '@/components/common/KpiCard';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtHm, fmtInt, NBSP } from '@/lib/format';
import { computeKpis } from '@/lib/records';
import { useMemo } from 'react';

/** Chiffres clés du pilote : vols, heures, sites, kilomètres, plafond max, jours volés. */
export function PilotKpis({ flights }: { flights: readonly Flight[] }) {
  const k = useMemo(() => computeKpis(flights), [flights]);
  const items: { id: string; label: string; value: string }[] = [
    { id: 'vols', label: 'Vols', value: fmtInt(k.nFlights) },
    { id: 'heures', label: 'Heures de vol', value: fmtHm(k.minutes) },
    { id: 'sites', label: 'Sites', value: fmtInt(k.nSites) },
    { id: 'km', label: 'Distance cumulée', value: k.distanceTotal === null ? EMPTY : `${fmtInt(k.distanceTotal)}${NBSP}km` },
    { id: 'plafond', label: 'Plafond max', value: k.ceilingMax === null ? EMPTY : `${fmtInt(k.ceilingMax)}${NBSP}m` },
    { id: 'jours', label: 'Jours volés', value: fmtInt(k.daysFlown) },
  ];
  return (
    <div className="pl-kpis" data-testid="pilot-kpis">
      {items.map((i) => (
        <div key={i.id} className="pl-kpi">
          <KpiCard testId={`pilot-kpi-${i.id}`} label={i.label} value={<span style={{ fontSize: 24 }}>{i.value}</span>} />
        </div>
      ))}
    </div>
  );
}
