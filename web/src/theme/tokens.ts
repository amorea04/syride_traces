/**
 * Jetons de design, palette « B · Encre » (source : web/design/tokens-B.json, recopiée sans transformation).
 * Une couleur = un sens : p = parapente (vermillon), m = paramoteur (azur), b = les deux,
 * gold = records et nouveautés uniquement, y0..y2 = années comparées (doublées d’un motif).
 */

export type ColorScheme = 'light' | 'dark';

const LIGHT = {
  bg: '#f4f4f8',
  surface: '#ffffff',
  line: '#dcdce6',
  text: '#14151c',
  muted: '#5b5e70',
  accent: '#1f2358',
  'accent-ink': '#ffffff',
  p: '#e4572e',
  m: '#2f6fe0',
  b: '#3f4352',
  'p-strong': '#b8401c',
  'm-strong': '#1f58c4',
  gold: '#b58900',
  'gold-bg': '#fbf0cf',
  'gold-text': '#6b5000',
  y0: '#1f2358',
  y1: '#8b5cf6',
  y2: '#7a7f92',
  up: '#0f8a7e',
  down: '#c2255c',
  nup: '#6f4fd0',
  ndown: '#a0651a',
  flat: '#5b5e70',
  scrim: 'rgba(20,21,28,.45)',
  c1: '#db5ab5',
  c2: '#a45159',
  c3: '#9d35ad',
  c4: '#346304',
  c5: '#9c0760',
  c6: '#02a339',
  c7: '#55489f',
  c8: '#2d895c',
  'up-bg': '#e2eeec',
  'up-text': '#0d766b',
  'down-bg': '#fbe3e7',
  'down-text': '#c2255c',
  'nup-bg': '#e8e7fb',
  'nup-text': '#6f4fd0',
  'ndown-bg': '#f2e9e0',
  'ndown-text': '#975c0a',
  'flat-bg': '#e6e7ea',
  'flat-text': '#5b5e70',
  'accent-text': '#1f2358',
  'p-text': '#d24619',
  'm-text': '#2f6fe0',
  'cal-empty': '#e2e2e7',
  'cal-p1': '#dbb3ac',
  'cal-p2': '#d29181',
  'cal-p3': '#c76b52',
  'cal-p4': '#b8401c',
  'cal-m1': '#a7bae0',
  'cal-m2': '#7c9dd9',
  'cal-m3': '#4f7bcf',
  'cal-m4': '#1f58c4',
  'cal-b1': '#a0a1a9',
  'cal-b2': '#72747d',
  'cal-b3': '#444651',
  'cal-b4': '#1b1d28',
  'w-site': '#764800',
  'w-treuil': '#930646',
  'w-rando': '#2f7c20',
  'w-mer': '#373ba7',
  'w-moteur': '#7b5b86',
  'w-autre': '#6b7280',
  'surface-2': '#ebebf2',
  'hero-1': '#1f2358',
  'hero-2': '#2a2f75',
  'map-water': '#dfe6ef',
  'map-land': '#eceee9',
  'map-border': '#c8ccd6',
} as const;

export type ColorKey = keyof typeof LIGHT;

