import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { whenNearViewport } from '@/lib/nearViewport';

interface Props {
  /** Ancre de la section remplacée : l'`id` reste présent avant le montage (liens, tests e2e). */
  id: string;
  /** Hauteur réservée avant le montage, proche de celle de la section (limite les sauts au défilement). */
  minHeight: number;
  /**
   * `near` (défaut) : monté à l'approche de l'écran, aucun calcul tant que la section n'est pas vue.
   * `background` : monté juste après la première peinture, dans un rendu de fond que React découpe en tranches
   * (pas de tâche longue) ; le contenu est présent sans défilement (sommaire, recherche dans la page).
   */
  when?: 'near' | 'background';
  children: ReactNode;
}

/**
 * Diffère le montage des sections du bas des pages lourdes (6.3) : au chargement, seul le haut de page est
 * calculé et peint. Une fois monté, le contenu le reste. Sans `IntersectionObserver` (jsdom), le contenu est
 * monté tout de suite.
 */
export function Deferred({ id, minHeight, when = 'near', children }: Props) {
  const [near, setNear] = useState(() => when === 'background' || typeof IntersectionObserver === 'undefined');
  // Vaut `false` au premier rendu, puis `true` dans un rendu de fond (transition) déclenché aussitôt.
  const settled = useDeferredValue(true, false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (near || !node) return;
    return whenNearViewport(node, () => setNear(true), '600px');
  }, [near]);
  const mounted = when === 'background' ? settled : near;
  if (mounted) return children;
  return <div ref={ref} id={id} style={{ minHeight }} aria-busy="true" data-deferred="" />;
}
