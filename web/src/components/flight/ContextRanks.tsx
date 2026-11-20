import { Section } from '@/components/common/Section';
import '@/components/flight/flight.css';
import { MIN_RANK_POPULATION, type RankStatement } from '@/lib/flightContext';

/** Rangs parlants du vol (top 3 ou 10 % de tête). L'or n'est utilisé que pour un rang 1. */
export function ContextRanks({ ranks }: { ranks: readonly RankStatement[] }) {
  return (
    <Section id="contexte" title="Ce vol dans son contexte">
      {ranks.length === 0 ? (
        <p className="fv-note" style={{ margin: 0 }} role="status">
          Aucun classement remarquable&nbsp;: le vol n’est ni dans les 3 premiers ni dans les 10&nbsp;% de tête, ou la
          population compte moins de {MIN_RANK_POPULATION} vols mesurés.
        </p>
      ) : (
        <ul className="fv-ctx" data-testid="flight-ranks">
          {ranks.map((r) => (
            <li key={`${r.metric}-${r.scope}`}>
              <span className="fv-diamond" data-gold={r.gold} aria-hidden="true" />
              <span>
                {r.gold ? <span className="fv-gold">{r.text}</span> : r.text}{' '}
                <span style={{ color: 'var(--sr-muted)' }}>({r.detail})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
