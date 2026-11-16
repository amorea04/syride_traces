import { Box, Group, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  /** Ancre de la section (`id` HTML), utile aux liens et aux tests e2e. */
  id: string;
  title: string;
  /** Une phrase sous le titre (contexte, unité, règle de calcul). */
  subtitle?: ReactNode;
  /** Contrôles à droite du titre (sélecteurs, bascules). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Carte de section du tableau de bord, style « Encre » de la maquette : filet de 2 px en haut,
 * pas de fond ni d'ombre, titre de 17 px, sous-titre atténué. Toutes les sections l'utilisent.
 */
export function Section({ id, title, subtitle, actions, children }: Props) {
  const headingId = `${id}-titre`;
  return (
    <Box component="section" id={id} aria-labelledby={headingId} className="sr-section">
      <Group justify="space-between" align="baseline" gap="xs" wrap="wrap" mb="sm">
        <Title order={2} id={headingId} fz={17} fw={700}>
          {title}
        </Title>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
        {subtitle && (
          <Text size="sm" c="dimmed" w="100%">
            {subtitle}
          </Text>
        )}
      </Group>
      {children}
    </Box>
  );
}
