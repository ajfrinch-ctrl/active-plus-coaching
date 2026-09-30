import { principalKey, SyncFault } from './sync-security.js';
import { syncConfig } from './firebase-config.js';

// withLock MUST serialize all queue access across tabs (e.g. Web Locks). No
// unsafe localStorage read/modify/write fallback. Never touches legacy keys.
export function createSyncQueue({ storage, principal, withLock }) {
  if (typeof withLock !== 'function') throw new SyncFault('STORAGE_LOCK_REQUIRED');
  const owner = principalKey(principal);
  const key = syncConfig.queuePrefix + owner;
  function load() {
    const raw = storage.getItem(key);
    if (raw === null) return { schemaVersion: 1, owner, items: [] };
    let state;
    try { state = JSON.parse(raw); } catch { throw new SyncFault('QUEUE_CORRUPT'); }
    if (state?.schemaVersion !== 1 || state.owner !== owner || !Array.isArray(state.items)) throw new SyncFault('QUEUE_SCHEMA_UNSUPPORTED');
    // Preserve incompatible data verbatim. Never replace it with an empty queue.
    return state;
  }
  async function change(fn) {
    return withLock(key, async () => {
      const state = load();
      const result = fn(state.items);
      storage.setItem(key, JSON.stringify(state)); // quota failure is propagated
      return result;
    });
  }
  return {
    key,
    list: () => withLock(key, async () => structuredClone(load().items)),
    enqueue: item => change(items => {
      if (principalKey(item.principal) !== owner) throw new SyncFault('PRINCIPAL_MISMATCH');
      if (items.some(entry => entry.id === item.id)) throw new SyncFault('DUPLICATE_OPERATION_ID');
      items.push(structuredClone(item));
      return item.id;
    }),
    patch: (id, fields) => change(items => {
      const index = items.findIndex(item => item.id === id);
      if (index < 0) throw new SyncFault('OPERATION_NOT_FOUND');
      // Queue metadata only: immutable operation ID, principal and payload.
      const allowed = ['syncStatus','retryCount','nextAttemptAt','errorCode','serverVersion'];
      for (const field of Object.keys(fields)) if (!allowed.includes(field)) throw new SyncFault('IMMUTABLE_OPERATION');
      Object.assign(items[index], fields);
    })
  };
}
