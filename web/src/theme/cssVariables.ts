import type { CSSVariablesResolver } from '@mantine/core';
import {
  borderWidth,
  colors,
  font,
  fontSize,
  fontWeight,
  lineHeight,
  motion,
  radius,
  shadow,
  space,
  tracking,
  type ColorScheme,
} from '@/theme/tokens';

/** Préfixe des variables CSS exposées : `--sr-bg`, `--sr-p`, `--sr-space-4`… */
export const CSS_PREFIX = '--sr-';

function schemeVariables(scheme: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors[scheme])) out[`${CSS_PREFIX}${key}`] = value;
  out[`${CSS_PREFIX}shadow-sm`] = shadow[scheme].sm;
  out[`${CSS_PREFIX}shadow-md`] = shadow[scheme].md;
  return out;
}

function sharedVariables(): Record<string, string> {
  const out: Record<string, string> = {
    [`${CSS_PREFIX}font-sans`]: font.sans,
    [`${CSS_PREFIX}font-mono`]: font.mono,
    [`${CSS_PREFIX}font-numeric`]: font.numeric,
    [`${CSS_PREFIX}border-width`]: `${borderWidth}px`,
    [`${CSS_PREFIX}motion`]: `${motion.durationMs}ms ${motion.easing}`,
    [`${CSS_PREFIX}tracking-display`]: tracking.display,
    [`${CSS_PREFIX}tracking-heading`]: tracking.heading,
    [`${CSS_PREFIX}tracking-label`]: tracking.label,
  };
  for (const [k, v] of Object.entries(space)) out[`${CSS_PREFIX}space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) out[`${CSS_PREFIX}radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(fontSize)) out[`${CSS_PREFIX}text-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(lineHeight)) out[`${CSS_PREFIX}leading-${k}`] = String(v);
  for (const [k, v] of Object.entries(fontWeight)) out[`${CSS_PREFIX}weight-${k}`] = String(v);
  return out;
}

/** Variables Mantine rebranchées sur nos jetons, pour que les composants suivent la palette. */
function mantineOverrides(scheme: ColorScheme): Record<string, string> {
  const c = colors[scheme];
  return {
    '--mantine-color-body': c.bg,
    '--mantine-color-text': c.text,
    '--mantine-color-dimmed': c.muted,
    '--mantine-color-default': c.surface,
    '--mantine-color-default-hover': c['surface-2'],
    '--mantine-color-default-color': c.text,
    '--mantine-color-default-border': c.line,
    '--mantine-color-placeholder': c.muted,
    '--mantine-color-anchor': c['accent-text'],
  };
}

/** À passer à `MantineProvider` : jetons `--sr-*` en clair et en sombre (suivent `data-mantine-color-scheme`). */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: sharedVariables(),
  light: { ...schemeVariables('light'), ...mantineOverrides('light') },
  dark: { ...schemeVariables('dark'), ...mantineOverrides('dark') },
});
