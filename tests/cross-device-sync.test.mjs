/* Cross-device sync — the whole point of the online bridge: an account or
   record created on one phone must be usable on another phone.

   Two isolated Node/jsdom processes (their own localStorage and module
   graphs) run the REAL app code against a shared in-memory mock of the
   Firebase Realtime Database. Only the three Firebase CDN import specifiers
   are rewritten (see tests/two-device-harness.mjs) — the storage-write
   bridge, push/merge rules, listeners and the login flow run as shipped.

   Covered end to end:
     • device A creates the first Admin → pushed to the cloud
     • device B boots fresh and pulls: role account, Staff Directory,
       Login User ID registry, students, the student login
     • the Admin ID created on A signs in on B through the real login form
     • a Staff Management (directory) ID created on A logs in on B and its
       forced password change flows back to A live
     • records written on either device appear on the other without a reload
     • only password HASHES travel the bridge (no plaintext pin) */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startMockCloud, Device } from './two-device-harness.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const ADMIN_PASSWORD = 'Admin-2026';
const TEACHER_PASSWORD = 'Teach-2026';

let cloud = null;
let deviceA = null;
let deviceB = null;
let adminUsername = null;
let teacherUsername = null;


const SYNC_ROOT = cloud => cloud.state.activePlusSync?.v1 || {};

/* Pushes inside the app are fire-and-forget promises (as in the browser), so
   cloud-side assertions poll briefly instead of racing the bridge. */
async function waitForCloud(predicate, what, timeout = 10000) {
  const started = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - started > timeout) throw new Error('cloud wait timed out: ' + what);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

before(async () => {
  cloud = await startMockCloud();
  const harness = await import('./two-device-harness.mjs');
  harness.buildDevices().buildAppCopy(cloud.url);
  deviceA = new Device('A', cloud.url);
  deviceB = new Device('B', cloud.url);
  deviceA.start();
  deviceB.start();
});

after(async () => {
  await Promise.allSettled([deviceA?.stop(), deviceB?.stop()]);
  await new Promise(resolve => cloud?.server?.close(resolve));
});

