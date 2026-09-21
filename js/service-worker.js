/* Offline app shell registration. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The UI remains usable if opened without a service worker.
    });
  });
}
