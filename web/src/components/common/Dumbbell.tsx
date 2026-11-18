import { Button, ScrollArea, Table } from '@mantine/core';
import { useId, useState } from 'react';
import '@/components/common/dumbbell.css';

export type DumbbellShape = 'circle' | 'square' | 'diamond' | 'triangle';

export interface DumbbellSeries {
  id: string;
  label: string;
  /** Couleur CSS (variable `--sr-*` ou valeur). */
  color: string;
  /** Forme du point : doublure de la couleur pour le daltonisme. */
  shape: DumbbellShape;
}

export interface DumbbellRow {
  id: string;
  label: string;
  /** Une valeur par série, dans l'ordre de `series` ; `null` = pas de mesure. */
  values: (number | null)[];
  /** Mise en forme d'une valeur (unité comprise). */
  format: (value: number) => string;
}

interface Props {
  series: readonly DumbbellSeries[];
  rows: readonly DumbbellRow[];
  /** Description du graphique pour les lecteurs d'écran. */
  ariaLabel: string;
  testId?: string;
}

/** Position (0 à 100 %) d'une valeur entre le minimum et le maximum de la ligne ; 50 % si tout est égal. */
export function dumbbellPosition(value: number, min: number, max: number): number {
  return max > min ? (100 * (value - min)) / (max - min) : 50;
}

/** Minimum et maximum des valeurs présentes d'une ligne, `null` si aucune. */
export function dumbbellRange(values: readonly (number | null)[]): { min: number; max: number } | null {
  const present = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  return present.length === 0 ? null : { min: Math.min(...present), max: Math.max(...present) };
}

export function Marker({ shape, color, size = 14 }: { shape: DumbbellShape; color: string; size?: number }) {
  const s = size;
  const h = s / 2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" style={{ flex: 'none' }}>
      {shape === 'circle' && <circle cx={h} cy={h} r={h - 1} fill={color} />}
      {shape === 'square' && <rect x={1.5} y={1.5} width={s - 3} height={s - 3} rx={1.5} fill={color} />}
      {shape === 'diamond' && <polygon points={`${h},0.5 ${s - 0.5},${h} ${h},${s - 0.5} 0.5,${h}`} fill={color} />}
      {shape === 'triangle' && <polygon points={`${h},1 ${s - 0.5},${s - 1.5} 0.5,${s - 1.5}`} fill={color} />}
    </svg>
  );
}

/**
 * Graphique en haltère générique : une ligne par métrique, un point par série (couleur + forme), les valeurs
 * formatées écrites sous la ligne, la barre grise reliant la plus petite à la plus grande. Échelle propre à
 * chaque ligne. Réutilisé par la comparaison et, plus tard, par le Bilan. « Voir les données » donne le tableau.
 */
export function Dumbbell({ series, rows, ariaLabel, testId }: Props) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  return (
    <div data-testid={testId}>
      {showTable ? (
        <ScrollArea.Autosize id={tableId} mah={420}>
          <Table striped fz="sm" className="sr-tabular">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mesure</Table.Th>
                {series.map((s) => (
                  <Table.Th key={s.id} ta="right">
                    {s.label}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{r.label}</Table.Td>
                  {series.map((s, i) => {
                    const v = r.values[i] ?? null;
                    return (
                      <Table.Td key={s.id} ta="right">
                        {v === null ? '–' : r.format(v)}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      ) : (
        <div className="sr-db" role="group" aria-label={ariaLabel}>
          {rows.map((r) => {
            const range = dumbbellRange(r.values);
            const spoken = series
              .map((s, i) => {
                const v = r.values[i] ?? null;
                return `${s.label} ${v === null ? 'sans mesure' : r.format(v)}`;
              })
              .join(', ');
            return (
              <div key={r.id} data-metric={r.id}>
                <div className="sr-db-title">{r.label}</div>
                <div className="sr-db-track" role="img" aria-label={`${r.label} : ${spoken}`}>
                  <span className="sr-db-rail" />
                  {range && (
                    <span
                      className="sr-db-bar"
                      style={{
                        left: `${dumbbellPosition(range.min, range.min, range.max)}%`,
                        width: `${dumbbellPosition(range.max, range.min, range.max) - dumbbellPosition(range.min, range.min, range.max)}%`,
                      }}
                    />
                  )}
                  {range &&
                    series.map((s, i) => {
                      const v = r.values[i] ?? null;
                      if (v === null) return null;
                      return (
                        <span
                          key={s.id}
                          className="sr-db-dot"
                          style={{ left: `${dumbbellPosition(v, range.min, range.max)}%` }}
                          title={`${s.label} : ${r.format(v)}`}
                        >
                          <Marker shape={s.shape} color={s.color} size={16} />
                        </span>
                      );
                    })}
                </div>
                <div className="sr-db-vals">
                  {series.map((s, i) => {
                    const v = r.values[i] ?? null;
                    return (
                      <span key={s.id} aria-hidden="true">
                        <Marker shape={s.shape} color={s.color} size={10} />
                        <span className="sr-db-name">{s.label}</span>
                        <b>{v === null ? '–' : r.format(v)}</b>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Button
        variant="subtle"
        size="compact-xs"
        mt={8}
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        aria-controls={tableId}
      >
        {showTable ? 'Voir le graphique' : 'Voir les données'}
      </Button>
    </div>
  );
}
