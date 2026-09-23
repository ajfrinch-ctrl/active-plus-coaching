/* Direct entry to the Payment Receive desk from the student login page:
   the counter user ID + PIN typed in either the student form or the
   “পেমেন্ট কাউন্টার” tab must hand a session to payment.html (auto-login)
   without ever opening the student app. Drives the real index.html markup
   through js/login.js. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { PAYMENT_SESSION_KEY, PAYMENT_REMEMBER_DAYS } from '../js/payment-auth.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
let ctx;
let studentAppOpened = 0;

before(async () => {
  ctx = await loadPage('index.html', { seed: DEMO_OFF });
  const { initLogin } = await import('../js/login.js');
  initLogin({
    state: { student: null, account: null },
    onAuthenticated: () => { studentAppOpened += 1; },
    onDemo: () => { studentAppOpened += 1; }
  });
});

const navigations = () => ctx.jsdomErrors.filter(message => /navigation/i.test(message));
const clearSession = () => ctx.window.localStorage.removeItem(PAYMENT_SESSION_KEY);
const session = () => {
  const raw = ctx.window.localStorage.getItem(PAYMENT_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};

test('the login card offers a payment counter tab with the demo credentials ready', () => {
  const { $, $$, click } = ctx;
  click($('[data-auth-tab="payment"]'));
  assert.equal($('#paymentPanel').hidden, false);
  assert.equal($('#loginPanel').hidden, true);
  assert.equal($$('[data-auth-panel]').filter(panel => !panel.hidden).length, 1);
  assert.equal($('#payPortalUser').value, 'APC-PAY-001');
  assert.equal($('#payPortalPin').value, '123123');
  // The student login panel links straight to the counter too.
  click($('[data-auth-tab="login"]'));
  assert.equal($('#loginPanel').hidden, false);
  assert.equal($('#paymentPanel').hidden, true);
});

test('a wrong PIN on the counter tab is rejected and stores no session', () => {
  const { $, type, submit } = ctx;
  clearSession();
  type($('#payPortalUser'), 'APC-PAY-001');
  type($('#payPortalPin'), '999999');
  submit($('#payPortalLoginForm'));
  assert.equal($('#payPortalError').hidden, false);
  assert.match($('#payPortalError').textContent, /ইউসার আইডি বা PIN সঠিক নয়/);
  assert.equal(session(), null);
  assert.equal(studentAppOpened, 0);
});

test('the counter tab signs straight into the payment desk', async () => {
  const { $, type, submit, waitFor } = ctx;
  clearSession();
  const before = navigations().length;
  type($('#payPortalUser'), 'apc-pay-001'); // case tolerant
  type($('#payPortalPin'), '১২৩১২৩'); // Bengali digits
  submit($('#payPortalLoginForm'));
  await waitFor(() => navigations().length > before);

  const stored = session();
  assert.ok(stored, 'the counter session must be handed over');
  const days = (stored.expiry - Date.now()) / 86400000;
  assert.ok(days > PAYMENT_REMEMBER_DAYS - 1 && days <= PAYMENT_REMEMBER_DAYS);
  assert.equal(studentAppOpened, 0);
});

test('the counter ID typed in the student form does not log a student in', () => {
  const { $, type, submit } = ctx;
  clearSession();
  type($('#loginMobile'), 'APC-PAY-001');
  type($('#loginPin'), '000000');
  submit($('#loginForm'));
  assert.equal($('#authMessage').hidden, false);
  assert.match($('#authMessage').textContent, /পেমেন্ট পোর্টালের ইউসার আইডি বা PIN সঠিক নয়/);
  assert.equal(session(), null);
  assert.equal(studentAppOpened, 0);
});

test('ID + PIN in the student form auto-logs into the payment desk', async () => {
  const { $, type, submit, waitFor } = ctx;
  clearSession();
  const before = navigations().length;
  type($('#loginMobile'), 'APC-PAY-001');
  type($('#loginPin'), '123123');
  submit($('#loginForm'));
  await waitFor(() => navigations().length > before);
  assert.ok(session(), 'the session must exist before the counter page opens');
  assert.equal(studentAppOpened, 0);
});
