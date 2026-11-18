import { ScrollArea, Table } from '@mantine/core';
import { useMemo } from 'react';
import { Marker } from '@/components/common/Dumbbell';
import { Section } from '@/components/common/Section';
import type { SeriesVisual } from '@/components/compare/visuals';
import { fmtRegularity, rhythmSummary, type CompareSeries } from '@/lib/compare';
import { EMPTY, fmtPercent, plural } from '@/lib/format';

interface Props {
  series: readonly CompareSeries[];
  visuals: readonly SeriesVisual[];
}

/** Rythme comparé : régularité (semaines avec vol), plus longue série, part du week-end. */
export function CompareRhythm({ series, visuals }: Props) {
  const rhythms = useMemo(() => series.map((s) => rhythmSummary(s.flights, s.span)), [series]);
  return (
    <Section
      id="rythme"
      title="Rythme comparé"
      subtitle="Régularité : semaines (lundi à dimanche) avec au moins un vol sur les semaines de la période. Série : jours volés consécutifs."
    >
      <ScrollArea type="auto">
        <Table fz="sm" className="sr-tabular" data-testid="compare-rhythm" miw={360}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mesure</Table.Th>
              {series.map((s, i) => (
                <Table.Th key={s.id} ta="right">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {visuals[i] && <Marker shape={visuals[i].shape} color={visuals[i].css} size={10} />}
                    {s.label}
                  </span>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Régularité</Table.Td>
              {rhythms.map((r, i) => (
                <Table.Td key={series[i]?.id} ta="right">
                  {r ? fmtRegularity(r) : EMPTY}
                </Table.Td>
              ))}
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Plus longue série</Table.Td>
              {rhythms.map((r, i) => (
                <Table.Td key={series[i]?.id} ta="right">
                  {r ? plural(r.streakDays, 'jour') : EMPTY}
                </Table.Td>
              ))}
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Part du week-end</Table.Td>
              {rhythms.map((r, i) => (
                <Table.Td key={series[i]?.id} ta="right">
                  {r ? fmtPercent(100 * r.weekendShare) : EMPTY}
                </Table.Td>
              ))}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Section>
  );
}
