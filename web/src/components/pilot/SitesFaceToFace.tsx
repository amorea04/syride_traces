import { Select, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import { fmtWithUnit } from '@/components/flight/measureFormat';
import { SiteStrip, StripLegend } from '@/components/flight/SiteStrip';
import { fmtWithShare } from '@/components/flight/shareFormat';
import '@/components/pilot/pilot.css';
import { useData } from '@/data/DataProvider';
import type { Flight } from '@/data/flight';
import { fmtInt, fmtPercent, plural } from '@/lib/format';
import {
  FEW_SITE_FLIGHTS,
  hasFewFlights,
  MIN_SITE_FLIGHTS_FACE_TO_FACE,
  parapenteShare,
  positionAmongSites,
  siteAggregates,
  SITE_INDICATORS,
  type DisciplineShare,
} from '@/lib/siteAggregates';

interface Props {
  pilot: string;
  /** Vols du pilote avec les filtres de la page. */
  flights: readonly Flight[];
}

function ShareBar({ name, share }: { name: string; share: DisciplineShare }) {
  const total = share.parapente + share.paramoteur;
  const p = parapenteShare(share);
  return (
    <div className="fv-b3">
      <span className="fv-b3-name">{name}</span>
      <span className="fv-bar" aria-hidden="true">
        {total > 0 && (
          <>
            <i className="fv-bar-sp" style={{ width: `${p}%` }} />
            <i className="fv-bar-sm" style={{ width: `${100 - p}%` }} />
          </>
        )}
      </span>
      <b>{fmtWithShare(share)}</b>
    </div>
  );
}

/**
 * D20 : tous ses sites (dès 1 vol), positionnés les uns par rapport aux autres sur ses propres vols. Même
 * langage visuel que « Ce site face aux autres » de la fiche vol.
 */
export function SitesFaceToFace({ pilot, flights }: Props) {
  const { siteById } = useData();
  const aggregates = useMemo(() => siteAggregates(flights), [flights]);
  const eligible = useMemo(
    () =>
      [...aggregates.values()]
        .filter((a) => a.flights >= MIN_SITE_FLIGHTS_FACE_TO_FACE)
        .sort((a, b) => b.flights - a.flights || a.siteId - b.siteId),
    [aggregates],
  );
  const nameOf = (id: number): string => siteById.get(id)?.name ?? `Site ${id}`;
  const [chosen, setChosen] = useState<number | null>(null);
  const siteId =
    chosen !== null && eligible.some((a) => a.siteId === chosen) ? chosen : (eligible[0]?.siteId ?? null);
  const position = useMemo(
    () => (siteId === null ? null : positionAmongSites(aggregates, siteId, MIN_SITE_FLIGHTS_FACE_TO_FACE)),
    [aggregates, siteId],
  );
  const selectedFlights = siteId === null ? 0 : (aggregates.get(siteId)?.flights ?? 0);
  const indicators = SITE_INDICATORS.filter((i) => i.id !== 'pilots');

  return (
    <Section
      id="sites-face"
      title="Ses sites face à face"
      subtitle={`Tous ses sites, comparés les uns aux autres sur ses propres vols ; le nombre de vols est indiqué à côté de chaque nom. Les vols sans mesure (valeur ≤ 0) sont ignorés dans les moyennes.`}
    >
      {eligible.length < 2 || position === null || siteId === null ? (
        <p style={{ margin: 0 }} role="status" data-testid="sites-face-empty">
          Moins de deux sites pour {pilot} : la comparaison entre ses sites n’est pas possible.
        </p>
      ) : (
        <>
          <Select
            label="Site à situer"
            data={eligible.map((a) => ({
              value: String(a.siteId),
              label: `${nameOf(a.siteId)} (${plural(a.flights, 'vol')})`,
            }))}
            value={String(siteId)}
            allowDeselect={false}
            searchable
            renderOption={({ option }) => {
              const few = hasFewFlights(aggregates.get(Number(option.value))?.flights ?? 0);
              return (
                <span>
                  {option.label}
                  {few && <span className="fv-few"> · peu de vols</span>}
                </span>
              );
            }}
            onChange={(v) => v !== null && setChosen(Number(v))}
            maw={420}
            mb="md"
            data-testid="face-select"
          />
          {hasFewFlights(selectedFlights) && (
            <Text size="sm" c="dimmed" mb="sm" data-testid="few-flights-note">
              Peu de vols ({plural(selectedFlights, 'vol')}) : sa moyenne est fragile.
            </Text>
          )}
          <div className="fv-strips" data-testid="pilot-site-strips">
            {position.indicators
              .filter((i) => i.id !== 'pilots')
              .map((ind) => (
                <SiteStrip
                  key={ind.id}
                  ind={ind}
                  othersLabel="autres sites du pilote"
                  siteName={nameOf(siteId)}
                />
              ))}
          </div>
          <StripLegend siteName={nameOf(siteId)} othersLabel="autres sites du pilote" />
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>Part parapente et paramoteur</div>
            <ShareBar name="Ce site" share={position.site} />
            <ShareBar name="Autres sites du pilote" share={position.others} />
          </div>
          <details className="fv-data">
            <summary>Voir les données</summary>
            <div className="fv-scroll">
              <table className="fv-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Vols</th>
                    {indicators
                      .filter((i) => i.id !== 'flights')
                      .map((i) => (
                        <th key={i.id}>{i.label}</th>
                      ))}
                    <th>Part parapente</th>
                  </tr>
                </thead>
                <tbody>
                  {eligible.map((a) => (
                    <tr key={a.siteId}>
                      <td>
                        <FilterLink to={`/site/${a.siteId}`}>{nameOf(a.siteId)}</FilterLink>
                        {hasFewFlights(a.flights) && <span className="fv-few"> · peu de vols</span>}
                      </td>
                      <td>{fmtInt(a.flights)}</td>
                      {indicators
                        .filter((i) => i.id !== 'flights')
                        .map((i) => (
                          <td key={i.id}>{fmtWithUnit(i.of(a), i.unit, i.digits)}</td>
                        ))}
                      <td>{fmtPercent(parapenteShare(a))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="fv-note">
            {plural(eligible.length, 'site')}, quel que soit leur nombre de vols ; ceux de moins de{' '}
            {FEW_SITE_FLIGHTS} vols sont signalés « peu de vols », car leur moyenne est fragile. Chaque site
            compte pour une voix : la moyenne des autres est la moyenne de leurs moyennes, sans pondération
            par le nombre de vols. Le rang 1ᵉʳ désigne la valeur la plus haute.
          </p>
        </>
      )}
    </Section>
  );
}
