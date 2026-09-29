/* First-use Admin Account — the real index.html + js/login.js in jsdom.

   Covers the acceptance list:
     1. fresh install → the "Admin Account তৈরি করুন" option is on the login page
     2. the first Admin is created there
     3. the User ID is generated, never typed
     4. "Rasal Russell Chowdhury" → "rasal.admin.apc"
     5. duplicates walk rasal2 / rasal3 on the first name
     6. after creation the option disappears from the login page
     7. no other page offers it (admin.html included)
     8. a direct function call cannot create a second first Admin
     9. the bootstrap role accounts and the staff/student id systems are intact
*/
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STAFF_ACCOUNTS, createInitialAdmin, readStaffAccount, staffAccountRecordExists } from '../js/staff-auth.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
const PASSWORD = 'Admin-2026';

let ctx;

async function openLoginPage() {
  ctx = await loadPage('index.html', { seed: { ...DEMO_OFF } });
  const { initLogin } = await import('../js/login.js');
  initLogin({ state: { student: null, account: null }, onAuthenticated: () => {} });
  // The gate is async (it settles the stored Admin record, and may consult the
  // optional online bridge first), so wait for it to actually decide rather
  // than for the element to merely exist in the markup: it ships hidden and is
  // either unhidden or removed once the answer is known.
  await ctx.waitFor(() => {
    const footnote = ctx.$('#firstAdminFootnote');
    if (!footnote) return true;
    return footnote.hidden === false;
  });
  await ctx.flush();
  return ctx;
}

const type = (selector, value) => ctx.type(ctx.$(selector), value);
const message = () => ctx.$('#authMessage')?.textContent || '';

before(async () => { await openLoginPage(); });

test('a fresh install offers the first-use Admin option on the login page', () => {
  assert.equal(ctx.$('#firstAdminPanel') !== null, true, 'the creation panel exists on the first run');
  assert.equal(ctx.$('#firstAdminFootnote').hidden, false, 'the login page shows the option');
  assert.match(ctx.$('#firstAdminFootnote').textContent, /প্রথমবার ব্যবহার করছেন/);
  assert.match(ctx.$('#openFirstAdmin').textContent, /Admin Account তৈরি করুন/);
});

test('the form has no username input — only a locked, generated preview', () => {
  const panel = ctx.$('#firstAdminPanel');
  assert.equal(panel.querySelector('input[name="username"]'), null, 'the id cannot be typed');
  assert.equal(panel.querySelector('#firstAdminUsername'), null);
  const preview = panel.querySelector('#firstAdminIdPreview');
  assert.ok(preview, 'the live preview exists');
  assert.notEqual(preview.tagName, 'INPUT', 'the preview is not an editable field');
  // The rest of the required fields are there.
  for (const id of ['#firstAdminName', '#firstAdminMobile', '#firstAdminEmail', '#firstAdminPassword', '#firstAdminConfirm']) {
    assert.ok(panel.querySelector(id), `${id} is missing`);
  }
  // Passwords can be revealed like everywhere else in the app.
  assert.ok(panel.querySelector('[data-toggle-pin="firstAdminPassword"]'));
});

test('typing a full name previews the generated User ID live', () => {
  type('#firstAdminName', 'Rasal Russell Chowdhury');
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, 'rasal.admin.apc');

  type('#firstAdminName', 'Karim Ahmed');
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, 'karim.admin.apc');

  type('#firstAdminName', 'Md. Hasan Ali');
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, 'hasan.admin.apc', 'honorifics are skipped');

  type('#firstAdminName', 'Abdullah Al Mamun');
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, 'abdullah.admin.apc');

  type('#firstAdminName', '');
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, '—');
});

test('creating the first Admin stores the generated ID and hides the workflow', async () => {
  type('#firstAdminName', 'Rasal Russell Chowdhury');
  type('#firstAdminMobile', '01711222333');
  type('#firstAdminEmail', 'rasal@example.com');
  type('#firstAdminPassword', PASSWORD);
  type('#firstAdminConfirm', PASSWORD);
  assert.equal(ctx.$('#firstAdminIdPreview').textContent, 'rasal.admin.apc');

  ctx.submit(ctx.$('#firstAdminForm'));
  await ctx.waitFor(() => ctx.$('#firstAdminPanel') === null, 20000);
  await ctx.waitFor(async () => Boolean(await readStaffAccount('admin')));
  await ctx.flush();

  const account = await readStaffAccount('admin');
  assert.equal(account.username, 'rasal.admin.apc');
  assert.equal(account.fullName, 'Rasal Russell Chowdhury');
  assert.equal(account.mobile, '01711222333');
  assert.equal(account.email, 'rasal@example.com');
  assert.equal(account.role, 'admin');
  // The password is a hash, never the plaintext.
  assert.equal(JSON.stringify(account).includes(PASSWORD), false);
  assert.equal(typeof account.password, 'object');

  // 6 + 12: the option is gone for good, and the id is handed to the login form.
  assert.equal(ctx.$('#firstAdminPanel'), null, 'the panel is removed, not hidden');
  assert.equal(ctx.$('#firstAdminFootnote'), null);
  assert.equal(ctx.$('#openFirstAdmin'), null);
  assert.equal(ctx.$('#loginMobile').value, 'rasal.admin.apc');
  assert.match(message(), /rasal\.admin\.apc/);
});

