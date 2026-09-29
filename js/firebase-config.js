// Active Plus — Firebase online test configuration.
// Loaded only when the app is online; the app remains independent offline.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAW9t4luwORjyu6T926qhL4mhOguxuTstI',
  authDomain: 'active-plus.firebaseapp.com',
  databaseURL: 'https://active-plus.firebaseio.com',
  projectId: 'active-plus',
  storageBucket: 'active-plus.firebasestorage.app',
  messagingSenderId: '267388759271',
  appId: '1:267388759271:web:a2ed1103cae476be784642'
};

export const firebaseApp = initializeApp(firebaseConfig);
export { firebaseConfig };

/* ---- App Check (optional) ---------------------------------------------------
   The Firebase console may enforce App Check on the Realtime Database. When
   enforcement is ON and the app never sends a token, EVERY sync read/write is
   rejected with {"error": "Missing appcheck token"} — cross-device login IDs
   (staff accounts, Staff Directory, the claimed-id registry and the student
   login) then never reach the cloud, and a second device shows
   "এই ডিভাইসে কোনো অ্যাকাউন্ট নেই" for an ID that works on the first device.

   Two ways to make the sync work again:
   • Console (simplest): App Check → Applications/Products → set Realtime
     Database enforcement to OFF (this app signs in anonymously; its rules are
     auth != null). No code change needed — this file stays as is.
   • Keep enforcement ON: register this web app under Firebase Console →
     App Check with a reCAPTCHA v3 site key, paste the key into
     APP_CHECK_SITE_KEY below, and (for localhost testing) register the debug
     token the browser prints. App Check then attaches tokens automatically.
   --------------------------------------------------------------------------- */
export const APP_CHECK_SITE_KEY = ''; // reCAPTCHA v3 site key — empty = App Check off here

/* ---- Push notifications (FCM) ----------------------------------------------
   Paste the Web Push certificate key here to turn on notifications for a
   closed app: Firebase Console → Project settings → Cloud Messaging → Web Push
   certificates → "Generate key pair" → copy the key pair value.

   Empty (the default) keeps the app fully working: notices still arrive in the
   app and on the phone while the app is open. See NOTIFICATIONS.md. */
export const FCM_VAPID_KEY = '';

async function initAppCheck() {
  if (!APP_CHECK_SITE_KEY) return; // no key → enforcement must be OFF in the console
  try {
    if (['localhost', '127.0.0.1'].includes(location.hostname)) {
      // Print a debug token in the console; register it once under
      // App Check → Apps → Manage debug tokens for local testing.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    const { initializeAppCheck, ReCaptchaV3Provider } =
      await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js');
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('[Active Plus] App Check unavailable:', error?.message);
  }
}

export const appCheckReady = initAppCheck();
