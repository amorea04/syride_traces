import { Table, Text } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { characteristics, formatCharacteristic } from '@/lib/dashboard';
import { EMPTY, fmtDateShort } from '@/lib/format';

interface Props {
  /** Sélection courante (filtres globaux appliqués). */
  flights: readonly Flight[];
}

/** « Caractéristiques de vol » : moyenne, médiane et maximum ; le maximum ouvre le vol record. */
export function FlightCharacteristics({ flights }: Props) {
  const rows = useMemo(() => characteristics(flights), [flights]);
  return (
    <Section
      id="caracteristiques"
      title="Caractéristiques de vol"
      subtitle="Mesures absentes ou nulles ignorées. Le maximum renvoie au vol concerné."
    >
      {flights.length === 0 ? (
        <EmptyNote />
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table fz="sm" verticalSpacing={6} className="sr-tabular" data-testid="characteristics">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mesure</Table.Th>
                <Table.Th ta="right">Moyenne</Table.Th>
                <Table.Th ta="right">Médiane</Table.Th>
                <Table.Th ta="right">Maximum</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.label}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {r.mean === null ? EMPTY : formatCharacteristic(r, r.mean)}
                  </Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {r.median === null ? EMPTY : formatCharacteristic(r, r.median)}
                  </Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                    {r.max === null || r.maxFlight === null ? (
                      EMPTY
                    ) : (
                      <>
                        <FilterLink to={`/vol/${r.maxFlight.key}`} fw={650}>
                          {formatCharacteristic(r, r.max)}
                        </FilterLink>
                        <Text span size="xs" c="dimmed">
                          {` ${r.maxFlight.pilot}, ${fmtDateShort(r.maxFlight.date)}`}
                        </Text>
                      </>
                    )}
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
