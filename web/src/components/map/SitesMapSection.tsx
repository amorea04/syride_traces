import { Button, ScrollArea, SegmentedControl, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { SitesMap } from '@/components/map/SitesMap';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { fmtHm, fmtInt, plural } from '@/lib/format';
import { aggregateSites } from '@/lib/mapSites';

const MAP_HEIGHT = 460;
const MAP_HEIGHT_MOBILE = 320;
/** Nombre de sites listés dans « Voir les données ». */
const TABLE_TOP = 15;

type Mode = 'cercles' | 'heatmap';

interface Props {
  /** Sélection courante (déjà filtrée). */
  flights: readonly Flight[];
}

/** Section « Carte des sites » du tableau de bord : carte, bascule cercles/heatmap, tableau alternatif. */
export function SitesMapSection({ flights }: Props) {
  const { siteById } = useData();
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;
  const [mode, setMode] = useState<Mode>('cercles');
  const [showTable, setShowTable] = useState(false);
  const data = useMemo(() => aggregateSites(flights, siteById), [flights, siteById]);
  const empty = flights.length === 0;

  return (
    <Section
      id="carte-sites"
      title="Carte des sites"
      subtitle="Un point par site de décollage&nbsp;; la taille suit le nombre de vols. Les cercles groupés indiquent un nombre de sites. La carte est cadrée sur les zones où ont lieu 90&nbsp;% des vols&nbsp;; dézoomez pour voir les plus lointains."
      actions={
        !empty && (
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            aria-label="Mode d’affichage de la carte"
            data={[
              { value: 'cercles', label: 'Cercles' },
              { value: 'heatmap', label: 'Heatmap' },
            ]}
          />
        )
      }
    >
      {empty ? (
        <Text c="dimmed" size="sm">
          Aucun vol pour ces filtres.
        </Text>
      ) : (
        <>
          <SitesMap
            data={data}
            height={isMobile ? MAP_HEIGHT_MOBILE : MAP_HEIGHT}
            heatmap={mode === 'heatmap'}
          />
          {data.sitesWithoutCoords > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              {plural(data.sitesWithoutCoords, 'site')} sans coordonnées (
              {plural(data.flightsWithoutCoords, 'vol')}), absent
              {data.sitesWithoutCoords > 1 ? 's' : ''} de la carte.
            </Text>
          )}
          {showTable && (
            <ScrollArea.Autosize mah={320} mt="xs">
              <Table striped highlightOnHover stickyHeader fz="sm" className="sr-tabular">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Site</Table.Th>
                    <Table.Th ta="right">Vols</Table.Th>
                    <Table.Th ta="right">Heures</Table.Th>
                    <Table.Th ta="right">Pilotes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.rows.slice(0, TABLE_TOP).map((r) => (
                    <Table.Tr key={r.siteId}>
                      <Table.Td>{r.name}</Table.Td>
                      <Table.Td ta="right">{fmtInt(r.flights)}</Table.Td>
                      <Table.Td ta="right">{fmtHm(r.minutes)}</Table.Td>
                      <Table.Td ta="right">{fmtInt(r.pilots)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
          <Button
            variant="subtle"
            size="compact-xs"
            mt={4}
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
          >
            {showTable ? 'Masquer les données' : 'Voir les données'}
          </Button>
        </>
      )}
    </Section>
  );
}