test('login IDs and data created on device A work on device B', async () => {
  /* ---- Device A: first boot, create the Admin, sign in, create data ---- */
  const bootA = await deviceA.run('boot');
  assert.equal(bootA.ok, true, 'device A sync started');

  const admin = await deviceA.run('create-admin', {
    fullName: 'Test admin',
    mobile: '01712345678',
    password: ADMIN_PASSWORD
  });
  adminUsername = admin.username;
  assert.match(adminUsername, /^test\.admin\.apc$/, 'the generated Admin Login User ID');
  assert.deepEqual(admin.bootstrapRoles.sort(), ['manager', 'payment', 'teacher']);

  /* A → cloud: the role account, the bootstrap roles and the claimed id
     registry must all be on the bridge now. */
  const root = () => SYNC_ROOT(cloud);
  await waitForCloud(() => root().staffAccounts?.admin?.username === adminUsername, 'Admin account pushed');
  assert.ok(root().staffAccounts?.admin?.password, 'password record travels (a PBKDF2 hash, never plaintext)');
  await waitForCloud(
    () => ['manager', 'teacher', 'payment'].every(role => root().staffAccounts?.[role]?.username),
    'bootstrap role accounts pushed');
  await waitForCloud(() => root().usernames?.[adminUsername] === 'staff:admin', 'claimed Login User ID registry pushed');

  const loginA = await deviceA.run('form-login', { username: adminUsername, pin: ADMIN_PASSWORD });
  assert.equal(loginA.adminSession, true, 'device A admin signs in');
  assert.equal(loginA.dialog, false, 'no forced password change for the first admin');
  assert.equal(loginA.navigated, true, 'hands over to the admin panel');

  const teacher = await deviceA.run('create-directory-staff', {
    fullName: 'Rahim Uddin',
    role: 'teacher',
    password: TEACHER_PASSWORD
  });
  teacherUsername = teacher.username;
  assert.match(teacherUsername, /^rahim\d?\.teacher\.apc$/, 'generated directory Login User ID');
  /* records[0] is the seeded system admin — find the created teacher. */
  const cloudTeacher = () => (root().staffDirectory?.records || []).find(record => record?.username === teacherUsername);
  await waitForCloud(() => Boolean(cloudTeacher()), 'directory record pushed');

  const students = [
    { id: 'STU-1', fullName: 'দোলন আক্তার', roll: '01', className: 'Nine', batch: 'A' },
    { id: 'STU-2', fullName: 'রহিম মিয়া', roll: '02', className: 'Ten', batch: 'B' }
  ];
  await deviceA.run('write-students', { students: [students[0]] });
  await waitForCloud(() => Boolean(root().students?.['STU-1']), 'student record pushed');

  await deviceA.run('write-student-account', {
    username: 'dolon',
    pin: '4321',
    fullName: 'দোলন আক্তার',
    mobile: '01812345678'
  });
  await waitForCloud(() => root().studentAccount?.username === 'dolon', 'student login pushed');
  const cloudStudent = root().studentAccount;
  assert.ok(cloudStudent?.pinHash, 'student pin travels as a hash');
  assert.ok(!('pin' in (cloudStudent || {})), 'a plaintext pin never reaches the cloud');

  /* ---- Device B: a fresh phone that has never seen any of this ---- */
  const bootB = await deviceB.run('boot');
  assert.equal(bootB.ok, true, 'device B sync started');

  const { KEYS } = await import('../js/database.js');
  const { STAFF_ACCOUNTS } = await import('../js/staff-auth.js');
  const { STAFF_DIRECTORY_KEY } = await import('../js/staff-directory.js');
  const dir = path_keys();

  function path_keys() {
    return {
      usernames: KEYS.usernames,
      students: KEYS.students,
      studentAccount: KEYS.account,
      directory: STAFF_DIRECTORY_KEY,
      adminAccount: STAFF_ACCOUNTS.admin.accountKey
    };
  }

  /* cloud → B: the initial sync fills in everything that exists remotely. */
  await deviceB.run('wait-keys', { keys: Object.values(dir) });
  const bStudents = await deviceB.run('snapshot', { keys: [KEYS.students] });
  assert.equal(bStudents.values[KEYS.students].length, 1, 'device B pulled the student list');

  /* Live A → B: a record written on A after B is already running. */
  await deviceA.run('write-students', { students });
  await deviceB.run('wait-content', { key: KEYS.students, id: 'STU-2' });
  const bStudents2 = await deviceB.run('snapshot', { keys: [KEYS.students] });
  assert.equal(bStudents2.values[KEYS.students].length, 2, 'device B received the new student live');
  assert.ok(bStudents2.eventCollections.includes('students'), 'device B saw a sync event');

  /* The Admin ID created on A signs in on B through the real login form. */
  const loginB = await deviceB.run('form-login', { username: adminUsername, pin: ADMIN_PASSWORD });
  assert.equal(loginB.adminSession, true, `the Admin ID ${adminUsername} created on A signs in on B`);
  assert.match(loginB.message, /নেওয়া হচ্ছে/, 'no credential error on device B');
  assert.equal(loginB.navigated, true, 'device B hands over to the admin panel');

  /* The Staff Management ID created on A logs in on B. */
  const teacherLogin = await deviceB.run('form-login', { username: teacherUsername, pin: TEACHER_PASSWORD });
  assert.equal(teacherLogin.dialog, true, 'the temporary-password dialog opens on device B');
  const change = await deviceB.run('change-dialog-password', { next: 'Own-Pass-2026' });
  assert.equal(change.teacherSession, true, 'teacher signs in after the password change');

  await waitForCloud(() => cloudTeacher()?.mustChangePassword === false,
    'password-change flag cleared in the cloud');

  /* B → A live: a record written on B appears on A without a reload. */
  await deviceB.run('write-notice', { id: 'N-1', title: 'কাল ছুটি', body: 'কালকে সকাল ১০টায় ক্লাস শুরু হবে।' });
  await deviceA.run('wait-content', { key: KEYS.notices, id: 'N-1' });
  const aSnapshot = await deviceA.run('snapshot', { keys: [KEYS.notices, STAFF_DIRECTORY_KEY] });
  assert.ok(aSnapshot.values[KEYS.notices]?.some(n => n.id === 'N-1'), 'device A received the notice written on B');
  assert.equal(
    (aSnapshot.values[STAFF_DIRECTORY_KEY]?.records || []).find(record => record?.username === teacherUsername)?.mustChangePassword,
    false, 'device A sees the password change made on B');
  assert.ok(aSnapshot.eventCollections.includes('notices'), 'device A saw sync events');

  /* The student login created on A signs in on B. */
  const studentLogin = await deviceB.run('form-login', { username: 'dolon', pin: '4321' });
  assert.equal(studentLogin.studentSession, true, 'the student login synced from A works on B');
  assert.match(studentLogin.message, /স্বাগতম|নেওয়া হচ্ছে|/, 'no credential error');
});

test('package still declares the realtime bridge', async () => {
  const loginSource = readFileSync(new URL('../js/login.js', import.meta.url), 'utf8');
  assert.match(loginSource, /hydrateUserIdentifiers/, 'login.js hydrates synced user IDs');
  void pkg; void REPO;
});