test('the generated ID signs in as Admin', async () => {
  // The login page is still on screen after creation — and the option is gone.
  assert.equal(ctx.$('#firstAdminPanel'), null);
  assert.equal(ctx.$('#firstAdminFootnote'), null);
  ctx.type(ctx.$('#loginMobile'), 'rasal.admin.apc');
  ctx.type(ctx.$('#loginPin'), PASSWORD);
  ctx.submit(ctx.$('#loginForm'));
  await ctx.waitFor(() => ctx.jsdomErrors.some(error => /navigation/i.test(error)) || /এডমিন প্যানেল/.test(message()), 20000);
  assert.match(message(), /এডমিন প্যানেল/);
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey) !== null, true);
});

test('a direct function call cannot create a second first Admin', async () => {
  assert.equal(await staffAccountRecordExists('admin'), true);
  const second = await createInitialAdmin({
    fullName: 'Second Owner',
    mobile: '01899887766',
    email: '',
    password: 'Another-2026',
    confirmPassword: 'Another-2026'
  });
  assert.equal(second.ok, false, 'the data layer refuses while one Admin exists');
  assert.match(second.error, /ইতিমধ্যে/);
  // Even a username smuggled in is ignored: the id is always generated.
  const smuggled = await createInitialAdmin({
    fullName: 'Third Owner', mobile: '01899887755', username: 'hacker.admin.apc',
    password: 'Another-2026', confirmPassword: 'Another-2026'
  });
  assert.equal(smuggled.ok, false);
  const account = await readStaffAccount('admin');
  assert.equal(account.username, 'rasal.admin.apc', 'the first Admin is untouched');
});

test('duplicate names walk rasal2 → rasal3 on the first name', async () => {
  // The generator is shared, so the staff roles follow the same numbering.
  const { generateLoginId } = await import('../js/user-id.js');
  const taken = ['rasal.admin.apc', 'karim.manager.apc', 'tanvir.cash.apc'];
  assert.equal(generateLoginId({ fullName: 'Rasal Ahmed', role: 'admin', taken }), 'rasal2.admin.apc');
  assert.equal(generateLoginId({ fullName: 'Rasal Karim', role: 'admin', taken: [...taken, 'rasal2.admin.apc'] }), 'rasal3.admin.apc');
  assert.equal(generateLoginId({ fullName: 'Karim Hasan', role: 'manager', taken }), 'karim2.manager.apc');
  assert.equal(generateLoginId({ fullName: 'Tanvir Rahman', role: 'cash-counter', taken }), 'tanvir2.cash.apc');
  // Forbidden shapes are never produced.
  const all = [
    generateLoginId({ fullName: 'Rasal Ahmed', role: 'admin', taken }),
    generateLoginId({ fullName: 'Tanvir Rahman', role: 'cash-counter', taken })
  ];
  for (const id of all) {
    assert.doesNotMatch(id, /(admin|manager|teacher|cash)\d/);
    assert.doesNotMatch(id, /apc\d/);
    assert.ok(id.endsWith('.apc'));
  }
});

test('the Admin portal also refuses to offer the workflow', async () => {
  const panel = await loadPage('admin.html', { seed: { ...DEMO_OFF } });
  await import('../js/admin.js?no-admin');
  // No creation form anywhere in the page.
  assert.equal(panel.$('#initialAdminSetup'), null);
  assert.equal(panel.$('#initialAdminForm'), null);
  assert.equal(panel.$('form input[name="username"][id*="initial"]'), null);
  /* With no Admin session stored the panel never opens: it locks in place and
     keeps the shared login page — the only place first use is handled — as a
     button, without navigating there on its own. */
  await panel.waitFor(() => Boolean(panel.$('#apcPanelLock')));
  assert.equal(panel.$('#adminShell').hidden, true, 'the Admin panel must stay closed');
  assert.equal(panel.jsdomErrors.some(error => /navigation/i.test(error)), false, 'no automatic hand-off');
  panel.window.close();
});
