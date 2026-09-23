/* Shared counter credentials: the payment desk and the student login page both
   rely on this module, so the rules live in one place and are tested here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAYMENT_USER_ID,
  DEFAULT_PAYMENT_PIN,
  PAYMENT_ACCOUNT_KEY,
  PAYMENT_SESSION_KEY,
  PAYMENT_PORTAL_PATH,
  PAYMENT_REMEMBER_DAYS,
  loadPaymentAccount,
  isPaymentUserId,
  verifyPaymentCredentials,
  savePaymentSession,
  hasPaymentSession,
  clearPaymentSession,
  changePaymentPin
} from '../js/payment-auth.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map
  };
}

function freshBrowser() {
  globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
  return window;
}

test('demo counter account is created on first use and verifies the ID + PIN pair', () => {
  const browser = freshBrowser();
  assert.deepEqual(loadPaymentAccount(), { userId: PAYMENT_USER_ID, pin: DEFAULT_PAYMENT_PIN });
  assert.deepEqual(JSON.parse(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY)), { userId: 'APC-PAY-001', pin: '123123' });

  assert.equal(verifyPaymentCredentials('APC-PAY-001', '123123'), true);
  assert.equal(verifyPaymentCredentials('  apc-pay-001 ', '123123'), true); // case/space tolerant
  assert.equal(verifyPaymentCredentials('APC-PAY-001', '১২৩১২৩'), true); // Bengali digits
  assert.equal(verifyPaymentCredentials('APC-PAY-001', '123124'), false);
  assert.equal(verifyPaymentCredentials('APC-PAY-002', '123123'), false);
  assert.equal(verifyPaymentCredentials('APC-PAY-001', ''), false);
  assert.equal(verifyPaymentCredentials('01700000000', '123123'), false);
});

test('counter ID is recognised without creating the account; mobile numbers are not', () => {
  const browser = freshBrowser();
  assert.equal(isPaymentUserId('APC-PAY-001'), true);
  assert.equal(isPaymentUserId('apc-pay-001'), true);
  assert.equal(isPaymentUserId('APC-PAY 001'), true);
  assert.equal(isPaymentUserId('01700000000'), false);
  assert.equal(isPaymentUserId('রাইসা'), false);
  assert.equal(isPaymentUserId(''), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY), null);
});

test('remembered sessions last 90 days in localStorage; tab sessions do not survive a closed tab', () => {
  const browser = freshBrowser();
  assert.equal(hasPaymentSession(), false);

  assert.equal(savePaymentSession(true), true);
  assert.equal(hasPaymentSession(), true);
  const stored = JSON.parse(browser.localStorage.getItem(PAYMENT_SESSION_KEY));
  const days = (stored.expiry - Date.now()) / 86400000;
  assert.ok(days > PAYMENT_REMEMBER_DAYS - 1 && days <= PAYMENT_REMEMBER_DAYS);
  assert.equal(browser.sessionStorage.getItem(PAYMENT_SESSION_KEY), null);

  clearPaymentSession();
  assert.equal(hasPaymentSession(), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);

  // Not remembered: the marker lives only in sessionStorage.
  savePaymentSession(false);
  assert.equal(hasPaymentSession(), true);
  assert.equal(browser.sessionStorage.getItem(PAYMENT_SESSION_KEY), '1');
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);
  browser.sessionStorage._map.clear(); // simulate closing the tab
  assert.equal(hasPaymentSession(), false);
});

test('expired sessions are dropped, and unreadable storage counts as signed out', () => {
  const browser = freshBrowser();
  browser.localStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify({ expiry: Date.now() - 1000 }));
  assert.equal(hasPaymentSession(), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);

  browser.localStorage.setItem(PAYMENT_SESSION_KEY, '{not json');
  assert.equal(hasPaymentSession(), false);

  globalThis.window = {
    get localStorage() { throw new Error('blocked'); },
    get sessionStorage() { throw new Error('blocked'); }
  };
  assert.equal(hasPaymentSession(), false);
  assert.equal(savePaymentSession(true), false);
  clearPaymentSession(); // must not throw
});

test('PIN change keeps the user ID, accepts Bengali digits and rejects bad input', () => {
  const browser = freshBrowser();
  assert.deepEqual(changePaymentPin('111111', '456789', '456789'), { ok: false, error: 'বর্তমান PIN সঠিক নয়।' });
  assert.deepEqual(changePaymentPin('123123', '123', '123'), { ok: false, error: 'নতুন PIN ৪–৬ সংখ্যার হতে হবে।' });
  assert.deepEqual(changePaymentPin('123123', '456789', '456780'), { ok: false, error: 'দুইবার লেখা নতুন PIN মিলছে না।' });

  assert.deepEqual(changePaymentPin('১২৩১২৩', '৪৫৬৭৮৯', '456789'), { ok: true, pin: '456789' });
  assert.deepEqual(JSON.parse(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY)), { userId: 'APC-PAY-001', pin: '456789' });
  assert.equal(verifyPaymentCredentials('APC-PAY-001', '123123'), false);
  assert.equal(verifyPaymentCredentials('APC-PAY-001', '456789'), true);
});

test('PIN change reports a storage failure instead of pretending to save', () => {
  freshBrowser();
  loadPaymentAccount();
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.deepEqual(
    changePaymentPin('123123', '456789', '456789'),
    { ok: false, error: 'PIN সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।' }
  );
});

test('the handoff target is the counter page that actually ships', () => {
  assert.equal(PAYMENT_PORTAL_PATH, 'payment.html');
  const html = readFileSync(new URL('../payment.html', import.meta.url), 'utf8');
  assert.match(html, /id="payShell"/);
});
