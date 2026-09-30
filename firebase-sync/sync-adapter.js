import { principalKey, validateOperation, SyncFault } from './sync-security.js';

/** Integration contract, deliberately not wired to existing feature stores yet.
 * local.commitAndEnqueue must atomically save the record AND durable operation
 * (one IndexedDB transaction, or a recoverable local write-ahead journal).
 * Never implement it as two unrelated best-effort writes.
 */
export function createSyncAdapter({ local, engine, queue, status, principal, deviceId,
  policies = {}, now = Date.now, uuid = () => crypto.randomUUID(), withLock }) {
  principalKey(principal);
  if (typeof withLock !== 'function' || typeof local.commitAndEnqueue !== 'function') throw new SyncFault('ATOMIC_LOCAL_STORE_REQUIRED');
  async function mutate(entity, recordId, payload, operation) {
    return withLock(`${queue.key}:record:${entity}:${recordId}`, async () => {
      const current = await local.read(entity, recordId);
      if (operation === 'CREATE' && current) throw new SyncFault('RECORD_EXISTS');
      if (operation !== 'CREATE' && !current) throw new SyncFault('RECORD_NOT_FOUND');
      const timestamp = now();
      const baseVersion = current?.version ?? 0;
      const item = { id: uuid(), entity, operation, recordId, payload: structuredClone(payload),
        createdAt: timestamp, updatedAt: timestamp, retryCount: 0, syncStatus: 'SYNC_PENDING',
        deviceId, principal: { uid: principal.uid, tenant: principal.tenant }, baseVersion, nextAttemptAt: 0 };
      validateOperation(item, policies);
      const record = { data: structuredClone(payload), id: recordId, updatedAt: timestamp,
        updatedBy: principal.uid, deviceId, version: baseVersion + 1, deleted: operation === 'DELETE' };
      // DELETE creates a durable tombstone, never physically erases local data.
      await local.commitAndEnqueue({ entity, record, operation: item, queueKey: queue.key });
      status.set({ state: 'SYNC_PENDING' });
      void engine.push().catch(() => status.set({ state: 'SYNC_ERROR' }));
      return structuredClone(record);
    });
  }
  return {
    create: (entity, data) => mutate(entity, uuid(), data, 'CREATE'),
    update: (entity, id, data) => mutate(entity, id, data, 'UPDATE'),
    delete: (entity, id) => mutate(entity, id, null, 'DELETE'),
    // Remote pull/merge is not provided until pending-write-safe hydration exists.
    pull: async () => { throw new SyncFault('REMOTE_PULL_NOT_CONFIGURED'); },
    push: () => engine.push(),
    syncNow: () => engine.push(),
    getStatus: () => status.get(),
    subscribe: listener => status.subscribe(listener)
  };
}
