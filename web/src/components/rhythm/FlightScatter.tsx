import { Group, Select, Text, useComputedColorScheme } from '@mantine/core';
import type { EChartsOption } from 'echarts';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFilterSearch } from '@/components/FilterLink';
import { ChartFrame } from '@/components/common/ChartFrame';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { Section } from '@/components/common/Section';
import type { Flight } from '@/data/flight';
import {
  BAND_SPREAD,
  CATEGORY_LABELS,
  CROSS_CATEGORIES,
  CROSS_MEASURES,
  bandCloud,
  isCategory,
  type BandPoint,
  type CrossCategory,
  type CrossKey,
} from '@/lib/durationCross';
import { EMPTY, fmtDateNumeric, fmtDuration, NBSP, plural } from '@/lib/format';
import { escapeHtml } from '@/lib/html';
import { formatMeasure, MEASURES } from '@/lib/measures';
import { SCATTER_LARGE_THRESHOLD, scatterPoints, type ScatterPoint, type ScatterY } from '@/lib/rhythmBlocks';
import { colors } from '@/theme/tokens';
import './rhythm.css';

interface Props {
  /** Vols de la sélection courante. */
  flights: readonly Flight[];
}

/** Lignes du tableau « Voir les données » d'un nuage de mesure : les vols aux valeurs les plus hautes. */
const TABLE_ROWS = 100;
const DISCIPLINES = [
  { activity: 'parapente', name: 'Parapente', color: 'p' },
  { activity: 'paramoteur', name: 'Paramoteur', color: 'm' },
] as const;

const SELECT_DATA = [
  { group: 'Mesure', items: CROSS_MEASURES.map((id) => ({ value: id, label: MEASURES[id].label })) },
  { group: 'Catégorie', items: CROSS_CATEGORIES.map((id) => ({ value: id, label: CATEGORY_LABELS[id] })) },
];

/** Libellé d'axe en heures (`60` min -> « 1 »). */
const hoursLabel = (v: number | string) => {
  const hours = Number(v) / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
};

/**
 * Bloc « Durée des vols » : la durée (axe vertical) croisée « selon » une mesure (nuage, un point par vol) ou une
 * catégorie (nuage en bandes : une colonne par mois, heure, voile ou site, trait de médiane par colonne).
 * Couleur = discipline ; un clic sur un point ouvre la fiche du vol. Au-delà de 3 000 points, ECharts passe en mode
 * `large` (tous les points restent tracés, sans animation ni infobulle par point groupé).
 */
