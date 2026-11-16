import { Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { Flight } from '@/data/flight';
import { fmtInt, fmtPercent, NBSP } from '@/lib/format';
import type { CoverageKey } from '@/lib/records';
import { MEASURE_LABELS, partialData } from '@/lib/rhythmBlocks';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
  /** Mesure concernée (`plafond`, `distance`, `gain`, `vitesseMax`, `vario`, `g`). */
  measure: CoverageKey;
}

/**
 * Mention discrète « Données partielles » quand plus de 20 % des vols n'ont pas la mesure.
 * L'infobulle (survol, focus clavier ou toucher) donne la répartition gpx / fiche / aucune ;
 * le même texte est dans l'`aria-label` du bouton. Ne rend rien sinon.
 */
export function CoverageNotice({ flights, measure }: Props) {
  const data = partialData(flights, measure);
  if (!data.partial) return null;
  const { sources, missing, n } = data;
  const detail =
    `${fmtInt(missing)} vol${missing > 1 ? 's' : ''} sur ${fmtInt(n)} (${fmtPercent(data.missingShare * 100)}) sans ${MEASURE_LABELS[measure]}. ` +
    `Origine des statistiques : trace GPX ${fmtInt(sources.gpx)}, fiche ${fmtInt(sources.fiche)}, aucune ${fmtInt(sources.aucune)}.`;
  return (
    <Tooltip label={detail} multiline w={260} events={{ hover: true, focus: true, touch: true }} withArrow>
      <UnstyledButton type="button" aria-label={`Données partielles. ${detail}`} data-testid="coverage-notice">
        <Text component="span" size="xs" c="dimmed" td="underline" style={{ textDecorationStyle: 'dotted' }}>
          Données partielles{NBSP}
          <span aria-hidden="true">ⓘ</span>
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}
