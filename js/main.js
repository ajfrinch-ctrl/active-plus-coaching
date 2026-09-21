/* Application composition root. Feature modules can be replaced independently. */
import { APP_TAGLINE } from './config.js';
import { loadStudent, loadAccount, hasSession, persistSession, saveStudent } from './storage.js';
import { $, openModal, setAuthMessage, showFeedback } from './ui.js';
import { renderStudent, openStudentApp, showAuthScreen, logout, setView } from './shell.js';
import { switchAuthTab, initAuth } from './auth.js';
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
      confirmLogoutAndLeave();
      break;
    default:
      break;
  }
}

function confirmLogoutAndLeave() {
  openModal('logoutModal');
}

function enterApp() {
  openStudentApp(state);
}

function leaveApp() {
  logout();
  switchAuthTab('login');
  setAuthMessage('লগআউট হয়েছে। আবার প্রবেশ করতে মোবাইল নম্বর ও PIN দিন।');
}

renderStudent(state.student);
initNavigation({ onAction: handleAction });
initModals({ onLogoutConfirm: leaveApp });
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
initAuth({
  state,
  onAuthenticated: enterApp,
  onDemo: () => {
    persistSession(false);
    enterApp();
    showFeedback('ডামি অ্যাকাউন্টে প্রবেশ করা হয়েছে');
  },
  onLogout: leaveApp
});

if (state.account && hasSession()) {
  state.student = { ...state.student, ...(state.account.student || {}) };
  saveStudent(state.student);
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
