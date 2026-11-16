import { Text, useComputedColorScheme } from '@mantine/core';
import type { ColorScheme } from '@/theme/tokens';

/** Message d'une sélection vide, commun à tous les blocs. */
export const EMPTY_MESSAGE = 'Aucun vol pour ces filtres.';

export function EmptyNote({ children = EMPTY_MESSAGE }: { children?: string }) {
  return (
    <Text size="sm" c="dimmed" role="status">
      {children}
    </Text>
  );
}

/** Schéma de couleurs courant, pour lire `colors[scheme]` dans les options ECharts. */
export function useScheme(): ColorScheme {
  return useComputedColorScheme('light', { getInitialValueInEffect: true });
}

/** Valeur d'un événement ECharts : `dataIndex` d'un clic ou d'un survol, sinon `null`. */
export function eventIndex(params: unknown): number | null {
  if (typeof params === 'object' && params !== null && 'dataIndex' in params) {
    const i = (params as { dataIndex: unknown }).dataIndex;
    if (typeof i === 'number') return i;
  }
  return null;
}
