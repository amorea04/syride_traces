import { Table } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { SyrideTraceLink } from '@/components/site/SyrideTraceLink';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDateNumeric, fmtDuration } from '@/lib/format';
import { MEASURES, formatMeasure } from '@/lib/measures';
import { latestFlightsOf } from '@/lib/sites';

/** Nombre de vols listés. */
export const LATEST_COUNT = 20;

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

/** Les derniers vols du site, chacun avec sa fiche et un lien vers la trace sur Syride. */
export function SiteLatestFlights({ flights }: Props) {
  const rows = useMemo(() => latestFlightsOf(flights, LATEST_COUNT), [flights]);
  return (
    <Section
      id="derniers-vols"
      title="Derniers vols"
      subtitle={`Les ${LATEST_COUNT} vols les plus récents sur ce site.`}
    >
      <Table.ScrollContainer minWidth={620}>
        <Table fz="sm" highlightOnHover className="sr-tabular" data-testid="site-latest">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Pilote</Table.Th>
              <Table.Th>Voile</Table.Th>
              <Table.Th ta="right">Durée</Table.Th>
              <Table.Th ta="right">Plafond</Table.Th>
              <Table.Th>Fiche</Table.Th>
              <Table.Th>
                <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                  Trace sur Syride
                </span>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((f) => (
              <Table.Tr key={f.key} data-testid="latest-row">
                <Table.Td>
                  {fmtDateNumeric(f.date)}
                  {f.time ? ` ${f.time}` : ''}
                </Table.Td>
                <Table.Td>
                  <FilterLink to={`/pilote/${f.pilotSlug}`}>{f.pilot}</FilterLink>
                </Table.Td>
                <Table.Td>{f.wing ?? EMPTY}</Table.Td>
                <Table.Td ta="right">{f.durationMin === null ? EMPTY : fmtDuration(f.durationMin)}</Table.Td>
                <Table.Td ta="right">
                  {f.ceilingM === null ? EMPTY : formatMeasure(MEASURES.plafond, f.ceilingM)}
                </Table.Td>
                <Table.Td>
                  <FilterLink to={`/vol/${f.key}`} data-testid="latest-flight-link">
                    Voir le vol
                  </FilterLink>
                </Table.Td>
                <Table.Td>
                  <SyrideTraceLink flight={f} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Section>
  );
}
