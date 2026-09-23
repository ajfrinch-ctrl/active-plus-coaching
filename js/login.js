/* Login feature: mobile number + PIN verification and auth tab switching.
   Updated: long-lived session so security check isn't required every time.
   The payment counter can also sign in from here — typing the counter user ID
   (APC-PAY-001) + PIN in either the student form or the “পেমেন্ট কাউন্টার” tab
   hands the session to payment.html, which opens straight onto the desk. */
import { $, $$, setAuthMessage, scrollToTop } from './ui.js';
import { demoEnabled } from './demo-data.js';
import { defaultStudent, DEFAULT_PIN } from './config.js';
import { contactNumber, isContactNumber, normalizeUsername } from './account-policy.js';
import { persistAccount, loadAccount, saveStudent, persistSession, setTrustedDevice, isSecurityCheckDisabled } from './storage.js';
import {
  PAYMENT_USER_ID,
  DEFAULT_PAYMENT_PIN,
  PAYMENT_PORTAL_PATH,
  loadPaymentAccount,
  isPaymentUserId,
  verifyPaymentCredentials,
  savePaymentSession
} from './payment-auth.js';

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

/* Hand the counter session to payment.html; that page skips its own entry form. */
function enterPaymentPortal(remember) {
  savePaymentSession(remember);
  window.location.assign(PAYMENT_PORTAL_PATH);
}

function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const typedId = String(form.get('mobile') || '').trim();
  const pin = String(form.get('pin') || '');
  // Counter shortcut: the payment portal user ID typed in the student form
  // auto-logs into the payment desk instead of failing as a bad mobile number.
  if (isPaymentUserId(typedId)) {
    if (verifyPaymentCredentials(typedId, pin)) {
      enterPaymentPortal($('#rememberMe')?.checked !== false);
      return;
    }
    setAuthMessage('পেমেন্ট পোর্টালের ইউসার আইডি বা PIN সঠিক নয়। শিক্ষার্থী লগইনের জন্য ইউজারনেম বা মোবাইল নম্বর দিন।');
    return;
  }
  // A student signs in with either the permanent username or the mobile number.
  const username = normalizeUsername(typedId);
  const mobile = contactNumber(typedId);
  state.account = loadAccount() || state.account;
  if ((!username && !mobile) || pin.length < 4) {
    setAuthMessage('ইউজারনেম বা মোবাইল নম্বর এবং ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
    return;
  }
  if (!state.account && demoEnabled() && (mobile === defaultStudent.studentMobile || username === DEMO_USERNAME) && pin === DEFAULT_PIN) {
    try { state.account = persistAccount(demoAccount()); }
    catch { setAuthMessage('ডেমো অ্যাকাউন্ট সংরক্ষণ হয়নি।'); return; }
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

export const DEMO_USERNAME = defaultStudent.username || 'raisa.islam';

function demoAccount() {
  return { mobile: defaultStudent.studentMobile, username: DEMO_USERNAME, pin: DEFAULT_PIN, status: 'active', student: { ...defaultStudent, username: DEMO_USERNAME }, securityQuestion: 'তোমার শৈশবের ডাকনাম কী?', securityAnswer: 'রাইসা', additionalMobiles: ['01900000000'], demoFixture: true };
}

function initDemoLogin(state, onDemo) {
  $('#demoLoginButton')?.addEventListener('click', () => {
    if (loadAccount()) return setAuthMessage('এই ডিভাইসে অ্যাকাউন্ট আছে। নিজের নিবন্ধিত নম্বর দিয়ে লগইন করুন।');
    const account = demoEnabled() ? demoAccount() : { mobile: '01700000000', username: DEMO_USERNAME, pin: DEFAULT_PIN, status: 'active', student: { ...defaultStudent, username: DEMO_USERNAME } };
    try { state.account = persistAccount(account); }
    catch { return setAuthMessage('ডেমো অ্যাকাউন্ট সংরক্ষণ হয়নি। স্টোরেজ পরীক্ষা করুন।'); }
    state.student = { ...defaultStudent };
    onDemo?.();
  });
}

/* “পেমেন্ট কাউন্টার” tab: same credentials as payment.html, straight to the desk. */
function initPaymentPortalEntry() {
  const form = $('#payPortalLoginForm');
  if (!form) return;
  const userField = $('#payPortalUser');
  const pinField = $('#payPortalPin');
  const account = loadPaymentAccount();
  if (userField && !userField.value) userField.value = account.userId;
  if (pinField && !pinField.value) pinField.value = DEFAULT_PAYMENT_PIN;
  const fail = message => {
    const box = $('#payPortalError');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  };
  form.addEventListener('input', () => {
    const box = $('#payPortalError');
    if (box) box.hidden = true;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const userId = String($('#payPortalUser').value || '').trim();
    const pin = String($('#payPortalPin').value || '');
    if (!userId || pin.length < 4) return fail('ইউসার আইডি ও ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
    if (!verifyPaymentCredentials(userId, pin)) {
      $('#payPortalPin').value = '';
      $('#payPortalPin').focus();
      return fail('ইউসার আইডি বা PIN সঠিক নয়। আবার চেষ্টা করুন।');
    }
    enterPaymentPortal($('#payPortalRemember')?.checked !== false);
  });
  $('#payPortalDemoButton')?.addEventListener('click', () => {
    $('#payPortalUser').value = PAYMENT_USER_ID;
    $('#payPortalPin').value = DEFAULT_PAYMENT_PIN;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true }));
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
  initPaymentPortalEntry();
}
