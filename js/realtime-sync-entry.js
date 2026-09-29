/* Deferred, retryable sync. No page reload and no deletion of local data. */
import { reportSyncError, setSyncStatus } from './sync-status.js';

let running = false;
let timer;
let attempt = 0;
let slowTimer;
function schedule(delay = 0) {
  clearTimeout(timer);
  if (delay) { timer = setTimeout(bootRealtimeSync, delay); return; }
  // Sync should start as soon as the UI is usable, but never block it: the
  // first idle moment wins, with a hard cap so an idle-less browser still
  // connects quickly.
  if (typeof window.requestIdleCallback === 'function') {
    timer = window.requestIdleCallback(bootRealtimeSync, { timeout: 600 });
  } else {
    timer = setTimeout(bootRealtimeSync, 250);
  }
}

async function bootRealtimeSync() {
  if (!navigator.onLine) { setSyncStatus('offline'); return; }
  if (running) return;
  running = true;
  setSyncStatus('connecting');
  slowTimer = setTimeout(() => {
    reportSyncError({ code: 'network-timeout' });
  }, 20000);
  try {
    const { startRealtimeSync } = await import('./realtime-sync.js?v=20260929-notify');
    const result = await startRealtimeSync();
    if (!result?.ok) {
      reportSyncError(result?.error);
      schedule(Math.min(30000, 1500 * 2 ** Math.min(attempt++, 5)));
    } else {
      attempt = 0;
      // Check again after cancelled listeners or a rejected background write.
      schedule(15000);
    }
  } catch (error) {
    reportSyncError(error);
    schedule(Math.min(30000, 1500 * 2 ** Math.min(attempt++, 5)));
  } finally {
    clearTimeout(slowTimer);
    running = false;
  }
}

function mountStatus() {
  const banner = document.createElement('button');
  banner.type = 'button';
  banner.id = 'cloudSyncStatus';
  banner.setAttribute('aria-label', 'ক্লাউড সিঙ্কের অবস্থা — আবার চেষ্টা করতে চাপুন');
  banner.style.cssText = 'position:fixed;bottom:calc(76px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:1000;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid #b45309;border-radius:10px;background:#fffbeb;color:#78350f;font:13px/1.5 sans-serif;box-shadow:0 2px 8px #0002;';
  banner.hidden = true;
  document.body.append(banner);
  const paint = () => {
    const { realtimeSync: state, realtimeSyncMessage: message } = document.documentElement.dataset;
    banner.hidden = !['error', 'offline', 'pending', 'conflict'].includes(state);
    banner.textContent = `${message || 'সিঙ্কের অপেক্ষায়'}${state === 'error' ? ' · আবার চেষ্টা' : ''}`;
  };
  banner.addEventListener('click', () => schedule(0));
  window.addEventListener('apc-sync-status', paint);
  paint();
  schedule();
  mountNotifications();
}

/* The notification centre is optional: a failure there never delays sync. */
function mountNotifications() {
  import('./notifications.js')
    .then(module => module.initNotifications())
    .catch(error => console.warn('[Active Plus] notifications unavailable:', error?.name || 'unknown'));
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', mountStatus, { once: true });
else mountStatus();
window.addEventListener('online', () => schedule(250));
window.addEventListener('offline', () => { clearTimeout(timer); setSyncStatus('offline'); });
window.addEventListener('apc-sync-retry', () => schedule(0));
