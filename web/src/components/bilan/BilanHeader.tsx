import { Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useBilan } from '@/components/bilan/BilanContext';
import { YearSwatch } from '@/components/bilan/YearSwatch';
import { useSeriesVisuals } from '@/components/compare/visuals';
import { FilterLink } from '@/components/FilterLink';
import { adjacentYears, MAX_COMPARE_YEARS } from '@/lib/bilan';
import { nextEquivalence, paramsForYear, topoPaths } from '@/lib/bilanOverview';
import { fmtDate, fmtHm, fmtInt, NBSP, plural } from '@/lib/format';
import { computeCoverage, computeKpis } from '@/lib/records';
import './bilanA.css';

const searchOf = (p: URLSearchParams): string => {
  const text = p.toString();
  return text === '' ? '' : `?${text}`;
};

/** Flèche du sélecteur d'année : lien, ou pastille inerte en bout de liste. */
function YearArrow({
  target,
  label,
  testId,
  children,
}: {
  target: { pathname: string; search: string } | null;
  label: string;
  testId: string;
  children: ReactNode;
}) {
  if (target === null) {
    return (
      <span className="bl-glass" role="img" aria-label={`${label} (aucune)`} aria-disabled="true" data-testid={testId}>
        {children}
      </span>
    );
  }
  return (
    <Link to={target} className="bl-glass" aria-label={label} data-testid={testId}>
      {children}
    </Link>
  );
}

/**
 * En-tête du bilan (5B.2) : bandeau bleu nuit à courbes de niveau, sélecteur d'année (flèches et liste, filtres et
 * `comparer` conservés si valides), 4 chiffres, portrait, écart avec l'année précédente, équivalence ↻, puis puces
 * des années comparées.
 */
