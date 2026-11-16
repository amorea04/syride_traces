import { SegmentedControl, SimpleGrid, Text } from '@mantine/core';
import { useMemo, useState, type ReactNode } from 'react';
import { Section } from '@/components/common/Section';
import { EMPTY_MESSAGE } from '@/components/dashboard/shared';
import { FilterLink } from '@/components/FilterLink';
import type { Flight } from '@/data/flight';
import { periodActivity, type PeriodKind } from '@/lib/dashboard';
import { fmtDate, fmtDuration, fmtHm, fmtInt, fmtRange, NBSP, plural } from '@/lib/format';

interface Props {
  /** Vols suivant les filtres globaux SAUF la période. */
  flights: readonly Flight[];
  /** Date de référence (`referenceDate`). */
  today: string;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text className="sr-tabular" fw={650} fz={18} lh={1.25}>
        {children}
      </Text>
    </div>
  );
}

/** « Ce mois-ci » / « Cette semaine » : activité du groupe depuis le début du mois ou de la semaine (lundi). */
export function PeriodActivity({ flights, today }: Props) {
  const [kind, setKind] = useState<PeriodKind>('mois');
  const activity = useMemo(() => periodActivity(flights, today, kind), [flights, today, kind]);
  const { longest, topSite } = activity;
  return (
    <Section
      id="periode-en-cours"
      title={kind === 'mois' ? 'Ce mois-ci' : 'Cette semaine'}
      subtitle={`${fmtRange(activity.range.from, activity.range.to)}, jusqu’au ${fmtDate(today, { withYear: true })}.`}
      actions={
        <SegmentedControl
          size="xs"
          value={kind}
          onChange={(v) => setKind(v as PeriodKind)}
          data={[
            { value: 'mois', label: 'Ce mois-ci' },
            { value: 'semaine', label: 'Cette semaine' },
          ]}
          aria-label="Période affichée"
        />
      }
    >
      {activity.flights === 0 ? (
        <Text size="sm" c="dimmed" role="status">
          {flights.length === 0
            ? EMPTY_MESSAGE
            : kind === 'mois'
              ? 'Aucun vol ce mois-ci pour ces filtres.'
              : 'Aucun vol cette semaine pour ces filtres.'}
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" verticalSpacing="sm" data-testid="period-stats">
          <Stat label="Pilotes actifs">{fmtInt(activity.pilots)}</Stat>
          <Stat label="Vols">{fmtInt(activity.flights)}</Stat>
          <Stat label="Heures de vol">{fmtHm(activity.minutes)}</Stat>
          <Stat label="Site le plus fréquenté">
            {topSite ? (
              <>
                {topSite.site}
                <Text span size="xs" c="dimmed" fw={400}>
                  {` (${plural(topSite.flights, 'vol')})`}
                </Text>
              </>
            ) : (
              '–'
            )}
          </Stat>
          <Stat label="Plus long vol">
            {longest ? (
              <FilterLink to={`/vol/${longest.flight.key}`} inherit>
                {fmtDuration(longest.value)}
              </FilterLink>
            ) : (
              '–'
            )}
            {longest && (
              <Text span size="xs" c="dimmed" fw={400}>
                {`${NBSP}${longest.flight.pilot}`}
              </Text>
            )}
          </Stat>
        </SimpleGrid>
      )}
    </Section>
  );
}
