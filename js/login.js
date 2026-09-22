/* Login feature: mobile number + PIN verification and auth tab switching.
   Updated: long-lived session so security check isn't required every time. */
import { $, $$, setAuthMessage, scrollToTop } from './ui.js';
import { demoEnabled } from './demo-data.js';
import { defaultStudent, DEFAULT_PIN } from './config.js';
import { contactNumber } from './account-policy.js';
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
  const mobile = contactNumber(form.get('mobile'));
  state.account = loadAccount() || state.account;
  const pin = String(form.get('pin') || '');
  if (!mobile || pin.length < 4) {
    setAuthMessage('মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
    return;
  }
  if (!state.account && demoEnabled() && mobile === defaultStudent.studentMobile && pin === DEFAULT_PIN) {
    try { state.account = persistAccount(demoAccount()); }
    catch { setAuthMessage('ডেমো অ্যাকাউন্ট সংরক্ষণ হয়নি।'); return; }
  }
  if (!state.account) {
    setAuthMessage('এই ডিভাইসে কোনো অ্যাকাউন্ট নেই। আগে রেজিস্ট্রেশন করুন।');
    return;
  }
  if (mobile !== state.account.mobile || pin !== state.account.pin) {
    setAuthMessage('মোবাইল নম্বর অথবা PIN সঠিক নয়। আবার চেষ্টা করুন।');
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

function demoAccount() {
  return { mobile: defaultStudent.studentMobile, pin: DEFAULT_PIN, status: 'active', student: { ...defaultStudent }, securityQuestion: 'তোমার শৈশবের ডাকনাম কী?', securityAnswer: 'রাইসা', additionalMobiles: ['01900000000'], demoFixture: true };
}

function initDemoLogin(state, onDemo) {
  $('#demoLoginButton')?.addEventListener('click', () => {
    if (loadAccount()) return setAuthMessage('এই ডিভাইসে অ্যাকাউন্ট আছে। নিজের নিবন্ধিত নম্বর দিয়ে লগইন করুন।');
    const account = demoEnabled() ? demoAccount() : { mobile: '01700000000', pin: DEFAULT_PIN, status: 'active', student: { ...defaultStudent } };
    try { state.account = persistAccount(account); }
    catch { return setAuthMessage('ডেমো অ্যাকাউন্ট সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করুন।'); }
    state.student = { ...defaultStudent };
    onDemo?.();
  });
}

function initSkipSecurityToggle() {
  const checkbox = $('#skipSecurityCheck');
  if (!checkbox) return;
  checkbox.checked = isSecurityCheckDisabled();
  checkbox.addEventListener('change', () => {
    // This checkbox on login screen is just visual; actual toggle lives in profile
    // But we keep it in sync if present
  });
}

export function initLogin({ state, onAuthenticated, onDemo }) {
  initPinVisibility();
  initSkipSecurityToggle();
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    switchAuthTab(trigger.dataset.authTab);
  }));
  $('#loginForm')?.addEventListener('submit', event => handleLogin(event, state, onAuthenticated));
  initDemoLogin(state, onDemo);
}
