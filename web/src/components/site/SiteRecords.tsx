import { useMemo } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { SyrideTraceLink } from '@/components/site/SyrideTraceLink';
import type { Flight } from '@/data/flight';
import { fmtDateNumeric } from '@/lib/format';
import { formatMeasure, MEASURES, type MeasureId } from '@/lib/measures';
import { rankedTop } from '@/lib/sites';
import './site.css';

/** Nombre de marques par critère. */
const TOP = 5;

const CRITERIA: readonly { id: MeasureId; label: string }[] = [
  { id: 'duree', label: 'Plus longue durée' },
  { id: 'distance', label: 'Plus grande distance' },
  { id: 'plafond', label: 'Plus haut plafond' },
  { id: 'vitesseMax', label: 'Vitesse max' },
  { id: 'vario', label: 'Vario max' },
  { id: 'g', label: 'g max' },
];

interface Props {
  /** Vols du site après filtres. */
  flights: readonly Flight[];
}

/** Records du site : les cinq meilleures marques de six critères ; la valeur record (rang 1) est en or. */
export function SiteRecords({ flights }: Props) {
  const lists = useMemo(
    () => CRITERIA.map((c) => ({ ...c, rows: rankedTop(flights, MEASURES[c.id].of, { top: TOP }) })),
    [flights],
  );
  return (
    <Section
      id="records"
      title="Records du site"
      subtitle={`Les ${TOP} meilleures marques de chaque critère.`}
    >
      <div className="st-records" data-testid="site-records">
        {lists.map((l) => (
          <div key={l.id} data-testid={`record-${l.id}`}>
            <h3>{l.label}</h3>
            {l.rows.length === 0 ? (
              <p className="fv-note" style={{ margin: 0, fontSize: 13 }}>
                Aucune mesure.
              </p>
            ) : (
              <ol>
                {l.rows.map((r) => (
                  <li key={r.flight.key}>
                    <span className="st-rank">{r.rank}</span>
                    <span className="st-records-main">
                      <b className={r.rank === 1 ? 'st-gold' : undefined}>
                        {formatMeasure(MEASURES[l.id], r.value)}
                      </b>
                      <FilterLink to={`/pilote/${r.flight.pilotSlug}`}>{r.flight.pilot}</FilterLink>
                      <span className="st-records-sub">
                        <span>{fmtDateNumeric(r.flight.date)}</span>
                        <FilterLink to={`/vol/${r.flight.key}`}>Fiche</FilterLink>
                        <SyrideTraceLink flight={r.flight} />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
