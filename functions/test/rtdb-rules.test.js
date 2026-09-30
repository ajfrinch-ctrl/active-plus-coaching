/* Authoritative check of the PROPOSED per-user Realtime Database rules
   (database.rules.v2.draft.json) against the real rules engine.

     cd functions && npm run test:rtdb-rules

   Needs Java 11+ and the database emulator (firebase-tools downloads it).
   This suite must pass before the draft replaces database.rules.json — see
   docs/RTDB-PER-USER-RULES-PLAN.md. It loads the DRAFT file explicitly; the
   deployed deny-all policy is covered by tests/cloud-containment.test.mjs. */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const ROOT = 'activePlusV2';
const NOW = Date.now();
const staff = (role, extra = {}) => ({ role, status: 'active', mustChangePassword: false, ...extra });

test('RTDB v2 draft: per-user/role boundary', async t => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-active-plus-rtdb',
    database: { rules: readFileSync(resolve(__dirname, '../../database.rules.v2.draft.json'), 'utf8') }
  });
  t.after(() => env.cleanup());

  await env.withSecurityRulesDisabled(async context => {
    await context.database().ref().set({
      activePlusSync: { v1: { staffAccounts: { admin: { username: 'a', pinHash: 'x' } } } },
      [ROOT]: {
        settings: { broadcast: '' },
        notices: { n1: { id: 'n1', title: 'Notice' } },
        students: { S1: { id: 'S1', name: 'A' }, S2: { id: 'S2', name: 'B' } },
        transactions: { tx1: { id: 'tx1', studentId: 'S1', amount: 500 } },
        exams: {
          e1: { id: 'e1', teacherId: 'T1', status: 'draft' },
          e2: { id: 'e2', teacherId: 'T1', status: 'published' }
        },
        studentExams: { S1: { e2: { id: 'e2', title: 'Paper' } } },
        attempts: { S1: { a1: { id: 'a1', studentId: 'S1', examId: 'e2', status: 'submitted', startedAt: NOW - 1000 } } }
      }
    });
  });

  const as = (uid, claims) => env.authenticatedContext(uid, claims).database();
  const admin = as('u-admin', staff('admin'));
  const manager = as('u-manager', staff('manager'));
  const teacher = as('u-teacher', staff('teacher', { teacherId: 'T1' }));
  const payment = as('u-payment', staff('payment'));
  const studentA = as('u-sa', { role: 'student', status: 'approved', studentId: 'S1' });
  const anonymous = as('anon', { firebase: { sign_in_provider: 'anonymous' }, role: 'admin', status: 'active' });
  const mustChange = as('u-new', staff('admin', { mustChangePassword: true }));
  const signedOut = env.unauthenticatedContext().database();
  const get = (db, path) => db.ref(path).once('value');
  const put = (db, path, value) => db.ref(path).set(value);
  const p = path => `${ROOT}/${path}`;

  // Legacy bridge + root: closed to everyone.
  for (const db of [admin, studentA, anonymous, signedOut]) {
    await assertFails(get(db, 'activePlusSync/v1/staffAccounts'));
    await assertFails(put(db, 'activePlusSync/v1/staffAccounts/admin', { username: 'evil' }));
    await assertFails(get(db, ROOT));
  }
  // Anonymous (even with a role-looking claim), signed-out, forced-change: nothing.
  for (const db of [anonymous, signedOut, mustChange]) {
    await assertFails(get(db, p('settings')));
    await assertFails(get(db, p('students/S1')));
  }

  // Settings / notices.
  await assertSucceeds(get(studentA, p('settings')));
  await assertFails(put(studentA, p('settings/broadcast'), 'x'));
  await assertSucceeds(put(admin, p('settings/broadcast'), 'urgent'));
  await assertSucceeds(put(admin, p('notices/n2'), { id: 'n2', title: 'New' }));
  await assertFails(put(manager, p('notices/n3'), { id: 'n3', title: 'x' }));
  await assertFails(put(admin, p('notices/n4'), { id: 'wrong', title: 'x' }));

  // Roster: students see only themselves.
  await assertSucceeds(get(teacher, p('students')));
  await assertSucceeds(get(studentA, p('students/S1')));
  await assertFails(get(studentA, p('students/S2')));
  await assertFails(get(studentA, p('students')));

  // Transactions: Payment creates only.
  await assertSucceeds(put(payment, p('transactions/tx2'), { id: 'tx2', studentId: 'S1', amount: 100 }));
  await assertFails(put(payment, p('transactions/tx1'), { id: 'tx1', studentId: 'S1', amount: 1 }));
  await assertFails(put(payment, p('transactions/tx1'), null));
  await assertSucceeds(put(admin, p('transactions/tx1'), null));
  await assertFails(get(manager, p('transactions')));
  await assertFails(get(studentA, p('transactions')));

  // Exams: own unpublished only; no client publishes; students never read papers.
  await assertSucceeds(put(teacher, p('exams/e4'), { id: 'e4', teacherId: 'T1', status: 'draft' }));
  await assertFails(put(teacher, p('exams/e1'), { id: 'e1', teacherId: 'T1', status: 'published' }));
  await assertFails(put(teacher, p('exams/e2'), { id: 'e2', teacherId: 'T1', status: 'draft' }));
  await assertFails(put(manager, p('exams/e1'), { id: 'e1', teacherId: 'T1', status: 'published' }));
  await assertFails(get(studentA, p('exams')));
  await assertSucceeds(get(studentA, p('studentExams/S1')));

  // Attempts.
  const attempt = { id: 'a2', studentId: 'S1', examId: 'e2', status: 'active', startedAt: NOW - 10 };
  await assertSucceeds(put(studentA, p('attempts/S1/a2'), attempt));
  await assertFails(put(studentA, p('attempts/S1/a3'), { ...attempt, id: 'a3', examId: 'e1' }));
  await assertFails(put(studentA, p('attempts/S1/a1'), { ...attempt, id: 'a1' }));
  await assertFails(put(studentA, p('attempts/S1/a4'), { ...attempt, id: 'a4', startedAt: NOW + 3_600_000 }));
  await assertFails(put(studentA, p('results/S1/e2'), { score: 100 }));

  // Push tokens.
  const token = { token: 'x'.repeat(40), role: 'student', studentId: 'S1' };
  await assertSucceeds(put(studentA, p('pushTokens/u-sa/d1'), token));
  await assertFails(put(studentA, p('pushTokens/u-other/d1'), token));
  await assertFails(put(studentA, p('pushTokens/u-sa/d2'), { ...token, role: 'admin' }));
  await assertFails(get(admin, p('pushTokens')));
});
