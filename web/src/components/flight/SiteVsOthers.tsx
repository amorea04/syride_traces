import { SegmentedControl } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import { SiteStrip, StripLegend } from '@/components/flight/SiteStrip';
import type { Flight } from '@/data/flight';
import { fmtInt, fmtPercent, fmtWithShare } from '@/components/flight/shareFormat';
import {
  MIN_SITE_FLIGHTS,
  MIN_SITE_FLIGHTS_PILOT,
  parapenteShare,
  positionAmongSites,
  siteAggregates,
  SITE_INDICATORS,
  type DisciplineShare,
  type SitePosition,
} from '@/lib/siteAggregates';
import { fmtWithUnit } from '@/components/flight/measureFormat';
import { fmtOrdinal } from '@/lib/flightContext';
import { plural } from '@/lib/format';

type View = 'all' | 'pilot';

interface Props {
  /** Vol de la fiche : donne le site et le pilote. Absent sur la page du site (voir `site`). */
  flight?: Flight;
  /** Site comparé quand il n'y a pas de vol (page du site). */
  site?: { id: number; name: string };
  /**
   * Population de référence des sites comparés : tous les vols sur la fiche vol (indépendante des filtres),
   * la sélection filtrée (tous filtres sauf les sites) sur la page du site.
   */
  referenceFlights: readonly Flight[];
  /** Vols du pilote (vide si la vue « Ce pilote » est masquée). */
  pilotFlights?: readonly Flight[];
  /** Propose la bascule « Tous les pilotes / Ce pilote » (défaut : oui, si `flight` est fourni). */
  showPilotView?: boolean;
  /** Affiche le lien « Voir la page du site » (défaut : oui). */
  showSiteLink?: boolean;
}

const NO_FLIGHTS: readonly Flight[] = [];

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

function Strips({
  pos,
  othersLabel,
  siteName,
  pilotLabel,
}: {
  pos: SitePosition;
  othersLabel: string;
  siteName: string;
  pilotLabel: string | null;
}) {
  const pct = (s: DisciplineShare) => fmtPercent(parapenteShare(s));
  // Vue « Ce pilote » : le nombre de pilotes vaut toujours 1, l'indicateur n'apporte rien.
  const indicators = pilotLabel ? pos.indicators.filter((ind) => ind.id !== 'pilots') : pos.indicators;
  return (
    <>
      <div className="fv-strips" data-testid="site-strips">
        {indicators.map((ind) => (
          <SiteStrip key={ind.id} ind={ind} othersLabel={othersLabel} siteName={siteName} />
        ))}
      </div>
      <div style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 650, marginBottom: 6 }}>Part parapente et paramoteur</div>
        <ShareBar name="Ce site" share={pos.site} />
        <ShareBar
          name={pilotLabel ? 'Autres sites du pilote' : 'Autres sites (tous vols)'}
          share={pos.others}
        />
      </div>
      <StripLegend siteName={siteName} othersLabel={othersLabel} />
      <div className="fv-legend" style={{ marginTop: 6 }}>
        <span>
          <i className="fv-sw" style={{ background: 'var(--sr-p)' }} />
          Parapente
        </span>
        <span>
          <i className="fv-sw" style={{ background: 'var(--sr-m)' }} />
          Paramoteur
        </span>
      </div>
      <details className="fv-data">
        <summary>Voir les données</summary>
        <div className="fv-scroll">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Ce site</th>
                <th>Moyenne des autres</th>
                <th>Médiane des autres</th>
                <th>Rang</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind) => {
                const def = SITE_INDICATORS.find((d) => d.id === ind.id)!;
                const fmt = (v: number | null) => fmtWithUnit(v, def.unit, def.digits);
                return (
                  <tr key={ind.id}>
                    <td>{def.label}</td>
                    <td>{fmt(ind.value)}</td>
                    <td>{fmt(ind.othersMean)}</td>
                    <td>{fmt(ind.othersMedian)}</td>
                    <td>{ind.rank === null ? '–' : `${fmtOrdinal(ind.rank)} sur ${fmtInt(ind.total)}`}</td>
                  </tr>
                );
              })}
              <tr>
                <td>Part parapente</td>
                <td>{pct(pos.site)}</td>
                <td>{pct(pos.others)}</td>
                <td>–</td>
                <td>–</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p className="fv-note">
        Seuls les sites comptant au moins {fmtInt(pos.minFlights)} vols{pilotLabel ? ` de ${pilotLabel}` : ''}{' '}
        sont comparés ({plural(pos.comparedSites, 'site')} sur {fmtInt(pos.totalSites)},{' '}
        {plural(pos.comparedFlights, 'vol')} sur {fmtInt(pos.totalFlights)}). Chaque site compte pour une voix
        : la moyenne des autres est la moyenne de leurs moyennes, sans pondération par le nombre de vols. Le
        rang 1ᵉʳ désigne la valeur la plus haute.
      </p>
    </>
  );
}

