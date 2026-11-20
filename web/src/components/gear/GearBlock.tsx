import { Button, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDuration, fmtHours, fmtInt, fmtNum, fmtOrDash, NBSP } from '@/lib/format';
import { instrumentRows, wingRows } from '@/lib/records';
import { useFiltersStore } from '@/store/filters';
import { useHighlightStore } from '@/store/highlight';
import { WingRibbon } from './WingRibbon';
import './gear.css';

/** Nombre de voiles montrées avant « Tout afficher ». */
export const WINGS_LIMIT = 15;

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/**
 * Bloc « Matériel » : tableau des voiles (barre = temps de vol, clic = filtre voile, survol = surlignage),
 * ruban voile × mois et tableau des instruments.
 */
export function GearBlock({ flights }: Props) {
  const [allWings, setAllWings] = useState(false);
  const wings = useMemo(() => wingRows(flights), [flights]);
  const shownWings = allWings ? wings : wings.slice(0, WINGS_LIMIT);
  const instruments = useMemo(() => instrumentRows(flights), [flights]);
  const highlight = useHighlightStore((s) => s.highlight);
  const setHighlight = useHighlightStore((s) => s.setHighlight);
  const setFilters = useFiltersStore((s) => s.setFilters);

  if (flights.length === 0) {
    return (
      <Section id="materiel" title="Matériel">
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  const peakMinutes = Math.max(1, ...wings.map((w) => w.minutes));
  const peakInstrument = Math.max(1, ...instruments.map((i) => i.minutes));
  return (
    <Section
      id="materiel"
      title="Matériel"
      subtitle="Un clic sur une voile filtre tout le tableau de bord&nbsp;; la barre est proportionnelle aux heures de vol."
    >
      {wings.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucune voile renseignée pour ces vols.
        </Text>
      ) : (
        <div className="sr-gear-wrap">
          <table className="sr-gear-table" data-testid="wings-table">
            <caption style={{ position: 'absolute', left: -9999 }}>Voiles utilisées</caption>
            <thead>
              <tr>
                <th scope="col">Voile</th>
                <th scope="col">Vols</th>
                <th scope="col">Heures de vol</th>
                <th scope="col">Durée moy.</th>
                <th scope="col">Vitesse moy.</th>
                <th scope="col">Gain max</th>
                <th scope="col">Vario max</th>
                <th scope="col">g max</th>
              </tr>
            </thead>
            <tbody>
              {shownWings.map((w) => (
                <tr
                  key={w.wing}
                  data-dim={highlight?.kind === 'wing' && highlight.wing !== w.wing}
                  onMouseEnter={() => setHighlight({ kind: 'wing', wing: w.wing })}
                  onMouseLeave={() => setHighlight(null)}
                >
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                    <button
                      type="button"
                      className="sr-gear-name"
                      title={`Filtrer sur la voile ${w.wing}`}
                      onFocus={() => setHighlight({ kind: 'wing', wing: w.wing })}
                      onBlur={() => setHighlight(null)}
                      onClick={() => setFilters({ wings: [w.wing] })}
                    >
                      {w.wing}
                    </button>
                  </th>
                  <td>{fmtInt(w.n)}</td>
                  <td>
                    <span
                      className="sr-gear-bar"
                      aria-hidden="true"
                      style={{ width: `${Math.round((w.minutes / peakMinutes) * 80)}px`, background: 'var(--sr-accent)' }}
                    />
                    {fmtHours(w.minutes)}
                  </td>
                  <td>{fmtDuration(w.durationMean)}</td>
                  <td>{fmtOrDash(w.speedAvgMean, (v) => `${fmtNum(v, 1)}${NBSP}km/h`)}</td>
                  <td>{fmtOrDash(w.gainMax, (v) => `${fmtInt(v)}${NBSP}m`)}</td>
                  <td>{fmtOrDash(w.varioMax, (v) => `${fmtNum(v, 1)}${NBSP}m/s`)}</td>
                  <td>{fmtOrDash(w.gMax, (v) => `${fmtNum(v, 1)}${NBSP}g`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {wings.length > WINGS_LIMIT && (
            <Button variant="subtle" size="compact-sm" mt={6} onClick={() => setAllWings((v) => !v)}>
              {allWings ? 'Réduire' : `Tout afficher (${wings.length})`}
            </Button>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <WingRibbon flights={flights} />
      </div>

      <div style={{ marginTop: 20 }}>
        <Title order={3} fz={14} fw={650} mb={6}>
          Instruments
        </Title>
        {instruments.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucun instrument renseigné.
          </Text>
        ) : (
          <div className="sr-gear-wrap">
            <table className="sr-gear-table" data-testid="instruments-table">
              <caption style={{ position: 'absolute', left: -9999 }}>Instruments utilisés</caption>
              <thead>
                <tr>
                  <th scope="col">Instrument</th>
                  <th scope="col">Vols</th>
                  <th scope="col">Heures de vol</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((i) => (
                  <tr key={i.instrument}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                      {i.instrument || EMPTY}
                    </th>
                    <td>{fmtInt(i.n)}</td>
                    <td>
                      <span
                        className="sr-gear-bar"
                        aria-hidden="true"
                        style={{ width: `${Math.round((i.minutes / peakInstrument) * 80)}px`, background: 'var(--sr-accent)' }}
                      />
                      {fmtHours(i.minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}
