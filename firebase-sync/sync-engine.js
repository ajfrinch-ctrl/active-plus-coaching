import { principalKey, retryable, validateOperation, SyncFault } from './sync-security.js';
import { syncConfig } from './firebase-config.js';

export function createSyncEngine({ queue, principal, auth, transport, policies = {}, status,
  withLock, online = () => true, now = Date.now, random = Math.random }) {
  if (typeof withLock !== 'function') throw new SyncFault('STORAGE_LOCK_REQUIRED');
  const owner = principalKey(principal);
  let paused = false;
  let flight;
  async function authorized() {
    const current = await auth.currentPrincipal();
    return current && principalKey(current) === owner && current.verified === true;
  }
  async function run() {
    if (paused) return status.set({ state: 'SYNC_PAUSED' });
    if (!online()) return status.set({ state: 'OFFLINE' });
    if (!await authorized()) return status.set({ state: 'AUTH_REQUIRED' });
    const blocked = new Set();
    for (const item of await queue.list()) {
      if (paused || !online() || !await authorized()) break;
      if (item.syncStatus === 'SYNCED') continue;
      const record = `${item.entity}:${item.recordId}`;
      if (blocked.has(record)) continue;
      if (['SYNC_CONFLICT','SYNC_ERROR','SYNC_FAILED'].includes(item.syncStatus) || item.nextAttemptAt > now()) {
        blocked.add(record); continue;
      }
      try {
        validateOperation(item, policies);
        if (principalKey(item.principal) !== owner) throw new SyncFault('PRINCIPAL_MISMATCH');
      } catch (error) {
        await queue.patch(item.id, { syncStatus: 'SYNC_ERROR', errorCode: error.code || 'INVALID_RECORD' });
        blocked.add(record); continue;
      }
      status.set({ state: 'SYNCING' });
      try {
        // Server must verify Firebase ID token, derive roles/tenant itself,
        // authorize fields, then atomically enforce op-id dedupe + baseVersion.
        const result = await transport.commit(structuredClone(item));
        if (paused || !await authorized()) break; // don't adopt late acknowledgements
        if (result?.operationId !== item.id) throw new SyncFault('INVALID_SERVER_RESPONSE');
        if (result.kind === 'conflict') {
          await queue.patch(item.id, { syncStatus: 'SYNC_CONFLICT', errorCode: 'VERSION_CONFLICT', serverVersion: result.version });
          blocked.add(record);
        } else if (['applied','duplicate'].includes(result.kind) && Number.isSafeInteger(result.version) && result.version > item.baseVersion) {
          await queue.patch(item.id, { syncStatus: 'SYNCED', serverVersion: result.version, errorCode: null });
        } else throw new SyncFault('INVALID_SERVER_RESPONSE');
      } catch (error) {
        blocked.add(record);
        const retryCount = item.retryCount + 1;
        if (['UNAUTHENTICATED','PERMISSION_DENIED'].includes(error.code)) {
          paused = true;
          await queue.patch(item.id, { syncStatus: 'SYNC_PENDING', errorCode: error.code });
          status.set({ state: 'AUTH_REQUIRED' });
          return;
        }
        const delay = Math.min(syncConfig.retryCapMs, syncConfig.retryBaseMs * 2 ** Math.min(retryCount - 1, 16));
        await queue.patch(item.id, { retryCount, syncStatus: retryable(error) ? 'SYNC_PENDING' : 'SYNC_FAILED',
          errorCode: error.code || 'SYNC_FAILED', nextAttemptAt: now() + Math.round(delay * (0.8 + random() * 0.4)) });
      }
    }
    const remaining = (await queue.list()).filter(item => item.syncStatus !== 'SYNCED');
    const state = paused ? 'SYNC_PAUSED' : !online() ? 'OFFLINE' : !await authorized() ? 'AUTH_REQUIRED'
      : remaining.some(item => item.syncStatus === 'SYNC_CONFLICT') ? 'SYNC_CONFLICT'
      : remaining.some(item => ['SYNC_ERROR','SYNC_FAILED'].includes(item.syncStatus)) ? 'SYNC_ERROR'
      : remaining.length ? 'SYNC_PENDING' : 'SYNCED';
    status.set({ state, pending: remaining.length });
  }
  return {
    push() {
      if (flight) return flight;
      flight = withLock(queue.key + ':flush', run).finally(() => { flight = null; });
      return flight;
    },
    pause() { paused = true; status.set({ state: 'SYNC_PAUSED' }); },
    resume() { paused = false; },
    async retry(id) {
      const item = (await queue.list()).find(item => item.id === id);
      if (!item || item.syncStatus !== 'SYNC_FAILED') throw new SyncFault('RETRY_NOT_ALLOWED');
      await queue.patch(id, { syncStatus: 'SYNC_PENDING', nextAttemptAt: 0 });
    }
  };
}
