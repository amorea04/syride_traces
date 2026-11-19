import './bilanA.css';

/** Trait court d'une année : couleur doublée du motif de la courbe (plein, tirets, pointillés). */
export function YearSwatch({ css, dash }: { css: string; dash: number[] | null }) {
  const style = dash === null ? 'solid' : (dash[0] ?? 0) <= 2 ? 'dotted' : 'dashed';
  return <i className="bl-swatch" style={{ color: css, borderTopStyle: style }} aria-hidden="true" />;
}
