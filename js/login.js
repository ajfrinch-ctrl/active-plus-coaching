/* Login feature: one door for everyone.
   A student signs in with username/mobile + password and lands in the student app.
   Staff (admin, manager, teacher, payment counter) sign in on the same form with their
   reserved username + password; the session is written first, so the panel
   opens directly on arrival — no second credential prompt.

   Security (Phase 1): passwords are checked against PBKDF2 hashes, legacy
   plaintext records are upgraded on the spot, and a role that has never set a
   password — or whose password is due for a change — gets the shared staff
   password dialog before the panel opens. */

import { defaultStudent } from './config.js';
import { $, $$, setAuthMessage, scrollToTop, toBanglaNumber } from './ui.js';
import { contactNumber, normalizeUsername } from './account-policy.js';
import { matchesLoginIdentifier, studentIdOf } from './sync-merge.js';
import {
  loadAccount, saveStudent, persistSession, setTrustedDevice,
  isSecurityCheckDisabled, loadAppConfig, verifyAccountPassword, upgradeAccountSecrets
} from './storage.js';
import {
  STAFF_ACCOUNTS, STAFF_USERNAMES, normalizeStaffUsername, authenticateStaff,
  saveStaffSession, resolveStaffRoleByUsername, createInitialAdmin, staffAccountRecordExists,
  activeStaffRoles
} from './staff-auth.js';
import { KEYS, readJSON } from './database.js';
import { mountPanelSwitch } from './panel-switch.js';
import { openStaffPasswordDialog } from './staff-password-dialog.js';
import { authenticateDirectoryStaff, changeDirectoryStaffPassword, findDirectoryStaffByUsername } from './staff-directory.js';
import { generateLoginId } from './user-id.js';
import { isPasswordRecord } from './password-hash.js';

const STAFF_PANEL = Object.freeze({ admin: 'admin.html', manager: 'manager.html', teacher: 'teacher.html', payment: 'payment.html' });
const STAFF_LABEL = Object.freeze({ admin: 'এডমিন প্যানেল', manager: 'ম্যানেজার প্যানেল', teacher: 'শিক্ষক প্যানেল', payment: 'পেমেন্ট রিসিভ প্যানেল' });
const STAFF_ID_HINT = 'স্টাফ লগইন';
const DEFAULT_ID_HINT = 'শিক্ষার্থী: লগইন সবসময় নিজের ইউজারনেম দিয়েই (চাইলে মোবাইল নম্বর বা প্রোফাইলের Student ID-ও চলবে) — সাথে নিজের পাসওয়ার্ড। এডমিন, ম্যানেজার, শিক্ষক ও পেমেন্ট কাউন্টার: নিজের ইউজারনেম ও পাসওয়ার্ড দিয়ে এখানেই লগইন করুন — একই ডিভাইসে প্যানেল বদলাতে আগে লগআউট করার দরকার নেই।';

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

/* Switching is deliberate and password-gated: the target role's own credentials
   were just verified, and the session they replace is named out loud. No logout
   step is needed, and no tap alone can move this device to another panel. */
