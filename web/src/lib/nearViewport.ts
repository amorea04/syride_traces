/**
 * Appelle `run` une seule fois, quand `el` approche de la zone visible (marge `margin`).
 * Sans `IntersectionObserver` (jsdom, vieux navigateurs), `run` part tout de suite.
 * Sert à ne charger MapLibre (≈ 0,3 Mo de JS à évaluer) que pour une carte réellement vue (6.3).
 * Renvoie la fonction d'annulation.
 */
export function whenNearViewport(el: Element, run: () => void, margin = '400px'): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    run();
    return () => undefined;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    },
    { rootMargin: margin },
  );
  io.observe(el);
  return () => io.disconnect();
}
