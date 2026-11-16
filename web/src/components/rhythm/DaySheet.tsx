import { Anchor, Button, Group, Modal, ScrollArea, Table, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDate, fmtDuration, fmtInt, NBSP, plural } from '@/lib/format';
import { dailySummaries } from '@/lib/rhythm';
import { flightsOfDay, neighborFlownDay } from '@/lib/rhythmBlocks';
import { syrideFlightUrl } from '@/lib/syride';

interface Props {
  /** Jour ouvert (`AAAA-MM-JJ`), `null` = fermé. */
  iso: string | null;
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
  onClose: () => void;
  /** Appelé avec le jour volé précédent ou suivant. */
  onChange: (iso: string) => void;
}

/** Fenêtre des vols d'un jour : heure, pilote, site, durée, plafond, liens fiche et Syride ; jours volés voisins. */
export function DaySheet({ iso, flights, onClose, onChange }: Props) {
  const dates = useMemo(() => dailySummaries(flights).map((d) => d.date), [flights]);
  const rows = useMemo(() => (iso === null ? [] : flightsOfDay(flights, iso)), [flights, iso]);
  const previous = iso === null ? null : neighborFlownDay(dates, iso, -1);
  const next = iso === null ? null : neighborFlownDay(dates, iso, 1);
  return (
    <Modal
      opened={iso !== null}
      onClose={onClose}
      size="lg"
      title={iso === null ? '' : fmtDate(iso, { weekday: true, withYear: true })}
      closeButtonProps={{ 'aria-label': 'Fermer' }}
    >
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucun vol ce jour-là pour ces filtres.
        </Text>
      ) : (
        <>
          <Text size="sm" c="dimmed" mb="xs">
            {plural(rows.length, 'vol')}
          </Text>
          <ScrollArea type="auto">
            <Table fz="sm" className="sr-tabular" verticalSpacing={4} data-testid="day-sheet-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Heure</Table.Th>
                  <Table.Th>Pilote</Table.Th>
                  <Table.Th>Site</Table.Th>
                  <Table.Th ta="right">Durée</Table.Th>
                  <Table.Th ta="right">Plafond</Table.Th>
                  <Table.Th>Liens</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((f) => (
                  <Table.Tr key={f.key}>
                    <Table.Td>{f.time ?? EMPTY}</Table.Td>
                    <Table.Td>{f.pilot}</Table.Td>
                    <Table.Td>{f.site ?? EMPTY}</Table.Td>
                    <Table.Td ta="right">{f.durationMin === null ? EMPTY : fmtDuration(f.durationMin)}</Table.Td>
                    <Table.Td ta="right">
                      {f.ceilingM === null || f.ceilingM <= 0 ? EMPTY : `${fmtInt(f.ceilingM)}${NBSP}m`}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <FilterLink to={`/vol/${f.key}`}>Fiche</FilterLink>
                        <Anchor
                          href={syrideFlightUrl(f.pilot, f.syrideNum)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Voir le vol de ${f.pilot} sur Syride (nouvel onglet)`}
                        >
                          Syride
                        </Anchor>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconChevronLeft size={14} />}
          disabled={previous === null}
          onClick={() => previous !== null && onChange(previous)}
        >
          Jour volé précédent
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          rightSection={<IconChevronRight size={14} />}
          disabled={next === null}
          onClick={() => next !== null && onChange(next)}
        >
          Jour volé suivant
        </Button>
      </Group>
    </Modal>
  );
}