export function FlightScatter({ flights }: Props) {
  const scheme = useComputedColorScheme('light');
  const navigate = useNavigate();
  const search = useFilterSearch();
  const [key, setKey] = useState<CrossKey>('plafond');
  const category: CrossCategory | null = isCategory(key) ? key : null;
  const measure: ScatterY | null = isCategory(key) ? null : key;

  const scatter = useMemo(() => (measure ? scatterPoints(flights, measure) : null), [flights, measure]);
  const bands = useMemo(() => (category ? bandCloud(flights, category) : null), [flights, category]);
  const points = useMemo<(ScatterPoint | BandPoint)[]>(
    () => scatter?.points ?? bands?.points ?? [],
    [scatter, bands],
  );
  const missing = scatter?.missing ?? bands?.missing ?? 0;

  // Séries de points par discipline, dans l'ordre de DISCIPLINES (la fiche s'ouvre par indice de série et de point).
  const series = useMemo<(ScatterPoint | BandPoint)[][]>(
    () => DISCIPLINES.map((d) => points.filter((p) => p.flight.activity === d.activity)),
    [points],
  );
  const large = points.length > SCATTER_LARGE_THRESHOLD;
  const def = measure ? MEASURES[measure] : null;

  const option = useMemo<EChartsOption>(() => {
    const c = colors[scheme];
    const durationAxis = {
      type: 'value' as const,
      name: 'Durée (h)',
      nameGap: 12,
      interval: 60,
      min: 0,
      max: (value: { max: number }) => Math.max(Math.ceil(value.max / 60), 1) * 60,
      axisLabel: { formatter: hoursLabel },
    };
    // Les séries 0 et 1 sont les points (parapente, paramoteur) ; la série 2, en bandes, est le trait de médiane.
    const pointSeries = DISCIPLINES.map((d, i) => ({
      type: 'scatter' as const,
      name: d.name,
      large,
      largeThreshold: SCATTER_LARGE_THRESHOLD,
      symbolSize: 6,
      itemStyle: { color: c[d.color], opacity: 0.6 },
      emphasis: { itemStyle: { opacity: 1, borderColor: c.text, borderWidth: 1 } },
      data: (series[i] ?? []).map((p) =>
        bands ? [(p as BandPoint).x + 1, p.y] : [(p as ScatterPoint).y, (p as ScatterPoint).x],
      ),
    }));

    if (bands && category) {
      const columns = bands.columns;
      const wide = category === 'voile' || category === 'site';
      // Un segment horizontal par colonne ; une valeur absente entre deux segments interrompt le trait.
      const medianData: (number | string)[][] = [];
      columns.forEach((col, i) => {
        if (col.median === null) return;
        medianData.push([i + 1 - BAND_SPREAD, col.median], [i + 1 + BAND_SPREAD, col.median], [i + 1, '-']);
      });
      const summary = (i: number) => {
        const col = columns[i];
        if (!col) return '';
        return (
          `<b>${escapeHtml(col.label)}</b>, ${plural(col.n, 'vol')}<br/>` +
          `Médiane ${col.median === null ? EMPTY : fmtDuration(col.median)}, max ${col.max === null ? EMPTY : fmtDuration(col.max)}`
        );
      };
      return {
        grid: { left: 44, right: 16, top: 28, bottom: category === 'heure' ? 44 : wide ? 74 : 56 },
        legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10 },
        tooltip: {
          trigger: 'item',
          confine: true,
          formatter: (raw: unknown) => {
            const p = raw as { seriesIndex: number; dataIndex: number };
            if (p.seriesIndex === DISCIPLINES.length) return summary(Math.floor(p.dataIndex / 3));
            const point = series[p.seriesIndex]?.[p.dataIndex] as BandPoint | undefined;
            if (!point) return '';
            const f = point.flight;
            return (
              `${summary(point.col)}<br/><span style="opacity:.75">${escapeHtml(f.pilot)}, ${fmtDateNumeric(f.date)}, ` +
              `${fmtDuration(point.y)}</span>`
            );
          },
        },
        xAxis: {
          type: 'value',
          name: category === 'heure' ? 'Heure de décollage (h)' : undefined,
          nameLocation: 'middle',
          nameGap: 28,
          min: 0,
          max: columns.length + 1,
          interval: 1,
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            interval: 0,
            rotate: category === 'heure' ? 0 : 45,
            hideOverlap: true,
            formatter: (v: number | string) => {
              const label = columns[Number(v) - 1]?.label;
              if (label === undefined) return '';
              if (category === 'heure') return label.replace(`${NBSP}h`, '');
              return label.length > 16 ? `${label.slice(0, 15)}…` : label;
            },
          },
        },
        yAxis: durationAxis,
        series: [
          ...pointSeries,
          {
            type: 'line' as const,
            name: 'Médiane',
            symbol: 'none',
            connectNulls: false,
            lineStyle: { color: c.text, width: 2.5 },
            itemStyle: { color: c.text },
            emphasis: { disabled: true },
            z: 5,
            data: medianData,
          },
        ],
      };
    }

    return {
      grid: { left: 44, right: 16, top: 28, bottom: 44 },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10 },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (raw: unknown) => {
          const p = raw as { seriesIndex: number; dataIndex: number };
          const point = series[p.seriesIndex]?.[p.dataIndex] as ScatterPoint | undefined;
          if (!point || !def) return '';
          const f = point.flight;
          return (
            `<b>${escapeHtml(f.pilot)}</b>, ${fmtDateNumeric(f.date)}<br/>` +
            `${escapeHtml(f.site ?? EMPTY)}<br/>` +
            `Durée ${fmtDuration(point.x)}<br/>${def.label} ${formatMeasure(def, point.y)}`
          );
        },
      },
      xAxis: {
        type: 'value',
        name: def ? `${def.label} (${def.unit})` : undefined,
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: { formatter: (v: number | string) => String(Number(v)).replace('.', ',') },
        splitLine: { show: false },
      },
      yAxis: durationAxis,
      series: pointSeries,
    };
  }, [series, scheme, large, def, bands, category]);

  const table = useMemo(() => {
    if (bands && category) {
      return {
        columns: [CATEGORY_LABELS[category], 'Vols', 'Durée médiane', 'Durée max'],
        rows: bands.columns.map((col) => [
          col.label,
          col.n,
          col.median === null ? EMPTY : fmtDuration(col.median),
          col.max === null ? EMPTY : fmtDuration(col.max),
        ]),
      };
    }
    const label = def?.label ?? '';
    return {
      columns: ['Date', 'Pilote', 'Site', 'Durée', label],
      rows: (points as ScatterPoint[])
        .slice()
        .sort((a, b) => b.y - a.y)
        .slice(0, TABLE_ROWS)
        .map((p) => [
          fmtDateNumeric(p.flight.date),
          p.flight.pilot,
          p.flight.site ?? EMPTY,
          fmtDuration(p.x),
          def ? formatMeasure(def, p.y) : '',
        ]),
    };
  }, [bands, category, def, points]);

  const onEvents = useMemo(
    () => ({
      click: (raw: unknown) => {
        const p = raw as { seriesIndex?: number; dataIndex?: number };
        if (p.seriesIndex === undefined || p.dataIndex === undefined || p.seriesIndex >= DISCIPLINES.length)
          return;
        const point = series[p.seriesIndex]?.[p.dataIndex];
        if (point) void navigate({ pathname: `/vol/${point.flight.key}`, search });
      },
    }),
    [series, navigate, search],
  );

  const title = 'Durée des vols';
  if (flights.length === 0) {
    return (
      <Section id="nuage" title={title}>
        <Text size="sm" c="dimmed">
          Aucun vol pour ces filtres.
        </Text>
      </Section>
    );
  }

  const what = category ? CATEGORY_LABELS[category].toLowerCase() : (def?.label.toLowerCase() ?? '');
  return (
    <Section
      id="nuage"
      title={title}
      subtitle="Un point par vol&nbsp;: un clic ouvre la fiche du vol."
      actions={
        <>
          {measure && <CoverageNotice flights={flights} measure={measure} />}
          <Group gap={6} wrap="nowrap">
            <Text size="xs" c="dimmed" component="span" aria-hidden="true">
              Selon
            </Text>
            <Select
              size="xs"
              w={170}
              aria-label="Durée selon"
              data={SELECT_DATA}
              value={key}
              allowDeselect={false}
              onChange={(v) => v && setKey(v as CrossKey)}
              maxDropdownHeight={380}
              comboboxProps={{ position: 'bottom-end' }}
            />
          </Group>
        </>
      }
    >
      {points.length === 0 ? (
        <Text size="sm" c="dimmed">
          Aucun vol avec durée et {what} connus.
        </Text>
      ) : (
        <ChartFrame
          option={option}
          height={category && (category === 'voile' || category === 'site') ? 370 : 340}
          testId="flight-scatter"
          ariaLabel={
            category
              ? `Nuage en bandes\u00a0: durée des vols en ordonnée, une colonne par ${what}, trait de médiane par colonne, ${plural(points.length, 'vol')} représentés${missing > 0 ? `, ${plural(missing, 'vol')} sans durée ou sans ${what}` : ''}.`
              : `Nuage de points\u00a0: ${what} en abscisse, durée du vol en ordonnée, ${plural(points.length, 'vol')} représentés${missing > 0 ? `, ${plural(missing, 'vol')} sans la mesure` : ''}.`
          }
          onEvents={onEvents}
          table={table}
          footer={
            <Text size="xs" c="dimmed" mt={4}>
              {plural(points.length, 'vol')} tracé{points.length > 1 ? 's' : ''}
              {missing > 0 ? `, ${plural(missing, 'vol')} sans durée ou sans ${what}` : ''}
              {large ? ' (mode grand volume)' : ''}.{' '}
              {category
                ? `Une colonne par ${what}, le trait épais marque la durée médiane${bands?.columns.some((col) => col.label === 'Autres') ? ' ; « Autres » regroupe les moins volés' : ''}.`
                : `Le tableau liste les ${TABLE_ROWS} valeurs les plus hautes.`}
            </Text>
          }
        />
      )}
    </Section>
  );
}
