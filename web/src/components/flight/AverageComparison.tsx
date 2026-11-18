import { Section } from '@/components/common/Section';
import { DeltaPill } from '@/components/common/DeltaPill';
import '@/components/flight/flight.css';
import { fmtWithUnit, type FlightUnit } from '@/components/flight/measureFormat';
import { barWidth, deltaPercent, type MetricComparison } from '@/lib/flightContext';
import { plural } from '@/lib/format';

interface Props {
  comparisons: readonly MetricComparison[];
  /** Le vol a-t-il un site (sinon, pas de moyenne de site) ? */
  hasSite: boolean;
  siteName: string | null;
}

function Row({
  name,
  value,
  scaleMax,
  kind,
  text,
}: {
  name: string;
  value: number | null;
  scaleMax: number;
  kind: 'self' | 'pilot' | 'site';
  text: string;
}) {
  return (
    <div className="fv-b3">
      <span className="fv-b3-name">{name}</span>
      <span className="fv-bar" aria-hidden="true">
        <i className={`fv-bar-${kind}`} style={{ width: `${barWidth(value, scaleMax)}%` }} />
      </span>
      <b>{text}</b>
    </div>
  );
}

/** Barres « ce vol / moyenne du pilote / moyenne du site ». Les écarts sont neutres (jamais bien ou mal). */
export function AverageComparison({ comparisons, hasSite, siteName }: Props) {
  return (
    <Section
      id="moyennes"
      title="Ce vol face aux moyennes"
      subtitle="Les vols sans mesure (valeur ≤ 0 ou absente) sont ignorés dans les moyennes ; la moyenne inclut ce vol."
    >
      <div className="fv-cmps" data-testid="flight-averages">
        {comparisons.map((c) => {
          const fmt = (v: number | null) => fmtWithUnit(v, c.unit as FlightUnit, c.digits);
          return (
            <div key={c.id} data-metric={c.id}>
              <div className="fv-cmp-title">
                <span>{c.label}</span>
                <DeltaPill value={deltaPercent(c.value, c.pilotMean)} kind="neutre" />
                {c.value !== null && c.pilotMean !== null && (
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--sr-muted)' }}>vs pilote</span>
                )}
              </div>
              <Row name="Ce vol" value={c.value} scaleMax={c.scaleMax} kind="self" text={fmt(c.value)} />
              <Row
                name={`Moy. du pilote (${plural(c.pilotCount, 'vol')})`}
                value={c.pilotMean}
                scaleMax={c.scaleMax}
                kind="pilot"
                text={fmt(c.pilotMean)}
              />
              {hasSite && (
                <Row
                  name={`Moy. site (${plural(c.siteCount, 'vol')})`}
                  value={c.siteMean}
                  scaleMax={c.scaleMax}
                  kind="site"
                  text={fmt(c.siteMean)}
                />
              )}
            </div>
          );
        })}
      </div>
      {!hasSite && <p className="fv-note">Ce vol n’a pas de site connu : pas de moyenne de site.</p>}
      <div className="fv-legend">
        <span>
          <i className="fv-sw" style={{ background: 'var(--sr-p)' }} />
          Ce vol
        </span>
        <span>
          <i className="fv-sw" style={{ background: 'var(--sr-b)', opacity: 0.55 }} />
          Moyenne du pilote
        </span>
        {hasSite && (
          <span>
            <i
              className="fv-sw"
              style={{
                background: 'repeating-linear-gradient(135deg, var(--sr-b) 0 2px, transparent 2px 5px)',
              }}
            />
            Moyenne du site{siteName ? ` (${siteName})` : ''}
          </span>
        )}
      </div>
      <details className="fv-data">
        <summary>Voir les données</summary>
        <div className="fv-scroll">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Ce vol</th>
                <th>Moyenne du pilote</th>
                <th>Moyenne du site</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => {
                const fmt = (v: number | null) => fmtWithUnit(v, c.unit as FlightUnit, c.digits);
                return (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>{fmt(c.value)}</td>
                    <td>{fmt(c.pilotMean)}</td>
                    <td>{hasSite ? fmt(c.siteMean) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}
