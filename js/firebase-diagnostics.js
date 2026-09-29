// Active Plus — Firebase read-only diagnostic.
// Does not clear, overwrite, or delete any LocalStorage/IndexedDB data.
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp, firebaseConfig, appCheckReady } from './firebase-config.js';

const waitForConnection = (db, timeoutMs = 8000) => new Promise(resolve => {
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

  try {
    if (!navigator.onLine) {
      result.error = 'ডিভাইস বর্তমানে অফলাইনে আছে';
      return result;
    }
    await appCheckReady;
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    result.authentication = !!auth.currentUser;

    const db = getDatabase(firebaseApp);
    result.firebaseConnection = await waitForConnection(db);
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
