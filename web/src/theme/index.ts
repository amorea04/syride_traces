import { createTheme } from '@mantine/core';

/** Pile de polices système uniquement (D10). Stub : le designer remplace ce fichier en gardant le nom d'export. */
export const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const mantineTheme = createTheme({ fontFamily: SYSTEM_FONT_STACK });
