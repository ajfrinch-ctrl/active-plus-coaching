/* Active Plus — Firebase diagnostic helper.
   Read-only diagnostics: it never clears local storage and never writes test
   records. A successful sync write is reported from the real sync path. */
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp, firebaseConfig, appCheckReady } from './firebase-config.js';
import { ensureCloudAuth } from './realtime-sync.js';

const DB_ROOT = 'activePlusSync/v1';

function waitForFirebaseConnection(db, timeout = 8000) {
  return new Promise(resolve => {
    let done = false;
    let timer;
    let stop;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop?.();
      resolve(Boolean(value));
    };
    stop = onValue(ref(db, '.info/connected'), snap => {
      if (snap.val() === true) finish(true);
    }, () => finish(false));
    timer = setTimeout(() => finish(false), timeout);
  });
}

export async function diagnoseFirebaseSync() {
  const report = {
    sdk: Boolean(firebaseApp),
    databaseURL: Boolean(firebaseConfig?.databaseURL),
    databaseURLValue: firebaseConfig?.databaseURL || '',
    authentication: false,
    firebaseConnection: false,
    databaseRead: false,
    databaseWrite: document.documentElement.dataset.firebaseLastSync ? 'verified-by-real-sync' : 'not-yet-tested',
    localStorageProtected: true,
    error: null
  };

  try {
    await appCheckReady;
    const auth = await ensureCloudAuth();
    report.authentication = Boolean(auth?.uid);
    const db = getDatabase(firebaseApp);
    report.firebaseConnection = await waitForFirebaseConnection(db);
    if (!report.firebaseConnection) throw Object.assign(new Error('Firebase connection timeout'), { code: 'database/network-timeout' });
    await get(ref(db, DB_ROOT));
    report.databaseRead = true;
    return report;
  } catch (error) {
    report.error = { code: error?.code || error?.name || 'unknown', message: error?.message || String(error) };
    return report;
  }
}

if (typeof window !== 'undefined') {
  window.APC_FIREBASE_DIAGNOSTIC = diagnoseFirebaseSync;
}
