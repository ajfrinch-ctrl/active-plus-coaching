/* One login page for everyone: student, teacher, admin and the payment counter
   all sign in on index.html. A student lands in the student app; a reserved
   staff username hands the visitor to that panel with the session already
   written, so the panel opens without a second credential form. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STAFF_ACCOUNTS, STAFF_PASSWORD } from '../js/staff-auth.js';
import { STORAGE_KEYS } from '../js/config.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
const ACCOUNT_KEY = 'active-plus-account-v1';
const studentAccount = {
  mobile: '01700000000',
  registrationMobile: '01700000000',
  username: 'raisa.islam',
  pin: '246810',
  status: 'active',
  student: { id: 'AP-1024', name: 'রাইসা', className: 'দশম শ্রেণি' }
};

let ctx;
let studentAppOpened = 0;

async function open(seed = {}) {
  ctx = await loadPage('index.html', { seed: { ...DEMO_OFF, ...seed } });
  const { initLogin } = await import('../js/login.js');
  initLogin({
    state: { student: null, account: null },
    onAuthenticated: () => { studentAppOpened += 1; }
  });
  return ctx;
}

function signIn(username, pin) {
  const { $, type, submit } = ctx;
  type($('#loginMobile'), username);
  type($('#loginPin'), pin);
  submit($('#loginForm'));
}

const session = role => ctx.window.localStorage.getItem(STAFF_ACCOUNTS[role].sessionKey);
const navigated = () => ctx.jsdomErrors.some(error => /navigation/i.test(error));

before(async () => { await open({ [ACCOUNT_KEY]: JSON.stringify(studentAccount) }); });

test('the login card is the single door: no staff tabs, no shortcut links, no demo button', () => {
  const { $ } = ctx;
  assert.equal($('#demoLoginButton'), null);
  assert.equal($('[data-auth-tab="payment"]'), null);
  assert.equal($('#paymentPanel'), null);
  for (const href of ['admin.html', 'teacher.html', 'payment.html']) {
    assert.equal($(`#authScreen a[href="${href}"]`), null);
  }
  // The hint tells everyone in, but nothing is prefilled.
  assert.match($('#loginHint').textContent, /শিক্ষক, এডমিন ও পেমেন্ট কাউন্টার/);
  assert.equal($('#loginMobile').value, '');
  assert.equal($('#loginPin').value, '');
  assert.equal(/১২৩১২৩|APC-PAY|এক ক্লিক/.test(ctx.window.document.body.textContent), false);
});

test('a student still signs in here and opens the student app', () => {
  signIn('raisa.islam', '246810');
  assert.equal(studentAppOpened, 1);
  assert.equal(ctx.window.localStorage.getItem(STORAGE_KEYS.session) !== null, true);
  for (const role of Object.keys(STAFF_ACCOUNTS)) assert.equal(session(role), null);
});

test('admin credentials hand over to the admin panel, wrong ones change nothing', () => {
  signIn('admin.apc', 'ভুল-পাসওয়ার্ড');
  assert.match(ctx.$('#authMessage').textContent, /সঠিক নয়/);
  assert.equal(session('admin'), null);
  assert.equal(navigated(), false);
  assert.equal(studentAppOpened, 1);

  signIn(STAFF_ACCOUNTS.admin.username.toUpperCase(), STAFF_PASSWORD);
  assert.match(ctx.$('#authMessage').textContent, /এডমিন প্যানেল/);
  const stored = JSON.parse(session('admin'));
  assert.equal(stored.role, 'admin');
  assert.equal(stored.expiry > Date.now(), true);
  assert.equal(navigated(), true, 'the login page must hand over to admin.html');
});

test('teacher and payment counter use the same form and reach their own panels', async () => {
  await open();
  signIn(STAFF_ACCOUNTS.teacher.username, STAFF_PASSWORD);
  assert.match(ctx.$('#authMessage').textContent, /শিক্ষক প্যানেল/);
  assert.equal(JSON.parse(session('teacher')).role, 'teacher');
  assert.equal(session('admin'), null);

  await open();
  signIn(STAFF_ACCOUNTS.payment.username, STAFF_PASSWORD);
  assert.match(ctx.$('#authMessage').textContent, /পেমেন্ট রিসিভ প্যানেল/);
  assert.equal(JSON.parse(session('payment')).role, 'payment');
  // The counter desk reads this key, so landing there needs no second form.
  assert.equal(session('payment') !== null, true);
});

test('remember-me unchecked keeps a staff session only for the tab', () => {
  return open().then(() => {
    const { $, type, submit } = ctx;
    type($('#loginMobile'), STAFF_ACCOUNTS.admin.username);
    type($('#loginPin'), STAFF_PASSWORD);
    $('#rememberMe').checked = false;
    submit($('#loginForm'));
    assert.equal(session('admin'), null, 'no 90-day session was written');
    assert.equal(ctx.window.sessionStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey), '1');
  });
});

test('the admin switch that closes teacher access also closes it from this page', async () => {
  await open({ 'active-plus-app-config-v1': JSON.stringify({ allowTeacherRegistration: false }) });
  signIn(STAFF_ACCOUNTS.teacher.username, STAFF_PASSWORD);
  assert.match(ctx.$('#authMessage').textContent, /বন্ধ রাখা হয়েছে/);
  assert.equal(session('teacher'), null);
  assert.equal(navigated(), false);
});

test('the panel a staff member was handed to opens without a second form', async () => {
  const panel = await loadPage('admin.html', {
    seed: { ...DEMO_OFF, [STAFF_ACCOUNTS.admin.sessionKey]: JSON.stringify({ expiry: Date.now() + 86400000, role: 'admin' }) }
  });
  await import('../js/admin.js');
  assert.equal(panel.$('#adminEntry').hidden, true);
  assert.equal(panel.$('#adminShell').hidden, false);
});

/* Logout is not a step back to a panel's own form: every panel drops the
   session and returns to the shared login page (index.html). */
