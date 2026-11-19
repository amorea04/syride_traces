import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { milestoneTag, milestoneTarget, requestOpenDay } from '@/lib/bilanOverview';
import { fmtDate } from '@/lib/format';
import './bilanA.css';

/**
 * Histoire (5B.4) : frise des jalons de l'année (textes du récit Python), en or pour les records et nouveautés.
 * Chaque jalon mène à la fiche du vol, ou à la fiche du jour quand il n'a pas de vol.
 */
export function BilanStory() {
  const { story, history, flights } = useBilan();
  const keys = useMemo(() => new Set(history.map((f) => f.key)), [history]);
  const days = useMemo(() => new Set(flights.map((f) => f.date)), [flights]);
  if (story.milestones.length === 0) return null;
  return (
    <Section
      id="histoire"
      title="Ton année en jalons"
      subtitle="Les records et les nouveautés sont en or. Chaque jalon mène au vol ou à la fiche du jour."
    >
      <ol className="bl-timeline" data-testid="bilan-milestones">
        {story.milestones.map((m, i) => {
          const target = milestoneTarget(m, keys, days);
          const tag = milestoneTag(m.kind, m.gold);
          return (
            <li key={`${m.date}-${m.kind}-${i}`} className="bl-ms" data-gold={m.gold} data-kind={m.kind} data-testid="bilan-milestone">
              <div className="bl-ms-date">
                {fmtDate(m.date)}
                {tag && <span className="bl-tag">{tag}</span>}
              </div>
              <b className="bl-ms-title">{m.title}</b>
              {m.detail && <span className="bl-ms-detail">{m.detail}</span>}
              {target?.type === 'flight' && (
                <FilterLink to={`/vol/${target.key}`} className="bl-link" data-testid="bilan-milestone-link">
                  Voir le vol
                </FilterLink>
              )}
              {target?.type === 'day' && (
                <button type="button" className="bl-link" onClick={() => requestOpenDay(target.date)}>
                  Ouvrir la fiche du jour
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