const DARK: Record<ColorKey, string> = {
  bg: '#0e0f14',
  surface: '#17181f',
  line: '#2b2d3a',
  text: '#ececf4',
  muted: '#a0a3b6',
  accent: '#c7ccff',
  'accent-ink': '#0e0f14',
  p: '#ff7a50',
  m: '#6aa0ff',
  b: '#c4c8d6',
  'p-strong': '#ff7a50',
  'm-strong': '#6aa0ff',
  gold: '#e8b923',
  'gold-bg': '#33280a',
  'gold-text': '#e8b923',
  y0: '#c7ccff',
  y1: '#a78bfa',
  y2: '#9a9fb2',
  up: '#2dd4bf',
  down: '#fb7185',
  nup: '#a78bfa',
  ndown: '#e0a458',
  flat: '#a0a3b6',
  scrim: 'rgba(0,0,0,.65)',
  c1: '#db5dbb',
  c2: '#a6535a',
  c3: '#9d50d5',
  c4: '#4dae0b',
  c5: '#b52a91',
  c6: '#4c781b',
  c7: '#625fa5',
  c8: '#009b7e',
  'up-bg': '#23393b',
  'up-text': '#2dd4bf',
  'down-bg': '#3f2a32',
  'down-text': '#fb7185',
  'nup-bg': '#302d45',
  'nup-text': '#a78bfa',
  'ndown-bg': '#3a312d',
  'ndown-text': '#e0a458',
  'flat-bg': '#2f303a',
  'flat-text': '#a0a3b6',
  'accent-text': '#c7ccff',
  'p-text': '#ff7a50',
  'm-text': '#6aa0ff',
  'cal-empty': '#202126',
  'cal-p1': '#75615d',
  'cal-p2': '#a7867c',
  'cal-p3': '#d7a99a',
  'cal-p4': '#ffc6b2',
  'cal-m1': '#5c6679',
  'cal-m2': '#7f8eaa',
  'cal-m3': '#a0b5d8',
  'cal-m4': '#bbd5ff',
  'cal-b1': '#6b6c72',
  'cal-b2': '#97989e',
  'cal-b3': '#c1c3c9',
  'cal-b4': '#e4e6ec',
  'w-site': '#c49d68',
  'w-treuil': '#fe85af',
  'w-rando': '#9bd75b',
  'w-mer': '#16bdb5',
  'w-moteur': '#c38eff',
  'w-autre': '#94a3b8',
  'surface-2': '#20212b',
  'hero-1': '#0a0b1e',
  'hero-2': '#14173a',
  'map-water': '#11141c',
  'map-land': '#1c2030',
  'map-border': '#343a50',
};

export const colors: Record<ColorScheme, Record<ColorKey, string>> = { light: LIGHT, dark: DARK };

/** Motifs doublant les couleurs d’années (accessibilité : ne pas compter sur la seule teinte). */
export const yearPatterns = {
  y0: { dasharray: 'none', hatch: 'none', hatchAngle: null },
  y1: { dasharray: '7 4', hatch: 'diagonal 45°', hatchAngle: 45 },
  y2: { dasharray: '2 4', hatch: 'diagonal 135°', hatchAngle: 135 },
  hatchWidth: 2,
  hatchGap: 5,
} as const;

export const space = {
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 32,
  '8': 48,
  '9': 64,
} as const;
export const radius = { sm: 3, md: 5, lg: 8, pill: 999 } as const;
export const shadow: Record<ColorScheme, { sm: string; md: string }> = {
  light: { sm: 'none', md: 'none' },
  dark: { sm: 'none', md: 'none' },
};
export const borderWidth = 1;
export const font = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  numeric: 'tabular-nums',
} as const;
export const fontSize = { xs: 12, sm: 13, base: 15, md: 17, lg: 20, xl: 26, '2xl': 34, '3xl': 46 } as const;
export const lineHeight = { tight: 1.15, base: 1.5, loose: 1.65 } as const;
export const fontWeight = { regular: 400, medium: 500, semibold: 650, bold: 750 } as const;
export const tracking = { display: '-.035em', heading: '-.02em', label: '.14em' } as const;
export const motion = { durationMs: 150, easing: 'ease-out' } as const;
export const layout = {
  containerRead: 1120,
  sidebar: 280,
  breakpointMobile: 900,
  previewMobile: 375,
  gridColumns: 12,
} as const;
export const contrastMin = { text: 4.5, marks: 3 } as const;

/** Couleurs catégorielles, ordre fixe (jamais cyclé au-delà de 8). */
export const CATEGORICAL_KEYS = [
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
] as const satisfies readonly ColorKey[];

export function categoricalColors(scheme: ColorScheme): string[] {
  return CATEGORICAL_KEYS.map((k) => colors[scheme][k]);
}

/** Activité telle qu’exportée (« parapente » / « paramoteur »), ou « tout » pour les deux. */
export type ActivityLike = 'parapente' | 'paramoteur' | 'tout';

/** Couleur sémantique d’une discipline : p, m ou b (les deux). */
export function disciplineColor(activity: ActivityLike, scheme: ColorScheme): string {
  const key: ColorKey = activity === 'parapente' ? 'p' : activity === 'paramoteur' ? 'm' : 'b';
  return colors[scheme][key];
}
