import { Box, VisuallyHidden } from '@mantine/core';
import { fmtSignedPct } from '@/lib/format';

/** `volume` : vols, heures, jours volés (vert / rouge). `neutre` : tout le reste (violet / ambre), sans jugement. */
export type DeltaKind = 'volume' | 'neutre';

interface Props {
  /** Variation en % ; `null` ou `undefined` : rien n'est rendu. */
  value: number | null | undefined;
  kind: DeltaKind;
  testId?: string;
}

const TOKENS: Record<DeltaKind, { up: string; down: string }> = {
  volume: { up: 'up', down: 'down' },
  neutre: { up: 'nup', down: 'ndown' },
};

/**
 * Pastille d'écart : ▲ / ▼ (ou « = » si la variation arrondie est nulle) et le pourcentage signé.
 * La couleur ne dit « bien » ou « mal » que pour les volumes ; la flèche double toujours la couleur.
 */
export function DeltaPill({ value, kind, testId }: Props) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const text = fmtSignedPct(value);
  const flat = text === '=';
  const token = flat ? 'flat' : value > 0 ? TOKENS[kind].up : TOKENS[kind].down;
  const arrow = flat ? '' : value > 0 ? '▲' : '▼';
  const spoken = flat ? 'stable' : value > 0 ? 'en hausse' : 'en baisse';
  return (
    <Box
      component="span"
      className="sr-tabular"
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 7px',
        borderRadius: 'var(--sr-radius-pill)',
        fontSize: 12,
        fontWeight: 650,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        background: `var(--sr-${token}-bg)`,
        color: `var(--sr-${token}-text)`,
      }}
    >
      {arrow && <span aria-hidden="true">{arrow}</span>}
      <span>{text}</span>
      <VisuallyHidden>{spoken}</VisuallyHidden>
    </Box>
  );
}
