import { Table, Text } from '@mantine/core';
import { Section } from '@/components/common/Section';
import { METRICS } from '@/lib/metrics';
import { AGGREGATION_LABELS, metricRule } from '@/lib/quality';
import { COVERAGE_NOTICE_THRESHOLD } from '@/lib/rhythmBlocks';
import { RHYTHM_MIN_STREAK } from '@/lib/rhythm';
import { fmtPercent } from '@/lib/format';

interface Notion {
  term: string;
  definition: string;
}

const NOTIONS: readonly Notion[] = [
  {
    term: 'Source des statistiques',
    definition:
      'Chaque vol porte l’origine de ses mesures\u00a0: «\u00a0GPX\u00a0» (calculées sur la trace), «\u00a0fiche\u00a0» (lues sur la fiche Syride, sans fichier GPX, donc pouvant différer) ou «\u00a0aucune\u00a0» (pas de statistiques).',
  },
  {
    term: 'Vol incomplet',
    definition:
      'Vol dont la trace ou la fiche est tronquée. Il compte dans les vols et les heures, mais ses mesures de fiche (vitesses, vario, g, plafond, distance cumulée) sont ignorées dans les moyennes et maxima.',
  },
  {
    term: 'Discipline',
    definition:
      'Parapente ou paramoteur, d’après le type d’activité du vol. Couleurs\u00a0: vermillon pour le parapente, azur pour le paramoteur, gris pour les deux.',
  },
  {
    term: 'Distance et distance cumulée',
    definition:
      'La distance est celle affichée par Syride (en ligne droite). La distance cumulée est la distance réellement parcourue, quand elle est connue.',
  },
  {
    term: 'Régularité',
    definition:
      'Part des semaines (du lundi au dimanche) comptant au moins un vol, parmi les semaines écoulées de l’année\u00a0; la semaine du 1er janvier compte.',
  },
  {
    term: 'Série',
    definition: `Jours de vol consécutifs\u00a0; une série compte au moins ${RHYTHM_MIN_STREAK} jours.`,
  },
  {
    term: 'Pause',
    definition:
      'Plus longue période sans vol entre deux jours de vol. Aucune pause n’est comptée après le dernier vol.',
  },
  {
    term: 'Données partielles',
    definition: `Mention affichée quand plus de ${fmtPercent(COVERAGE_NOTICE_THRESHOLD * 100)} des vols de la sélection n’ont pas la mesure\u00a0: la valeur affichée ne repose alors que sur une partie des vols.`,
  },
  {
    term: 'Mesure absente',
    definition: 'Une mesure inconnue ou nulle s’affiche «\u00a0–\u00a0»\u00a0: elle n’est jamais comptée comme zéro.',
  },
];

/** Glossaire : les 19 métriques (libellé, unité, agrégation, règle) puis les notions de l'application. */
export function Glossary() {
  return (
    <Section
      id="glossaire"
      title="Glossaire"
      subtitle="Chaque statistique est définie une seule fois dans l’application&nbsp;; les mêmes règles s’appliquent partout."
    >
      <Text fw={650} size="sm" mb={4}>
        Statistiques
      </Text>
      <Table.ScrollContainer minWidth={640}>
        <Table fz="sm" highlightOnHover data-testid="glossary-metrics">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Statistique</Table.Th>
              <Table.Th>Unité</Table.Th>
              <Table.Th>Agrégation</Table.Th>
              <Table.Th>Règle</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {METRICS.map((m) => (
              <Table.Tr key={m.id} data-testid="glossary-metric">
                <Table.Td>{m.label}</Table.Td>
                <Table.Td>{m.unit}</Table.Td>
                <Table.Td>{AGGREGATION_LABELS[m.aggregation]}</Table.Td>
                <Table.Td>{metricRule(m)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text fw={650} size="sm" mt="lg" mb={4}>
        Notions
      </Text>
      <dl style={{ margin: 0 }} data-testid="glossary-notions">
        {NOTIONS.map((n) => (
          <div key={n.term} style={{ padding: '6px 0', borderTop: '1px solid var(--sr-line)' }}>
            <dt style={{ fontWeight: 650, fontSize: 14 }}>{n.term}</dt>
            <dd style={{ margin: 0, fontSize: 14, color: 'var(--sr-muted)' }}>{n.definition}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
