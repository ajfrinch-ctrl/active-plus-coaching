/* Panel switch on the shared login page.
 *
 * The panels cannot reach each other (tests/panel-lockdown.test.mjs), so the
 * only place a device changes panels is index.html. This is the convenience
 * side of that rule: no logout step, a resume button for the panel the device
 * already has open, and a chip per panel that merely fills the username box.
 *
 * The security claim these tests pin down: no tap alone ever opens a panel —
 * the target role's password is always typed on the same form. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { STAFF_TEST_PASSWORD, provisionStaff, seedStaffSession } from './staff-harness.mjs';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
const SWITCH_ID = 'staffSwitch';

let ctx;
let opened = 0;

/** A freshly loaded login page. Accounts are provisioned and sessions seeded
    *after* the page exists, because each page brings its own storage. */
async function boot({ accounts = [], sessions = [] } = {}) {
  ctx = await loadPage('index.html', { seed: { ...DEMO_OFF } });
  for (const role of accounts) await provisionStaff(role);
  for (const role of sessions) seedStaffSession(ctx.window, role);
  const { initLogin } = await import(`../js/login.js?switch=${Math.random()}`);
  initLogin({ state: { student: null, account: null }, onAuthenticated: () => { opened += 1; } });
  await ctx.flush(12);
  return ctx;
}

const navigations = () => ctx.jsdomErrors.filter(error => /navigation/i.test(error)).length;
const strip = () => ctx.$(`#${SWITCH_ID}`);

test('a device with no panel account keeps the switch hidden', async () => {
  await boot();
  assert.equal(strip().hidden, true, 'nothing to switch on a fresh device');
  assert.equal(ctx.$('#staffSwitchResume'), null);
  assert.equal(navigations(), 0);
});

test('a device holding a panel session shows where it is and how to switch', async () => {
  await boot({ accounts: ['manager'], sessions: ['manager'] });
  await ctx.waitFor(() => strip().hidden === false);

  const host = strip();
  assert.match(host.textContent, /এই ডিভাইসে এখন ম্যানেজার প্যানেল খোলা আছে/);
  assert.match(host.textContent, /প্যানেল বদলাতে আগে লগআউট করার দরকার নেই/);
  // Nobody may open a panel without its password: the strip says it out loud.
  assert.match(host.textContent, /শুধু ট্যাপ করে কোনো প্যানেল খোলে না/);
  assert.deepEqual([...host.querySelectorAll('button')].map(button => button.id), ['staffSwitchResume', 'staffSwitchEnd']);
  assert.equal(navigations(), 0, 'the strip itself never navigates');
});

test('resume reopens the panel this device already has open', async () => {
  const before = navigations();
  ctx.click(ctx.$('#staffSwitchResume'));
  assert.equal(navigations(), before + 1, 'resume is the only button that moves the device');
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey) === null, false, 'the session is untouched');
});

test('ending the session keeps the person on the login page', async () => {
  const before = navigations();
  ctx.click(ctx.$('#staffSwitchEnd'));
  // The panel account stays on the device; only the open session goes away.
  await ctx.waitFor(() => ctx.$('#staffSwitchResume') === null);
  assert.match(strip().textContent, /এই ডিভাইসে এখন কোনো প্যানেল খোলা নেই/);
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey), null);
  assert.equal(ctx.window.sessionStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey), null);
  assert.equal(navigations(), before, 'ending a session is not a hand-off');
});

test('a chip only fills the username box — never an open panel', async () => {
  await boot({ accounts: ['manager', 'admin'], sessions: ['manager'] });
  await ctx.waitFor(() => Boolean(ctx.$('#staffSwitchFill-admin')));

  const chip = ctx.$('#staffSwitchFill-admin');
  assert.match(chip.getAttribute('aria-label'), /এডমিন প্যানেলের লগইন আইডি বসান/);
  const before = navigations();

  ctx.click(chip);
  assert.equal(ctx.$('#loginMobile').value, STAFF_ACCOUNTS.admin.username, 'the username is filled for the person');
  assert.equal(ctx.$('#loginPin').value, '', 'the password box stays empty');
  assert.equal(navigations(), before, 'a tap alone never opens another panel');
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey), null, 'and never signs anyone in');
  assert.match(strip().textContent, /এবার নিজের পাসওয়ার্ড দিয়ে লগইন করুন/);
});

test('signing in as another panel switches the device and says so', async () => {
  await boot({ accounts: ['manager', 'admin'], sessions: ['manager'] });
  await ctx.waitFor(() => strip().hidden === false);
  const before = navigations();

  ctx.type(ctx.$('#loginMobile'), STAFF_ACCOUNTS.admin.username);
  ctx.type(ctx.$('#loginPin'), STAFF_TEST_PASSWORD);
  ctx.submit(ctx.$('#loginForm'));
  await ctx.waitFor(() => navigations() > before || /সঠিক নয়/.test(ctx.$('#authMessage').textContent));

  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey) === null, false, 'the Admin session is written');
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey), null, 'the Manager session ended');
  assert.equal(ctx.window.sessionStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey), null);
  assert.match(ctx.$('#authMessage').textContent, /আগের ম্যানেজার প্যানেল সেশনটি বন্ধ হয়েছে/);
  assert.equal(navigations(), before + 1, 'and the Admin panel opens from the shared login page');
});
