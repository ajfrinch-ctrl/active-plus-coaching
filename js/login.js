/* Login feature: one door for everyone.
   A student signs in with username/mobile + password and lands in the student app.
   Staff (admin, teacher, payment counter) sign in on the same form with their
   reserved username + password; the session is written first, so the panel
   opens directly on arrival — no second credential prompt. */
import { $, $$, setAuthMessage, scrollToTop } from './ui.js';
import { contactNumber, isContactNumber, normalizeUsername } from './account-policy.js';
import { persistAccount, loadAccount, saveStudent, persistSession, setTrustedDevice, isSecurityCheckDisabled, loadAppConfig } from './storage.js';
import { STAFF_ACCOUNTS, normalizeStaffUsername, verifyStaffCredentials, saveStaffSession } from './staff-auth.js';

const STAFF_PANEL = Object.freeze({ admin: 'admin.html', teacher: 'teacher.html', payment: 'payment.html' });
const STAFF_LABEL = Object.freeze({ admin: 'এডমিন প্যানেল', teacher: 'শিক্ষক প্যানেল', payment: 'পেমেন্ট রিসিভ প্যানেল' });
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
function syncLoginHints() {
  const idInput = $('#loginMobile');
  const pinInput = $('#loginPin');
  if (!idInput || !pinInput) return;
  const role = staffRoleFor(idInput.value);
  pinInput.setAttribute('inputmode', role ? 'text' : 'numeric');
  pinInput.setAttribute('placeholder', role ? 'পাসওয়ার্ড' : '৪–৬ সংখ্যার পাসওয়ার্ড');
  const hint = $('#loginHint');
  if (hint) {
    hint.textContent = role
      ? `${STAFF_ID_HINT} — ${STAFF_LABEL[role]}। নিজের পাসওয়ার্ড দিয়ে প্রবেশ করুন।`
      : DEFAULT_ID_HINT;
    hint.classList.toggle('is-staff', Boolean(role));
  }
}

function handleStaffLogin(role, typedId, pin) {
  if (!verifyStaffCredentials(role, typedId, pin)) {
    setAuthMessage(`${STAFF_LABEL[role]}র ইউজারনেম বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।`);
    return true;
  }
  if (role === 'teacher' && loadAppConfig().allowTeacherRegistration === false) {
    setAuthMessage('শিক্ষক প্যানেল প্রবেশ এই মুহূর্তে এডমিন কর্তৃক বন্ধ রাখা হয়েছে।');
    return true;
  }
  const remember = $('#rememberMe')?.checked !== false;
  if (!saveStaffSession(role, remember)) {
    setAuthMessage('সেশন সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।');
    return true;
  }
  setAuthMessage(`${STAFF_LABEL[role]}ে নেওয়া হচ্ছে…`, 'success');
  window.location.assign(staffPanelPath(role));
  return true;
}

function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');

  // Staff usernames are reserved, so a match here can only be that panel.
  const staffRole = staffRoleFor(typedId);
  if (staffRole) {
    handleStaffLogin(staffRole, typedId, pin);
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
  if ((!byUsername && !byMobile) || pin !== state.account.pin) {
    setAuthMessage('ইউজারনেম/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
    return;
  }
  state.student = { ...state.student, ...(state.account.student || {}) };
  saveStudent(state.student);
  const remember = $('#rememberMe')?.checked !== false;
  persistSession(remember);
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
