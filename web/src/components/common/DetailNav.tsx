import { Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useFilterSearch } from '@/components/FilterLink';
import { useHighlightStore } from '@/store/highlight';
import { backSteps, useNavHistoryStore } from '@/store/navHistory';
import './detailNav.css';

export interface Crumb {
  label: string;
  /** Chemin (sans query : les filtres courants sont ajoutés). Absent pour la page courante. */
  to?: string;
}

/** Éléments qui, ouverts, gardent la touche Échap pour eux : fenêtre, tiroir, menu, liste déroulante. */
const OVERLAY_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"], [role="alertdialog"]';

/** Vrai si l'élément et ses ancêtres ne sont ni `hidden` ni masqués par le style (les listes de Mantine restent montées, cachées). */
function isShown(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    if (node instanceof HTMLElement) {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
  }
  return true;
}

/** Infobulle de case (`CellTooltip`) affichée : Échap la ferme avant de quitter la page. */
const TOOLTIP_SELECTOR = '[data-testid="cell-tooltip"]';

export function hasOpenOverlay(root: ParentNode = document): boolean {
  return (
    [...root.querySelectorAll(OVERLAY_SELECTOR)].some(isShown) ||
    root.querySelector(TOOLTIP_SELECTOR) !== null
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export interface EscapeContext {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  /** Le focus est dans un champ de saisie. */
  editable: boolean;
  /** Une fenêtre, un tiroir ou un menu est ouvert. */
  overlayOpen: boolean;
  /** Un surlignage croisé est actif : Échap commence par l'effacer. */
  highlightActive: boolean;
}

/** Vrai si Échap doit faire quitter la page (équivalent de « ← Retour »). */
export function shouldLeaveOnEscape(e: EscapeContext): boolean {
  if (e.key !== 'Escape') return false;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return false;
  return !e.editable && !e.overlayOpen && !e.highlightActive;
}

interface Props {
  /** Fil d'Ariane : les parents (avec `to`), puis la page courante (sans `to`). */
  crumbs: readonly Crumb[];
  /** Destination du retour sans historique ; par défaut le dernier parent du fil. */
  fallback?: string;
}

/** « ← Retour » (page précédente d'un autre chemin, sinon la liste parente), fil d'Ariane (filtres conservés) et touche Échap, communs aux pages de détail. */
export function DetailNav({ crumbs, fallback }: Props) {
  const search = useFilterSearch();
  const navigate = useNavigate();
  const parent = fallback ?? [...crumbs].reverse().find((c) => c.to !== undefined)?.to ?? '/';

  const goBack = useCallback(() => {
    // Page précédente d'un autre chemin (les changements de filtre empilent des entrées sur le même chemin).
    const { entries, index } = useNavHistoryStore.getState();
    const steps = backSteps({ entries, index });
    if (steps !== null) navigate(-steps);
    else navigate({ pathname: parent, search });
  }, [navigate, parent, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const leave = shouldLeaveOnEscape({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        editable: isEditable(event.target),
        overlayOpen: hasOpenOverlay(),
        highlightActive: useHighlightStore.getState().highlight !== null,
      });
      if (leave) goBack();
    };
    // Phase de capture : on lit l'état des fenêtres et menus avant que leur propre gestion d'Échap les ferme.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [goBack]);

  return (
    <div className="dn" data-testid="detail-nav">
      <Button
        variant="subtle"
        color="gray"
        size="compact-sm"
        className="dn-back"
        leftSection={<IconArrowLeft size={16} aria-hidden />}
        onClick={goBack}
        data-testid="detail-back"
      >
        Retour
      </Button>
      <nav aria-label="Fil d’Ariane" style={{ minWidth: 0 }}>
        <ol className="dn-trail" data-testid="detail-trail">
          {crumbs.map((crumb, i) => (
            <li key={`${i}-${crumb.label}`}>
              {crumb.to !== undefined ? (
                <Link to={{ pathname: crumb.to, search }}>{crumb.label}</Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
