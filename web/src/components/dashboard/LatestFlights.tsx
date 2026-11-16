import { ActionIcon, Table, VisuallyHidden } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { latestFlights } from '@/lib/dashboard';
import { EMPTY, fmtDate, fmtDateShort, fmtDuration, fmtInt, fmtOrDash, NBSP } from '@/lib/format';
import { syrideFlightUrl } from '@/lib/syride';

interface Props {
  /** Vols suivant les filtres globaux SAUF la période. */
  flights: readonly Flight[];
  /** Nombre de vols affichés. */
  count?: number;
}

export const LATEST_FLIGHTS_COUNT = 15;

/** « Derniers vols » : les vols les plus récents, avec lien vers la fiche vol et vers la trace sur Syride. */
export function LatestFlights({ flights, count = LATEST_FLIGHTS_COUNT }: Props) {
  const latest = useMemo(() => latestFlights(flights, count), [flights, count]);
  return (
    <Section id="derniers-vols" title="Derniers vols" subtitle={`Les ${count} vols les plus récents.`}>
      {latest.length === 0 ? (
        <EmptyNote />
      ) : (
        <Table.ScrollContainer minWidth={460}>
          <Table fz="sm" verticalSpacing={5} className="sr-tabular" data-testid="latest-flights">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vol</Table.Th>
                <Table.Th>Pilote</Table.Th>
                <Table.Th>Site</Table.Th>
                <Table.Th ta="right">Durée</Table.Th>
                <Table.Th ta="right">Plafond</Table.Th>
                <Table.Th w={32}>
                  <VisuallyHidden>Trace sur Syride</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {latest.map((f) => (
                <Table.Tr key={f.key}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    <FilterLink to={`/vol/${f.key}`}>
                      {fmtDateShort(f.date)}
                      {f.time ? ` ${f.time}` : ''}
                    </FilterLink>
                  </Table.Td>
                  <Table.Td>{f.pilot}</Table.Td>
                  <Table.Td>{f.site ?? EMPTY}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {fmtOrDash(f.durationMin, fmtDuration)}
                  </Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {f.ceilingM !== null && f.ceilingM > 0 ? `${fmtInt(f.ceilingM)}${NBSP}m` : EMPTY}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      component="a"
                      href={syrideFlightUrl(f.pilot, f.syrideNum)}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={`Voir la trace sur Syride : vol de ${f.pilot} du ${fmtDate(f.date, { withYear: true })}`}
                    >
                      <IconExternalLink size={15} stroke={1.6} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Section>
  );
}
