import { useMemo } from 'react';
import { useScheme } from '@/components/dashboard/shared';
import { seriesStyle, type CompareMode, type CompareSeries, type SeriesStyle } from '@/lib/compare';
import { colors } from '@/theme/tokens';

/** Apparence d'une série comparée : couleur (jeton), motif de trait et forme de point. */
export interface SeriesVisual extends SeriesStyle {
  id: string;
  label: string;
  /** Valeur CSS pour le HTML (`var(--sr-c1)`). */
  css: string;
  /** Valeur résolue pour ECharts. */
  color: string;
}

export function useSeriesVisuals(mode: CompareMode, series: readonly CompareSeries[]): SeriesVisual[] {
  const scheme = useScheme();
  return useMemo(
    () =>
      series.map((s, i) => {
        const style = seriesStyle(mode, i);
        return {
          ...style,
          id: s.id,
          label: s.label,
          css: `var(--sr-${style.colorKey})`,
          color: colors[scheme][style.colorKey],
        };
      }),
    [mode, series, scheme],
  );
}
