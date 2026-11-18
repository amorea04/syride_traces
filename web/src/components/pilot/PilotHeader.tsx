import { Anchor } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router';
import { FilterLink } from '@/components/FilterLink';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { writeFilters } from '@/lib/filters';
import { fmtDate, fmtHm, fmtPercent, plural } from '@/lib/format';
import { sum } from '@/lib/numeric';
import { minutesOf } from '@/lib/rhythm';
import { syridePilotUrl } from '@/lib/syride';
import { useFiltersStore } from '@/store/filters';

interface Props {
  pilot: string;
  slug: string;
  /** Vols du pilote avec les filtres de la page (le filtre pilote est ignoré). */
  flights: readonly Flight[];
  /** Libellés des filtres qui réduisent la vue. */
  reduced: readonly string[];
}

/** En-tête : nom, volumes, dates, répartition des disciplines, liens Syride, ses vols et ses bilans. */
export function PilotHeader({ pilot, slug, flights, reduced }: Props) {
  const filters = useFiltersStore((s) => s.filters);
  // Lien « Voir ses vols » : filtres courants + filtre pilote.
  const flightsSearch = writeFilters('', { ...filters, pilots: [slug] });
  const dates = flights.map((f) => f.date).sort();
  const minutes = sum(flights.map(minutesOf));
  const para = sum(flights.filter((f) => f.activity === 'parapente').map(minutesOf));
  const motor = minutes - para;
  const years = [...new Set(flights.map((f) => f.year))].sort((a, b) => b - a);
  return (
    <header className="pl-head" data-testid="pilot-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="pl-title" data-testid="pilot-name">
          {pilot}
        </h1>
        {flights.length > 0 ? (
          <p className="pl-sub">
            {plural(flights.length, 'vol')} · {fmtHm(minutes)} · depuis {dates[0]?.slice(0, 4)} · dernier vol le{' '}
            {fmtDate(dates[dates.length - 1] as string, { withYear: true })}
          </p>
        ) : (
          <p className="pl-sub">Aucun vol pour ces filtres.</p>
        )}
        {reduced.length > 0 && (
          <p className="pl-sub" style={{ marginTop: -6 }} data-testid="pilot-filtered">
            Vue filtrée : {reduced.join(', ')}
          </p>
        )}
        <div className="pl-chips">
          {minutes > 0 && para > 0 && (
            <span className="pl-chip">
              <i className="pl-dot" style={{ background: 'var(--sr-p)' }} aria-hidden="true" />
              Parapente {fmtPercent((100 * para) / minutes)} du temps
            </span>
          )}
          {minutes > 0 && motor > 0 && (
            <span className="pl-chip">
              <i className="pl-dot" style={{ background: 'var(--sr-m)' }} aria-hidden="true" />
              Paramoteur {fmtPercent((100 * motor) / minutes)} du temps
            </span>
          )}
          <Anchor
            href={syridePilotUrl(pilot)}
            target="_blank"
            rel="noopener noreferrer"
            fz={13}
            data-testid="pilot-syride"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            Profil Syride <IconExternalLink size={14} aria-hidden="true" />
          </Anchor>
          <Anchor component={Link} to={{ pathname: '/vols', search: flightsSearch }} fz={13} data-testid="pilot-flights-link">
            Voir ses vols
          </Anchor>
        </div>
      </div>
      {years.length > 0 && (
        <nav aria-label="Bilans annuels" className="pl-years-nav">
          {years.map((y) => (
            <FilterLink key={y} to={`/pilote/${slug}/${y}`} underline="never">
              {y}
            </FilterLink>
          ))}
        </nav>
      )}
    </header>
  );
}
