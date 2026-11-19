import { ActionIcon, Anchor, Button, Group, Menu } from '@mantine/core';
import { IconChevronDown, IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useFilterSearch } from '@/components/FilterLink';
import '@/components/pilot/pilot.css';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { pilotYears } from '@/lib/bilan';
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
  // Le bilan ignore les filtres : ses années viennent de tous les vols du pilote.
  const { flights: all } = useData();
  const bilanYears = useMemo(() => pilotYears(all, slug), [all, slug]);
  const latest = bilanYears[0];
  const others = bilanYears.slice(1);
  const search = useFilterSearch();
  return (
    <header className="pl-head" data-testid="pilot-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="pl-title" data-testid="pilot-name">
          {pilot}
        </h1>
        {flights.length > 0 ? (
          <p className="pl-sub">
            {plural(flights.length, 'vol')} · {fmtHm(minutes)} · depuis {dates[0]?.slice(0, 4)} · dernier vol
            le {fmtDate(dates[dates.length - 1] as string, { withYear: true })}
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
          <Anchor
            component={Link}
            to={{ pathname: '/vols', search: flightsSearch }}
            fz={13}
            data-testid="pilot-flights-link"
          >
            Voir ses vols
          </Anchor>
        </div>
      </div>
      {latest !== undefined && (
        <Group gap={4} wrap="nowrap" data-testid="pilot-bilan-access">
          <Button
            component={Link}
            styles={{ root: { background: 'var(--sr-accent)', color: 'var(--sr-accent-ink)' } }}
            to={{ pathname: `/pilote/${slug}/${latest}`, search }}
            data-testid="pilot-bilan-button"
          >
            Voir le bilan {latest}
          </Button>
          {others.length > 0 && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon
                  variant="default"
                  size={36}
                  aria-label="Bilans des autres années"
                  data-testid="pilot-bilan-menu"
                >
                  <IconChevronDown size={16} aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {others.map((y) => (
                  <Menu.Item key={y} component={Link} to={{ pathname: `/pilote/${slug}/${y}`, search }}>
                    Bilan {y}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      )}
    </header>
  );
}
