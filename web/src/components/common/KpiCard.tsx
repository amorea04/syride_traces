import { Box, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { DeltaPill, type DeltaKind } from '@/components/common/DeltaPill';

export interface KpiDelta {
  /** Variation en % ; `null` : non calculable (aucune référence). */
  value: number | null;
  kind: DeltaKind;
}

interface Props {
  label: string;
  /** Valeur principale (texte, ou lien pour un chiffre cliquable). */
  value: ReactNode;
  /** Complément sous la valeur (pilote, site…), facultatif. */
  note?: ReactNode;
  /** Pied : pastille et « vs période précédente ». Absent : pas de pied. */
  delta?: KpiDelta;
  /** Remplace « vs période précédente ». */
  deltaLabel?: string;
  testId?: string;
}

/** Tuile de chiffre clé : libellé en capitales espacées, grande valeur à chiffres tabulaires, pied facultatif. */
export function KpiCard({ label, value, note, delta, deltaLabel = 'vs période précédente', testId }: Props) {
  return (
    <Box data-testid={testId} style={{ minWidth: 0 }}>
      <Text
        component="div"
        fz={11}
        fw={650}
        c="dimmed"
        tt="uppercase"
        style={{ letterSpacing: 'var(--sr-tracking-label)' }}
      >
        {label}
      </Text>
      <Text
        component="div"
        className="sr-tabular"
        fz={28}
        fw={750}
        lh={1.15}
        mt={4}
        style={{ letterSpacing: 'var(--sr-tracking-heading)' }}
      >
        {value}
      </Text>
      {note && (
        <Text component="div" size="xs" c="dimmed" mt={2}>
          {note}
        </Text>
      )}
      {delta && (
        <Text component="div" size="xs" c="dimmed" mt={6} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {delta.value === null ? (
            <span>Pas de comparaison possible</span>
          ) : (
            <>
              <DeltaPill value={delta.value} kind={delta.kind} />
              <span>{deltaLabel}</span>
            </>
          )}
        </Text>
      )}
    </Box>
  );
}
