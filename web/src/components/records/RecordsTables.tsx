import { Checkbox, Table, Tabs, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { EmptyNote } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import { SyrideTraceLink } from '@/components/site/SyrideTraceLink';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDateNumeric, fmtDuration, fmtNum, NBSP } from '@/lib/format';
import { rankedTop, RECORD_METRICS, type RecordMetric } from '@/lib/sites';
import './records.css';

/** Lignes par classement. */
export const RECORDS_TOP = 10;

/** Valeur d'un record : durée en « 1 h 12 min », le reste avec son unité. */
function formatValue(metric: RecordMetric, value: number): string {
  if (metric.unit === 'min') return fmtDuration(value);
  return `${fmtNum(value, metric.digits)}${NBSP}${metric.unit}`;
}

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/**
 * Classements « Top 10 » par métrique, un onglet par métrique (la distance cumulée n'apparaît que si elle est connue).
 * Rang 1 en or, sans médaille ; ex æquo = même rang ; option « un seul vol par pilote ».
 */
export function RecordsTables({ flights }: Props) {
  const [metricId, setMetricId] = useState(RECORD_METRICS[0]!.id);
  const [onePerPilot, setOnePerPilot] = useState(false);

  const available = useMemo(
    () => RECORD_METRICS.filter((m) => flights.some((f) => (m.of(f) ?? 0) > 0)),
    [flights],
  );
  const metric = available.find((m) => m.id === metricId) ?? available[0];
  const rows = useMemo(
    () => (metric ? rankedTop(flights, metric.of, { top: RECORDS_TOP, onePerPilot }) : []),
    [flights, metric, onePerPilot],
  );

  return (
    <Section
      id="classements"
      title="Top 10 par métrique"
      subtitle="Les dix meilleures marques de la sélection. À valeur égale, le vol le plus récent passe devant (puis le numéro Syride le plus élevé) ; les ex æquo de valeur partagent le même rang."
      actions={
        <Checkbox
          size="xs"
          label="Un seul vol par pilote"
          checked={onePerPilot}
          onChange={(e) => setOnePerPilot(e.currentTarget.checked)}
          data-testid="one-per-pilot"
        />
      }
    >
      {flights.length === 0 || !metric ? (
        <EmptyNote />
      ) : (
        <Tabs
          value={metric.id}
          onChange={(v) => {
            if (v) setMetricId(v);
          }}
          keepMounted={false}
        >
          <Tabs.List className="rc-tabs" aria-label="Métrique" mb="sm">
            {available.map((m) => (
              <Tabs.Tab key={m.id} value={m.id} data-testid={`tab-${m.id}`}>
                {m.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {available.map((m) => (
            <Tabs.Panel key={m.id} value={m.id} data-testid={`panel-${m.id}`}>
              {m.id === metric.id && (
                <Table.ScrollContainer minWidth={640}>
                  <Table fz="sm" highlightOnHover className="sr-tabular" data-testid="records-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th ta="right">Rang</Table.Th>
                        <Table.Th ta="right">{m.label}</Table.Th>
                        <Table.Th>Pilote</Table.Th>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Site</Table.Th>
                        <Table.Th>Fiche</Table.Th>
                        <Table.Th>
                          <span style={{ position: 'absolute', left: -9999 }}>Trace sur Syride</span>
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rows.map((r) => (
                        <Table.Tr key={r.flight.key} data-testid="record-row" data-rank={r.rank}>
                          <Table.Td ta="right">{r.rank}</Table.Td>
                          <Table.Td ta="right">
                            <span className={r.rank === 1 ? 'rc-gold' : undefined} data-gold={r.rank === 1}>
                              {formatValue(m, r.value)}
                            </span>
                          </Table.Td>
                          <Table.Td>
                            <FilterLink to={`/pilote/${r.flight.pilotSlug}`}>{r.flight.pilot}</FilterLink>
                          </Table.Td>
                          <Table.Td>{fmtDateNumeric(r.flight.date)}</Table.Td>
                          <Table.Td>
                            {r.flight.siteId !== null && r.flight.site ? (
                              <FilterLink to={`/site/${r.flight.siteId}`}>{r.flight.site}</FilterLink>
                            ) : (
                              EMPTY
                            )}
                          </Table.Td>
                          <Table.Td>
                            <FilterLink to={`/vol/${r.flight.key}`} data-testid="record-flight-link">
                              Voir le vol
                            </FilterLink>
                          </Table.Td>
                          <Table.Td>
                            <SyrideTraceLink flight={r.flight} />
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
      {metric && rows.length > 0 && rows.length < RECORDS_TOP && (
        <Text size="xs" c="dimmed" mt={6}>
          {rows.length} mesure{rows.length > 1 ? 's' : ''} seulement dans la sélection.
        </Text>
      )}
    </Section>
  );
}
