/* Login feature: username or mobile number + PIN. Staff desks have their own pages. */
import { $, $$, setAuthMessage, scrollToTop } from './ui.js';
import { contactNumber, isContactNumber, normalizeUsername } from './account-policy.js';
import { persistAccount, loadAccount, saveStudent, persistSession, setTrustedDevice, isSecurityCheckDisabled } from './storage.js';

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

function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');
  const username = normalizeUsername(typedId);
  const mobile = contactNumber(typedId);
  state.account = loadAccount() || state.account;
  if ((!username && !mobile) || pin.length < 4) {
    setAuthMessage('ইউজারনেম বা মোবাইল নম্বর এবং ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
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
    setAuthMessage('ইউজারনেম/মোবাইল নম্বর অথবা PIN সঠিক নয়। আবার চেষ্টা করুন।');
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
  $('#loginForm')?.addEventListener('submit', event => handleLogin(event, state, onAuthenticated));
}
