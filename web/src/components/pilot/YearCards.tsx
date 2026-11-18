import { useMemo } from 'react';
import { DeltaPill } from '@/components/common/DeltaPill';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { EmptyNote } from '@/components/dashboard/shared';
import '@/components/pilot/pilot.css';
import type { Flight } from '@/data/flight';
import { fmtHm, plural } from '@/lib/format';
import { yearCards } from '@/lib/pilots';

interface Props {
  flights: readonly Flight[];
  slug: string;
  /** Date de mise à jour des données. */
  refDate: string;
}

/** Une carte par année, cliquable vers le Bilan de l'année. */
export function YearCards({ flights, slug, refDate }: Props) {
  const cards = useMemo(() => yearCards(flights, refDate), [flights, refDate]);
  return (
    <Section id="bilans" title="Un bilan par année" subtitle="Chaque carte ouvre le bilan de l’année.">
      {cards.length === 0 ? (
        <EmptyNote />
      ) : (
        <div className="pl-years" data-testid="year-cards">
          {cards.map((card) => {
            const max = Math.max(...card.months, 1);
            return (
              <FilterLink
                key={card.year}
                to={`/pilote/${slug}/${card.year}`}
                className="pl-year"
                underline="never"
                data-testid="year-card"
                data-year={card.year}
              >
                <span className="pl-year-top">
                  <span className="pl-year-y">{card.year}</span>
                  {card.inProgress && <span className="pl-year-tag">en cours</span>}
                </span>
                <span className="pl-year-h">{fmtHm(card.minutes)}</span>
                <span className="pl-year-meta">
                  {plural(card.flights, 'vol')} · {plural(card.sites, 'site')}
                </span>
                <span className="pl-months" aria-hidden="true">
                  {card.months.map((m, i) => (
                    <i key={i} data-empty={m === 0} style={{ height: `${Math.max(8, (100 * m) / max)}%` }} />
                  ))}
                </span>
                <span className="pl-year-foot">
                  {card.deltaPct !== null ? (
                    <DeltaPill value={card.deltaPct} kind="volume" />
                  ) : (
                    <span className="pl-year-tag">{card.first ? 'première année' : ''}</span>
                  )}
                  <span>Voir le bilan ›</span>
                </span>
              </FilterLink>
            );
          })}
        </div>
      )}
    </Section>
  );
}
