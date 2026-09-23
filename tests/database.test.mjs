import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, SYNCABLE, LOCAL_ONLY, listDocuments, listDocumentsStrict, replaceDocuments, replaceDocumentsStrict, rememberAccount, newId } from '../js/database.js';
import { saveAccount, loadAccount, generateStudentId } from '../js/storage.js';
import { financeRepository, TRANSACTIONS_KEY, stampTransaction } from '../js/finance-data.js';

function setup() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value)
    }
  };
  return store;
}

test('collections keep the existing storage keys and leave secrets off the sync list', () => {
  assert.equal(KEYS.students, 'activePlus.admin.students.v1');
  assert.equal(KEYS.transactions, TRANSACTIONS_KEY);
  assert.equal(KEYS.teaching, 'activePlus.teaching.v1');
  assert.equal(KEYS.exams, 'activePlus.exams.v1');
  assert.equal(SYNCABLE.includes('students'), true);
  assert.equal(SYNCABLE.includes('account'), false);
  assert.equal(LOCAL_ONLY.includes('account'), true);
});

test('empty collections stay empty and round-trip without adding fields', () => {
  const store = setup();
  assert.deepEqual(listDocuments('students'), []);
  assert.deepEqual(listDocumentsStrict('transactions', () => true), []);
  replaceDocuments('notices', [{ id: 'NOT-1', title: 'বন্ধ' }]);
  assert.deepEqual(listDocuments('notices'), [{ id: 'NOT-1', title: 'বন্ধ' }]);
  const tx = { id: 'TRX-1', studentId: 'S-1', amount: 500 };
  replaceDocumentsStrict('transactions', [tx]);
  assert.deepEqual(JSON.parse(store.get(KEYS.transactions)), [tx]);
});

test('corrupt ledger is rejected and left untouched', () => {
  const store = setup();
  store.set(KEYS.transactions, 'corrupt-json');
  assert.throws(() => listDocumentsStrict('transactions', () => true));
  assert.equal(store.get(KEYS.transactions), 'corrupt-json');
});

test('account mirror keeps the login password on the device and out of the collection', () => {
  setup();
  assert.equal(saveAccount({
    mobile: '01711223344',
    pin: '123123',
    username: 'raisa.islam',
    student: { id: 'S-9', name: 'রাইসা', pin: 'secret', securityAnswer: 'no' }
  }), true);
  const login = loadAccount();
  assert.equal(login.pin, '123123');
  const mirrored = JSON.parse(window.localStorage.getItem(KEYS.accounts));
  assert.equal(mirrored['S-9'].username, 'raisa.islam');
  assert.equal(mirrored['S-9'].pin, undefined);
  assert.equal(mirrored['S-9'].student.pin, undefined);
  assert.equal(mirrored['S-9'].student.securityAnswer, undefined);
  assert.equal(rememberAccount({ studentId: 'S-9' }), true);
});

test('new ids do not collide and student ids are not a shared counter alone', () => {
  const first = newId('NOT');
  const second = newId('NOT');
  assert.notEqual(first, second);
  assert.match(first, /^NOT-/);
  setup();
  const now = new Date();
  const prefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const a = generateStudentId('দশম শ্রেণি');
  const b = generateStudentId('দশম শ্রেণি');
  assert.notEqual(a, b);
  assert.match(a, new RegExp(`^${prefix}0`));
  assert.notEqual(a, `${prefix}0001`);
});

test('stamped payments keep the exact saved fields plus a sortable time', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  const tx = stampTransaction({ id: 'TRX-2', studentId: 'S-1', amount: 100, date: '২৩ সেপ্টেম্বর ২০২৬' }, now);
  assert.equal(tx.recordedAt, now.getTime());
  assert.equal(tx.createdAt, now.toISOString());
  assert.equal(tx.amount, 100);
  setup();
  return financeRepository.saveTransaction(tx).then(saved => {
    assert.deepEqual(saved[0], tx);
  });
});
