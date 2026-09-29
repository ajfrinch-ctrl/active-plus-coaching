// Active Plus — Sync Guard.
// Read-only health validation. It never clears local data and never disables sync.
import { firebaseConfig } from '../firebase/firebase-config.js';
import { firebaseApp } from '../firebase/firebase-init.js';
import { SyncService } from './sync-core.js';

export function validateSyncGuard() {
  const checks = {
    firebaseConfig: Boolean(firebaseConfig?.projectId && firebaseConfig?.appId && firebaseConfig?.databaseURL),
    firebaseInitialized: Boolean(firebaseApp),
    syncService: typeof SyncService?.start === 'function' && typeof SyncService?.getStatus === 'function',
    localStorage: false,
    queue: false,
    retry: true
  };
  try {
    localStorage.setItem('__apc_sync_guard__', '1');
    localStorage.removeItem('__apc_sync_guard__');
    checks.localStorage = true;
    checks.queue = typeof localStorage.getItem === 'function';
  } catch {}
  const critical = Object.values(checks).every(Boolean);
  return { ok: critical, checks, timestamp: new Date().toISOString() };
}
export function assertSyncGuard() {
  const health = validateSyncGuard();
  if (!health.ok) throw new Error('Active Plus Sync Guard failed: ' + JSON.stringify(health.checks));
  return health;
}