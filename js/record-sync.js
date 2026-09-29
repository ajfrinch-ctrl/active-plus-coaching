/* Durable record-level outbox. Cloud transport is injected so the same merge
   rules can be tested without a Firebase project. A persisted view distinguishes
   an offline deletion from a record this device has never seen. */
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => stableJSON(a) === stableJSON(b);
const own = (obj, key) => Object.hasOwn(obj, key);

export function mergeRecordOperations(remote, operations) {
  const next = { ...(remote || {}) };
  for (const [id, op] of Object.entries(operations)) {
    if (op.seed && own(next, id)) continue; // first sync must not replace cloud data
    if (op.value === null) delete next[id];
    else Object.defineProperty(next, id, { value: op.value, enumerable: true, configurable: true, writable: true });
  }
  return next;
}

export function createRecordSync({ loadState, saveState, readLocal, writeLocal, commit }) {
  const saved = loadState();
  let view = saved?.view ?? null;
  let pending = saved?.pending || {};
  let flight = null;
  const persist = () => saveState({ version: 1, view, pending });

  function capture() {
    const local = readLocal();
    if (local === null) return; // unreadable is NOT a request to delete everything
    const ids = new Set([...Object.keys(view || {}), ...Object.keys(local)]);
    for (const id of ids) {
      if (view !== null && same(view[id], local[id])) continue;
      const value = own(local, id) ? local[id] : null;
      Object.defineProperty(pending, id, {
        value: { value, ...(view === null ? { seed: true } : {}) },
        enumerable: true, configurable: true, writable: true
      });
    }
    view = copy(local);
    persist(); // save the outbox before making a network request
  }

  function receive(remote) {
    capture();
    const next = mergeRecordOperations(remote, pending);
    view = copy(next);
    persist();
    writeLocal(next);
  }

  function flush() {
    if (flight) return flight;
    flight = (async () => {
      capture();
      while (Object.keys(pending).length) {
        const batch = copy(pending);
        // commit atomically merges ONLY changed IDs into current server state.
        const remote = await commit(batch);
        // A new edit can arrive while the old write is awaiting acknowledgement.
        for (const [id, operation] of Object.entries(batch)) {
          if (same(pending[id], operation)) delete pending[id];
        }
        receive(remote);
      }
    })().finally(() => { flight = null; });
    return flight;
  }

  capture();
  return { capture, receive, flush, hasPending: () => Object.keys(pending).length > 0 };
}
