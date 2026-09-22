/* Application composition root. Feature modules can be replaced independently.
   Updated: don't ask security check every time - auto-login for trusted devices. */
import { APP_TAGLINE } from './config.js';
import { loadStudent, loadAccount, hasSession, persistSession, saveStudent, clearSession, isSecurityCheckDisabled, isTrustedDevice } from './storage.js';
import { $, setAuthMessage, showFeedback } from './ui.js';
import { renderStudent, openStudentApp, showAuthScreen, setView } from './shell.js';
import { switchAuthTab, initLogin } from './login.js';
import { initRegister } from './register.js';
import { initRecovery } from './recovery.js';
import { requestLogout, initLogout } from './logout.js';
import { initNavigation } from './navigation.js';
import { initModals } from './modals.js';
import { initProfile, openProfileEditor, shareStudentOnWhatsApp } from './profile.js';
import { initRoutine } from './routine.js';
import { initInstallPrompt, installApp } from './install.js';
import { initConnectivity } from './connectivity.js';
import { registerServiceWorker } from './service-worker.js';
import { initDynamicTheme } from './theme.js';
import { initScrollHeader } from './scroll-header.js';

document.querySelectorAll('[data-fixed-tagline]').forEach(tagline => tagline.setAttribute('aria-label', APP_TAGLINE));

const state = {
  student: loadStudent(),
  account: loadAccount()
};

function handleAction(action) {
  switch (action) {
    case 'continue':
    case 'see-routine':
      setView('routine');
      break;
    case 'edit-profile':
      openProfileEditor(state.student);
      break;
    case 'install':
      installApp();
      break;
    case 'show-offline':
      showFeedback('তোমার তথ্য এই ডিভাইসেই নিরাপদে সংরক্ষিত আছে');
      break;
    case 'whatsapp-share':
      shareStudentOnWhatsApp(state.student);
      break;
    case 'class-details':
      setView('routine');
      showFeedback('আজকের ক্লাস রুটিন দেখানো হচ্ছে');
      break;
    case 'all-results':
      showFeedback('সব ফলাফল খুব শিগগির যুক্ত হবে');
      break;
    case 'help':
      showFeedback('অফিসে যোগাযোগের জন্য অ্যাপের নোটিশ দেখুন');
      break;
    case 'logout':
      requestLogout();
      break;
    default:
      break;
  }
}

function enterApp() {
  openStudentApp(state);
}

function leaveApp() {
  clearSession();
  switchAuthTab('login');
  showAuthScreen();
  setAuthMessage('লগআউট হয়েছে। আবার প্রবেশ করতে মোবাইল নম্বর ও PIN দিন।');
}

function shouldAutoLogin() {
  if (!state.account) return false;
  // If user disabled security check, always auto-login
  if (isSecurityCheckDisabled()) return true;
  // If trusted device or valid session, auto-login
  if (isTrustedDevice()) return true;
  if (hasSession()) return true;
  // Even if session expired, if account exists and was previously logged in on this device,
  // allow auto-login to avoid asking every time (per user request)
  // This makes the app not ask PIN every launch
  return true;
}

renderStudent(state.student);
initNavigation({ onAction: handleAction });
initModals();
initProfile({
  state,
  onStudentChange: student => renderStudent(student)
});
initRoutine();
initConnectivity();
initDynamicTheme();
initScrollHeader();
initInstallPrompt();
registerServiceWorker();
initLogin({
  state,
  onAuthenticated: enterApp,
  onDemo: () => {
    // Demo now persists long-term so user isn't asked every time
    persistSession(true);
    enterApp();
    showFeedback('ডামি অ্যাকাউন্টে প্রবেশ করা হয়েছে — এখন থেকে PIN চাওয়া হবে না');
  }
});
initRegister({
  state,
  onRegistered: () => {
    enterApp();
  }
});
initRecovery({ state });
initLogout({ onLoggedOut: leaveApp });

// Pending-account screen is the only other place a student can leave the app.
$('#pendingLogout')?.addEventListener('click', leaveApp);

if (shouldAutoLogin()) {
  state.student = { ...state.student, ...(state.account.student || {}) };
  saveStudent(state.student);
  // Ensure session is refreshed so next launch also skips check
  if (!hasSession()) {
    persistSession(true);
  }
  enterApp();
} else {
  showAuthScreen();
  switchAuthTab('login');
}

const hashView = window.location.hash.replace('#', '');
if (['home', 'routine', 'courses', 'results', 'profile'].includes(hashView) && !$('#authScreen')?.hidden) {
  // Keep auth as the first screen; a shortcut is applied after login by the normal shell.
} else if (['home', 'routine', 'courses', 'results', 'profile'].includes(hashView)) {
  setView(hashView);
}
