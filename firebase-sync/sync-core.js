// Independent lifecycle: no selectors, theme imports, or Firebase global.
// Construct only after storage and trusted auth integration have been supplied.
export function startSyncLifecycle({ engine, status, events, authEvents, intervalMs = 60000,
  schedule = setInterval, cancel = clearInterval }) {
  let stopped = false;
  const trigger = () => {
    if (!stopped) void engine.push().catch(() => status.set({ state: 'SYNC_ERROR' }));
  };
  const onAuth = () => { engine.resume(); trigger(); };
  const onLogout = () => engine.pause();
  events?.addEventListener('online', trigger);
  authEvents?.addEventListener('verified-login', onAuth);
  authEvents?.addEventListener('logout', onLogout);
  const timer = schedule(trigger, intervalMs);
  trigger();
  return () => {
    stopped = true;
    cancel(timer);
    engine.pause();
    events?.removeEventListener('online', trigger);
    authEvents?.removeEventListener('verified-login', onAuth);
    authEvents?.removeEventListener('logout', onLogout);
  };
}
