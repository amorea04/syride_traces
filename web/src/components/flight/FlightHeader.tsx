import { IconExternalLink } from '@tabler/icons-react';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import type { Flight } from '@/data/flight';
import { fmtDate, fmtDateShort } from '@/lib/format';
import { syrideFlightUrl } from '@/lib/syride';
import { useScheme } from '@/components/dashboard/shared';
import { disciplineColor } from '@/theme/tokens';

const ACTIVITY_LABEL = { parapente: 'Parapente', paramoteur: 'Paramoteur' } as const;

/** Texte du lien Syride (libellé et nom accessible). */
export const SYRIDE_LABEL = 'Voir la trace sur Syride';

/** « samedi 12 septembre 2026, 12:12 » (l'heure est omise si elle est inconnue). */
export function fmtFlightMoment(flight: Pick<Flight, 'date' | 'time'>): string {
  const day = fmtDate(flight.date, { withYear: true, weekday: true });
  return flight.time ? `${day}, ${flight.time}` : day;
}

interface Props {
  flight: Flight;
}

/** En-tête de la fiche : site, pilote, moment, pastilles, et le bouton principal vers la trace sur Syride. */
export function FlightHeader({ flight }: Props) {
  const scheme = useScheme();
  const url = syrideFlightUrl(flight.pilot, flight.syrideNum);
  const title = flight.site ?? 'Site non renseigné';
  return (
    <header className="fv-head">
      <div style={{ minWidth: 0 }}>
        <div className="fv-eyebrow" style={{ marginBottom: 8 }}>
          <FilterLink to="/vols" c="inherit">
            Vols
          </FilterLink>
          {' › '}
          {flight.pilot} · {fmtDateShort(flight.date)}
        </div>
        <h1 className="fv-title" data-testid="flight-title">
          {flight.siteId !== null ? <FilterLink to={`/site/${flight.siteId}`}>{title}</FilterLink> : title}
        </h1>
        <p className="fv-sub">
          <FilterLink to={`/pilote/${flight.pilotSlug}`} data-testid="flight-pilot">
            {flight.pilot}
          </FilterLink>
          {' · '}
          {fmtFlightMoment(flight)}
        </p>
        <div className="fv-chips">
          <span className="fv-chip">
            <i className="fv-dot" style={{ background: disciplineColor(flight.activity, scheme) }} />
            {ACTIVITY_LABEL[flight.activity]}
          </span>
          {flight.mode && <span className="fv-chip">Mode : {flight.mode}</span>}
          {flight.wing && <span className="fv-chip">Voile : {flight.wing}</span>}
          {flight.instrument && <span className="fv-chip">Instrument : {flight.instrument}</span>}
        </div>
      </div>
      <div className="fv-actions">
        <a
          className="fv-primary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${SYRIDE_LABEL} (nouvel onglet)`}
          data-testid="syride-button"
        >
          {SYRIDE_LABEL}
          <IconExternalLink size={18} aria-hidden="true" />
        </a>
        <span style={{ fontSize: 13, color: 'var(--sr-muted)' }}>
          S’ouvre sur syride.com, dans un nouvel onglet.
        </span>
      </div>
    </header>
  );
}
