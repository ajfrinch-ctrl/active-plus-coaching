import { iconMarkup } from './icons.js';
/* Application composition root. Feature modules can be replaced independently. */
import { runMigrations } from './storage/migration.js';
import { KEYS, listDocuments } from './database.js';
import { syncAccountStatus } from './office-data.js';
import { APP_TAGLINE, defaultStudent } from './config.js';
import { loadStudent, loadAccount, hasSession, saveStudent, clearSession, loadAppConfig } from './storage.js';
import { escapeHtml } from './sanitize.js';
import { $, setAuthMessage, showFeedback } from './ui.js';
import { renderStudent, openStudentApp, showAuthScreen, setView, viewRouteFromHash } from './shell.js';
import { initAppearance } from './appearance.js';
import { initCopyChips } from './copy.js';
import { activeStaffRoles } from './staff-auth.js';
import { staffPanelPath } from './login.js';
import { switchAuthTab, initLogin } from './login.js';
import { initRegister } from './register.js';
import { initRecovery } from './recovery.js';
import { requestLogout, initLogout } from './logout.js';
import { initNavigation } from './navigation.js';
import { initProfile, openProfileEditor, shareStudentOnWhatsApp } from './profile.js';
import { initRoutine } from './routine.js';
import { initInstallPrompt, installApp } from './install.js';
import { initConnectivity } from './connectivity.js';
import { registerServiceWorker } from './service-worker.js';
import { initDynamicTheme } from './theme.js';
import { initFixedShell } from './fixed-shell.js';
import { initStudentExams } from './student-exams.js';
import { initStudentTeaching } from './student-teaching.js';
import { initStudentDashboard } from './student-dashboard.js';
import { mountReports, refreshReports } from './reports.js';

/* Always reveal the login shell before optional startup work. A failure in any
   secondary feature must never leave the entry page completely blank. */
showAuthScreen();
switchAuthTab('login');

initFixedShell();
runMigrations();

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
        ${iconMarkup("shield")}
      </div>
      <div class="maint-body">
        <strong>⚠️ সিস্টেম রক্ষণাবেক্ষণ চলছে</strong>
        <p>${escapeHtml(cfg.maintenanceMessage) || 'বর্তমানে অ্যাপটিতে সিস্টেম আপডেট ও রক্ষণাবেক্ষণের কাজ চলছে।'}</p>
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
        ${iconMarkup("shield")}
      </div>
      <div class="maint-body">
        <strong>⚠️ সিস্টেম রক্ষণাবেক্ষণ চলছে</strong>
        <p>${escapeHtml(cfg.maintenanceMessage) || 'বর্তমানে অ্যাপটিতে সিস্টেম আপডেট ও রক্ষণাবেক্ষণের কাজ চলছে।'}</p>
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
const refreshDashboard = initStudentDashboard({ getStudent: () => state.student, getAccount: () => state.account });

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
  // A completed login wins over an in-flight asynchronous session restore.
  sessionRestoreSequence += 1;
  // A #view shortcut in the URL opens exactly that view after any login;
  // otherwise every login lands on Home. A leftover panel from a previous
  // session must never greet the student.
  setView(viewRouteFromHash(), { history: 'replace' });
  openStudentApp(state);
  refreshDashboard();
  refreshTeaching();
  refreshExams();
  refreshNotices();
  window.dispatchEvent(new Event('apc-session-ready'));
  // A student's reports are their own: the module re-reads the signed-in id.
  mountReports($('#studentReports'), { panel: 'student' });
}

function leaveApp() {
  sessionRestoreSequence += 1;
  clearSession();
  window.dispatchEvent(new Event('apc-session-ended'));
  switchAuthTab('login');
  showAuthScreen();
  // Logout always lands on the login page itself — drop a leftover view hash too.
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  setAuthMessage('লগআউট হয়েছে। আবার প্রবেশ করতে মোবাইল নম্বর ও পাসওয়ার্ড দিন।');
}

/* A remembered, device-bound session is the only way to restore the app
   without retyping credentials. An account or legacy skip flag is not enough. */
