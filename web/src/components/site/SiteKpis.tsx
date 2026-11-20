import { SimpleGrid } from '@mantine/core';
import { useMemo } from 'react';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { KpiCard } from '@/components/common/KpiCard';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import { EMPTY, fmtDuration, fmtHm, fmtInt } from '@/lib/format';
import { MEASURES, formatMeasure } from '@/lib/measures';
import { computeKpis } from '@/lib/records';

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

const orDash = (value: number | null, measure: keyof typeof MEASURES): string =>
  value === null ? EMPTY : formatMeasure(MEASURES[measure], value);

/** Chiffres clés du site. */
export function SiteKpis({ flights }: Props) {
  const k = useMemo(() => computeKpis(flights), [flights]);
  return (
    <Section id="chiffres" title="Chiffres du site">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="lg" verticalSpacing="md" data-testid="site-kpis">
        <KpiCard label="Vols" value={fmtInt(k.nFlights)} />
        <KpiCard label="Heures de vol" value={fmtHm(k.minutes)} />
        <KpiCard label="Jours volés" value={fmtInt(k.daysFlown)} />
        <KpiCard
          label="Durée moyenne"
          value={k.durationMean === null ? EMPTY : fmtDuration(k.durationMean)}
        />
        <KpiCard
          label="Plafond max"
          value={orDash(k.ceilingMax, 'plafond')}
          note={<CoverageNotice flights={flights} measure="plafond" />}
        />
        <KpiCard
          label="Distance max"
          value={orDash(k.distanceMax, 'distance')}
          note={<CoverageNotice flights={flights} measure="distance" />}
        />
        <KpiCard
          label="Vitesse max"
          value={orDash(k.speedMaxMax, 'vitesseMax')}
          note={<CoverageNotice flights={flights} measure="vitesseMax" />}
        />
        <KpiCard
          label="Vario max"
          value={orDash(k.varioMax, 'vario')}
          note={<CoverageNotice flights={flights} measure="vario" />}
        />
      </SimpleGrid>
    </Section>
  );
}
