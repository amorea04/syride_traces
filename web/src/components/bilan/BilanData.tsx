import { Anchor, Table, Text } from '@mantine/core';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { useFilterSearch } from '@/components/FilterLink';
import { useData } from '@/data/DataProvider';
import { fmtDate, fmtInt, fmtPercent } from '@/lib/format';
import { computeCoverage, MEASURE_KEYS, type Coverage, type CoverageKey } from '@/lib/records';
import { COVERAGE_NOTICE_THRESHOLD, MEASURE_LABELS } from '@/lib/rhythmBlocks';
import './bilanB.css';

/** Notions du Bilan, en une phrase chacune (le détail est dans « À propos »). */
const GLOSSARY: readonly { term: string; definition: string }[] = [
  {
    term: 'Persona',
    definition:
      'Le portrait de ton année : une étiquette tirée de règles sur tes vols (régularité, sites, durées, horaires…), avec sa justification. D’autres traits peuvent s’y ajouter.',
  },
  {
    term: 'Jalon',
    definition:
      'Un moment marquant de l’année (premier vol, n-ième vol ou heure, record, meilleure journée, nouveau site, nouvelle voile, retour). Or pour les records et les nouveautés.',
  },
  {
    term: 'Écart à date',
    definition:
      'Quand l’année est en cours, elle est comparée à l’année précédente entière : on dit seulement si tu as déjà dépassé son total ou combien il reste.',
  },
  {
    term: 'Équivalence',
    definition: 'Une comparaison imagée d’un de tes chiffres (plafond, distance, fréquence). Le bouton ↻ en change.',
  },
  {
    term: 'Régularité',
    definition: 'Part des semaines (du lundi au dimanche) comptant au moins un vol, parmi les semaines écoulées de l’année.',
  },
  { term: 'Série', definition: 'Jours de vol consécutifs ; une série compte au moins deux jours.' },
  {
    term: 'Portée',
    definition: 'Distance à vol d’oiseau entre ton site principal et le site le plus éloigné où tu as volé cette année.',
  },
  {
    term: 'Zone',
    definition: 'Groupe de sites proches les uns des autres ; les boutons au-dessus de la carte la cadrent sur une zone.',
  },
];

type Row = { label: string; count: number | null; measure?: CoverageKey };

function Cell({ cov, row }: { cov: Coverage | null; row: Row }) {
  if (!cov || row.count === null || cov.n === 0) return <>–</>;
  if (row.measure && row.count === 0) return <span style={{ color: 'var(--sr-muted)' }}>non mesuré</span>;
  const partial = row.measure !== undefined && (cov.n - row.count) / cov.n > COVERAGE_NOTICE_THRESHOLD;
  return (
    <>
      <span>
        {fmtInt(row.count)} sur {fmtInt(cov.n)}
        {partial && row.measure && (
          <span
            className="bb-partial"
            title={`${MEASURE_LABELS[row.measure]} : connu pour ${fmtInt(row.count)} vols sur ${fmtInt(cov.n)}`}
          >
            Données partielles
          </span>
        )}
      </span>
      <span className="bb-cov-bar" aria-hidden="true">
        <i style={{ width: `${(100 * row.count) / cov.n}%` }} />
      </span>
    </>
  );
}

/** Lignes d'un tableau de couverture : origine des statistiques puis mesures (`_coverage_table` du rapport). */
function rowsOf(cov: Coverage | null, kind: 'origine' | 'mesures'): Row[] {
  if (kind === 'mesures') {
    return MEASURE_KEYS.map((k) => ({
      label: MEASURE_LABELS[k].charAt(0).toUpperCase() + MEASURE_LABELS[k].slice(1),
      count: cov ? cov.measured[k] : null,
      measure: k,
    }));
  }
  return [
    { label: 'Avec trace GPX', count: cov ? cov.sources.gpx : null },
    { label: 'Fiche Syride seule', count: cov ? cov.sources.fiche : null },
    { label: 'Sans statistiques', count: cov ? cov.sources.aucune : null },
    { label: 'Placés sur la carte', count: cov && cov.noPosition !== null ? cov.n - cov.noPosition : null },
  ];
}

function CoverageTable({ title, kind, year, all, label, testId }: { title: string; kind: 'origine' | 'mesures'; year: Coverage; all: Coverage; label: string; testId: string }) {
  const a = rowsOf(year, kind);
  const b = rowsOf(all, kind);
  return (
    <div className="bb-block" style={{ marginTop: 12 }}>
      <p className="bb-sub">{title}</p>
      <Table.ScrollContainer minWidth={420}>
        <Table fz="sm" className="sr-tabular" data-testid={testId}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>{label}</Table.Th>
              <Table.Th>Toutes années</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {a.map((row, i) => (
              <Table.Tr key={row.label}>
                <Table.Td>{row.label}</Table.Td>
                <Table.Td>
                  <Cell cov={year} row={row} />
                </Table.Td>
                <Table.Td>
                  <Cell cov={all} row={b[i] as Row} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </div>
  );
}

/**
 * Données : couverture de l'année et de toutes les années du pilote (comme « Données et limites » du rapport), mention
 * « Données partielles », date de coupure, glossaire court des notions du bilan.
 */
export function BilanData() {
  const { flights, history, year, ongoing, cutoff } = useBilan();
  const { siteById, meta } = useData();
  const search = useFilterSearch();
  const hasCoords = useMemo(
    () => (id: number) => {
      const s = siteById.get(id);
      return s !== undefined && s.lat !== null && s.lon !== null;
    },
    [siteById],
  );
  const cov = useMemo(() => computeCoverage(flights, hasCoords), [flights, hasCoords]);
  const covAll = useMemo(() => computeCoverage(history, hasCoords), [history, hasCoords]);
  const anyPartial = MEASURE_KEYS.some((k) => cov.measured[k] > 0 && (cov.n - cov.measured[k]) / cov.n > COVERAGE_NOTICE_THRESHOLD);

  return (
    <Section id="donnees" title="Comprendre les chiffres">
      <Text size="sm" mb="xs" data-testid="bilan-cutoff">
        {ongoing
          ? `Année ${year} en cours : chiffres arrêtés au ${fmtDate(cutoff, { withYear: true })}, comparés aux années précédentes entières. `
          : `Année ${year} entière. `}
        Données mises à jour le {fmtDate(meta.data_refreshed_at, { withYear: true })}.
      </Text>
      <Text size="sm" c="dimmed">
        Ce que Syride a pu mesurer sur tes vols.
        {anyPartial
          ? ` Quand une mesure manque à plus de ${fmtPercent(COVERAGE_NOTICE_THRESHOLD * 100)} des vols, la mention « Données partielles » le signale.`
          : ''}
      </Text>
      <div data-testid="bilan-coverage">
        <CoverageTable title="Origine des statistiques" kind="origine" year={cov} all={covAll} label={`En ${year}`} testId="bilan-coverage-origin" />
        <CoverageTable title="Mesures disponibles" kind="mesures" year={cov} all={covAll} label={`En ${year}`} testId="bilan-coverage-measures" />
      </div>

      <div className="bb-block">
        <p className="bb-sub">Glossaire</p>
        <dl className="bb-glossary" data-testid="bilan-glossary">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.definition}</dd>
            </div>
          ))}
        </dl>
        <Text size="sm" mt="xs">
          Les règles complètes sont dans{' '}
          <Anchor component={Link} to={{ pathname: '/a-propos', search }} data-testid="bilan-about-link">
            À propos
          </Anchor>
          .
        </Text>
      </div>
    </Section>
  );
}
