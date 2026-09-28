/* Login feature: one door for everyone.
   A student signs in with username/mobile + password and lands in the student app.
   Staff (admin, manager, teacher, payment counter) sign in on the same form with their
   reserved username + password; the session is written first, so the panel
   opens directly on arrival — no second credential prompt.

   Security (Phase 1): passwords are checked against PBKDF2 hashes, legacy
   plaintext records are upgraded on the spot, and a role that has never set a
   password — or whose password is due for a change — gets the shared staff
   password dialog before the panel opens. */

import { $, $$, setAuthMessage, scrollToTop } from './ui.js';
import { contactNumber, isContactNumber, normalizeUsername } from './account-policy.js';
import {
  loadAccount, saveStudent, persistSession, setTrustedDevice,
  isSecurityCheckDisabled, loadAppConfig, verifyAccountPassword, upgradeAccountSecrets
} from './storage.js';
import {
  STAFF_ACCOUNTS, STAFF_USERNAMES, normalizeStaffUsername, authenticateStaff,
  saveStaffSession, resolveStaffRoleByUsername, createInitialAdmin, staffAccountRecordExists
} from './staff-auth.js';
import { KEYS, readJSON } from './database.js';
import { openStaffPasswordDialog } from './staff-password-dialog.js';
import { authenticateDirectoryStaff, changeDirectoryStaffPassword, findDirectoryStaffByUsername } from './staff-directory.js';
import { generateLoginId } from './user-id.js';
import { isPasswordRecord } from './password-hash.js';

const STAFF_PANEL = Object.freeze({ admin: 'admin.html', manager: 'manager.html', teacher: 'teacher.html', payment: 'payment.html' });
const STAFF_LABEL = Object.freeze({ admin: 'এডমিন প্যানেল', manager: 'ম্যানেজার প্যানেল', teacher: 'শিক্ষক প্যানেল', payment: 'পেমেন্ট রিসিভ প্যানেল' });
const STAFF_ID_HINT = 'স্টাফ লগইন';
const DEFAULT_ID_HINT = 'শিক্ষার্থী: ইউজারনেম বা মোবাইল নম্বর ও পাসওয়ার্ড। এডমিন, ম্যানেজার, শিক্ষক ও পেমেন্ট কাউন্টার: নিজের ইউজারনেম ও পাসওয়ার্ড দিয়ে এখানেই লগইন করুন।';

export function staffRoleFor(value) {
  const typed = normalizeStaffUsername(value);
  if (!typed) return null;
  return Object.keys(STAFF_ACCOUNTS).find(role => STAFF_ACCOUNTS[role].username === typed) || null;
}

export function staffPanelPath(role) {
  return STAFF_PANEL[role] || '';
}

