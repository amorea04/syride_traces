export const APP_NAME = 'Analyse traces de vol';

export interface NavItem {
  label: string;
  to: string;
  /** Préfixes de chemin pour lesquels l'entrée est « page courante ». */
  prefixes: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tableau de bord', to: '/', prefixes: [] },
  { label: 'Vols', to: '/vols', prefixes: ['/vols', '/vol/'] },
  { label: 'Pilotes', to: '/pilotes', prefixes: ['/pilotes', '/pilote/'] },
  { label: 'Sites', to: '/sites', prefixes: ['/sites', '/site/'] },
  { label: 'Comparer', to: '/comparer', prefixes: ['/comparer'] },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.prefixes.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));
}

export const UPDATE_NOTICE = 'Données issues de syride.com. Outil personnel, non affilié à Syride.';