for (const [panel, script, exitButton, role] of [
  ['admin.html', '../js/admin.js', '#adminExitButton', 'admin'],
  ['teacher.html', '../js/teacher.js', '#teacherExit', 'teacher'],
  ['payment.html', '../js/payment.js', '#payExitButton', 'payment']
]) {
  test(`logging out of ${panel} goes to the login page`, async () => {
    const page = await loadPage(panel, {
      seed: { ...DEMO_OFF, [STAFF_ACCOUNTS[role].sessionKey]: JSON.stringify({ expiry: Date.now() + 86400000, role }) }
    });
    // Cache-bust: the previous test already evaluated admin.js against another
    // document, and a cached module would bind its handlers to that old DOM.
    await import(`${script}?logout=${role}`);
    assert.equal(page.window.localStorage.getItem(STAFF_ACCOUNTS[role].sessionKey) !== null, true, 'session was there to begin with');
    page.click(page.$(exitButton));
    assert.equal(page.window.localStorage.getItem(STAFF_ACCOUNTS[role].sessionKey), null);
    assert.equal(page.window.sessionStorage.getItem(STAFF_ACCOUNTS[role].sessionKey), null);
    assert.equal(page.jsdomErrors.some(error => /navigation/i.test(error)), true, 'the panel must hand over to the login page');
    // The panel never falls back to showing its own entry form.
    assert.equal(page.$('#adminEntry, #teacherEntry, #payEntry')?.hidden, true);
  });
}

test('typing a staff username switches the password box to a keyboard layout', async () => {
  await open();
  const { $, type } = ctx;
  assert.equal($('#loginPin').getAttribute('inputmode'), 'numeric');
  type($('#loginMobile'), 'admin.apc');
  assert.equal($('#loginPin').getAttribute('inputmode'), 'text');
  assert.equal($('#loginHint').classList.contains('is-staff'), true);
  type($('#loginMobile'), 'raisa.islam');
  assert.equal($('#loginPin').getAttribute('inputmode'), 'numeric');
  assert.equal($('#loginHint').classList.contains('is-staff'), false);
});
