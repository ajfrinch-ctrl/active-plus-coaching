import { startRealtimeSync } from './realtime-sync.js';

async function bootRealtimeSync() {
  if (!navigator.onLine) return;
  const result = await startRealtimeSync();
  if (result?.ok) {
    document.documentElement.dataset.realtimeSync = 'online';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootRealtimeSync, { once: true });
} else {
  bootRealtimeSync();
}

window.addEventListener('online', bootRealtimeSync);
