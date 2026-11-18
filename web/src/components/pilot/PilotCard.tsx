import { Anchor } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { FilterLink } from '@/components/FilterLink';
import '@/components/pilot/pilot.css';
import { fmtDate, fmtHm, plural } from '@/lib/format';
import type { PilotSummary } from '@/lib/pilots';
import { syridePilotUrl } from '@/lib/syride';

/** Carte sobre d'un pilote : nom (lien vers sa page), activité principale, volumes, dates, profil Syride. */
export function PilotCard({ row }: { row: PilotSummary }) {
  const para = row.mainActivity === 'parapente';
  return (
    <li className="pl-card" data-testid="pilot-card" data-slug={row.slug} style={{ listStyle: 'none' }}>
      <FilterLink to={`/pilote/${row.slug}`} className="pl-card-name" underline="never">
        {row.pilot}
      </FilterLink>
      <span className="pl-card-main">
        <i className="pl-dot" style={{ background: para ? 'var(--sr-p)' : 'var(--sr-m)' }} aria-hidden="true" />
        {para ? 'parapente' : 'paramoteur'}
      </span>
      <span className="pl-card-meta">
        {plural(row.flights, 'vol')} · {fmtHm(row.minutes)}
      </span>
      <span className="pl-card-meta">
        Première année {row.firstYear} · dernier vol le {fmtDate(row.lastDate, { withYear: true })}
      </span>
      <Anchor
        href={syridePilotUrl(row.pilot)}
        target="_blank"
        rel="noopener noreferrer"
        className="pl-card-ext"
        aria-label={`Profil de ${row.pilot} sur Syride`}
      >
        Profil Syride <IconExternalLink size={13} aria-hidden="true" />
      </Anchor>
    </li>
  );
}
