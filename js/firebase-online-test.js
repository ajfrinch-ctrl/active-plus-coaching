// Optional online Firebase smoke test. Never changes local app data.
export async function testFirebaseOnlineConnection() {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    const { firebaseApp } = await import('./firebase-config.js');
    return { ok: Boolean(firebaseApp), reason: 'initialized' };
  } catch (error) {
    console.warn('[Active Plus] Firebase online test failed:', error);
    return { ok: false, reason: 'initialization-failed', error };
  }
}
