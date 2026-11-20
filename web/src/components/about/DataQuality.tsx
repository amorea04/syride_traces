import { SimpleGrid, Table, Text } from '@mantine/core';
import { useMemo } from 'react';
import { KpiCard } from '@/components/common/KpiCard';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { useData } from '@/data/DataProvider';
import { fmtInt, fmtPercent, plural } from '@/lib/format';
import { computeQuality } from '@/lib/quality';
import { MEASURE_KEYS } from '@/lib/records';
import { MEASURE_LABELS } from '@/lib/rhythmBlocks';

/** Part en pourcents, « – » sans vol. */
const share = (count: number, total: number): string =>
  total > 0 ? fmtPercent((100 * count) / total, 1) : '–';

/** Qualité des données : compteurs d'anomalies, couverture des mesures et des sources, voiles à uniformiser. Indépendant des filtres. */
export function DataQuality() {
  const { flights, sites, meta } = useData();
  const q = useMemo(
    () => computeQuality(flights, sites, meta.counts.excluded_flights),
    [flights, sites, meta.counts.excluded_flights],
  );
  const { coverage } = q;
  return (
    <Section
      id="qualite"
      title="Qualité des données"
      subtitle="Compteurs sur l’ensemble des vols exportés, sans tenir compte des filtres."
    >
      <SimpleGrid
        cols={{ base: 2, sm: 3, md: 5 }}
        spacing="lg"
        verticalSpacing="md"
        data-testid="quality-kpis"
      >
        <KpiCard label="Vols exportés" value={fmtInt(q.exported)} testId="q-exported" />
        <KpiCard
          label="Vols écartés"
          value={fmtInt(q.excluded)}
          note="Non exportés (date invalide)"
          testId="q-excluded"
        />
        <KpiCard label="Vols incomplets" value={fmtInt(q.incomplete)} testId="q-incomplete" />
        <KpiCard
          label="Sites sans coordonnées"
          value={fmtInt(q.sitesWithoutCoords.length)}
          note={`${plural(q.flightsWithoutCoords, 'vol')} concerné${q.flightsWithoutCoords > 1 ? 's' : ''}`}
          testId="q-no-coords"
        />
        <KpiCard label="Vols sans site" value={fmtInt(q.withoutSite)} testId="q-no-site" />
      </SimpleGrid>

      <Text fw={650} size="sm" mt="lg" mb={4}>
        Couverture par mesure
      </Text>
      <Table.ScrollContainer minWidth={360}>
        <Table fz="sm" className="sr-tabular" data-testid="quality-coverage">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mesure</Table.Th>
              <Table.Th ta="right">Vols avec la mesure</Table.Th>
              <Table.Th ta="right">Part</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {MEASURE_KEYS.map((k) => (
              <Table.Tr key={k}>
                <Table.Td style={{ textTransform: 'capitalize' }}>{MEASURE_LABELS[k]}</Table.Td>
                <Table.Td ta="right">{fmtInt(coverage.measured[k])}</Table.Td>
                <Table.Td ta="right">{share(coverage.measured[k], coverage.n)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Text fw={650} size="sm" mt="lg" mb={4}>
        Origine des statistiques
      </Text>
      <Table.ScrollContainer minWidth={360}>
        <Table fz="sm" className="sr-tabular" data-testid="quality-sources">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th ta="right">Vols</Table.Th>
              <Table.Th ta="right">Part</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(
              [
                ['GPX (trace)', coverage.sources.gpx],
                ['Fiche Syride seule', coverage.sources.fiche],
                ['Aucune statistique', coverage.sources.aucune],
              ] as const
            ).map(([label, n]) => (
              <Table.Tr key={label}>
                <Table.Td>{label}</Table.Td>
                <Table.Td ta="right">{fmtInt(n)}</Table.Td>
                <Table.Td ta="right">{share(n, coverage.n)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Text fw={650} size="sm" mt="lg" mb={4}>
        Sites sans coordonnées
      </Text>
      {q.sitesWithoutCoords.length === 0 ? (
        <Text size="sm" c="dimmed">
          Tous les sites ont des coordonnées.
        </Text>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }} data-testid="quality-sites">
          {q.sitesWithoutCoords.map((s) => (
            <li key={s.id}>
              <FilterLink to={`/site/${s.id}`}>{s.name}</FilterLink> ({plural(s.flights, 'vol')})
            </li>
          ))}
        </ul>
      )}

      <Text fw={650} size="sm" mt="lg" mb={4}>
        Voiles très proches à uniformiser
      </Text>
      {q.similarWings.length === 0 ? (
        <Text size="sm" c="dimmed" data-testid="quality-wings-none">
          Aucune voile écrite de plusieurs façons.
        </Text>
      ) : (
        <>
          <Text size="xs" c="dimmed" mb={4}>
            Même nom une fois la casse, les accents, les espaces et les tirets ignorés.
          </Text>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }} data-testid="quality-wings">
            {q.similarWings.map((g) => (
              <li key={g.key}>
                {g.variants.map((v) => `«\u00a0${v.name}\u00a0» (${plural(v.flights, 'vol')})`).join(' · ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
