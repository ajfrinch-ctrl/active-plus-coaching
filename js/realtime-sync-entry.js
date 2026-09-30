import { LEGACY_CLOUD_ENABLED } from '../sync/cloud-access.js';
import { mountStatusNotice } from './status-surface.js';
/* Deferred, retryable sync. No page reload and no deletion of local data. */
import { reportSyncError, setSyncStatus } from '../sync/sync-status.js';
import { assertSyncGuard } from '../sync/sync-guard.js';
import { retryDelay } from '../sync/sync-retry.js';

let running = false;
let timer;
let idleScheduled = false;
let attempt = 0;
function cancelScheduled() {
  if (idleScheduled) window.cancelIdleCallback?.(timer);
  else clearTimeout(timer);
  idleScheduled = false;
}
function schedule(delay = 0) {
  cancelScheduled();
  if (!LEGACY_CLOUD_ENABLED) { setSyncStatus('paused'); return; }
  if (delay) { timer = setTimeout(bootRealtimeSync, delay); return; }
  // Sync should start as soon as the UI is usable, but never block it: the
  // first idle moment wins, with a hard cap so an idle-less browser still
  // connects quickly.
  if (typeof window.requestIdleCallback === 'function') {
    idleScheduled = true;
    timer = window.requestIdleCallback(bootRealtimeSync, { timeout: 600 });
  } else {
    timer = setTimeout(bootRealtimeSync, 250);
  }
}

async function bootRealtimeSync() {
  if (!LEGACY_CLOUD_ENABLED) { setSyncStatus('paused'); return; }
  if (!maySync()) return;
  if (!navigator.onLine) { setSyncStatus('offline'); return; }
  try {
    const { hasSyncSession } = await import('./sync-session.js');
    if (!(await hasSyncSession())) return;
  } catch { return; }
  if (running) return;
  running = true;
  setSyncStatus('connecting');
  try {
    await assertSyncGuard();
    const { startRealtimeSync } = await import('../sync/sync-core.js?v=20260929-protected');
    const result = await startRealtimeSync();
    if (!result?.ok) {
      if (result?.reason !== 'session-ended' && result?.reason !== 'authentication-required') {
        if (result?.error) reportSyncError(result.error);
        if (maySync()) schedule(retryDelay(attempt++));
      }
    } else {
      attempt = 0;
      // The RTDB listeners and outbox own reconnects while healthy. Polling
      // start() here used to turn a short outage into repeated full boots.
    }
  } catch (error) {
    reportSyncError(error);
    if (maySync()) schedule(retryDelay(attempt++));
  } finally {
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
    banner.hidden = !maySync() || !['error', 'offline', 'pending', 'conflict', 'paused'].includes(state);
    banner.disabled = state === 'paused';
    banner.textContent = `${message || 'সিঙ্কের অপেক্ষায়'}${state === 'error' ? ' · আবার চেষ্টা' : ''}`;
  };
  banner.addEventListener('click', () => { if (LEGACY_CLOUD_ENABLED && maySync()) schedule(0); });
  window.addEventListener('apc-sync-status', paint);
  paint();
  // The login page must not fetch/sync account or application collections
  // before a user has signed in. A valid restored session emits the same event.
  if (maySync()) schedule();
  if (maySync()) mountNotifications();
}

function maySync() {
  return !document.getElementById('authScreen') || document.getElementById('authScreen').hidden;
}
/* The notification centre is optional: a failure there never delays sync. */
function mountNotifications() {
  import('./notifications.js')
    .then(module => module.initNotifications())
    .catch(error => console.warn('[Active Plus] notifications unavailable:', error?.name || 'unknown'));
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', mountStatus, { once: true });
else mountStatus();

window.addEventListener('apc-session-ready', () => { if (!maySync()) return; mountNotifications(); schedule(0); });
window.addEventListener('apc-session-ended', () => {
  cancelScheduled();
  attempt = 0;
  const banner = document.getElementById('cloudSyncStatus');
  if (banner) banner.hidden = true;
});
window.addEventListener('online', () => { if (maySync()) schedule(250); });
window.addEventListener('offline', () => { cancelScheduled(); setSyncStatus(LEGACY_CLOUD_ENABLED ? 'offline' : 'paused'); });
window.addEventListener('apc-sync-retry', () => { if (maySync()) schedule(0); });
