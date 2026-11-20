import { Box, Button, ScrollArea, Table } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import ReactEChartsCoreModule from 'echarts-for-react/lib/core';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { whenNearViewport } from '@/lib/nearViewport';
import { echartsCore, useEchartsTheme } from '@/theme/echarts';

/** Tableau alternatif d'un graphique (« voir les données ») : en-têtes et lignes déjà formatées. */
export interface DataTable {
  columns: string[];
  rows: (string | number)[][];
}

// `echarts-for-react/lib/core` est un module CommonJS : selon l'outil, l'import par défaut est le composant ou l'objet
// d'exports (`{ default }`). Le build de production de Vite donne le second cas.
const ReactEChartsCore = ((ReactEChartsCoreModule as unknown as { default?: typeof ReactEChartsCoreModule })
  .default ?? ReactEChartsCoreModule) as typeof ReactEChartsCoreModule;

type EventHandlers = Record<string, (params: unknown) => void>;

interface Props {
  option: EChartsOption;
  /** Description du graphique pour les lecteurs d'écran (obligatoire, §6 accessibilité). */
  ariaLabel: string;
  height: number;
  /** Données alternatives ; si fourni, un bouton « Voir les données » bascule vers un tableau. */
  table?: DataTable;
  /** Événements ECharts (`click`, `mouseover`, `mouseout`…). */
  onEvents?: EventHandlers;
  /** Contenu affiché sous le graphique (légende maison, note). */
  footer?: ReactNode;
  testId?: string;
  /**
   * Remplace l'option à chaque rendu (défaut : oui). Mettre `false` pour la fusionner dans l'existante et conserver
   * l'état d'interaction (zoom) ; l'appelant doit alors remonter le graphique quand sa forme change (`key`).
   */
  notMerge?: boolean;
}

/**
 * Vrai dès que l'élément approche de l'écran (6.3) : les graphiques hors écran ne sont instanciés qu'à ce moment.
 * L'élément est suivi par un ref callback : quand le nœud est remplacé (bascule tableau / graphique), l'observateur
 * suit le nouveau. Une fois vrai, le résultat reste vrai.
 */
function useNearViewport(): [(el: HTMLDivElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !node) return;
    return whenNearViewport(node, () => setNear(true), '300px');
  }, [node, near]);
  return [setNode, near];
}

/**
 * Enveloppe commune des graphiques ECharts : thème clair/sombre, `aria-label`, hauteur fixe,
 * bascule « Voir les données / Voir le graphique ». `notMerge` (par défaut) évite les séries
 * fantômes quand la sélection change de forme.
 */
export function ChartFrame({
  option,
  ariaLabel,
  height,
  table,
  onEvents,
  footer,
  testId,
  notMerge = true,
}: Props) {
  const theme = useEchartsTheme();
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const [holder, near] = useNearViewport();
  return (
    <Box data-testid={testId}>
      {showTable && table ? (
        <ScrollArea.Autosize mah={height} id={tableId}>
          <Table striped highlightOnHover stickyHeader fz="sm" className="sr-tabular">
            <Table.Thead>
              <Table.Tr>
                {table.columns.map((c) => (
                  <Table.Th key={c}>{c}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {table.rows.map((row, i) => (
                <Table.Tr key={i}>
                  {row.map((cell, j) => (
                    <Table.Td key={j}>{cell}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      ) : (
        <div role="img" aria-label={ariaLabel} ref={holder} style={{ minHeight: height }}>
          {near && (
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
          )}
        </div>
      )}
      {footer}
      {table && (
        <Button
          variant="subtle"
          size="compact-xs"
          mt={4}
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
        >
          {showTable ? 'Voir le graphique' : 'Voir les données'}
        </Button>
      )}
    </Box>
  );
}
