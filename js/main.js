/* Application composition root. Feature modules can be replaced independently.
   Updated: don't ask security check every time - auto-login for trusted devices. */
import { APP_TAGLINE } from './config.js';
import { loadStudent, loadAccount, hasSession, persistSession, saveStudent, clearSession, isSecurityCheckDisabled, isTrustedDevice, loadAppConfig } from './storage.js';
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
import { initFixedShell } from './fixed-shell.js';
import { initStudentExams } from './student-exams.js';
import { initStudentTeaching } from './student-teaching.js';

initFixedShell();

const appConfig = loadAppConfig();

function applyAppConfig(cfg) {
  if (!cfg) return;

  // 1. Tagline
  const taglineText = cfg.tagline || APP_TAGLINE;
  document.querySelectorAll('[data-fixed-tagline]').forEach(tagline => {
    tagline.setAttribute('aria-label', taglineText);
    tagline.textContent = taglineText;
  });

  // 3. Maintenance Mode
  if (cfg.maintenanceMode) {
    // 1. On Auth Screen: insert inside .auth-card safely below topbar
    let authMaintBanner = $('#authMaintenanceBanner');
    if (!authMaintBanner) {
      authMaintBanner = document.createElement('div');
      authMaintBanner.id = 'authMaintenanceBanner';
      authMaintBanner.className = 'maintenance-alert-card';
      const authCard = $('.auth-card');
      if (authCard) {
        authCard.prepend(authMaintBanner);
      }
    }
    authMaintBanner.innerHTML = `
      <div class="maint-icon">
        <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-shield"></use></svg>
      </div>
      <div class="maint-body">
        <strong>⚠️ সিস্টেম রক্ষণাবেক্ষণ চলছে</strong>
        <p>${cfg.maintenanceMessage || 'বর্তমানে অ্যাপটিতে সিস্টেম আপডেট ও রক্ষণাবেক্ষণের কাজ চলছে।'}</p>
      </div>
    `;
    authMaintBanner.hidden = false;

    // 2. On App Main Screen: insert inside #appMain safely below topbar
    let appMaintBanner = $('#appMainMaintenanceBanner');
    if (!appMaintBanner) {
      appMaintBanner = document.createElement('div');
      appMaintBanner.id = 'appMainMaintenanceBanner';
      appMaintBanner.className = 'maintenance-alert-card';
      const appMain = $('#appMain');
      if (appMain) {
        appMain.prepend(appMaintBanner);
      }
    }
    appMaintBanner.innerHTML = `
      <div class="maint-icon">
        <svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-shield"></use></svg>
      </div>
      <div class="maint-body">
        <strong>⚠️ সিস্টেম রক্ষণাবেক্ষণ চলছে</strong>
        <p>${cfg.maintenanceMessage || 'বর্তমানে অ্যাপটিতে সিস্টেম আপডেট ও রক্ষণাবেক্ষণের কাজ চলছে।'}</p>
      </div>
    `;
    appMaintBanner.hidden = false;
  } else {
    $('#authMaintenanceBanner')?.remove();
    $('#appMainMaintenanceBanner')?.remove();
    $('#appMaintenanceBanner')?.remove();
  }

  // 4. Registration Permission
  if (cfg.allowRegistration === false) {
    const regTab = $('[data-auth-tab="register"]');
    if (regTab) {
      regTab.disabled = true;
      regTab.style.opacity = '0.5';
      regTab.title = 'বর্তমানে নতুন রেজিস্ট্রেশন বন্ধ রয়েছে';
    }
  }

  // 5. Module Toggles
  if (cfg.modules) {
    if (cfg.modules.routine === false) {
      $('.bottom-link[data-view="routine"]')?.classList.add('disabled-nav');
    }
    if (cfg.modules.courses === false) {
      $('.bottom-link[data-view="courses"]')?.classList.add('disabled-nav');
    }
    if (cfg.modules.results === false) {
      $('.bottom-link[data-view="results"]')?.classList.add('disabled-nav');
    }
  }

  // 6. Theme Mode Override
  if (cfg.themeMode && cfg.themeMode !== 'auto') {
    document.documentElement.dataset.timeTheme = cfg.themeMode;
  }
}

applyAppConfig(appConfig);

const state = {
  student: loadStudent(),
  account: loadAccount()
};
const refreshExams = initStudentExams({ getStudent: () => state.student, getAccount: () => state.account });
const refreshTeaching = initStudentTeaching({ getStudent: () => state.student });

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
  refreshTeaching();
  refreshExams();
  refreshNotices();
}

function leaveApp() {
  clearSession();
  switchAuthTab('login');
  showAuthScreen();
  // Logout always lands on the login page itself — drop a leftover view hash too.
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  setAuthMessage('লগআউট হয়েছে। আবার প্রবেশ করতে মোবাইল নম্বর ও পাসওয়ার্ড দিন।');
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
  // This makes the app not ask পাসওয়ার্ড every launch
  return true;
}

renderStudent(state.student);
initNavigation({ onAction: handleAction });
const refreshNotices = initModals({ getStudent: () => state.student });
initProfile({
  state,
  onStudentChange: student => { renderStudent(student); refreshTeaching(); refreshExams(); }
});
initRoutine();
initConnectivity();
initDynamicTheme();
initInstallPrompt();
registerServiceWorker();
initLogin({
  state,
  onAuthenticated: enterApp
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
if (['home', 'routine', 'courses', 'results', 'profile', 'exams'].includes(hashView) && !$('#authScreen')?.hidden) {
  // Keep auth as the first screen; a shortcut is applied after login by the normal shell.
} else if (['home', 'routine', 'courses', 'results', 'profile', 'exams'].includes(hashView)) {
  setView(hashView);
}
