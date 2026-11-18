import { IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { Section } from '@/components/common/Section';
import { useScheme } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import { SYRIDE_LABEL } from '@/components/flight/FlightHeader';
import type { Flight } from '@/data/flight';
import type { SameDay as SameDayFlights } from '@/lib/flightContext';
import { fmtDateShort, fmtDuration, fmtInt, plural } from '@/lib/format';
import { syrideFlightUrl } from '@/lib/syride';
import { disciplineColor } from '@/theme/tokens';

/** Nombre de vols montrés avant « Afficher tout » (les jours chargés dépassent la trentaine). */
export const SAME_DAY_VISIBLE = 8;

function detail(f: Flight): string {
  const parts = [
    f.time,
    f.durationMin === null ? null : fmtDuration(f.durationMin),
    f.ceilingM === null ? null : `plafond ${fmtInt(f.ceilingM)} m`,
  ];
  return parts.filter(Boolean).join(' · ');
}

function FlightList({
  flights,
  label,
  withSite,
}: {
  flights: readonly Flight[];
  label: string;
  withSite: boolean;
}) {
  const scheme = useScheme();
  const [all, setAll] = useState(false);
  const shown = all ? flights : flights.slice(0, SAME_DAY_VISIBLE);
  return (
    <>
      <ul className="fv-list" aria-label={label}>
        {shown.map((f) => (
          <li className="fv-li" key={f.key} data-testid="same-day-item">
            <i
              className="fv-dot"
              style={{ background: disciplineColor(f.activity, scheme) }}
              aria-hidden="true"
            />
            <div style={{ minWidth: 0 }}>
              <FilterLink to={`/vol/${f.key}`} className="fv-li-main" c="inherit" underline="hover">
                {f.pilot}
                {withSite && f.site ? ` · ${f.site}` : ''}
              </FilterLink>
              <div className="fv-li-sub">{detail(f)}</div>
            </div>
            <a
              className="fv-ico"
              href={syrideFlightUrl(f.pilot, f.syrideNum)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${SYRIDE_LABEL} : vol de ${f.pilot} (nouvel onglet)`}
              title={SYRIDE_LABEL}
            >
              <IconExternalLink size={16} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      {flights.length > SAME_DAY_VISIBLE && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          style={{
            background: 'none',
            border: 0,
            padding: '6px 0',
            color: 'var(--sr-accent-text)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {all ? 'Réduire la liste' : `Afficher les ${fmtInt(flights.length)} vols`}
        </button>
      )}
    </>
  );
}

interface Props {
  flight: Flight;
  sameDay: SameDayFlights;
}

/** Autres vols du même jour au même site (tous pilotes), puis les autres vols du pilote ce jour-là ailleurs. */
export function SameDay({ flight, sameDay }: Props) {
  const { sameSite, elsewhere } = sameDay;
  const day = fmtDateShort(flight.date);
  const empty = sameSite.length === 0 && elsewhere.length === 0;
  return (
    <Section
      id="meme-jour"
      title="Vols du même jour"
      subtitle={
        flight.site && sameSite.length > 0
          ? `${plural(sameSite.length, 'autre vol')} à ${flight.site} le ${day}, tous pilotes.`
          : undefined
      }
    >
      {empty ? (
        <p className="fv-note" style={{ margin: 0 }} role="status">
          Aucun autre vol ce jour-là{flight.site ? ' à ce site' : ''}.
        </p>
      ) : (
        <div data-testid="same-day">
          {sameSite.length > 0 && <FlightList flights={sameSite} label="Même site" withSite={false} />}
          {elsewhere.length > 0 && (
            <div style={{ marginTop: sameSite.length > 0 ? 16 : 0 }}>
              <div className="fv-eyebrow" style={{ marginBottom: 2 }}>
                Autres vols de {flight.pilot} ce jour-là, ailleurs
              </div>
              <FlightList flights={elsewhere} label={`Autres vols de ${flight.pilot}`} withSite />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
