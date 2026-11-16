import { Table, Text } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import {
  formatRecordValue,
  RECENT_RECORD_DAYS,
  RECORD_METRICS,
  recentRecords,
} from '@/lib/dashboard';
import { fmtDateShort } from '@/lib/format';

interface Props {
  /** Vols suivant les filtres globaux SAUF la période. */
  flights: readonly Flight[];
  /** Date de référence (`referenceDate`). */
  today: string;
  /** Fenêtre en jours avant la date de référence. */
  days?: number;
}

/**
 * « Records récents » : records personnels (par pilote et discipline) battus dans les derniers jours.
 * Mis en avant par la couleur réservée aux records, sans médaille.
 */
export function RecentRecords({ flights, today, days = RECENT_RECORD_DAYS }: Props) {
  const records = useMemo(() => recentRecords(flights, today, days), [flights, today, days]);
  return (
    <Section
      id="records-recents"
      title="Records récents"
      subtitle={`Records personnels battus ces ${days} derniers jours, par pilote et par discipline.`}
    >
      {flights.length === 0 ? (
        <EmptyNote />
      ) : records.length === 0 ? (
        <Text size="sm" c="dimmed" role="status">
          {`Aucun record personnel battu ces ${days} derniers jours.`}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={460}>
          <Table fz="sm" verticalSpacing={5} className="sr-tabular" data-testid="recent-records">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pilote</Table.Th>
                <Table.Th>Critère</Table.Th>
                <Table.Th>Nouveau</Table.Th>
                <Table.Th>Ancien</Table.Th>
                <Table.Th>Vol</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {records.map((r) => (
                <Table.Tr key={`${r.pilotSlug}-${r.activity}-${r.metric}`}>
                  <Table.Td>{r.pilot}</Table.Td>
                  <Table.Td>{RECORD_METRICS[r.metric].label}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        background: 'var(--sr-gold-bg)',
                        color: 'var(--sr-gold-text)',
                        padding: '1px 8px',
                        borderRadius: 'var(--sr-radius-sm)',
                        fontWeight: 650,
                      }}
                    >
                      {formatRecordValue(r.metric, r.value)}
                    </span>
                  </Table.Td>
                  <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatRecordValue(r.metric, r.previous)}
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    <FilterLink to={`/vol/${r.flight.key}`}>{fmtDateShort(r.flight.date)}</FilterLink>
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
