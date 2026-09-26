/* One login page for everyone: student, teacher, admin and the payment counter
   all sign in on index.html. A student lands in the student app; a reserved
   staff username hands the visitor to that panel with the session already
   written, so the panel opens without a second credential form.

   Phase 1 security: no built-in default password exists. A role's first
   sign-in on a device opens the shared password dialog; the session is a
   device-bound token written only after a valid password is in place. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { hasStaffSession } from '../js/staff-auth.js';
import { STORAGE_KEYS } from '../js/config.js';
import { STAFF_TEST_PASSWORD, provisionStaff, seedStaffSession, signInOnLoginPage, completeStaffPasswordDialog } from './staff-harness.mjs';

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

async function signIn(username, pin, wait = () => true) {
  const { $, type, submit } = ctx;
  type($('#loginMobile'), username);
  type($('#loginPin'), pin);
  submit($('#loginForm'));
  await ctx.waitFor(wait);
  await ctx.flush();
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

test('a student still signs in here and opens the student app', async () => {
  await signIn('raisa.islam', '246810', () => studentAppOpened === 1);
  assert.equal(studentAppOpened, 1);
  assert.equal(ctx.window.localStorage.getItem(STORAGE_KEYS.session) !== null, true);
  // The legacy plaintext PIN was upgraded to a hash on this successful login.
  const stored = JSON.parse(ctx.window.localStorage.getItem(ACCOUNT_KEY));
  assert.equal(stored.pin, undefined);
  assert.equal(typeof stored.pinHash, 'object');
  for (const role of Object.keys(STAFF_ACCOUNTS)) assert.equal(session(role), null);
});

test('admin credentials hand over to the admin panel, wrong ones change nothing', async () => {
  await open();
  // A fresh device has no password for the role yet: the shared dialog asks
  // for one before anything else happens.
  await signIn(STAFF_ACCOUNTS.admin.username, STAFF_TEST_PASSWORD, () => Boolean(ctx.$('.staff-pw-backdrop')));
  assert.equal(session('admin'), null, 'no session before a password exists');
  ctx.$('[data-staff-pw-cancel]')?.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
  await ctx.waitFor(() => !ctx.$('.staff-pw-backdrop'));

  await provisionStaff('admin');
  await signIn('admin.apc', 'ভুল-পাসওয়ার্ড', () => /সঠিক ন(য়|য়)/.test(ctx.$('#authMessage').textContent));
  assert.match(ctx.$('#authMessage').textContent, /সঠিক ন(য়|য়)/);
  assert.equal(session('admin'), null);
  assert.equal(navigated(), false);
  assert.equal(studentAppOpened, 1);

  // The right password hands over to the panel with the session already written.
  await signIn(STAFF_ACCOUNTS.admin.username.toUpperCase(), STAFF_TEST_PASSWORD, () => navigated());
  assert.match(ctx.$('#authMessage').textContent, /এডমিন প্যানেল/);
  assert.equal(session('admin') !== null, true);
  assert.equal(await hasStaffSession('admin'), true);
  assert.equal(navigated(), true, 'the login page must hand over to admin.html');
});

test('teacher and payment counter use the same form and reach their own panels', async () => {
  await open();
  await provisionStaff('teacher');
  await signIn(STAFF_ACCOUNTS.teacher.username, STAFF_TEST_PASSWORD, () => navigated() || ctx.$('#authMessage').textContent.includes('শিক্ষক'));
  assert.match(ctx.$('#authMessage').textContent, /শিক্ষক প্যানেল/);
  assert.equal(session('teacher') !== null, true);
  assert.equal(await hasStaffSession('teacher'), true);
  assert.equal(session('admin'), null);

  await open();
  await provisionStaff('payment');
  await signIn(STAFF_ACCOUNTS.payment.username, STAFF_TEST_PASSWORD, () => navigated() || ctx.$('#authMessage').textContent.includes('পেমেন্ট'));
  assert.match(ctx.$('#authMessage').textContent, /পেমেন্ট রিসিভ প্যানেল/);
  assert.equal(await hasStaffSession('payment'), true);
  // The counter desk reads this key, so landing there needs no second form.
  assert.equal(session('payment') !== null, true);
});

test('remember-me unchecked keeps a staff session only for the tab', async () => {
  await open();
  await provisionStaff('admin');
  const { $, type, submit } = ctx;
  type($('#loginMobile'), STAFF_ACCOUNTS.admin.username);
  type($('#loginPin'), STAFF_TEST_PASSWORD);
  $('#rememberMe').checked = false;
  submit($('#loginForm'));
  await ctx.waitFor(() => ctx.window.sessionStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey) === '1' || navigated());
  assert.equal(session('admin'), null, 'no 90-day session was written');
  assert.equal(ctx.window.sessionStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey), '1');
});

test('the admin switch that closes teacher access also closes it from this page', async () => {
  await open({ 'active-plus-app-config-v1': JSON.stringify({ allowTeacherRegistration: false }) });
  await provisionStaff('teacher');
  await signIn(STAFF_ACCOUNTS.teacher.username, STAFF_TEST_PASSWORD, () => ctx.$('#authMessage').textContent.includes('বন্ধ'));
  assert.match(ctx.$('#authMessage').textContent, /বন্ধ রাখা হয়েছে/);
  assert.equal(session('teacher'), null);
  assert.equal(navigated(), false);
});

test('the panel a staff member was handed to opens without a second form', async () => {
  const panel = await loadPage('admin.html', { seed: DEMO_OFF });
  seedStaffSession(panel.window, 'admin');
  await import('../js/admin.js');
  await panel.flush();
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
    const page = await loadPage(panel, { seed: DEMO_OFF });
    seedStaffSession(page.window, role);
    // Cache-bust: the previous test already evaluated this module against
    // another document, and a cached module would bind its handlers to that
    // old DOM.
    await import(`${script}?logout=${role}`);
    // The desk rewrites its session on entry; wait for the store to settle.
    await page.waitFor(() => page.window.localStorage.getItem(STAFF_ACCOUNTS[role].sessionKey) !== null);
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