export function BilanHeader() {
  const { pilot, slug, year, flights, story, availableYears, compareYears, setCompareYears, ongoing, cutoff } =
    useBilan();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topo = useMemo(() => topoPaths(), []);
  const kpis = useMemo(() => computeKpis(flights), [flights]);
  const coverage = useMemo(() => computeCoverage(flights), [flights]);
  const { prev, next } = adjacentYears(availableYears, year);
  const [eqIndex, setEqIndex] = useState(0);
  const eqCount = story.equivalences.length;
  const equivalence = story.equivalences[eqIndex % Math.max(eqCount, 1)];

  const toYear = (y: number) => ({
    pathname: `/pilote/${slug}/${y}`,
    search: searchOf(paramsForYear(params, y, availableYears)),
  });

  const previousYears = availableYears.filter((y) => y < year);
  const compareSeries = useMemo(
    () => [year, ...compareYears].map((y) => ({ id: String(y), label: String(y), flights: [], span: null })),
    [year, compareYears],
  );
  const visuals = useSeriesVisuals('annees', compareSeries);
  const visualOf = (y: number) => visuals[compareYears.indexOf(y) + 1];

  const toggle = (y: number) => {
    if (compareYears.includes(y)) setCompareYears(compareYears.filter((c) => c !== y));
    else if (compareYears.length < MAX_COMPARE_YEARS) setCompareYears([...compareYears, y]);
  };

  const km = kpis.distanceTotal;
  const persona = story.persona;
  const gap = story.gap;

  return (
    <>
      <header className="bl-hero" data-testid="bilan-header">
        <svg className="bl-topo" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <path d={topo.lines} />
          <path className="bl-topo-i" d={topo.index} />
        </svg>
        <div className="bl-hero-in">
          <div className="bl-yr">
            <YearArrow target={prev === null ? null : toYear(prev)} label="Année précédente" testId="bilan-prev">
              <IconChevronLeft size={18} aria-hidden="true" />
            </YearArrow>
            <select
              className="bl-year-select"
              aria-label="Année du bilan"
              data-testid="bilan-year-select"
              value={year}
              onChange={(e) => navigate(toYear(Number(e.target.value)))}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <YearArrow target={next === null ? null : toYear(next)} label="Année suivante" testId="bilan-next">
              <IconChevronRight size={18} aria-hidden="true" />
            </YearArrow>
            <span className="bl-eyebrow">Bilan{ongoing ? ' · année en cours' : ''}</span>
          </div>
          <h1 className="bl-title" data-testid="bilan-title">
            Bilan {year} · {pilot}
          </h1>
          <p className="bl-sub">
            {ongoing && <span data-testid="bilan-ongoing">à date du {fmtDate(cutoff, { withYear: true })}</span>}
            <FilterLink to={`/pilote/${slug}`} data-testid="bilan-pilot-link">
              Page de {pilot}
            </FilterLink>
          </p>

          <div className="bl-hkpis" data-testid="bilan-hero-kpis">
            <div className="bl-hk">
              <span className="bl-hv">{fmtInt(kpis.nFlights)}</span>
              <span className="bl-hkl">{kpis.nFlights < 2 ? 'vol' : 'vols'}</span>
            </div>
            <div className="bl-hk">
              <span className="bl-hv">{fmtHm(kpis.minutes)}</span>
              <span className="bl-hkl">de vol</span>
            </div>
            <div className="bl-hk">
              <span className="bl-hv">{fmtInt(kpis.nSites)}</span>
              <span className="bl-hkl">{kpis.nSites < 2 ? 'site' : 'sites'}</span>
            </div>
            <div className="bl-hk">
              <span className="bl-hv">
                {km ? (
                  <>
                    {fmtInt(km)}
                    <small>km</small>
                  </>
                ) : (
                  '–'
                )}
              </span>
              <span className="bl-hkl">{km ? 'parcourus' : 'distance non mesurée'}</span>
              {km !== null && km > 0 && coverage.measured.distance < coverage.n && (
                <span className="bl-hknote" data-testid="bilan-hero-km-note">
                  sur {plural(coverage.measured.distance, 'vol mesuré', 'vols mesurés')}
                </span>
              )}
            </div>
          </div>

          {persona && (
            <div data-testid="bilan-persona">
              <p className="bl-persona">
                Profil <b>{persona.label}</b>.{persona.why ? ` ${persona.why}` : ''}
              </p>
              {persona.secondary.length > 0 && (
                <ul className="bl-persona-more" aria-label="Autres traits">
                  {persona.secondary.map((t) => (
                    <li key={t.key}>
                      <b>{t.label}</b>
                      {t.why ? ` · ${t.why}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {gap && (
            <p className="bl-gap" data-testid="bilan-gap" data-status={gap.status}>
              {gap.text}
              {gap.note && <span className="bl-gap-note">{gap.note}</span>}
            </p>
          )}
          {equivalence && (
            <p className="bl-eq" data-testid="bilan-equivalence">
              <span>{equivalence}</span>
              {eqCount > 1 && (
                <button
                  type="button"
                  className="bl-glass"
                  aria-label="Autre équivalence"
                  title="Autre équivalence"
                  onClick={() => setEqIndex((i) => nextEquivalence(i, eqCount))}
                >
                  <IconRefresh size={16} aria-hidden="true" />
                </button>
              )}
            </p>
          )}
        </div>
      </header>

      <div className="bl-ctl" data-testid="bilan-compare-chips">
        <span className="bl-ctl-label">Comparer avec</span>
        {previousYears.length === 0 ? (
          <Text component="span" className="bl-note">
            Aucune année précédente à comparer.
          </Text>
        ) : (
          previousYears.map((y) => {
            const on = compareYears.includes(y);
            const visual = visualOf(y);
            const full = !on && compareYears.length >= MAX_COMPARE_YEARS;
            return (
              <button
                key={y}
                type="button"
                className="bl-chip"
                aria-pressed={on}
                disabled={full}
                title={full ? 'Deux années au maximum : retire-en une d’abord.' : undefined}
                data-testid="bilan-compare-chip"
                data-year={y}
                onClick={() => toggle(y)}
              >
                {on && visual && <YearSwatch css={visual.css} dash={visual.dash} />}
                {y}
              </button>
            );
          })
        )}
        {ongoing && compareYears.length > 0 && (
          <span className="bl-note">
            Années comparées entières{NBSP}: {year} est arrêtée au {fmtDate(cutoff)}.
          </span>
        )}
      </div>
    </>
  );
}
