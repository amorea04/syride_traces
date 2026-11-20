import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL_KEYS,
  colors,
  contrastMin,
  disciplineColor,
  type ColorKey,
  type ColorScheme,
} from '@/theme/tokens';
import { buildEchartsTheme } from '@/theme/echarts';
import { mapStyleUrl, tuneMapStyle } from '@/theme/map';

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG d'une couleur #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const SCHEMES: ColorScheme[] = ['light', 'dark'];

/** Paires [texte, fond] qui portent du texte : seuil AA 4,5. */
const TEXT_PAIRS: Array<[ColorKey, ColorKey]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['accent-text', 'surface'],
  ['accent-text', 'bg'],
  ['accent-ink', 'accent'],
  ['p-text', 'surface'],
  ['p-text', 'bg'],
  ['m-text', 'bg'],
  ['m-text', 'surface'],
  ['gold-text', 'gold-bg'],
  ['up-text', 'up-bg'],
  ['down-text', 'down-bg'],
  ['nup-text', 'nup-bg'],
  ['ndown-text', 'ndown-bg'],
  ['flat-text', 'flat-bg'],
];

/** Marques graphiques sur fond de surface : seuil 3. */
const MARK_KEYS: ColorKey[] = ['p', 'm', 'b', 'y0', 'y1', 'y2', 'up', 'down', 'nup', 'ndown', 'gold'];

describe('jetons', () => {
  it('clair et sombre ont exactement les mêmes clés', () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it.each(['p', 'm', 'b', 'gold', 'y0', 'y1', 'y2', 'up', 'down', 'nup', 'ndown'])('%s existe', (k) => {
    expect(colors.light).toHaveProperty(k);
  });

  it('toutes les couleurs sont des #rrggbb (hors scrim)', () => {
    for (const scheme of SCHEMES) {
      for (const [k, v] of Object.entries(colors[scheme])) {
        if (k === 'scrim') continue;
        expect(v, `${scheme}/${k}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it.each(SCHEMES)('contrastes AA du texte (%s)', (scheme) => {
    for (const [fg, bg] of TEXT_PAIRS) {
      const ratio = contrast(colors[scheme][fg], colors[scheme][bg]);
      expect(ratio, `${scheme} ${fg} sur ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        contrastMin.text,
      );
    }
  });

  it.each(SCHEMES)('contrastes des marques (%s)', (scheme) => {
    for (const k of MARK_KEYS) {
      const ratio = contrast(colors[scheme][k], colors[scheme].surface);
      expect(ratio, `${scheme} ${k} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(contrastMin.marks);
    }
  });

  it('les 8 couleurs catégorielles existent et sont distinctes', () => {
    for (const scheme of SCHEMES) {
      const vals = CATEGORICAL_KEYS.map((k) => colors[scheme][k]);
      expect(new Set(vals).size).toBe(8);
    }
  });

  it('disciplineColor associe p, m et b', () => {
    expect(disciplineColor('parapente', 'light')).toBe(colors.light.p);
    expect(disciplineColor('paramoteur', 'dark')).toBe(colors.dark.m);
    expect(disciplineColor('tout', 'light')).toBe(colors.light.b);
    expect(disciplineColor('parapente', 'light')).not.toBe(disciplineColor('paramoteur', 'light'));
  });
});

describe('thème ECharts', () => {
  it.each(SCHEMES)('reprend les catégorielles et le fond (%s)', (scheme) => {
    const t = buildEchartsTheme(scheme);
    expect(t['color']).toEqual(CATEGORICAL_KEYS.map((k) => colors[scheme][k]));
    expect(t['backgroundColor']).toBe('transparent');
  });
});

describe('style de carte', () => {
  it('mapStyleUrl pointe sur positron', () => {
    expect(mapStyleUrl('light')).toBe('https://tiles.openfreemap.org/styles/positron');
  });

  it.each(SCHEMES)('recolore eau, fond et routes (%s) sans muter', (scheme) => {
    const style = {
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
        { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
        {
          id: 'highway_major',
          type: 'line',
          'source-layer': 'transportation',
          paint: { 'line-color': '#000' },
        },
      ],
    };
    const out = tuneMapStyle(style, scheme);
    expect(out.layers[0]?.paint?.['background-color']).toBe(colors[scheme]['map-land']);
    expect(out.layers[1]?.paint?.['fill-color']).toBe(colors[scheme]['map-water']);
    expect(out.layers[2]?.paint?.['line-color']).toBe(colors[scheme]['map-border']);
    expect(style.layers[0]?.paint?.['background-color']).toBe('#fff');
  });
});
