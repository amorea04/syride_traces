import {
  Badge,
  Button,
  Card,
  createTheme,
  MultiSelect,
  Paper,
  Pill,
  SegmentedControl,
  Select,
  TextInput,
  type MantineColorsTuple,
} from '@mantine/core';
import { font, fontSize, fontWeight, lineHeight, radius } from '@/theme/tokens';

export { cssVariablesResolver } from '@/theme/cssVariables';

/** Pile de polices système uniquement (D10). */
export const SYSTEM_FONT_STACK = font.sans;

/**
 * Échelle « encre indigo » : la nuance 8 est l'encre #1f2358 (accent clair), la 2 est #c7ccff (accent sombre).
 * Du plus clair (0) au plus sombre (9).
 */
export const INK_SCALE: MantineColorsTuple = [
  '#eef0ff',
  '#dde0fb',
  '#c7ccff',
  '#a4abf0',
  '#7c85d6',
  '#555fb8',
  '#3a4396',
  '#2a2f75',
  '#1f2358',
  '#151845',
];

const px = (n: number) => `${n}px`;

export const mantineTheme = createTheme({
  primaryColor: 'ink',
  primaryShade: { light: 8, dark: 2 },
  autoContrast: true,
  colors: { ink: INK_SCALE },
  fontFamily: SYSTEM_FONT_STACK,
  fontFamilyMonospace: font.mono,
  headings: {
    fontFamily: SYSTEM_FONT_STACK,
    fontWeight: String(fontWeight.bold),
    sizes: {
      h1: { fontSize: px(fontSize['2xl']), lineHeight: String(lineHeight.tight) },
      h2: { fontSize: px(fontSize.xl), lineHeight: String(lineHeight.tight) },
      h3: { fontSize: px(fontSize.lg), lineHeight: '1.25' },
      h4: { fontSize: px(fontSize.md), lineHeight: '1.3' },
      h5: { fontSize: px(fontSize.base), lineHeight: '1.4' },
      h6: { fontSize: px(fontSize.sm), lineHeight: '1.4' },
    },
  },
  fontSizes: {
    xs: px(fontSize.xs),
    sm: px(fontSize.sm),
    md: px(fontSize.base),
    lg: px(fontSize.md),
    xl: px(fontSize.lg),
  },
  lineHeights: {
    xs: '1.4',
    sm: '1.45',
    md: String(lineHeight.base),
    lg: String(lineHeight.loose),
    xl: '1.65',
  },
  radius: { xs: px(radius.sm), sm: px(radius.sm), md: px(radius.md), lg: px(radius.lg), xl: px(radius.lg) },
  defaultRadius: 'md',
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  cursorType: 'pointer',
  /** Anneau de focus net, visible au clavier uniquement. */
  focusRing: 'auto',
  focusClassName: 'sr-focus',
  other: { tabularNums: 'tabular-nums' },
  components: {
    Card: Card.extend({ defaultProps: { withBorder: true, radius: 'md', shadow: undefined, padding: 'md' } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: 'md', shadow: undefined } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: 'md' } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { radius: 'md', size: 'sm' } }),
    Select: Select.extend({ defaultProps: { radius: 'md', size: 'sm' } }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'md', size: 'sm' } }),
    Pill: Pill.extend({ defaultProps: { radius: 'sm' } }),
    /** Badge sobre : contour, sans aplat vif. */
    Badge: Badge.extend({
      defaultProps: { variant: 'outline', radius: 'sm', color: 'gray', fw: fontWeight.medium },
    }),
    Button: Button.extend({ defaultProps: { radius: 'md', fw: fontWeight.medium } }),
  },
});