async function shouldAutoLogin() {
  if (!state.account) return false;
  return hasSession();
}

renderStudent(state.student);
initNavigation({ onAction: handleAction });
/* The bell and its inbox are owned by the notification engine
   (js/notifications.js) so every panel shares one receipt list. */
const refreshNotices = () => window.apcNoticeCenter?.paint?.();
initProfile({
  state,
  onStudentChange: student => { renderStudent(student); refreshTeaching(); refreshExams(); refreshReports($('#studentReports')); }
});
initRoutine();
initConnectivity();
// Firebase is optional during online testing; offline startup remains independent.
// The connection smoke test is diagnostic-only and costs an extra SDK download,
// so it runs only when explicitly asked (index.html?fbtest=1) — never on a
// normal boot, and never as an unhandled rejection that can take the page down.
if (navigator.onLine && new URLSearchParams(location.search).get('fbtest') === '1') {
  import('./firebase-online-test.js?v=20260929-fbaudit')
    .then(({ testFirebaseOnlineConnection }) => testFirebaseOnlineConnection())
    .catch(() => {});
}
initDynamicTheme();
initAppearance();
initCopyChips();
initInstallPrompt();
registerServiceWorker();
initLogin({
  state,
  onAuthenticated: enterApp
});
initRegister({ state });
initRecovery({ state });
initLogout({ onLoggedOut: leaveApp });

// Pending-account screen is the only other place a student can leave the app.
$('#pendingLogout')?.addEventListener('click', leaveApp);

// The entry decision is asynchronous: the stored session may be encrypted.
// A #view shortcut in the URL is applied by enterApp once the screen opens.
let sessionRestoreSequence = 0;
async function restoreEntrySession() {
  const sequence = ++sessionRestoreSequence;
  const roles = await activeStaffRoles();
  if (sequence !== sessionRestoreSequence) return;
  if (roles.length) {
    window.location.replace(staffPanelPath(roles[0]));
    return;
  }
  state.account = loadAccount();
  const authenticated = await shouldAutoLogin();
  if (sequence !== sessionRestoreSequence) return;
  if (authenticated) {
    state.student = { ...state.student, ...(state.account.student || {}) };
    saveStudent(state.student);
    if (sequence !== sessionRestoreSequence) return;
    enterApp();
  } else {
    window.dispatchEvent(new Event('apc-session-ended'));
    showAuthScreen();
    switchAuthTab('login');
  }
}
window.addEventListener('popstate', () => { void restoreEntrySession(); });
/* The open student page lives in the URL hash, so a refresh reopens it. A hash
   edited (or a link opened) while the app is already on screen follows here. */
window.addEventListener('hashchange', () => {
  if ($('#appShell')?.hidden !== false) return;
  if ($('#appShell')?.classList.contains('is-pending')) return;
  setView(viewRouteFromHash(), { history: 'keep' });
});
// Back/forward cache restores an old DOM without running module startup again.
window.addEventListener('pageshow', event => {
  if (event.persisted) void restoreEntrySession();
});
void restoreEntrySession();

// Cloud writes occur in this window; native storage events alone never fire here.
window.addEventListener('storage', async event => {
  if (!event.apcRemote) return;
  try {
    if (event.key === KEYS.students) {
      const account = loadAccount();
      const id = account?.student?.id || account?.studentId;
      const roster = listDocuments('students').find(student => student.id === id);
      const status = roster?.status === 'approved' ? 'active' : roster?.status;
      if (roster && status !== account?.status) {
        await syncAccountStatus(id, roster.status);
        state.account = loadAccount();
      }
    }
    if (event.key === KEYS.account) {
      state.account = loadAccount();
      if (state.account?.student) {
        state.student = { ...defaultStudent, ...state.account.student };
        saveStudent(state.student);
        renderStudent(state.student);
      }
    }
    if (!$('#appShell').hidden) openStudentApp(state);
    refreshDashboard();
    refreshTeaching();
    refreshExams();
    refreshNotices();
    refreshReports($('#studentReports'));
  } catch (error) {
    console.warn('[Active Plus] cloud refresh failed:', error?.message);
  }
});
