import { useComputedColorScheme } from '@mantine/core';
import * as echarts from 'echarts';
import { categoricalColors, colors, font, fontSize, type ColorScheme } from '@/theme/tokens';

export const ECHARTS_THEME_NAMES: Record<ColorScheme, string> = {
  light: 'syride-clair',
  dark: 'syride-sombre',
};

/** Construit l'objet de thème ECharts d'un schéma (fonction pure, testable sans canvas). */
export function buildEchartsTheme(scheme: ColorScheme): Record<string, unknown> {
  const c = colors[scheme];
  const textStyle = { fontFamily: font.sans, color: c.text, fontSize: fontSize.sm };
  const axis = {
    axisLine: { show: true, lineStyle: { color: c.line } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontFamily: font.sans, fontSize: fontSize.xs },
    splitLine: { show: true, lineStyle: { color: c.line, width: 1 } },
    splitArea: { show: false },
    nameTextStyle: { color: c.muted },
  };
  return {
    color: categoricalColors(scheme),
    backgroundColor: 'transparent',
    textStyle,
    title: { textStyle: { color: c.text, fontWeight: 650 }, subtextStyle: { color: c.muted } },
    legend: {
      textStyle: { color: c.muted, fontFamily: font.sans },
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 4,
    },
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    categoryAxis: {
      ...axis,
      splitLine: { show: false },
      axisLine: { show: true, lineStyle: { color: c.line } },
    },
    valueAxis: { ...axis, axisLine: { show: false } },
    timeAxis: axis,
    logAxis: axis,
    line: { symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, smooth: false },
    bar: { itemStyle: { borderRadius: [2, 2, 0, 0] }, barMaxWidth: 28 },
    tooltip: {
      backgroundColor: c.surface,
      borderColor: c.line,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: c.text, fontFamily: font.sans, fontSize: fontSize.sm },
      extraCssText: 'box-shadow:none;font-variant-numeric:tabular-nums;',
      axisPointer: {
        lineStyle: { color: c.muted, width: 1 },
        crossStyle: { color: c.muted },
        shadowStyle: { color: c['surface-2'] },
      },
    },
    visualMap: { textStyle: { color: c.muted } },
    dataZoom: { textStyle: { color: c.muted } },
    animationDuration: 150,
    animationDurationUpdate: 150,
    animationEasing: 'linear',
  };
}

let registered = false;

/** Enregistre les deux thèmes (idempotent). Appelé au démarrage dans `main.tsx`. */
export function registerEchartsThemes(): void {
  if (registered) return;
  registered = true;
  for (const scheme of ['light', 'dark'] as const) {
    echarts.registerTheme(ECHARTS_THEME_NAMES[scheme], buildEchartsTheme(scheme));
  }
}

/** Nom du thème ECharts à passer à `<ReactECharts theme={…}>`, selon le schéma Mantine. */
export function useEchartsTheme(): string {
  registerEchartsThemes();
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true });
  return ECHARTS_THEME_NAMES[scheme];
}
