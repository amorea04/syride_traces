import { Table } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { fmtDateNumeric, fmtHm, fmtInt } from '@/lib/format';
import { sitePilotRows } from '@/lib/sites';

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

/** Pilotes présents sur le site : vols, heures, dernier vol, lien vers la page du pilote. */
export function SitePilots({ flights }: Props) {
  const rows = useMemo(() => sitePilotRows(flights), [flights]);
  return (
    <Section
      id="pilotes"
      title="Pilotes présents"
      subtitle="Les pilotes qui ont décollé de ce site, du plus assidu au moins assidu."
    >
      <Table.ScrollContainer minWidth={420}>
        <Table fz="sm" highlightOnHover className="sr-tabular" data-testid="site-pilots">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pilote</Table.Th>
              <Table.Th ta="right">Vols</Table.Th>
              <Table.Th ta="right">Heures</Table.Th>
              <Table.Th ta="right">Dernier vol</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.pilotSlug}>
                <Table.Td>
                  <FilterLink to={`/pilote/${r.pilotSlug}`}>{r.pilot}</FilterLink>
                </Table.Td>
                <Table.Td ta="right">{fmtInt(r.flights)}</Table.Td>
                <Table.Td ta="right">{fmtHm(r.minutes)}</Table.Td>
                <Table.Td ta="right">{fmtDateNumeric(r.lastDate)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Section>
  );
}