export function switchAuthTab(tab) {
  $$('[data-auth-tab]').forEach(trigger => {
    if (!trigger.classList.contains('auth-tab')) return;
    const active = trigger.dataset.authTab === tab;
    trigger.classList.toggle('active', active);
    trigger.setAttribute('aria-selected', String(active));
  });
  $$('[data-auth-panel]').forEach(panel => {
    const active = panel.dataset.authPanel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  setAuthMessage('');
  scrollToTop();
}

/* The same box takes a 4–6 digit student password or a staff password, so the
   keyboard and the hint follow what is being typed. */
let loginHintSequence = 0;
function syncLoginHints() {
  const idInput = $('#loginMobile');
  const pinInput = $('#loginPin');
  if (!idInput || !pinInput) return;
  const value = idInput.value;
  const sequence = ++loginHintSequence;
  const paint = role => {
    if (sequence !== loginHintSequence || idInput.value !== value) return;
    pinInput.setAttribute('inputmode', role ? 'text' : 'numeric');
    pinInput.setAttribute('placeholder', role ? 'পাসওয়ার্ড' : '৪–৬ সংখ্যার পাসওয়ার্ড');
    const hint = $('#loginHint');
    if (hint) {
      hint.textContent = role ? `${STAFF_ID_HINT} — ${STAFF_LABEL[role]}। নিজের পাসওয়ার্ড দিয়ে প্রবেশ করুন।` : DEFAULT_ID_HINT;
      hint.classList.toggle('is-staff', Boolean(role));
    }
  };
  const known = staffRoleFor(value);
  if (known) { paint(known); return; }
  resolveStaffRoleByUsername(value)
    .then(role => (role ? role : staffPanelRoleFor(value)))
    .then(paint)
    .catch(() => paint(null));
}

/* A username created in Staff Management is not one of the four fixed role
   names, so the panel it belongs to comes from the staff directory. */
async function staffPanelRoleFor(value) {
  try {
    const staff = await findDirectoryStaffByUsername(value);
    return staff ? staffRolePanelOf(staff) : null;
  } catch { return null; }
}

function staffRolePanelOf(staff) {
  const role = staff?.role;
  if (role === 'manager') return 'manager';
  if (role === 'teacher') return 'teacher';
  if (role === 'cash-counter') return 'payment';
  if (role === 'admin') return 'admin';
  return null; // "other" staff have no panel of their own yet
}

async function enterStaffPanel(role, remember) {
  if (!(await saveStaffSession(role, remember))) {
    setAuthMessage('সেশন সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
    return;
  }
  setAuthMessage(`${STAFF_LABEL[role]}ে নেওয়া হচ্ছে…`, 'success');
  window.location.replace(staffPanelPath(role));
}

async function handleStaffLogin(role, typedId, pin) {
  const result = await authenticateStaff(role, typedId, pin);
  if (!result.ok) {
    setAuthMessage(`${STAFF_LABEL[role]}র ইউজারনেম বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।`);
    return;
  }
  if (role === 'teacher' && loadAppConfig().allowTeacherRegistration === false) {
    setAuthMessage('শিক্ষক প্যানেল প্রবেশ এই মুহূর্তে এডমিন কর্তৃক বন্ধ রাখা হয়েছে।');
    return;
  }
  const remember = $('#rememberMe')?.checked !== false;
  if (result.needsSetup) {
    openStaffPasswordDialog({
      role,
      mode: 'setup',
      onDone: () => enterStaffPanel(role, remember),
      onCancel: () => setAuthMessage('প্রবেশের আগে একটি পাসওয়ার্ড নির্ধারণ করুন।')
    });
    return;
  }
  if (result.needsPasswordChange) {
    openStaffPasswordDialog({
      role,
      mode: 'change',
      onDone: () => enterStaffPanel(role, remember),
      onCancel: () => setAuthMessage('নিরাপত্তার জন্য নতুন পাসওয়ার্ড নির্ধারণ করা বাধ্যতামূলক।')
    });
    return;
  }
  await enterStaffPanel(role, remember);
}

/* A staff identity created in Staff Management: same password rules, same
   forced-change flow, and a deactivated account simply cannot get in. */
async function handleDirectoryStaffLogin(directory, remember) {
  const { staff, mustChangePassword } = directory;
  const role = staffRolePanelOf(staff);
  if (!role) {
    setAuthMessage('এই স্টাফ অ্যাকাউন্টের জন্য এই ডিভাইসে কোনো প্যানেল নির্ধারিত নয়।');
    return;
  }
  if (role === 'teacher' && loadAppConfig().allowTeacherRegistration === false) {
    setAuthMessage('শিক্ষক প্যানেল প্রবেশ এই মুহূর্তে এডমিন কর্তৃক বন্ধ রাখা হয়েছে।');
    return;
  }
  if (mustChangePassword) {
    openStaffPasswordDialog({
      role,
      mode: 'change',
      onSubmit: (next, confirm) => changeDirectoryStaffPassword(staff.staffId, $('#loginPin').value, next, confirm),
      onDone: () => enterStaffPanel(role, remember),
      onCancel: () => setAuthMessage('নিরাপত্তার জন্য নতুন পাসওয়ার্ড নির্ধারণ করা বাধ্যতামূলক।')
    });
    return;
  }
  await enterStaffPanel(role, remember);
}

async function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');

  // Staff credentials are shared across devices through the optional online bridge.
  // Hydrate before resolving the role so a newly-created Admin can sign in on a second device.
  if (navigator.onLine && typedId) {
    try {
      const { hydrateStaffAccounts } = await import('./realtime-sync.js?v=20260928-1731');
      await hydrateStaffAccounts();
    } catch (error) {
      console.warn('[Active Plus] staff account sync unavailable during login:', error);
    }
  }
  // Staff usernames are reserved, so a match here can only be that panel.
  const staffRole = await resolveStaffRoleByUsername(typedId);
  if (staffRole) {
    await handleStaffLogin(staffRole, typedId, pin);
    return;
  }
  // A Staff ID identity created from Admin → Staff Management.
  const directory = await authenticateDirectoryStaff(typedId, pin);
  if (directory.ok) {
    await handleDirectoryStaffLogin(directory, $('#rememberMe')?.checked !== false);
    return;
  }
  if (directory.code === 'INACTIVE') {
    setAuthMessage(directory.error || 'এই স্টাফ অ্যাকাউন্টটি নিষ্ক্রিয়।');
    return;
  }
  // The username belongs to a Staff Management account, so a wrong password is
  // a staff error — it must not fall through to the student path.
  if (directory.code === 'WRONG_PASSWORD') {
    setAuthMessage('স্টাফ ইউজারনেম বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
    return;
  }

  const username = normalizeUsername(typedId);
  const mobile = contactNumber(typedId);
  state.account = loadAccount() || state.account;
  if ((!username && !mobile) || pin.length < 4) {
    setAuthMessage('ইউজারনেম বা মোবাইল নম্বর এবং ৪–৬ সংখ্যার পাসওয়ার্ড সঠিকভাবে দিন।');
    return;
  }
  if (!state.account) {
    setAuthMessage('এই ডিভাইসে কোনো অ্যাকাউন্ট নেই। আগে রেজিস্ট্রেশন করুন।');
    return;
  }
  const knownUsername = normalizeUsername(state.account.username || state.account.student?.username || '');
  const byUsername = Boolean(username) && Boolean(knownUsername) && username === knownUsername;
  const byMobile = isContactNumber(mobile) && mobile === (state.account.registrationMobile || state.account.mobile);
  if (!byUsername && !byMobile) {
    setAuthMessage('ইউজারনেম/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
    return;
  }
  if (!(await verifyAccountPassword(state.account, pin))) {
    setAuthMessage('ইউজারনেম/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
    return;
  }
  // A plaintext record from the retired scheme is replaced by a hash now that
  // the password has been proven correct.
  if (!isPasswordRecord(state.account.pinHash)) {
    state.account = await upgradeAccountSecrets(state.account, { pin }) || state.account;
  }
  state.student = { ...state.student, ...(state.account.student || {}) };
  saveStudent(state.student);
  const remember = $('#rememberMe')?.checked !== false;
  await persistSession(remember);
  if (remember) setTrustedDevice(true);
  onAuthenticated?.();
}

function initPinVisibility() {
  $$('[data-toggle-pin]').forEach(button => {
    button.addEventListener('click', () => {
      const input = $(`#${button.dataset.togglePin}`);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

function initSkipSecurityToggle() {
  const checkbox = $('#skipSecurityCheck');
  if (!checkbox) return;
  checkbox.checked = isSecurityCheckDisabled();
}

export function initLogin({ state, onAuthenticated }) {
  initPinVisibility();
  initSkipSecurityToggle();
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    switchAuthTab(trigger.dataset.authTab);
  }));
  $('#loginMobile')?.addEventListener('input', syncLoginHints);
  syncLoginHints();
  $('#loginForm')?.addEventListener('submit', event => handleLogin(event, state, onAuthenticated));
  initFirstAdminSetup();
}

/* ---------------------------------------------------------------------------
   First use only — "Admin Count = 0" opens the one-time Admin Account form.

   The gate is the stored Admin record itself, not a flag: while no Admin
   account exists the option is on the login page, and the moment one is
   created the panel and its trigger are REMOVED from the DOM. Even a direct
   console call to createInitialAdmin() is refused by js/staff-auth.js, which
   re-checks the same record before writing anything.
   ------------------------------------------------------------------------- */

let firstAdminState = { available: false, preview: '' };

/** Every username already claimed on this device (case-insensitive compare). */
function claimedUsernames() {
  const index = readJSON(KEYS.usernames, {}) || {};
  return [...Object.keys(index), ...STAFF_USERNAMES];
}

/** Live preview: the id the form will create for the typed name. */
function renderFirstAdminPreview() {
  const name = $('#firstAdminName')?.value || '';
  const box = $('#firstAdminIdPreview');
  if (!box) return;
  if (!String(name).trim()) {
    box.textContent = '—';
    box.dataset.value = '';
    firstAdminState.preview = '';
    return;
  }
  const id = generateLoginId({ fullName: name, role: 'admin', taken: claimedUsernames() });
  box.textContent = id;
  box.dataset.value = id;
  firstAdminState.preview = id;
}

async function lockFirstAdminSetup(reason = '') {
  firstAdminState.available = false;
  // Removed, not hidden: no second first-use workflow can be reached from here.
  $('#firstAdminPanel')?.remove();
  $('#firstAdminFootnote')?.remove();
  $('#openFirstAdmin')?.remove();
  if (reason) setAuthMessage(reason, 'success');
}

async function initFirstAdminSetup() {
  const panel = $('#firstAdminPanel');
  if (!panel) return;                       // page carries no first-use form
  if (await staffAccountRecordExists('admin')) {
    await lockFirstAdminSetup();             // Admin Count >= 1 → never offered
    return;
  }
  firstAdminState.available = true;
  const footnote = $('#firstAdminFootnote');
  if (footnote) footnote.hidden = false;
  $('#firstAdminName')?.addEventListener('input', renderFirstAdminPreview);
  renderFirstAdminPreview();
  $('#firstAdminForm')?.addEventListener('submit', handleFirstAdminSubmit);
}

async function handleFirstAdminSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const error = $('#firstAdminError');
  const data = new FormData(form);
  const showError = message => {
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  };
  showError('');
  // Re-check at submit time too: a second tab may have created the Admin.
  if (await staffAccountRecordExists('admin')) {
    await lockFirstAdminSetup('প্রথম Admin Account ইতিমধ্যে তৈরি হয়েছে — এখন লগইন করুন।');
    switchAuthTab('login');
    return;
  }
  if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  try {
    const result = await createInitialAdmin({
      fullName: data.get('fullName'),
      mobile: data.get('mobile'),
      email: data.get('email'),
      password: data.get('password'),
      confirmPassword: data.get('confirmPassword')
    });
    if (!result.ok) {
      showError(result.error || 'Admin Account তৈরি করা যায়নি।');
      return;
    }
    const id = result.account.username;
    form.reset();
    // The workflow is over for good: remove it, then hand the id to the form.
    await lockFirstAdminSetup();
    switchAuthTab('login');
    const idInput = $('#loginMobile');
    if (idInput) idInput.value = id;
    const pinInput = $('#loginPin');
    if (pinInput) pinInput.value = String(data.get('password') || '');
    setAuthMessage(`Admin Account তৈরি হয়েছে। আপনার User ID: ${id} — এখন লগইন করুন।`, 'success');
    pinInput?.focus?.({ preventScroll: true });
  } catch {
    showError('Account সংরক্ষণ করা যায়নি। স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
  } finally {
    if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  }
}
