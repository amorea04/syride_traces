import { useCallback } from 'react';
import { CellTooltip } from '@/components/common/CellTooltip';
import '@/components/flight/flight.css';
import { stripMarkTip } from '@/lib/cellTips';
import { fmtWithUnit } from '@/components/flight/measureFormat';
import { fmtNum, fmtSignedPct, NBSP } from '@/lib/format';
import { fmtOrdinal, deltaPercent } from '@/lib/flightContext';
import { SITE_INDICATORS, type IndicatorPosition } from '@/lib/siteAggregates';

/** Position (0 à 100 %) d'une valeur sur la bande ; 50 % si toutes les valeurs sont égales. */
export function stripPosition(value: number, min: number, max: number, scale: 'linear' | 'log'): number {
  if (max <= min) return 50;
  if (scale === 'log') {
    const lo = Math.log(Math.max(min, 1));
    const hi = Math.log(Math.max(max, 1));
    if (hi <= lo) return 50;
    return (100 * (Math.log(Math.max(value, 1)) - lo)) / (hi - lo);
  }
  return (100 * (value - min)) / (max - min);
}

/** Écart de ce site à la moyenne des autres : « ×2,4 » pour un effectif, « +12 % » sinon ; neutre, jamais bien ou mal. */
export function gapLabel(
  ind: IndicatorPosition,
  scale: 'linear' | 'log',
): { text: string; up: boolean } | null {
  if (ind.value === null || ind.othersMean === null || ind.othersMean === 0) return null;
  if (scale === 'log') {
    const ratio = ind.value / ind.othersMean;
    return { text: `×${fmtNum(ratio, 1)}`, up: ratio >= 1 };
  }
  const pct = deltaPercent(ind.value, ind.othersMean);
  if (pct === null) return null;
  return { text: fmtSignedPct(pct), up: pct >= 0 };
}

interface Props {
  ind: IndicatorPosition;
  /** Libellé du groupe de référence : « autres sites » ou « autres sites du pilote ». */
  othersLabel: string;
  /** Nom du site situé, pour l'infobulle de son point (« Ce site » par défaut). */
  siteName?: string;
}

/** Légende commune des bandes : point = ce site, trait épais = moyenne, barre grise = étendue min–max. */
export function StripLegend({ siteName, othersLabel }: { siteName?: string; othersLabel: string }) {
  return (
    <div className="fv-legend" data-testid="strip-legend">
      <span>
        <i className="fv-sw" style={{ background: 'var(--sr-accent)', borderRadius: '50%' }} />
        Point : {siteName ? `ce site (${siteName})` : 'ce site'}
      </span>
      <span>
        <i className="fv-sw" style={{ background: 'var(--sr-b)', opacity: 0.4, borderRadius: '50%' }} />
        Petit point : un autre site
      </span>
      <span>
        <i
          className="fv-sw"
          style={{ width: 3, height: 14, background: 'var(--sr-text)', borderRadius: 1 }}
        />
        Trait : moyenne des {othersLabel}
      </span>
      <span>
        <i
          className="fv-sw"
          style={{ width: 22, height: 0, borderTop: '1px solid var(--sr-line)', borderRadius: 0 }}
        />
        Barre : étendue du plus bas au plus haut des sites
      </span>
    </div>
  );
}

/** Une bande : un point par site comparé, le site en accent, la moyenne des autres en trait. */
export function SiteStrip({ ind, othersLabel, siteName }: Props) {
  const def = SITE_INDICATORS.find((d) => d.id === ind.id)!;
  const fmt = (v: number | null) => fmtWithUnit(v, def.unit, def.digits);
  const gap = gapLabel(ind, def.scale);
  const rankText = ind.rank === null ? '–' : `${fmtOrdinal(ind.rank)} sur ${ind.total}`;
  const hasRange = ind.min !== null && ind.max !== null && ind.value !== null;
  const pos = (v: number) => (hasRange ? stripPosition(v, ind.min!, ind.max!, def.scale) : 50);
  const aria = `${def.label} : ${fmt(ind.value)} ici, moyenne des ${othersLabel} ${fmt(ind.othersMean)}, ${rankText}`;
  const resolve = useCallback(
    (el: HTMLElement) => {
      const kind = el.dataset['mark'] as 'site' | 'mean' | 'other' | undefined;
      const raw = Number(el.dataset['value']);
      return kind ? stripMarkTip(kind, siteName ?? 'Ce site', fmt(raw)) : null;
    },
    // `fmt` ne dépend que de l'indicateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, siteName],
  );
  const pill = gap && {
    background: `var(--sr-${gap.up ? 'nup' : 'ndown'}-bg)`,
    color: `var(--sr-${gap.up ? 'nup' : 'ndown'}-text)`,
  };
  return (
    <div data-indicator={ind.id}>
      <div style={{ fontWeight: 650 }}>{def.label}</div>
      {hasRange && (
        <CellTooltip resolve={resolve} className="fv-trk" role="img" ariaLabel={aria}>
          {ind.values.map((v, i) => (
            <i key={i} style={{ left: `${pos(v)}%` }} data-tip={`o${i}`} data-mark="other" data-value={v} />
          ))}
          {ind.othersMean !== null && (
            <b
              className="fv-mean"
              style={{ left: `${pos(ind.othersMean)}%` }}
              data-tip="mean"
              data-mark="mean"
              data-value={ind.othersMean}
            />
          )}
          <b
            className="fv-me"
            style={{ left: `${pos(ind.value!)}%` }}
            data-tip="me"
            data-mark="site"
            data-value={ind.value!}
          />
        </CellTooltip>
      )}
      <div className="fv-sv">
        <span>
          <b>{fmt(ind.value)}</b> <span style={{ color: 'var(--sr-muted)' }}>ce site</span>
        </span>
        <span style={{ color: 'var(--sr-muted)' }}>
          {othersLabel}
          {NBSP}: {fmt(ind.othersMean)}
        </span>
        {gap && (
          <span className="fv-pill" style={pill ?? undefined}>
            <span aria-hidden="true">{gap.up ? '▲' : '▼'}</span> {gap.text}
          </span>
        )}
        <span style={{ color: 'var(--sr-muted)' }}>{rankText}</span>
      </div>
      {hasRange && (
        <div className="fv-ax">
          <span>{fmt(ind.min)}</span>
          <span>
            {fmt(ind.max)}
            {def.scale === 'log' ? ' · échelle logarithmique' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