async function enterStaffPanel(role, remember) {
  const previous = (await activeStaffRoles()).filter(name => name !== role);
  if (!(await saveStaffSession(role, remember))) {
    setAuthMessage('সেশন সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
    return;
  }
  const switched = previous.length
    ? ` — এই ডিভাইসের আগের ${STAFF_LABEL[previous[0]] || 'প্যানেল'} সেশনটি বন্ধ হয়েছে`
    : '';
  setAuthMessage(`${STAFF_LABEL[role]}ে নেওয়া হচ্ছে…${switched}`, 'success');
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

/* The online bridge is an optional convenience, never a gate. localStorage is
   the source of truth on this device, so a CDN that is slow, blocked or simply
   unreachable (school network, ad blocker, captive portal) must never hold the
   login button hostage: the import and the hydrate each get a short budget and
   the device's own records are used either way. */
const ONLINE_BRIDGE_BUDGET_MS = 2500;
/* The identity hydrate pays for the CDN import, anonymous sign-in and the cloud
   reads in one go, so on a slow mobile network 2.5s cuts the first cross-device
   login short — the account that exists on the other phone would then be
   reported as "not on this device". A wider budget only extends this one wait;
   login still proceeds either way. */
const LOGIN_IDENTITY_BUDGET_MS = 8000;

function withinBudget(promise, what, budget = ONLINE_BRIDGE_BUDGET_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out`)), budget);
    })
  ]).finally(() => clearTimeout(timer));
}

async function hydrateStaffAccountsOnline(what) {
  if (!navigator.onLine) return;
  try {
    const bridge = await withinBudget(import('./realtime-sync.js?v=20260929-fbaudit'), 'online bridge import');
    await withinBudget(bridge.hydrateStaffAccounts({ preserveLocalAdmin: staffAccountRecordExists('admin') }), 'online bridge hydrate');
  } catch (error) {
    console.warn(`[Active Plus] staff account sync unavailable during ${what}:`, error.message);
  }
}

/* Login User IDs created on another device (Staff Directory, the claimed-id
   registry and the student login) are pulled in here, so the same ID and
   password sign in on this phone. Records this device already has are left
   untouched — they stay the authoritative credentials on it.
   Returns true only when the cloud lookup ran and finished; false when the
   device is offline, the budget ran out, or the cloud refused the request. */
async function hydrateUserIdentifiersOnline(what, identifier = '', password = '') {
  if (!navigator.onLine) return false;
  try {
    const bridge = await withinBudget(import('./realtime-sync.js?v=20260929-fbaudit'), 'online identity import', LOGIN_IDENTITY_BUDGET_MS);
    const result = await withinBudget(bridge.hydrateUserIdentifiers({ identifier, password }), 'online identity hydrate', LOGIN_IDENTITY_BUDGET_MS);
    return result;
  } catch (error) {
    console.warn(`[Active Plus] user id sync unavailable during ${what}:`, error.message);
    return false;
  }
}

/** The identifier belongs to this device's account: User ID, mobile, the full
    Student ID, or its short prefix. */
function isOwnIdentifier(account, identifier) {
  if (matchesLoginIdentifier(account, identifier)) return true;
  const typed = normalizeUsername(identifier);
  const id = studentIdOf(account);
  return /^s\d{6}/.test(typed) && Boolean(id) && id.startsWith(typed);
}

async function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');

  // Staff credentials are shared across devices through the optional online bridge.
  // Hydrate before resolving the role so a newly-created Admin can sign in on a second device.
  // `onlineIdentities` remembers whether that cloud lookup actually finished,
  // so a missing account later reports the real cause instead of blaming the device.
  const onlineIdentities = { attempted: false, synced: true, cloudPasswordMismatch: false };
  if (navigator.onLine && typedId) {
    onlineIdentities.attempted = true;
    // Staff accounts and student logins live on different cloud paths, so both
    // lookups run together instead of one waiting for the other.
    const [, identities] = await Promise.all([
      // Never re-hydrate an existing local Admin record during a normal
      // logout/login cycle. Logout removes only the session; the local account
      // remains the authoritative credential on this device.
      hydrateStaffAccountsOnline('login'),
      // Login IDs created on other devices: directory accounts, the claimed-id
      // registry and the student login (a verified password is required before
      // anything is written to this device).
      hydrateUserIdentifiersOnline('login', typedId, pin)
    ]);
    onlineIdentities.synced = Boolean(identities?.ok);
    // A cloud copy whose password does not match must never block a valid
    // local credential: this device's account can be the newer one.
    onlineIdentities.cloudPasswordMismatch = Boolean(identities?.found && identities?.credentialMismatch);
    // "s260929001" matched more than one student in the cloud.
    onlineIdentities.ambiguous = Boolean(identities?.ambiguous);
    onlineIdentities.cloudAccounts = identities?.cloudAccounts ?? null;
    onlineIdentities.similar = Array.isArray(identities?.similar) ? identities.similar : [];
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
    setAuthMessage('ইউজারনেম, মোবাইল নম্বর বা Student ID এবং ৪–৬ সংখ্যার পাসওয়ার্ড সঠিকভাবে দিন।');
    return;
  }
  if (!state.account) {
    if (onlineIdentities.ambiguous) {
      setAuthMessage('এই সংক্ষিপ্ত Student ID দিয়ে একাধিক শিক্ষার্থী পাওয়া গেছে — সম্পূর্ণ Student ID লিখুন।');
    } else if (onlineIdentities.cloudPasswordMismatch) {
      setAuthMessage('ইউজারনেম, মোবাইল নম্বর বা Student ID অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
    } else if (onlineIdentities.attempted && !onlineIdentities.synced) {
      // The cloud lookup itself failed (offline, timed out or refused — e.g.
      // App Check enforcement blocking the Realtime Database). An account that
      // lives on another phone would make "register first" a false message.
      setAuthMessage('ক্লাউড থেকে অ্যাকাউন্ট আনা যায়নি। ইন্টারনেট ও Firebase সিঙ্ক পরীক্ষা করে আবার লগইন করুন। আগে অ্যাকাউন্ট তৈরি করে থাকলে নতুন করে রেজিস্ট্রেশন করবেন না।');
    } else if (!navigator.onLine) {
      setAuthMessage('এই ডিভাইসে অ্যাকাউন্ট সংরক্ষিত নেই। অন্য ডিভাইসে তৈরি অ্যাকাউন্টে প্রথমবার লগইন করতে ইন্টারনেট চালু করুন।');
    } else {
      // The username is the login ID: say so once, so a student who typed a
      // name or a guardian's number knows exactly what to type.
      const similar = onlineIdentities.similar.length
        ? ` ক্লাউডে মিলে যেতে পারে: ${onlineIdentities.similar.join(', ')}।`
        : '';
      if (onlineIdentities.attempted && onlineIdentities.cloudAccounts === 0) {
        // The cloud is reachable but holds no student login at all: the device
        // that has the account never uploaded it.
        setAuthMessage('ক্লাউডে এখনো কোনো শিক্ষার্থী অ্যাকাউন্ট ওঠেনি। যে ডিভাইসে অ্যাকাউন্টটি আছে সেখানে অ্যাপ অনলাইনে খুলে সিঙ্ক চালু করুন (উপরে সবুজ/নীল সিঙ্ক চিহ্ন), তারপর এখানে আবার চেষ্টা করুন।');
      } else if (onlineIdentities.attempted && onlineIdentities.cloudAccounts > 0) {
        setAuthMessage(`ক্লাউডে ${toBanglaNumber(onlineIdentities.cloudAccounts)}টি শিক্ষার্থী অ্যাকাউন্ট আছে, কিন্তু “${typedId}” দিয়ে কিছু পাওয়া যায়নি।${similar} নামের বানান মিলিয়ে দেখুন; না মিললে যে ডিভাইসে অ্যাকাউন্টটি আছে সেখানে অ্যাপ অনলাইনে খুলুন।`);
      } else {
        setAuthMessage('অ্যাকাউন্ট পাওয়া যায়নি। আগে অন্য ডিভাইসে তৈরি করে থাকলে সেই ডিভাইসে অ্যাপ অনলাইনে খুলে সিঙ্ক সম্পন্ন করুন, তারপর এখানে আবার চেষ্টা করুন।');
      }
    }
    return;
  }
  // What the student may type: the login User ID, the mobile number used at
  // registration, or the permanent Student ID from the profile. A Student ID
  // without its random suffix ("s260929001") is accepted for this device's own
  // account, so nobody has to read out the long tail.
  if (!isOwnIdentifier(state.account, typedId)) {
    // The record is here: naming it turns a typo into a one-second fix.
    const knownId = state.account.username || state.account.student?.username || '';
    const knownStudentId = studentIdOf(state.account);
    const known = [knownId, knownStudentId].filter(Boolean).join(' / ');
    setAuthMessage(`ইউজারনেম, মোবাইল নম্বর বা Student ID অথবা পাসওয়ার্ড সঠিক নয়। এই ডিভাইসের আইডি: ${known || '—'}`);
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
  state.student = { ...defaultStudent, ...(state.account.student || {}) };
  saveStudent(state.student);
  const remember = $('#rememberMe')?.checked !== false;
  await persistSession(remember);
  if (remember) setTrustedDevice(true);
  // Lets the sync bridge fetch this student's exam/result data in the background.
  window.dispatchEvent(new Event('apc-student-login'));
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
  // The strip that lets this device change panels without a logout step.
  void mountPanelSwitch();
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

  // On a new device the Admin record may exist only in Firebase at first.
  // Hydrate staff accounts before deciding whether the one-time setup is
  // available, so a real Admin account is never shown as "Create Admin".
  await hydrateStaffAccountsOnline('first-use check');
  await hydrateUserIdentifiersOnline('first-use check');

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
