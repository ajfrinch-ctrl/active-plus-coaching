/* The PROPOSED per-user RTDB rules (database.rules.v2.draft.json).
   See docs/RTDB-PER-USER-RULES-PLAN.md. These tests use a local simulator
   (tests/rtdb-rules-sim.mjs), not the Firebase engine; the emulator suite in
   functions/test/rtdb-rules.test.js must also pass before anything ships. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, V2_ROOT } from '../tools/rtdb-rules/build-v2-draft.mjs';
import { createSimulator } from './rtdb-rules-sim.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const draft = JSON.parse(read('../database.rules.v2.draft.json'));
const NOW = Date.UTC(2026, 8, 30, 6, 0, 0);
const sim = createSimulator(draft, { now: NOW });
const R = path => `${V2_ROOT}/${path}`;

// ---- identities -----------------------------------------------------------
const staff = (uid, role, extra = {}) => ({ uid, token: { role, status: 'active', mustChangePassword: false, ...extra } });
const USERS = {
  admin: staff('u-admin', 'admin'),
  manager: staff('u-manager', 'manager'),
  teacher: staff('u-teacher', 'teacher', { teacherId: 'T1' }),
  teacher2: staff('u-teacher2', 'teacher', { teacherId: 'T2' }),
  payment: staff('u-payment', 'payment'),
  studentA: { uid: 'u-sa', token: { role: 'student', status: 'approved', studentId: 'S1' } },
  studentB: { uid: 'u-sb', token: { role: 'student', status: 'approved', studentId: 'S2' } }
};
const BLOCKED = {
  signedOut: null,
  anonymous: { uid: 'anon-1', token: { firebase: { sign_in_provider: 'anonymous' } } },
  anonymousWithRole: { uid: 'anon-2', token: { firebase: { sign_in_provider: 'anonymous' }, role: 'admin', status: 'active' } },
  claimless: { uid: 'u-plain', token: {} },
  adminMustChange: staff('u-admin-new', 'admin', { mustChangePassword: true }),
  suspendedManager: { uid: 'u-m2', token: { role: 'manager', status: 'suspended' } },
  pendingStudent: { uid: 'u-sp', token: { role: 'student', status: 'pending', studentId: 'S9' } },
  studentWithoutLink: { uid: 'u-sx', token: { role: 'student', status: 'approved' } },
  teacherWithoutLink: staff('u-tx', 'teacher')
};

const state = () => ({
  activePlusSync: { v1: { staffAccounts: { admin: { username: 'a', pinHash: 'x' } } } },
  [V2_ROOT]: {
    settings: { broadcast: '' },
    notices: { n1: { id: 'n1', title: 'Notice' } },
    students: { S1: { id: 'S1', name: 'A' }, S2: { id: 'S2', name: 'B' } },
    transactions: { tx1: { id: 'tx1', studentId: 'S1', amount: 500 } },
    studentLedger: { S1: { tx1: { amount: 500 } } },
    exams: {
      e1: { id: 'e1', teacherId: 'T1', status: 'draft' },
      e2: { id: 'e2', teacherId: 'T1', status: 'published' },
      e3: { id: 'e3', teacherId: 'T2', status: 'pending' }
    },
    studentExams: { S1: { e2: { id: 'e2', title: 'Paper' } } },
    attempts: {
      S1: { a1: { id: 'a1', studentId: 'S1', examId: 'e2', status: 'submitted', startedAt: NOW - 1000 } },
      S2: { b1: { id: 'b1', studentId: 'S2', examId: 'e9', status: 'active', startedAt: NOW - 1000 } }
    },
    results: { S1: { e2: { score: 10 } } }
  }
});
const attempt = (overrides = {}) => ({ id: 'a2', studentId: 'S1', examId: 'e2', status: 'active', startedAt: NOW - 10, answers: { q1: 'B' }, number: 1, order: ['q1'], ...overrides });
const exam = (overrides = {}) => ({ id: 'e4', teacherId: 'T1', status: 'draft', participants: ['S1'], ...overrides });
const tokenRecord = (overrides = {}) => ({ token: 'x'.repeat(40), role: 'student', studentId: 'S1', deviceId: 'd1', ...overrides });

const canRead = (who, path) => sim.canRead(who, path, state());
const canWrite = (who, path, value) => sim.canWrite(who, path, value, state());
const only = (allowed, check) => {
  for (const [name, user] of Object.entries({ ...USERS, ...BLOCKED })) {
    assert.equal(check(user), allowed.includes(name), `${name}: expected ${allowed.includes(name) ? 'ALLOW' : 'DENY'}`);
  }
};

// ---- deployment guards ----------------------------------------------------
test('draft stays a draft: firebase.json still deploys the deny-all rules', () => {
  const firebase = JSON.parse(read('../firebase.json'));
  assert.equal(firebase.database.rules, 'database.rules.json');
  assert.deepEqual(JSON.parse(read('../database.rules.json')), { rules: { '.read': false, '.write': false } });
});

test('committed draft JSON matches its generator', () => {
  assert.equal(read('../database.rules.v2.draft.json'), render(),
    'run: node tools/rtdb-rules/build-v2-draft.mjs');
});

test('structure: no bare "auth != null", no true grants, no credential nodes, legacy bridge closed', () => {
  assert.equal(draft.rules['.read'], false);
  assert.equal(draft.rules['.write'], false);
  assert.deepEqual(draft.rules.activePlusSync, { '.read': false, '.write': false });
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === '.read' || key === '.write') {
        assert.notEqual(value, true, `${path}/${key} is an unconditional grant`);
        if (typeof value === 'string') {
          assert.match(value, /auth\.token\.role === '|auth\.uid === \$uid/, `${path}/${key} is not bound to a role or owner`);
          assert.match(value, /sign_in_provider !== 'anonymous'/, `${path}/${key} does not reject anonymous identities`);
        }
      } else if (value && typeof value === 'object') walk(value, `${path}/${key}`);
    }
  };
  walk(draft.rules, '');
  const v2 = Object.keys(draft.rules[V2_ROOT]);
  for (const credentialNode of ['staffAccounts', 'studentAccounts', 'studentAccount', 'usernames', 'staffDirectory']) {
    assert.ok(!v2.includes(credentialNode), `${credentialNode} must not exist in the v2 tree`);
  }
});

// ---- access matrix --------------------------------------------------------
test('root and the legacy anonymous bridge are closed to everyone, including Admin', () => {
  only([], user => canRead(user, ''));
  only([], user => canRead(user, 'activePlusSync/v1/staffAccounts'));
  only([], user => canWrite(user, 'activePlusSync/v1/staffAccounts/admin', { username: 'evil', pinHash: 'y' }));
  only([], user => canRead(user, V2_ROOT));
});

test('settings and notices: every active account reads, only Admin writes', () => {
  const active = ['admin', 'manager', 'teacher', 'teacher2', 'payment', 'studentA', 'studentB'];
  only(active, user => canRead(user, R('settings')));
  only(active, user => canRead(user, R('notices')));
  only(['admin'], user => canWrite(user, R('settings/broadcast'), 'urgent'));
  only(['admin'], user => canWrite(user, R('notices/n2'), { id: 'n2', title: 'New' }));
  assert.equal(canWrite(USERS.admin, R('notices/n2'), { id: 'other', title: 'x' }), false, 'record id must match key');
  assert.equal(canWrite(USERS.admin, R('notices'), { n2: { id: 'n2' } }), false, 'no whole-collection replace');
});

test('roster: staff read all; a student reads only their own record; Admin/Manager write', () => {
  only(['admin', 'manager', 'teacher', 'teacher2', 'payment'], user => canRead(user, R('students')));
  only(['admin', 'manager', 'teacher', 'teacher2', 'payment', 'studentA'], user => canRead(user, R('students/S1')));
  only(['admin', 'manager', 'teacher', 'teacher2', 'payment', 'studentB'], user => canRead(user, R('students/S2')));
  only(['admin', 'manager'], user => canWrite(user, R('students/S3'), { id: 'S3', name: 'C' }));
  assert.equal(canWrite(USERS.studentA, R('students/S1/name'), 'Changed'), false);
});

test('transactions: Payment creates only; Admin corrects/deletes; students read their ledger', () => {
  only(['admin', 'payment'], user => canRead(user, R('transactions')));
  only(['admin', 'payment'], user => canWrite(user, R('transactions/tx2'), { id: 'tx2', studentId: 'S1', amount: 100 }));
  only(['admin'], user => canWrite(user, R('transactions/tx1'), { id: 'tx1', studentId: 'S1', amount: 1 }));
  only(['admin'], user => canWrite(user, R('transactions/tx1'), null));
  assert.equal(canWrite(USERS.payment, R('transactions/tx2'), { id: 'tx2', amount: 100 }), false, 'studentId required');
  only(['admin', 'payment', 'studentA'], user => canRead(user, R('studentLedger/S1')));
  only(['admin', 'payment'], user => canRead(user, R('studentLedger')));
  only([], user => canWrite(user, R('studentLedger/S1/tx9'), { amount: 1 }));
});

test('exams: teachers edit their own unpublished papers; nobody publishes from a client; students never see answer keys', () => {
  only(['admin', 'manager', 'teacher', 'teacher2'], user => canRead(user, R('exams')));
  only(['admin', 'teacher'], user => canWrite(user, R('exams/e4'), exam()));
  only(['admin', 'teacher'], user => canWrite(user, R('exams/e1'), exam({ id: 'e1', status: 'pending' })));
  only([], user => canWrite(user, R('exams/e1'), exam({ id: 'e1', status: 'published' })));
  only([], user => canWrite(user, R('exams/e2'), exam({ id: 'e2', status: 'draft' })));
  only(['admin', 'teacher2'], user => canWrite(user, R('exams/e3'), exam({ id: 'e3', teacherId: 'T2', status: 'draft' })));
  assert.equal(canWrite(USERS.teacher, R('exams/e5'), exam({ id: 'e5', teacherId: 'T2' })), false, 'cannot create for another teacher');
  assert.equal(canWrite(USERS.teacher2, R('exams/e1'), exam({ id: 'e1', teacherId: 'T2' })), false, 'cannot take over a paper');
  only(['admin'], user => canWrite(user, R('exams/e2'), null));
  only(['admin', 'manager', 'teacher', 'teacher2', 'studentA'], user => canRead(user, R('studentExams/S1')));
  only([], user => canWrite(user, R('studentExams/S1/e9'), { id: 'e9' }));
});

test('attempts: a student writes only their own, only for a paper they were given, never after submission', () => {
  only(['studentA'], user => canWrite(user, R('attempts/S1/a2'), attempt()));
  assert.equal(canWrite(USERS.studentA, R('attempts/S1/a2'), attempt({ examId: 'e1' })), false, 'paper not in inbox');
  assert.equal(canWrite(USERS.studentA, R('attempts/S2/a2'), attempt({ studentId: 'S2' })), false, 'other student subtree');
  assert.equal(canWrite(USERS.studentA, R('attempts/S1/a2'), attempt({ studentId: 'S2' })), false, 'studentId must match path');
  assert.equal(canWrite(USERS.studentA, R('attempts/S1/a1'), attempt({ id: 'a1', status: 'active' })), false, 'submitted is final');
  assert.equal(canWrite(USERS.studentA, R('attempts/S1/a2'), attempt({ startedAt: NOW + 60_000 })), false, 'no future start time');
  assert.equal(canWrite(USERS.studentA, R('attempts/S1/a2'), null), false, 'students cannot delete attempts');
  only(['admin'], user => canWrite(user, R('attempts/S1/a1'), null));
  only(['admin', 'manager', 'teacher', 'teacher2'], user => canRead(user, R('attempts')));
  only(['admin', 'manager', 'teacher', 'teacher2', 'studentA'], user => canRead(user, R('attempts/S1')));
  only(['admin', 'manager', 'teacher', 'teacher2', 'studentA'], user => canRead(user, R('results/S1')));
  only([], user => canWrite(user, R('results/S1/e2'), { score: 100 }));
});

test('push tokens: owner-only writes bound to the real role/studentId; no client reads', () => {
  only(['studentA'], user => canWrite(user, R('pushTokens/u-sa/d1'), tokenRecord()));
  assert.equal(canWrite(USERS.studentB, R('pushTokens/u-sa/d1'), tokenRecord()), false, 'other uid');
  assert.equal(canWrite(USERS.studentA, R('pushTokens/u-sa/d1'), tokenRecord({ studentId: 'S2' })), false, 'foreign studentId');
  assert.equal(canWrite(USERS.studentA, R('pushTokens/u-sa/d1'), tokenRecord({ role: 'admin' })), false, 'role spoof');
  assert.equal(canWrite(USERS.admin, R('pushTokens/u-admin/d1'), tokenRecord({ role: 'admin', studentId: '' })), true);
  assert.equal(canWrite(USERS.admin, R('pushTokens/u-admin/d1'), tokenRecord({ role: 'admin', studentId: 'S1' })), false, 'staff cannot claim a student');
  assert.equal(canWrite(USERS.studentA, R('pushTokens/u-sa/d1'), null), true, 'owner may unregister');
  only([], user => canRead(user, R('pushTokens')));
  only([], user => canRead(user, R('pushTokens/u-sa')));
});

test('blocked identities get nothing anywhere in the v2 tree', () => {
  const paths = ['settings', 'notices', 'routine', 'teaching', 'teacherAssignments', 'students', 'students/S9',
    'transactions', 'studentLedger/S9', 'exams', 'studentExams/S9', 'attempts', 'attempts/S9', 'results/S9'];
  for (const [name, user] of Object.entries(BLOCKED)) {
    for (const path of paths) assert.equal(canRead(user, R(path)), false, `${name} read ${path}`);
    assert.equal(canWrite(user, R('notices/n9'), { id: 'n9' }), false, `${name} write notice`);
    assert.equal(canWrite(user, R('attempts/S9/z'), attempt({ id: 'z', studentId: 'S9' })), false, `${name} write attempt`);
  }
});
