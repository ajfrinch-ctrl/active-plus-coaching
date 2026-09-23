/* Shared staff logins for admin, teacher and the payment desk.
   Usernames are reserved so a student cannot claim them. The password is
   stored locally and can be changed; the first login uses the office default. */

import { STAFF_KEYS, readJSON, writeJSON } from './database.js';

export const STAFF_PASSWORD = 'Apc@2026';

export const STAFF_ACCOUNTS = Object.freeze({
  admin: {
    role: 'admin',
    username: 'admin.apc',
    password: STAFF_PASSWORD,
    accountKey: STAFF_KEYS.adminAccount,
    sessionKey: STAFF_KEYS.adminSession
  },
  teacher: {
    role: 'teacher',
    username: 'teacher.apc',
    password: STAFF_PASSWORD,
    accountKey: STAFF_KEYS.teacherAccount,
    sessionKey: STAFF_KEYS.teacherSession
  },
  payment: {
    role: 'payment',
    username: 'payment.apc',
    password: STAFF_PASSWORD,
    accountKey: STAFF_KEYS.paymentAccount,
    sessionKey: STAFF_KEYS.paymentSession
  }
});

export const STAFF_USERNAMES = Object.freeze(Object.values(STAFF_ACCOUNTS).map(account => account.username));

const REMEMBER_DAYS = 90;

export function normalizeStaffUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function loadStaffAccount(role) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return null;
  const stored = readJSON(spec.accountKey);
  const password = typeof stored?.password === 'string' && stored.password
    ? stored.password
    : (typeof stored?.pin === 'string' && stored.pin ? stored.pin : spec.password);
  return { username: spec.username, password };
}

export function verifyStaffCredentials(role, username, password) {
  const account = loadStaffAccount(role);
  if (!account) return false;
  return normalizeStaffUsername(username) === account.username && String(password ?? '') === account.password;
}

export function saveStaffSession(role, remember = true) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return false;
  try {
    window.sessionStorage.removeItem(spec.sessionKey);
    if (remember) return writeJSON(spec.sessionKey, { expiry: Date.now() + REMEMBER_DAYS * 86400000, role });
    window.localStorage.removeItem(spec.sessionKey);
    window.sessionStorage.setItem(spec.sessionKey, '1');
    return true;
  } catch { return false; }
}

export function hasStaffSession(role) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return false;
  try {
    if (window.sessionStorage.getItem(spec.sessionKey) === '1') return true;
    const stored = readJSON(spec.sessionKey);
    if (stored?.expiry && Date.now() < stored.expiry) return true;
    window.localStorage.removeItem(spec.sessionKey);
    return false;
  } catch { return false; }
}

export function clearStaffSession(role) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return;
  try {
    window.localStorage.removeItem(spec.sessionKey);
    window.sessionStorage.removeItem(spec.sessionKey);
  } catch { /* no-op */ }
}

export function changeStaffPassword(role, currentPassword, nextPassword, confirmPassword) {
  const account = loadStaffAccount(role);
  if (!account || String(currentPassword ?? '') !== account.password) {
    return { ok: false, error: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' };
  }
  const password = String(nextPassword ?? '');
  if (password.length < 6 || password.length > 32) {
    return { ok: false, error: 'নতুন পাসওয়ার্ড ৬–৩২ অক্ষরের হতে হবে।' };
  }
  if (password !== String(confirmPassword ?? '')) {
    return { ok: false, error: 'দুইবার লেখা নতুন পাসওয়ার্ড মিলছে না।' };
  }
  const spec = STAFF_ACCOUNTS[role];
  if (!writeJSON(spec.accountKey, { username: spec.username, password })) {
    return { ok: false, error: 'পাসওয়ার্ড সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।' };
  }
  return { ok: true, password };
}
