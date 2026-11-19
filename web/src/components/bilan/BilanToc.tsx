import { useEffect, useState } from 'react';
import './bilanA.css';

/** Ancres du bilan dans l'ordre de la page (sommaire du rapport). */
export const TOC_ITEMS: readonly { id: string; label: string }[] = [
  { id: 'apercu', label: 'Aperçu' },
  { id: 'histoire', label: 'Histoire' },
  { id: 'rythme', label: 'Rythme' },
  { id: 'quand', label: 'Quand' },
  { id: 'ou', label: 'Où' },
  { id: 'matos', label: 'Matos' },
  { id: 'records', label: 'Records' },
  { id: 'comparaison', label: 'Comparaison' },
  { id: 'vols', label: 'Vols' },
  { id: 'donnees', label: 'Données' },
];

const presentIds = (): string[] => TOC_ITEMS.filter((i) => document.getElementById(i.id) !== null).map((i) => i.id);
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Sommaire horizontal défilant. N'affiche que les ancres présentes dans le DOM (une section sans rien à montrer
 * ne se rend pas) ; la liste suit les ajouts et retraits de sections.
 */
export function BilanToc() {
  const [present, setPresent] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setPresent((old) => {
      const next = presentIds();
      return sameList(old, next) ? old : next;
    });
    update();
    const root = document.querySelector('[data-testid="bilan-page"]');
    if (!root) return undefined;
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, []);

  if (present.length === 0) return null;
  return (
    <nav className="bl-toc" aria-label="Sommaire du bilan" data-testid="bilan-toc">
      {TOC_ITEMS.filter((i) => present.includes(i.id)).map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
