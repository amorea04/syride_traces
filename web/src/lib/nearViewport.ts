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

/**
 * Appelle `run` quand le navigateur est inactif (au plus tard après `timeout` ms), donc après la première peinture :
 * le travail non urgent (ECharts) ne retarde pas l'affichage du contenu principal (6.3). Renvoie l'annulation.
 */
export function whenIdle(run: () => void, timeout = 1500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 200);
  return () => clearTimeout(id);
}

/** `whenNearViewport` puis `whenIdle` : chargement lourd (ECharts, MapLibre) après la première peinture. */
export function whenNearViewportIdle(el: Element, run: () => void, margin = '400px'): () => void {
  let stopIdle: (() => void) | null = null;
  const stopWaiting = whenNearViewport(
    el,
    () => {
      stopIdle = whenIdle(run);
    },
    margin,
  );
  return () => {
    stopWaiting();
    stopIdle?.();
  };
}
