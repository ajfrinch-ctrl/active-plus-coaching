import test from 'node:test';
import assert from 'node:assert/strict';
import { protectAccountIdentity, appendAccountMobile, contactNumber, isContactNumber } from '../js/account-policy.js';
import { saveAccount, loadAccount, saveStudent, writeJSON } from '../js/storage.js';
import { STORAGE_KEYS, DEFAULT_PIN } from '../js/config.js';
const primary = '01711223344', extra = '01811223344';
function setup() {
  const store = new Map(); let broken = false;
  globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { if (broken) throw new Error('quota'); store.set(k, v); } } };
  return { store, fail: () => { broken = true; } };
}
for (const role of ['student', 'teacher']) {
  test(`${role}: first number immutable, contacts append-only, default password shared`, () => {
    const initial = protectAccountIdentity({ role, mobile: primary });
    assert.equal(initial.pin, '123123');
    const added = appendAccountMobile(initial, '+8801811223344');
    const edited = protectAccountIdentity({ ...added, registrationMobile: '', mobile: extra, additionalMobiles: [] }, added);
    assert.equal(edited.mobile, primary); assert.equal(edited.registrationMobile, primary);
    assert.deepEqual(edited.additionalMobiles, [extra]);
    assert.throws(() => appendAccountMobile(added, primary));
    assert.throws(() => appendAccountMobile(added, extra));
    assert.throws(() => appendAccountMobile(added, '123'));
  });
}
test('Bengali/local/international formats; reject invalid characters and prefixes', () => {
  assert.equal(contactNumber('+৮৮০ ১৭১১-২২৩৩৪৪'), primary);
  for (const value of ['01111223344', 'hello01711223344', '0171122334', '', '017112233444']) assert.equal(isContactNumber(value), false);
});
test('storage enforcement ignores attempted primary replacements and omitted contacts', () => {
  setup(); assert.equal(saveAccount({ mobile: primary, student: { id: 'S-1', studentMobile: extra } }), true);
  let current = loadAccount(); assert.equal(current.student.studentMobile, primary);
  assert.equal(saveAccount(appendAccountMobile(current, extra)), true);
  assert.equal(saveAccount({ ...loadAccount(), mobile: '01911223344', registrationMobile: '', additionalMobiles: [], student: { id: 'S-1', studentMobile: '' } }), true);
  current = loadAccount(); assert.equal(current.mobile, primary); assert.deepEqual(current.additionalMobiles, [extra]);
  saveStudent({ id: 'S-1', studentMobile: extra });
  assert.equal(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.student)).studentMobile, primary);
});
test('legacy account anchors current login number, preserves separate contact and custom PIN', () => {
  const env = setup(); env.store.set(STORAGE_KEYS.account, JSON.stringify({ mobile: primary, pin: '789789', student: { id: 'S-1', studentMobile: extra } }));
  const current = loadAccount(); assert.equal(current.registrationMobile, primary); assert.equal(current.student.studentMobile, primary);
  assert.deepEqual(current.additionalMobiles, [extra]); assert.equal(current.pin, '789789');
  assert.equal(saveAccount(current), true);
  assert.equal(saveAccount({ ...current, pin: DEFAULT_PIN }), true);
  assert.equal(loadAccount().pin, '123123'); assert.equal(loadAccount().mobile, primary);
});
test('failed/corrupt/unavailable storage is never reported as successful', () => {
  let env = setup(); saveAccount({ mobile: primary }); env.fail();
  assert.equal(saveAccount({ mobile: extra }), false); assert.equal(loadAccount().mobile, primary);
  env = setup(); env.store.set(STORAGE_KEYS.account, '{broken'); assert.equal(saveAccount({ mobile: primary }), false); assert.equal(env.store.get(STORAGE_KEYS.account), '{broken');
  globalThis.window = { get localStorage() { throw new Error('unavailable'); } };
  assert.equal(writeJSON('test', {}), false); assert.equal(saveAccount({ mobile: primary }), false);
});
