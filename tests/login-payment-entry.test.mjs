/* The student login page is only for students. Payment and one-click demo
   entry used to live here; both are gone. The payment desk has its own page. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { PAYMENT_SESSION_KEY } from '../js/payment-auth.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
let ctx;
let studentAppOpened = 0;

before(async () => {
  ctx = await loadPage('index.html', { seed: DEMO_OFF });
  const { initLogin } = await import('../js/login.js');
  initLogin({
    state: { student: null, account: null },
    onAuthenticated: () => { studentAppOpened += 1; }
  });
});

const session = () => {
  const raw = ctx.window.localStorage.getItem(PAYMENT_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};

test('the login card has no demo button and no payment counter tab', () => {
  const { $ } = ctx;
  assert.equal($('#demoLoginButton'), null);
  assert.equal($('[data-auth-tab="payment"]'), null);
  assert.equal($('#paymentPanel'), null);
  assert.equal($('#payPortalLoginForm'), null);
  assert.equal($('#payPortalDemoButton'), null);
  assert.equal($('#loginPanel').hidden, false);
  assert.equal($('#loginMobile').value, '');
  assert.equal($('#loginPin').value, '');
  assert.equal(/১২৩১২৩|APC-PAY|এক ক্লিক/.test(ctx.window.document.body.textContent), false);
});

test('staff payment credentials do not open the student app or a counter session', () => {
  const { $, type, submit } = ctx;
  type($('#loginMobile'), 'payment.apc');
  type($('#loginPin'), 'Apc@2026');
  submit($('#loginForm'));
  assert.equal($('#authMessage').hidden, false);
  assert.match($('#authMessage').textContent, /অ্যাকাউন্ট নেই|সঠিক নয়/);
  assert.equal(session(), null);
  assert.equal(studentAppOpened, 0);
});
