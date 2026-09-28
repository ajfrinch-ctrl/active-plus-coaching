/* Active Plus — deferred Realtime Database test sync.
   Firebase must never block the login/app startup path. */
async function bootRealtimeSync() {
  if (!navigator.onLine) return;
  try {
    const { startRealtimeSync } = await import('./realtime-sync.js?v=20260929-1000');
    const result = await startRealtimeSync();
    if (result?.ok) {
      document.documentElement.dataset.realtimeSync = 'online';
    }
  } catch (error) {
    console.warn('[Active Plus] Realtime sync unavailable:', error);
  }
}

function scheduleRealtimeSync() {
  window.setTimeout(bootRealtimeSync, 1200);
}

if (document.readyState === 'complete') {
  scheduleRealtimeSync();
} else {
  window.addEventListener('load', scheduleRealtimeSync, { once: true });
}

window.addEventListener('online', () => {
  window.setTimeout(bootRealtimeSync, 500);
});
