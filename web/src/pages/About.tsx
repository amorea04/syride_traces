import { Anchor, Stack, Text, Title } from '@mantine/core';
import { DataQuality } from '@/components/about/DataQuality';
import { Glossary } from '@/components/about/Glossary';
import { Section } from '@/components/common/Section';
import { APP_NAME } from '@/components/navigation';
import { useData } from '@/data/DataProvider';
import { fmtDate } from '@/lib/format';

const SYRIDE_URL = 'https://www.syride.com';

/** Date ISO (ou horodatage UTC) → « 28 décembre 2025 ». */
const longDate = (iso: string): string => fmtDate(iso.slice(0, 10), { withYear: true });

/** À propos (ROADMAP §5.5 et §5.8) : source, règle D12, glossaire, qualité des données, crédit. */
export function About() {
  const { meta } = useData();
  return (
    <Stack gap={24}>
      <title>{`À propos · ${APP_NAME}`}</title>
      <Stack gap={4}>
        <Title order={1} size="h2">
          À propos
        </Title>
        <Text size="sm" c="dimmed">
          Source des données, méthode de calcul de chaque statistique et état des données.
        </Text>
      </Stack>

      <Section id="source" title="Source des données">
        <Text size="sm" data-testid="about-source">
          Les vols viennent de{' '}
          <Anchor href={SYRIDE_URL} target="_blank" rel="noopener noreferrer">
            syride.com
          </Anchor>
          . Outil personnel, non affilié à Syride.
        </Text>
        <Text size="sm" mt="xs" data-testid="about-dates">
          Données mises à jour le <b>{longDate(meta.data_refreshed_at)}</b> ; exportées le{' '}
          <b>{longDate(meta.generated_at)}</b>. Dernier vol le <b>{longDate(meta.data_updated_at)}</b>.
        </Text>
        <Text size="sm" mt="xs" data-testid="about-d12">
          Aucune trace de vol n’est publiée ici&nbsp;: seule la position des sites apparaît sur les cartes. Pour
          voir une trace, chaque vol renvoie vers sa page sur Syride.
        </Text>
      </Section>

      <Glossary />
      <DataQuality />

      <Section id="credit" title="Crédit">
        <Text size="sm" data-testid="about-credit">
          Créée par&nbsp;: Adrien Moreau
        </Text>
      </Section>
    </Stack>
  );
}
