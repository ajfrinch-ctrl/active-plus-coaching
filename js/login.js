/* Login feature: mobile number + PIN verification and auth tab switching. */
import { $, $$, normalizeMobile, setAuthMessage } from './ui.js';
import { defaultStudent } from './config.js';
import { saveStudent, persistSession } from './storage.js';

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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleLogin(event, state, onAuthenticated) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const mobile = normalizeMobile(form.get('mobile'));
  const pin = String(form.get('pin') || '');
  if (!mobile || pin.length < 4) {
    setAuthMessage('মোবাইল নম্বর ও ৪–৬ সংখ্যার PIN সঠিকভাবে দিন।');
    return;
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
  persistSession($('#rememberMe')?.checked !== false);
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

function initDemoLogin(state, onDemo) {
  $('#demoLoginButton')?.addEventListener('click', () => {
    state.account = { mobile: '01700000000', pin: '123456', status: 'active', student: { ...defaultStudent } };
    state.student = { ...defaultStudent };
    onDemo?.();
  });
}

export function initLogin({ state, onAuthenticated, onDemo }) {
  initPinVisibility();
  $$('[data-auth-tab]').forEach(trigger => trigger.addEventListener('click', () => {
    switchAuthTab(trigger.dataset.authTab);
  }));
  $('#loginForm')?.addEventListener('submit', event => handleLogin(event, state, onAuthenticated));
  initDemoLogin(state, onDemo);
}
