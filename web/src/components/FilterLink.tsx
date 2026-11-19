import { Anchor, type AnchorProps } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { writeFilters } from '@/lib/filters';
import { useFiltersStore } from '@/store/filters';

/** Query string des filtres courants (« » si tout est par défaut) : à ajouter aux liens internes. */
export function useFilterSearch(): string {
  const filters = useFiltersStore((s) => s.filters);
  return writeFilters('', filters);
}

interface Props extends AnchorProps {
  to: string;
  children: ReactNode;
}

/** Lien interne qui conserve les filtres dans l'URL. */
export function FilterLink({ to, children, ...rest }: Props) {
  const search = useFilterSearch();
  const target = { pathname: to, search };
  return (
    <Anchor component={Link} to={target} {...rest}>
      {children}
    </Anchor>
  );
}
