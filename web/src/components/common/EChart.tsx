import type { EChartsOption } from 'echarts';
import ReactEChartsCoreModule from 'echarts-for-react/lib/core';
import { echartsCore, useEchartsTheme } from '@/theme/echarts';

// `echarts-for-react/lib/core` est un module CommonJS : selon l'outil, l'import par défaut est le composant ou l'objet
// d'exports (`{ default }`). Le build de production de Vite donne le second cas.
const ReactEChartsCore = ((ReactEChartsCoreModule as unknown as { default?: typeof ReactEChartsCoreModule })
  .default ?? ReactEChartsCoreModule) as typeof ReactEChartsCoreModule;

export type EventHandlers = Record<string, (params: unknown) => void>;

interface Props {
  option: EChartsOption;
  height: number;
  notMerge: boolean;
  onEvents?: EventHandlers;
}

/**
 * Instance ECharts thémée. Module séparé, chargé à la demande par `ChartFrame` (6.3) : ECharts (≈ 190 Ko gzip)
 * n'est plus une dépendance statique des pages, qui s'affichent sans l'attendre.
 */
export default function EChart({ option, height, notMerge, onEvents }: Props) {
  const theme = useEchartsTheme();
  return (
    <ReactEChartsCore
      echarts={echartsCore}
      option={option}
      theme={theme}
      notMerge={notMerge}
      lazyUpdate
      style={{ height, width: '100%' }}
      onEvents={onEvents}
      opts={{ renderer: 'canvas' }}
    />
  );
}
