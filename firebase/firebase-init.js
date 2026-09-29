// Active Plus — idempotent Firebase initialization.
// There is exactly one initialization path for the entire application.
import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { firebaseConfig, APP_CHECK_SITE_KEY } from './firebase-config.js';

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

async function initAppCheck() {
  if (!APP_CHECK_SITE_KEY) return;
  try {
    if (['localhost', '127.0.0.1'].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    const { initializeAppCheck, ReCaptchaV3Provider } =
      await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js');
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn('[Active Plus] App Check unavailable:', error?.message || error);
  }
}

export const appCheckReady = initAppCheck();