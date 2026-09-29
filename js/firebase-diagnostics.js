import { LEGACY_CLOUD_ENABLED, CLOUD_PAUSED_MESSAGE, cloudPausedResult } from '../sync/cloud-access.js';
// Active Plus — Firebase read-only diagnostic.
// Does not clear, overwrite, or delete any LocalStorage/IndexedDB data.

import { firebaseConfig } from '../firebase/firebase-config.js';


const waitForConnection = (db, { ref, onValue }, timeoutMs = 8000) => new Promise(resolve => {
  let done = false;
  const finish = value => { if (done) return; done = true; off(); resolve(value); };
  const connectionRef = ref(db, '.info/connected');
  const off = onValue(connectionRef, snap => finish(snap.val() === true), () => finish(false));
  setTimeout(() => finish(false), timeoutMs);
});

export async function diagnoseFirebaseSync() {
  const result = {
    sdk: true,
    databaseURL: firebaseConfig.databaseURL,
    authentication: false,
    firebaseConnection: false,
    databaseRead: false,
    databaseWrite: 'not-tested',
    localStorageProtected: true,
    error: ''
  };

  if (!LEGACY_CLOUD_ENABLED) return { ...result, ...cloudPausedResult(), error: CLOUD_PAUSED_MESSAGE };
  try {
    if (!navigator.onLine) {
      result.error = 'ডিভাইস বর্তমানে অফলাইনে আছে';
      return result;
    }
    const { hasSyncSession } = await import('./sync-session.js');
    if (!(await hasSyncSession())) throw new Error('authentication-required');
    const { firebaseApp, appCheckReady } = await import('../firebase/firebase-init.js');
    const { getAuth, signInAnonymously, getDatabase, ref, get, onValue } = await import('../firebase/firebase-services.js');
    await appCheckReady;
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    result.authentication = !!auth.currentUser;

    const db = getDatabase(firebaseApp);
    result.firebaseConnection = await waitForConnection(db, { ref, onValue });
    if (!result.firebaseConnection) {
      result.error = 'Firebase Realtime Database connection পাওয়া যায়নি';
      return result;
    }

    await get(ref(db, 'activePlusSync/v1'));
    result.databaseRead = true;
  } catch (error) {
    const code = String(error?.code || '');
    const message = String(error?.message || error || '');
    if (code.includes('permission-denied')) result.error = 'Firebase Database permission denied';
    else if (code.includes('auth/operation-not-allowed')) result.error = 'Anonymous Authentication চালু নেই';
    else if (code.includes('auth/invalid-api-key')) result.error = 'Firebase API key invalid';
    else if (/app.?check/i.test(message)) result.error = 'Firebase App Check সমস্যা';
    else result.error = message || 'Firebase diagnostic failed';
  }
  return result;
}

window.APC_FIREBASE_DIAGNOSTIC = diagnoseFirebaseSync;
