import { Table } from '@mantine/core';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { FlightModes } from '@/components/rhythm/FlightModes';
import { wingTableRows } from '@/lib/bilanDetails';
import { EMPTY, fmtDate, fmtDuration, fmtInt, fmtNum, NBSP } from '@/lib/format';
import { instrumentRows } from '@/lib/records';
import './bilanB.css';

const num = (value: number | null, unit: string, digits = 1): string =>
  value === null ? EMPTY : `${fmtNum(value, digits)}${NBSP}${unit}`;

/** Matos : voiles et instruments de l'année, nouvelles voiles en or (`story.new_wings`), modes de vol. */
export function BilanGear() {
  const { flights, story } = useBilan();
  const wings = useMemo(() => wingTableRows(flights, story), [flights, story]);
  const instruments = useMemo(() => instrumentRows(flights), [flights]);
  return (
    <Section id="matos" title="Avec quel matériel ?">
      {story.texts.matos && (
        <p className="bb-lead" data-testid="bilan-texte-matos">
          {story.texts.matos}
        </p>
      )}
      <div className="bb-block" style={{ marginTop: 0 }}>
        <p className="bb-sub">Voiles utilisées</p>
        {wings.length === 0 ? (
          <p className="bb-rec-foot">Aucune voile renseignée.</p>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table fz="sm" className="sr-tabular" data-testid="bilan-wings-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Voile</Table.Th>
                  <Table.Th ta="right">Vols</Table.Th>
                  <Table.Th ta="right">Temps de vol</Table.Th>
                  <Table.Th ta="right">Durée moy.</Table.Th>
                  <Table.Th ta="right">Vitesse moy.</Table.Th>
                  <Table.Th ta="right">Gain max</Table.Th>
                  <Table.Th ta="right">Vario max</Table.Th>
                  <Table.Th ta="right">g max</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {wings.map((w) => (
                  <Table.Tr key={w.wing} data-testid="bilan-wing-row" data-new={w.isNew}>
                    <Table.Td>
                      {w.wing}
                      {w.isNew && (
                        <span
                          className="bb-new"
                          data-testid="bilan-new-wing"
                          title={w.firstDate ? `Première sortie le ${fmtDate(w.firstDate, { withYear: true })}` : undefined}
                        >
                          nouvelle
                        </span>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{fmtInt(w.n)}</Table.Td>
                    <Table.Td ta="right">{fmtDuration(w.minutes)}</Table.Td>
                    <Table.Td ta="right">{fmtDuration(w.durationMean)}</Table.Td>
                    <Table.Td ta="right">{num(w.speedAvgMean, 'km/h')}</Table.Td>
                    <Table.Td ta="right">{num(w.gainMax, 'm', 0)}</Table.Td>
                    <Table.Td ta="right">{num(w.varioMax, 'm/s')}</Table.Td>
                    <Table.Td ta="right">{num(w.gMax, 'g')}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      <div className="bb-block">
        <p className="bb-sub">Instruments</p>
        {instruments.length === 0 ? (
          <p className="bb-rec-foot">Aucun instrument renseigné.</p>
        ) : (
          <Table.ScrollContainer minWidth={320}>
            <Table fz="sm" className="sr-tabular" data-testid="bilan-instruments-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Instrument</Table.Th>
                  <Table.Th ta="right">Vols</Table.Th>
                  <Table.Th ta="right">Temps de vol</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {instruments.map((i) => (
                  <Table.Tr key={i.instrument}>
                    <Table.Td>{i.instrument}</Table.Td>
                    <Table.Td ta="right">{fmtInt(i.n)}</Table.Td>
                    <Table.Td ta="right">{fmtDuration(i.minutes)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </div>

      <div className="bb-block">
        <FlightModes flights={flights} />
      </div>
    </Section>
  );
}
