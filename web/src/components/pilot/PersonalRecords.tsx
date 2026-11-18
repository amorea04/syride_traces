import { Anchor } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { fmtDate, EMPTY } from '@/lib/format';
import { MEASURES, formatMeasure } from '@/lib/measures';
import { personalRecords } from '@/lib/pilots';
import { syrideFlightUrl } from '@/lib/syride';

/** Records personnels : chacun lié à sa fiche vol et à Syride. L'or ne sert qu'ici. */
export function PersonalRecords({ flights }: { flights: readonly Flight[] }) {
  const records = useMemo(() => personalRecords(flights), [flights]);
  return (
    <Section id="records" title="Records personnels" subtitle="Chaque record mène à la fiche du vol.">
      <div className="pl-recs" data-testid="pilot-records">
        {records.map((r) => (
          <div key={r.key} className="pl-rec" data-record={r.key}>
            <span className="pl-rec-label">
              <i className="pl-rec-diamond" aria-hidden="true" />
              {r.label}
            </span>
            <span className="pl-rec-value">{r.entry ? formatMeasure(MEASURES[r.key], r.entry.value) : EMPTY}</span>
            {r.entry && (
              <>
                <span className="pl-rec-meta">
                  {r.entry.site ? `${r.entry.site} · ` : ''}
                  {fmtDate(r.entry.date, { withYear: true })}
                </span>
                <span className="pl-rec-links">
                  <FilterLink to={`/vol/${r.entry.flightKey}`} data-testid="record-flight-link">
                    Fiche du vol
                  </FilterLink>
                  <Anchor
                    href={syrideFlightUrl(r.entry.pilot, r.entry.syrideNum)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Voir la trace sur Syride"
                    data-testid="record-syride-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                  >
                    Syride <IconExternalLink size={12} aria-hidden="true" />
                  </Anchor>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
