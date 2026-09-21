/* Application composition root. Feature modules can be replaced independently. */
import { APP_TAGLINE } from './config.js';
import { loadStudent, loadAccount, hasSession, saveStudent } from './storage.js';
import { $, setAuthMessage, showFeedback } from './ui.js';
import { renderStudent, openStudentApp, showAuthScreen, logout, setView } from './shell.js';
import { switchAuthTab, initAuth } from './auth.js';
import { initNavigation } from './navigation.js';
import { initModals } from './modals.js';
import { initProfile, openProfileEditor, shareStudentOnWhatsApp } from './profile.js';
import { initRoutine } from './routine.js';
import { initInstallPrompt, installApp } from './install.js';
import { initConnectivity } from './connectivity.js';
import { registerServiceWorker } from './service-worker.js';

document.querySelector('[data-fixed-tagline]')?.setAttribute('aria-label', APP_TAGLINE);

const state = {
  student: loadStudent(),
  account: loadAccount(),
  registrationMode: 'self'
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
    default:
      break;
  }
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
initModals();
initProfile({
  state,
  onStudentChange: student => renderStudent(student)
});
initRoutine();
initConnectivity();
initInstallPrompt();
registerServiceWorker();
initAuth({
  state,
  onAuthenticated: enterApp,
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
