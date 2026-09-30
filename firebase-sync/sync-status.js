// No DOM, theme or application imports. UI may subscribe without owning sync.
export function createSyncStatus() {
  let current = Object.freeze({ state: 'SYNC_PAUSED', pending: 0 });
  const listeners = new Set();
  return {
    get: () => ({ ...current }),
    set: update => {
      current = Object.freeze({ ...current, ...update });
      for (const listener of listeners) { try { listener({ ...current }); } catch {} }
    },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
