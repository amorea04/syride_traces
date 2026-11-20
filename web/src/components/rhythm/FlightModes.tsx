import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import type { ColorKey } from '@/theme/tokens';
import type { Flight } from '@/data/flight';
import { fmtHours, fmtInt, fmtPercent } from '@/lib/format';
import { flightModes } from '@/lib/rhythm';
import { disciplineShares } from '@/lib/rhythmBlocks';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

const MODE_COLOR: Readonly<Record<string, ColorKey>> = {
  Site: 'w-site',
  Treuil: 'w-treuil',
  Rando: 'w-rando',
  'Bord de mer': 'w-mer',
  Moteur: 'w-moteur',
};

const modeColor = (mode: string): string => `var(--sr-${MODE_COLOR[mode] ?? 'w-autre'})`;

/**
 * Bloc « Modes de vol » : barre empilée horizontale (une part par façon de voler, en vols) et répartition
 * parapente / paramoteur. Les vols sans mode renseigné ne sont pas comptés dans la barre.
 */
export function FlightModes({ flights }: Props) {
  const modes = useMemo(() => flightModes(flights), [flights]);
  const shares = useMemo(() => disciplineShares(flights), [flights]);
  const withMode = modes.reduce((s, m) => s + m.n, 0);

  if (flights.length === 0) {
    return (
      <Section id="modes" title="Modes de vol">
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  return (
    <Section id="modes" title="Modes de vol" subtitle="Part des vols par façon de voler, puis par discipline.">
      {withMode === 0 ? (
        <Text size="sm" c="dimmed">
          Aucun mode de vol renseigné.
        </Text>
      ) : (
        <>
          <div
            className="sr-bar-track"
            role="img"
            aria-label={`Modes de vol\u00a0: ${modes.map((m) => `${m.mode} ${fmtPercent((m.n / withMode) * 100)}`).join(', ')}.`}
            data-testid="flight-modes-bar"
          >
            {modes.map((m) => (
              <div
                key={m.mode}
                className="sr-bar-seg"
                title={`${m.mode} : ${fmtInt(m.n)} vols, ${fmtHours(m.minutes)}`}
                style={{ flexGrow: m.n, background: modeColor(m.mode) }}
              />
            ))}
          </div>
          <Group gap="md" mt={8} wrap="wrap">
            {modes.map((m) => (
              <Text key={m.mode} size="sm" component="span">
                <span className="sr-cal-swatch" style={{ background: modeColor(m.mode) }} aria-hidden="true" />
                {m.mode}{' '}
                <b className="sr-tabular">{fmtPercent((m.n / withMode) * 100)}</b>{' '}
                <Text component="span" size="xs" c="dimmed">
                  ({fmtInt(m.n)}, {fmtHours(m.minutes)})
                </Text>
              </Text>
            ))}
          </Group>
        </>
      )}
      <div
        className="sr-bar-track"
        style={{ marginTop: 16, height: 10 }}
        role="img"
        aria-label={`Parapente ${fmtPercent(shares.parapente * 100)}, paramoteur ${fmtPercent(shares.paramoteur * 100)}.`}
        data-testid="discipline-bar"
      >
        {shares.parapente > 0 && (
          <div className="sr-bar-seg" style={{ flexGrow: shares.parapente, background: 'var(--sr-p)' }} />
        )}
        {shares.paramoteur > 0 && (
          <div className="sr-bar-seg" style={{ flexGrow: shares.paramoteur, background: 'var(--sr-m)' }} />
        )}
      </div>
      <Group gap="md" mt={6}>
        <Text size="sm" c="var(--sr-p-text)">
          Parapente <b className="sr-tabular">{fmtPercent(shares.parapente * 100)}</b>
        </Text>
        <Text size="sm" c="var(--sr-m-text)">
          Paramoteur <b className="sr-tabular">{fmtPercent(shares.paramoteur * 100)}</b>
        </Text>
      </Group>
    </Section>
  );
}
