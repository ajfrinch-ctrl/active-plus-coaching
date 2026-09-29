import { mountStatusNotice } from './status-surface.js';
/* Deferred, retryable sync. No page reload and no deletion of local data. */
import { reportSyncError, setSyncStatus } from '../sync/sync-status.js';
import { assertSyncGuard } from '../sync/sync-guard.js';
import { retryDelay } from '../sync/sync-retry.js';

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
    await assertSyncGuard();
    const { startRealtimeSync } = await import('../sync/sync-core.js?v=20260929-protected');
    const result = await startRealtimeSync();
    if (!result?.ok) {
      reportSyncError(result?.error);
      schedule(retryDelay(attempt++));
    } else {
      attempt = 0;
      // Check again after cancelled listeners or a rejected background write.
      schedule(15000);
    }
  } catch (error) {
    reportSyncError(error);
    schedule(retryDelay(attempt++));
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
  banner.hidden = true;
  mountStatusNotice(banner);
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