/**
 * D15 / D17 : le site du vol positionné parmi les autres sites (tous pilotes), ou parmi les sites du
 * pilote. Même langage visuel que « Ce vol face aux moyennes ». Calculs mémoïsés (un passage sur les vols).
 */
export function SiteVsOthers({
  flight,
  site,
  referenceFlights,
  pilotFlights = NO_FLIGHTS,
  showPilotView = true,
  showSiteLink = true,
}: Props) {
  const [view, setView] = useState<View>('all');
  const siteId = site?.id ?? flight?.siteId ?? null;
  const siteName = site?.name ?? flight?.site ?? '';
  const pilotName = flight?.pilot ?? '';
  const pilotViewEnabled = showPilotView && flight !== undefined;

  // Les agrégats ne dépendent que des vols (un passage) ; seul le positionnement dépend du site.
  const allAggregates = useMemo(() => siteAggregates(referenceFlights), [referenceFlights]);
  const pilotAggregates = useMemo(() => siteAggregates(pilotFlights), [pilotFlights]);
  const all = useMemo(
    () => (siteId === null ? null : positionAmongSites(allAggregates, siteId, MIN_SITE_FLIGHTS)),
    [allAggregates, siteId],
  );
  const mine = useMemo(
    () => (siteId === null ? null : positionAmongSites(pilotAggregates, siteId, MIN_SITE_FLIGHTS_PILOT)),
    [pilotAggregates, siteId],
  );
  const siteFlightsCount = siteId === null ? 0 : (allAggregates.get(siteId)?.flights ?? 0);

  if (siteId === null) return null;
  const link = showSiteLink ? (
    <FilterLink to={`/site/${siteId}`} data-testid="site-page-link" fz={13}>
      Voir la page du site
    </FilterLink>
  ) : null;

  if (!all) {
    return (
      <Section id="site-face" title="Ce site face aux autres" actions={link}>
        <p style={{ margin: '0 0 8px' }} data-testid="site-few">
          <b>{siteName}</b> compte <b>{plural(siteFlightsCount, 'vol')}</b> dans les données : sous le minimum
          de {MIN_SITE_FLIGHTS} vols, la comparaison avec les autres sites ne serait pas fiable.
        </p>
        {showSiteLink && (
          <p className="fv-note" style={{ margin: 0 }}>
            La page du site donne ses chiffres bruts.
          </p>
        )}
      </Section>
    );
  }

  const pilotAvailable = pilotViewEnabled && mine !== null && mine.comparedSites >= 2;
  const showPilot = view === 'pilot' && pilotAvailable;
  const pos = showPilot ? mine : all;
  const alone = pos.comparedSites < 2;

  const toggle = pilotAvailable ? (
    <SegmentedControl
      size="xs"
      value={view}
      onChange={(v) => setView(v as View)}
      aria-label="Population comparée"
      data={[
        { value: 'all', label: 'Tous les pilotes' },
        { value: 'pilot', label: 'Ce pilote' },
      ]}
    />
  ) : null;

  const subtitle = showPilot ? (
    <>
      Les {plural(pos.indicators[0]?.value ?? 0, 'vol')} de <b>{pilotName}</b> à <b>{siteName}</b>, comparés à
      ses {pos.comparedSites - 1} autres sites ayant au moins {MIN_SITE_FLIGHTS_PILOT} vols. Les vols sans
      mesure (valeur ≤ 0) sont ignorés dans les moyennes.
    </>
  ) : (
    <>
      Les {plural(pos.indicators[0]?.value ?? 0, 'vol')} de tous les pilotes à <b>{siteName}</b>, comparés aux{' '}
      {pos.comparedSites - 1} autres sites ayant au moins {MIN_SITE_FLIGHTS} vols. Les vols sans mesure
      (valeur ≤ 0) sont ignorés dans les moyennes.
    </>
  );

  return (
    <Section
      id="site-face"
      title="Ce site face aux autres"
      subtitle={alone ? undefined : subtitle}
      actions={
        <>
          {toggle}
          {link}
        </>
      }
    >
      {pilotViewEnabled && !pilotAvailable && (
        <p className="fv-note" style={{ margin: '0 0 12px' }} data-testid="pilot-view-unavailable">
          Vue « Ce pilote » indisponible : {pilotName} n’a pas au moins deux sites de {MIN_SITE_FLIGHTS_PILOT}{' '}
          vols ou plus, dont celui-ci.
        </p>
      )}
      {alone ? (
        <p style={{ margin: 0 }} role="status">
          Aucun autre site de {pos.minFlights} vols ou plus à comparer.
        </p>
      ) : (
        <Strips
          pos={pos}
          othersLabel={showPilot ? 'autres sites du pilote' : 'autres sites'}
          siteName={siteName}
          pilotLabel={showPilot ? pilotName : null}
        />
      )}
    </Section>
  );
}
