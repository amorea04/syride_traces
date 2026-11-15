import { Anchor, Stack } from '@mantine/core';
import { Link } from 'react-router';
import { PageStub } from '@/components/PageStub';

export function NotFound() {
  return (
    <PageStub title="Page introuvable" description="Cette adresse ne correspond à aucune page.">
      <Stack gap={4} align="flex-start">
        <Anchor component={Link} to="/">
          Retour au tableau de bord
        </Anchor>
      </Stack>
    </PageStub>
  );
}
