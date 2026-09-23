/* Counter credentials for the standalone Payment Receive desk.
   payment.html checks them on its own entry screen, and the student login page
   (index.html) checks the very same pair — so a counter operator can type the
   portal user ID + PIN on the login page and be dropped straight onto the desk
   (auto-login, no second form).
   Demo-only: the account lives in localStorage as plain values. When a real
   server exists, swap this module for an API adapter; the storage keys below
   are what the UI already reads, so nothing else has to change. */
import { latinDigits } from './finance-data.js';

export const PAYMENT_USER_ID = 'APC-PAY-001';
export const DEFAULT_PAYMENT_PIN = '123123';
export const PAYMENT_ACCOUNT_KEY = 'activePlus.paymentAccount.v1';
export const PAYMENT_SESSION_KEY = 'activePlus.paymentSession.v1';
export const PAYMENT_PORTAL_PATH = 'payment.html';
export const PAYMENT_REMEMBER_DAYS = 90;

function readJSON(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
}

function writeJSON(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export const paymentDigits = value => latinDigits(value).replace(/[^0-9]/g, '');

function pinMatches(input, pin) {
  const typed = paymentDigits(input);
  return typed.length > 0 && typed === pin;
}

const normalId = value => String(value ?? '').trim().toUpperCase();

/** The stored counter account; created with the demo ID/PIN on first use. */
export function loadPaymentAccount() {
  const stored = readJSON(PAYMENT_ACCOUNT_KEY);
  if (stored && stored.userId && typeof stored.pin === 'string') return stored;
  const account = { userId: stored?.userId || PAYMENT_USER_ID, pin: DEFAULT_PAYMENT_PIN };
  writeJSON(PAYMENT_ACCOUNT_KEY, account);
  return account;
}

/** True when the typed text looks like the counter ID rather than a mobile number. */
export function isPaymentUserId(value) {
  const typed = normalId(value);
  if (!typed) return false;
  if (/^APC-PAY[-_ ]?\d{2,}$/.test(typed)) return true;
  // A renamed counter ID still routes here, without creating the account key.
  const stored = readJSON(PAYMENT_ACCOUNT_KEY);
  return Boolean(stored?.userId) && typed === normalId(stored.userId);
}

/** Case-tolerant ID compare + PIN compare (Bengali digits accepted). */
export function verifyPaymentCredentials(userId, pin) {
  const account = loadPaymentAccount();
  return normalId(userId) === normalId(account.userId) && pinMatches(pin, account.pin);
}

export function savePaymentSession(remember = true) {
  try {
    window.sessionStorage.removeItem(PAYMENT_SESSION_KEY);
    if (remember) {
      writeJSON(PAYMENT_SESSION_KEY, { expiry: Date.now() + PAYMENT_REMEMBER_DAYS * 86400000 });
    } else {
      window.localStorage.removeItem(PAYMENT_SESSION_KEY);
      window.sessionStorage.setItem(PAYMENT_SESSION_KEY, '1');
    }
    return true;
  } catch { return false; } // private browsing: the session just won't survive a reload
}

export function hasPaymentSession() {
  try {
    if (window.sessionStorage.getItem(PAYMENT_SESSION_KEY) === '1') return true;
    const stored = readJSON(PAYMENT_SESSION_KEY);
    if (stored?.expiry && Date.now() < stored.expiry) return true;
    window.localStorage.removeItem(PAYMENT_SESSION_KEY);
    return false;
  } catch { return false; }
}

export function clearPaymentSession() {
  try {
    window.localStorage.removeItem(PAYMENT_SESSION_KEY);
    window.sessionStorage.removeItem(PAYMENT_SESSION_KEY);
  } catch { /* no-op */ }
}

/** PIN change with the exact Bengali messages the counter UI shows. */
export function changePaymentPin(currentPin, nextPin, confirmPin) {
  const account = loadPaymentAccount();
  if (!pinMatches(currentPin, account.pin)) return { ok: false, error: 'বর্তমান PIN সঠিক নয়।' };
  const pin = paymentDigits(nextPin);
  if (pin.length < 4 || pin.length > 6) return { ok: false, error: 'নতুন PIN ৪–৬ সংখ্যার হতে হবে।' };
  if (pin !== paymentDigits(confirmPin)) return { ok: false, error: 'দুইবার লেখা নতুন PIN মিলছে না।' };
  if (!writeJSON(PAYMENT_ACCOUNT_KEY, { userId: account.userId, pin })) {
    return { ok: false, error: 'PIN সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।' };
  }
  return { ok: true, pin };
}
