import { describe, expect, it } from 'vitest';
import { buildEchartsTheme } from '@/theme/echarts';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('thème ECharts : pas d’aplat sur les barres (5C.6)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme} : axisPointer sans aplat opaque, barres mises en avant au survol`, () => {
      const theme = buildEchartsTheme(scheme) as Obj;
      const pointer = theme.tooltip.axisPointer as Obj;
      expect(pointer.type).toBe('line');
      expect(pointer.shadowStyle.opacity).toBeLessThanOrEqual(0.15);
      expect(theme.bar.emphasis.focus).toBe('series');
      expect(theme.bar.blur.itemStyle.opacity).toBeLessThan(1);
    });
  }
});
