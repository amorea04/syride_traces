import { Anchor } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { DeltaPill } from '@/components/common/DeltaPill';
import { Section } from '@/components/common/Section';
import { CoverageNotice } from '@/components/common/CoverageNotice';
import { FilterLink } from '@/components/FilterLink';
import {
  flightOfTheYear,
  isRecordFlight,
  kpiRows,
  OVERVIEW_IDS,
  requestOpenDay,
  type KpiRow,
} from '@/lib/bilanOverview';
import { fmtDate, fmtDuration, fmtInt, plural } from '@/lib/format';
import { computeHighlights } from '@/lib/records';
import { syrideFlightUrl } from '@/lib/syride';
import './bilanA.css';

const SPARK_W = 120;
const SPARK_H = 26;

/** Mini-courbe mensuelle : 12 barres ; en année en cours, les mois écoulés sont estompés (comme `report.js`). */
function Sparkline({ values, liveMonth, label }: { values: readonly number[]; liveMonth: number; label: string }) {
  const max = Math.max(...values);
  return (
    <svg
      className="bl-spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-testid="bilan-spark"
    >
      {values.map((v, m) => {
        const h = v ? Math.max(3, (v / max) * (SPARK_H - 2)) : 1;
        const opacity = !v ? 0.35 : liveMonth < 0 || m === liveMonth ? 1 : 0.55;
        return <rect key={m} x={m * 10 + 1} y={SPARK_H - 1 - h} width={8} height={h} rx={1} fill="currentColor" opacity={opacity} />;
      })}
    </svg>
  );
}

function KpiTile({ row, liveMonth, ongoing }: { row: KpiRow; liveMonth: number; ongoing: boolean }) {
  const { flights } = useBilan();
  return (
    <div className="bl-kpi" data-testid="bilan-kpi" data-kpi={row.id}>
      <span className="bl-kpi-l">{row.label}</span>
      <span className="bl-kpi-v">
        {row.notMeasured ? (
          <span className="bl-kpi-na">non mesuré</span>
        ) : (
          <>
            {row.cardText}
            {row.unit && row.value !== null && <small>{row.unit}</small>}
          </>
        )}
      </span>
      {row.spark && <Sparkline values={row.spark} liveMonth={liveMonth} label={`${row.label} par mois`} />}
      {row.measuredNote && (
        <span className="bl-kpi-note">
          sur {plural(row.measuredNote.ok, 'vol mesuré', 'vols mesurés')}
          {row.measure && (
            <>
              {' '}
              <CoverageNotice flights={flights} measure={row.measure} />
            </>
          )}
        </span>
      )}
      {row.deltas.length > 0 && (
        <span className="bl-deltas">
          {row.deltas.map((d) => (
            <span
              key={d.year}
              className="bl-delta"
              data-testid="bilan-kpi-delta"
              title={`Par rapport à ${d.year}${ongoing ? ' entière' : ''}`}
            >
              <i>{d.year}</i>
              {d.pct === null ? <span aria-label="non calculable">–</span> : <DeltaPill value={d.pct} kind={row.kind} />}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * Aperçu (5B.3) : synthèse, 8 cartes de chiffres (mini-courbe mensuelle, écart avec chaque année comparée),
 * meilleur jour, journée type et vol de l'année. Mêmes définitions que les cartes du rapport.
 */
export function BilanOverview() {
  const { flights, compareYears, compareFlights, story, ongoing, cutoff } = useBilan();
  const rows = useMemo(
    () => kpiRows(flights, compareYears, compareFlights, OVERVIEW_IDS),
    [flights, compareYears, compareFlights],
  );
  const best = useMemo(() => computeHighlights(flights).bestDay, [flights]);
  const ofYear = useMemo(() => flightOfTheYear(flights), [flights]);
  const liveMonth = ongoing ? Number(cutoff.slice(5, 7)) - 1 : -1;
  const { synthese, meilleure_journee: bestText, journee_type: typical } = story.texts;
  const yearFlight = ofYear?.flight ?? null;
  const gold = ofYear ? isRecordFlight(story, ofYear.entry.flightKey, 'duree') : false;

  return (
    <Section
      id="apercu"
      title="L’année en un coup d’œil"
      subtitle="Les pastilles comparent avec les années choisies en haut de page. Vert et rouge pour les volumes, violet et ambre pour le reste : aucune ne juge une vitesse ou un plafond."
    >
      {synthese && (
        <p className="bl-lead" data-testid="bilan-synthese">
          {synthese}
        </p>
      )}
      <div className="bl-kpis" data-testid="bilan-kpis">
        {rows.map((row) => (
          <KpiTile key={row.id} row={row} liveMonth={liveMonth} ongoing={ongoing} />
        ))}
      </div>
      <div className="bl-facts">
        {best && bestText && (
          <div className="bl-fact" data-testid="bilan-best-day">
            <span className="bl-kpi-l">Meilleur jour</span>
            <span className="bl-fact-big">{fmtDate(best.date, { weekday: true })}</span>
            <p className="bl-fact-txt">{bestText}</p>
            <button type="button" className="bl-link" onClick={() => requestOpenDay(best.date)}>
              Ouvrir la fiche du jour
            </button>
          </div>
        )}
        {typical && (
          <div className="bl-fact" data-testid="bilan-typical-day">
            <span className="bl-kpi-l">Journée type</span>
            <p className="bl-fact-big" style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              {typical}
            </p>
          </div>
        )}
        {ofYear && (
          <div className="bl-fact" data-testid="bilan-flight-of-year">
            <span className="bl-kpi-l">Vol de l’année</span>
            <span className={`bl-fact-big${gold ? ' bl-gold' : ''}`}>{fmtDuration(ofYear.entry.value)}</span>
            <p className="bl-fact-txt">
              {[
                fmtDate(ofYear.entry.date, { withYear: true }),
                ofYear.entry.site,
                ofYear.entry.wing,
                yearFlight?.ceilingM ? `plafond ${fmtInt(yearFlight.ceilingM)} m` : null,
                yearFlight?.distKm ? `distance ${fmtInt(yearFlight.distKm)} km` : null,
              ]
                .filter((part): part is string => !!part)
                .join(' · ')}
            </p>
            <span className="bl-links">
              <FilterLink to={`/vol/${ofYear.entry.flightKey}`} className="bl-link" data-testid="bilan-flight-of-year-link">
                Voir la fiche du vol
              </FilterLink>
              <Anchor
                href={syrideFlightUrl(ofYear.entry.pilot, ofYear.entry.syrideNum)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Voir la trace sur Syride"
                title="Voir la trace sur Syride"
                style={{ display: 'inline-flex' }}
              >
                <IconExternalLink size={16} aria-hidden="true" />
              </Anchor>
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}
