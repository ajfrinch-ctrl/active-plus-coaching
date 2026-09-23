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

test('the payment desk verifies payment.apc without writing an account until the password changes', () => {
  const browser = freshBrowser();
  assert.equal(PAYMENT_USER_ID, 'payment.apc');
  assert.equal(DEFAULT_PAYMENT_PIN, 'Apc@2026');
  assert.deepEqual(loadPaymentAccount(), {
    userId: 'payment.apc', username: 'payment.apc', pin: 'Apc@2026', password: 'Apc@2026'
  });
  assert.equal(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY), null);

  assert.equal(verifyPaymentCredentials('payment.apc', 'Apc@2026'), true);
  assert.equal(verifyPaymentCredentials('  Payment.APC ', 'Apc@2026'), true);
  assert.equal(verifyPaymentCredentials('payment.apc', 'wrong'), false);
  assert.equal(verifyPaymentCredentials('admin.apc', 'Apc@2026'), false);
  assert.equal(verifyPaymentCredentials('payment.apc', ''), false);
  assert.equal(verifyPaymentCredentials('01700000000', 'Apc@2026'), false);
});

test('the payment username is recognised without creating the account; other names are not', () => {
  const browser = freshBrowser();
  assert.equal(isPaymentUserId('payment.apc'), true);
  assert.equal(isPaymentUserId('Payment.APC'), true);
  assert.equal(isPaymentUserId('payment apc'), false);
  assert.equal(isPaymentUserId('APC-PAY-001'), false);
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

test('password change keeps the username and rejects a short or mismatched password', () => {
  const browser = freshBrowser();
  assert.deepEqual(changePaymentPin('wrong', '456789', '456789'), { ok: false, error: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' });
  assert.deepEqual(changePaymentPin('Apc@2026', '123', '123'), { ok: false, error: 'নতুন পাসওয়ার্ড ৬–৩২ অক্ষরের হতে হবে।' });
  assert.deepEqual(changePaymentPin('Apc@2026', '456789', '456780'), { ok: false, error: 'দুইবার লেখা নতুন পাসওয়ার্ড মিলছে না।' });

  assert.deepEqual(changePaymentPin('Apc@2026', '456789', '456789'), { ok: true, pin: '456789', password: '456789' });
  assert.deepEqual(JSON.parse(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY)), { username: 'payment.apc', password: '456789' });
  assert.equal(verifyPaymentCredentials('payment.apc', 'Apc@2026'), false);
  assert.equal(verifyPaymentCredentials('payment.apc', '456789'), true);
});

test('password change reports a storage failure instead of pretending to save', () => {
  freshBrowser();
  loadPaymentAccount();
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.deepEqual(
    changePaymentPin('Apc@2026', '456789', '456789'),
    { ok: false, error: 'পাসওয়ার্ড সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।' }
  );
});

test('the handoff target is the counter page that actually ships', () => {
  assert.equal(PAYMENT_PORTAL_PATH, 'payment.html');
  const html = readFileSync(new URL('../payment.html', import.meta.url), 'utf8');
  assert.match(html, /id="payShell"/);
});
