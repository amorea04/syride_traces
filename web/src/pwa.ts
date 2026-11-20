/** Délai avant le second signalement des fichiers déjà chargés (ms). */
const REPORT_DELAY_MS = 3000;

/** Enregistre le service worker (`public/sw.js`) en production seulement : en dev il gênerait le rechargement à chaud. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // Les fichiers déjà chargés par cette page l'ont été avant que le service worker la contrôle : on les lui signale
        // (ils viennent du cache HTTP), pour que cette même page se recharge hors ligne.
        // Deux envois : tout de suite (coquille) puis une fois la route courante et ses graphiques chargés.
        const report = () => {
          const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
          registration.active?.postMessage({ type: 'cache-loaded', urls });
        };
        report();
        window.setTimeout(report, REPORT_DELAY_MS);
      })
      .catch(() => {
        /* Sans service worker, l'application reste pleinement utilisable en ligne. */
      });
  });
}
