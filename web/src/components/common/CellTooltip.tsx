import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { nearestInDirection, tipPlacement, type Direction, type TipContent } from '@/lib/cellTips';
import './cellTooltip.css';

/** Attribut des éléments qui portent une infobulle ; sa valeur identifie la case pour `resolve`. */
export const TIP_ATTR = 'data-tip';
const SELECTOR = `[${TIP_ATTR}]`;
const ACTIVE_ATTR = 'data-tip-on';
const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

interface Props {
  /** Contenu de la bulle d'un élément `[data-tip]` ; `null` : pas de bulle. */
  resolve: (element: HTMLElement) => TipContent | null;
  /**
   * Une seule bulle pour toute la grille (délégation d'événements) : survol, focus clavier, toucher.
   * `roving` : un seul arrêt de tabulation sur la grille, flèches pour passer d'une case à l'autre.
   */
  roving?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  /** Rôle et nom accessibles de la grille, si elle en porte un (une bande est une image). */
  role?: string;
  ariaLabel?: string;
}

interface Active {
  element: HTMLElement;
  tip: TipContent;
  /** `resolve` qui a produit `tip` : une bulle ne survit pas à un changement de données. */
  source: Props['resolve'];
}

function tipTarget(event: { target: EventTarget | null }, root: HTMLElement | null): HTMLElement | null {
  const el = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(SELECTOR) ?? null;
  return el && root?.contains(el) ? el : null;
}

/**
 * Enveloppe d'une grille de cases (calendrier, matrice, ruban, frise, haltères) : une seule infobulle par grille,
 * posée dans `document.body` (jamais rognée par un défilement). La case désignée reçoit un contour (`data-tip-on`).
 */
export function CellTooltip({
  resolve,
  roving = false,
  children,
  className,
  style,
  testId,
  role,
  ariaLabel,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);
  const [opened, setActive] = useState<Active | null>(null);
  const active = opened?.source === resolve ? opened : null;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(
    (element: HTMLElement | null) => {
      setActive((prev) => {
        if (prev?.element === element) return prev;
        if (!element) return null;
        const tip = resolve(element);
        return tip ? { element, tip, source: resolve } : null;
      });
    },
    [resolve],
  );

  // Contour de la case désignée ; retiré dès que la bulle se ferme ou change de case.
  useEffect(() => {
    const element = active?.element;
    if (!element) return undefined;
    element.setAttribute(ACTIVE_ATTR, 'true');
    return () => element.removeAttribute(ACTIVE_ATTR);
  }, [active?.element]);

  // La case désignée a quitté le document (grille redessinée) : on ferme.
  useEffect(() => {
    const element = active?.element;
    if (!element || !root.current) return undefined;
    const observer = new MutationObserver(() => {
      if (!element.isConnected) setActive(null);
    });
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active?.element]);

  // Placement : mesure de la bulle une fois rendue, hors écran tant qu'elle n'est pas placée.
  useLayoutEffect(() => {
    if (!active || !bubble.current) {
      setPos(null);
      return;
    }
    const a = active.element.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    setPos(
      tipPlacement(
        { x: a.left, y: a.top, width: a.width, height: a.height },
        { width: b.width, height: b.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [active]);

  // Ferme au défilement, au redimensionnement et au toucher ailleurs.
  useEffect(() => {
    if (!active) return undefined;
    const hide = () => setActive(null);
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) hide();
    };
    // Échap ferme la bulle, que le focus soit dans la grille ou non (survol à la souris).
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);

  // Mode « roving » : une seule case dans l'ordre de tabulation (la dernière focalisée, sinon la première).
  // Réappliqué à l'arrivée ou au départ de cases (observateur du DOM) et au focus, pas à chaque rendu.
  const syncTabStops = useCallback(() => {
    if (!root.current) return;
    const cells = [...root.current.querySelectorAll<HTMLElement>(SELECTOR)];
    const keep = current.current && cells.includes(current.current) ? current.current : (cells[0] ?? null);
    for (const el of cells) {
      const wanted = el === keep ? 0 : -1;
      if (el.tabIndex !== wanted) el.tabIndex = wanted;
    }
  }, []);
  useEffect(() => {
    if (!roving || !root.current) return undefined;
    syncTabStops();
    const observer = new MutationObserver(syncTabStops);
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [roving, syncTabStops]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = ARROWS[event.key];
    if (!roving || !direction || !root.current) return;
    const from = tipTarget(event, root.current);
    if (!from) return;
    const cells = [...root.current.querySelectorAll<HTMLElement>(SELECTOR)];
    const boxes = cells.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const next = nearestInDirection(boxes, cells.indexOf(from), direction);
    if (next === null) return;
    event.preventDefault();
    cells[next]?.focus();
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const el = tipTarget(event, root.current);
    if (el) {
      current.current = el;
      if (roving) syncTabStops();
    }
    show(el);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') show(tipTarget(event, root.current));
  };
  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => show(tipTarget(event, root.current));

  return (
    <div
      ref={root}
      className={className}
      style={style}
      data-testid={testId}
      role={role}
      aria-label={ariaLabel}
      onMouseOver={onMouseOver}
      onMouseLeave={() => show(null)}
      onFocus={onFocus}
      onBlur={() => show(null)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      {children}
      {active &&
        createPortal(
          <div
            ref={bubble}
            className="sr-tip"
            data-testid="cell-tooltip"
            aria-hidden="true"
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            <div className="sr-tip-title">{active.tip.title}</div>
            {active.tip.lines.map((line, i) => (
              <div key={i} className="sr-tip-line">
                {line}
              </div>
            ))}
            {active.tip.hint && <div className="sr-tip-hint">{active.tip.hint}</div>}
          </div>,
          document.body,
        )}
    </div>
  );
}
