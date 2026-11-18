import { ActionIcon } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import type { Flight } from '@/data/flight';
import { fmtDate } from '@/lib/format';
import { syrideFlightUrl } from '@/lib/syride';

/** Lien externe vers la trace d'un vol sur Syride (D12 : l'app ne montre jamais la trace). */
export function SyrideTraceLink({ flight }: { flight: Flight }) {
  return (
    <ActionIcon
      component="a"
      href={syrideFlightUrl(flight.pilot, flight.syrideNum)}
      target="_blank"
      rel="noopener noreferrer"
      variant="subtle"
      color="gray"
      size="sm"
      data-testid="syride-link"
      aria-label={`Voir la trace sur Syride : vol de ${flight.pilot} du ${fmtDate(flight.date, { withYear: true })}`}
      title="Voir la trace sur Syride"
    >
      <IconExternalLink size={15} stroke={1.6} />
    </ActionIcon>
  );
}
