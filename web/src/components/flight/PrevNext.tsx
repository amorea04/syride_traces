import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FilterLink, useFilterSearch } from '@/components/FilterLink';
import '@/components/flight/flight.css';
import type { Flight } from '@/data/flight';
import { fmtDateShort, fmtDuration, fmtInt } from '@/lib/format';

function summary(f: Flight): string {
  const parts = [
    f.time ? `${fmtDateShort(f.date)}, ${f.time}` : fmtDateShort(f.date),
    f.durationMin === null ? null : fmtDuration(f.durationMin),
    f.ceilingM === null ? null : `${fmtInt(f.ceilingM)} m`,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** La cible d'un événement clavier est-elle un champ de saisie ou la carte (qui utilise les flèches) ? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="listbox"], .maplibregl-map',
    ) !== null
  );
}

/** Flèches ← et → : vol précédent et suivant du pilote (inactives dans un champ de saisie ou avec un modificateur). */
export function useArrowNavigation(previous: Flight | null, next: Flight | null): void {
  const navigate = useNavigate();
  const search = useFilterSearch();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (isTypingTarget(e.target)) return;
      const target = e.key === 'ArrowLeft' ? previous : next;
      if (!target) return;
      e.preventDefault();
      void navigate({ pathname: `/vol/${target.key}`, search });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previous, next, navigate, search]);
}

function Card({ flight, dir }: { flight: Flight | null; dir: 'previous' | 'next' }) {
  const label = dir === 'previous' ? '← Vol précédent' : 'Vol suivant →';
  if (!flight) {
    return (
      <div
        className="fv-pn"
        data-empty="true"
        data-dir={dir === 'next' ? 'next' : undefined}
        data-testid={`${dir}-flight`}
      >
        <span className="fv-eyebrow">{label}</span>
        <b>{dir === 'previous' ? 'Premier vol du pilote' : 'Dernier vol du pilote'}</b>
      </div>
    );
  }
  return (
    <FilterLink
      to={`/vol/${flight.key}`}
      className="fv-pn"
      c="inherit"
      underline="never"
      data-dir={dir === 'next' ? 'next' : undefined}
      data-testid={`${dir}-flight`}
    >
      <span className="fv-eyebrow">{label}</span>
      <b>{flight.site ?? 'Site non renseigné'}</b>
      <span style={{ color: 'var(--sr-muted)', fontSize: 13 }}>{summary(flight)}</span>
    </FilterLink>
  );
}

interface Props {
  previous: Flight | null;
  next: Flight | null;
}

/** Vols précédent et suivant du pilote (date, heure, numéro Syride). */
export function PrevNext({ previous, next }: Props) {
  useArrowNavigation(previous, next);
  return (
    <nav aria-label="Vols du même pilote">
      <div className="fv-pn-row">
        <Card flight={previous} dir="previous" />
        <Card flight={next} dir="next" />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sr-muted)' }}>Touches ← et → du clavier.</p>
    </nav>
  );
}
