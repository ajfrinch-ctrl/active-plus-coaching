/* Login feature: one door for everyone.
   A student signs in with username/mobile + password and lands in the student app.
   Staff (admin, teacher, payment counter) sign in on the same form with their
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
  STAFF_ACCOUNTS, normalizeStaffUsername, authenticateStaff, saveStaffSession, resolveStaffRoleByUsername
} from './staff-auth.js';
import { openStaffPasswordDialog } from './staff-password-dialog.js';
import { isPasswordRecord } from './password-hash.js';

const STAFF_PANEL = Object.freeze({ admin: 'admin.html', manager: 'manager.html', teacher: 'teacher.html', payment: 'payment.html' });
const STAFF_LABEL = Object.freeze({ admin: 'এডমিন প্যানেল', manager: 'ম্যানেজার প্যানেল', teacher: 'শিক্ষক প্যানেল', payment: 'পেমেন্ট রিসিভ প্যানেল' });
const STAFF_ID_HINT = 'স্টাফ লগইন';
const DEFAULT_ID_HINT = 'শিক্ষার্থী: ইউজারনেম বা মোবাইল নম্বর ও পাসওয়ার্ড। শিক্ষক, এডমিন ও পেমেন্ট কাউন্টার: নিজের ইউজারনেম ও পাসওয়ার্ড দিয়ে এখানেই লগইন করুন।';

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
  if (known) paint(known);
  else resolveStaffRoleByUsername(value).then(paint).catch(() => paint(null));
}

async function enterStaffPanel(role, remember) {
  if (!(await saveStaffSession(role, remember))) {
    setAuthMessage('সেশন সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
    return;
  }
  setAuthMessage(`${STAFF_LABEL[role]}ে নেওয়া হচ্ছে…`, 'success');
  window.location.assign(staffPanelPath(role));
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

async function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');

  // Staff usernames are reserved, so a match here can only be that panel.
  const staffRole = await resolveStaffRoleByUsername(typedId);
  if (staffRole) {
    await handleStaffLogin(staffRole, typedId, pin);
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
}
