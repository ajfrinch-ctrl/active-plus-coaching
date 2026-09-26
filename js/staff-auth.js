/* Shared staff logins for admin, teacher and the payment desk.
   Usernames are reserved so a student cannot claim them.

   Security rules (Phase 1):
   • There is no built-in default password. The first time a role signs in on
     a device it sets its own password; a password created by an office
     provisioning flow (or migrated from the retired plaintext default) is
     marked must-change and has to be replaced before the panel opens.
   • Passwords are stored only as PBKDF2-HMAC-SHA256 hashes (password-hash.js),
     inside an AES-GCM envelope when the platform allows it (secure-store.js).
     Plaintext passwords are never written to storage.
   • Sessions are random tokens bound to this device id with an expiry
     (session.js); "remember me" keeps the token in localStorage for 90 days,
     otherwise it lives in sessionStorage and dies with the tab. */

import { STAFF_KEYS, readJSON, writeJSON } from './database.js';
import { hashPassword, verifyPassword, isPasswordRecord } from './password-hash.js';
import { encryptValue, decryptValue, isEncryptedEnvelope } from './secure-store.js';
import { buildSessionRecord, isSessionRecordValid, DAY_MS } from './session.js';

const REMEMBER_DAYS = 90;
const TAB_SESSION_MARKER = '1';

/* Migration note: a record written by the retired plaintext scheme (a username
   plus a bare password string) is recognised by shape and re-hashed on the
   next successful login. No default password value exists in this file. */
const WRONG_CREDENTIALS = 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।';
const PASSWORD_RULE = 'নতুন পাসওয়ার্ড ৬–৩২ অক্ষরের হতে হবে।';
const PASSWORD_MISMATCH = 'দুইবার লেখা নতুন পাসওয়ার্ড মিলছে না।';
const PASSWORD_STORE_FAILED = 'পাসওয়ার্ড সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।';

export const STAFF_ACCOUNTS = Object.freeze({
  admin: {
    role: 'admin',
    username: 'admin.apc',
    accountKey: STAFF_KEYS.adminAccount,
    sessionKey: STAFF_KEYS.adminSession
  },
  teacher: {
    role: 'teacher',
    username: 'teacher.apc',
    accountKey: STAFF_KEYS.teacherAccount,
    sessionKey: STAFF_KEYS.teacherSession
  },
  payment: {
    role: 'payment',
    username: 'payment.apc',
    accountKey: STAFF_KEYS.paymentAccount,
    sessionKey: STAFF_KEYS.paymentSession
  }
});

export const STAFF_USERNAMES = Object.freeze(Object.values(STAFF_ACCOUNTS).map(account => account.username));

export function normalizeStaffUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function staffSpec(role) {
  return STAFF_ACCOUNTS[role] || null;
}

/** The stored record, decrypted when possible. Null when never provisioned. */
export async function readStaffAccount(role) {
  const spec = staffSpec(role);
  if (!spec) return null;
  let raw;
  try { raw = readJSON(spec.accountKey); } catch { return null; }
  if (raw === null || raw === undefined) return null;
  if (isEncryptedEnvelope(raw)) {
    const plaintext = await decryptValue(raw);
    if (!plaintext) return null;
    try { return JSON.parse(plaintext); } catch { return null; }
  }
  return raw && typeof raw === 'object' ? raw : null;
}

async function writeStaffAccount(role, account) {
  const spec = staffSpec(role);
  if (!spec || !account) return false;
  try {
    const envelope = await encryptValue(JSON.stringify(account));
    return envelope ? writeJSON(spec.accountKey, envelope) : writeJSON(spec.accountKey, account);
  } catch { return false; }
}

/** True when the role has never set a password on this device. */
export async function staffNeedsSetup(role) {
  const account = await readStaffAccount(role);
  return !account || typeof account.password === 'undefined';
}

/**
 * One call for every login form. Resolves to:
 *  { ok: false, error }                      — wrong username or password
 *  { ok: true, needsSetup: true }            — first use: the role picks a password
 *  { ok: true, needsPasswordChange: true }   — verified, but a new password is due
 *  { ok: true }                              — verified and up to date
 * Legacy plaintext records are verified once and immediately re-hashed.
 */
export async function authenticateStaff(role, username, password) {
  const spec = staffSpec(role);
  if (!spec || normalizeStaffUsername(username) !== spec.username) {
    return { ok: false, error: WRONG_CREDENTIALS };
  }
  const account = await readStaffAccount(role);
  if (!account || typeof account.password === 'undefined') {
    return { ok: true, needsSetup: true };
  }
  if (isPasswordRecord(account.password)) {
    const valid = await verifyPassword(password, account.password);
    if (!valid) return { ok: false, error: WRONG_CREDENTIALS };
    return { ok: true, needsPasswordChange: Boolean(account.mustChangePassword) };
  }
  // Legacy plaintext record: verify, then hash it away on the spot.
  const legacy = String(account.password ?? '');
  if (!legacy || String(password ?? '') !== legacy) {
    return { ok: false, error: WRONG_CREDENTIALS };
  }
  const upgraded = await writeStaffAccount(role, {
    username: spec.username,
    password: await hashPassword(legacy),
    mustChangePassword: true,
    migratedAt: new Date().toISOString()
  });
  if (!upgraded) return { ok: false, error: PASSWORD_STORE_FAILED };
  return { ok: true, needsPasswordChange: true };
}

/** No-plaintext view of a staff account, for UI hints and tests. */
export async function loadStaffAccount(role) {
  const spec = staffSpec(role);
  if (!spec) return null;
  const account = await readStaffAccount(role);
  if (!account) return { username: spec.username, hasPassword: false, mustChangePassword: false, isLegacy: false };
  const isLegacy = typeof account.password === 'string' && !isPasswordRecord(account.password);
  return {
    username: spec.username,
    hasPassword: typeof account.password !== 'undefined',
    mustChangePassword: isLegacy || Boolean(account.mustChangePassword),
    isLegacy
  };
}

export async function verifyStaffCredentials(role, username, password) {
  const result = await authenticateStaff(role, username, password);
  return result.ok && !result.needsSetup && !result.needsPasswordChange;
}

function passwordProblem(nextPassword, confirmPassword) {
  const password = String(nextPassword ?? '');
  if (password.length < 6 || password.length > 32) return PASSWORD_RULE;
  if (password !== String(confirmPassword ?? '')) return PASSWORD_MISMATCH;
  return '';
}

/** First-use provisioning: only allowed while no password exists. */
export async function provisionStaffAccount(role, nextPassword, confirmPassword) {
  const spec = staffSpec(role);
  if (!spec) return { ok: false, error: 'অজানা ভূমিকা।' };
  const problem = passwordProblem(nextPassword, confirmPassword);
  if (problem) return { ok: false, error: problem };
  if (!(await staffNeedsSetup(role))) {
    return { ok: false, error: 'এই ইউজারনেমের পাসওয়ার্ড আগেই নির্ধারিত হয়েছে। লগইন করুন।' };
  }
  const saved = await writeStaffAccount(role, {
    username: spec.username,
    password: await hashPassword(nextPassword),
    createdAt: new Date().toISOString()
  });
  if (!saved) return { ok: false, error: PASSWORD_STORE_FAILED };
  return { ok: true };
}

/** Replace the password directly (used after verification, or by provisioning). */
export async function setStaffPassword(role, nextPassword, confirmPassword) {
  const spec = staffSpec(role);
  if (!spec) return { ok: false, error: 'অজানা ভূমিকা।' };
  const problem = passwordProblem(nextPassword, confirmPassword);
  if (problem) return { ok: false, error: problem };
  const saved = await writeStaffAccount(role, {
    username: spec.username,
    password: await hashPassword(nextPassword),
    updatedAt: new Date().toISOString()
  });
  if (!saved) return { ok: false, error: PASSWORD_STORE_FAILED };
  return { ok: true };
}

/** Change password from inside a panel: the current password must match. */
export async function changeStaffPassword(role, currentPassword, nextPassword, confirmPassword) {
  const spec = staffSpec(role);
  if (!spec) return { ok: false, error: 'অজানা ভূমিকা।' };
  const account = await readStaffAccount(role);
  if (!account || typeof account.password === 'undefined') {
    return { ok: false, error: 'এই ডিভাইসে পাসওয়ার্ড নির্ধারিত হয়নি।' };
  }
  const currentOk = isPasswordRecord(account.password)
    ? await verifyPassword(currentPassword, account.password)
    : String(currentPassword ?? '') === String(account.password ?? '');
  if (!currentOk) return { ok: false, error: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' };
  const problem = passwordProblem(nextPassword, confirmPassword);
  if (problem) return { ok: false, error: problem };
  const saved = await writeStaffAccount(role, {
    username: spec.username,
    password: await hashPassword(nextPassword),
    updatedAt: new Date().toISOString()
  });
  if (!saved) return { ok: false, error: PASSWORD_STORE_FAILED };
  return { ok: true, password: String(nextPassword) };
}

/* ---------- Sessions ---------- */

function sessionStores(spec) {
  try {
    return { local: window.localStorage, tab: window.sessionStorage };
  } catch { return { local: null, tab: null }; }
}

export async function saveStaffSession(role, remember = true) {
  const spec = staffSpec(role);
  if (!spec) return false;
  const { local, tab } = sessionStores(spec);
  if (!local || !tab) return false;
  try {
    local.removeItem(spec.sessionKey);
    tab.removeItem(spec.sessionKey);
    if (remember) {
      const record = buildSessionRecord({ owner: spec.username, ttlDays: REMEMBER_DAYS });
      const envelope = await encryptValue(JSON.stringify(record));
      return envelope
        ? writeJSON(spec.sessionKey, envelope)
        : writeJSON(spec.sessionKey, record);
    }
    // Tab-only session: marker in sessionStorage, token in localStorage is not written.
    tab.setItem(spec.sessionKey, TAB_SESSION_MARKER);
    return true;
  } catch { return false; }
}

async function readStaffSession(role) {
  const spec = staffSpec(role);
  if (!spec) return null;
  const { local, tab } = sessionStores(spec);
  if (!local || !tab) return null;
  try {
    if (tab.getItem(spec.sessionKey) === TAB_SESSION_MARKER) {
      return { tab: true };
    }
    const raw = readJSON(spec.sessionKey);
    if (raw === null) return null;
    if (isEncryptedEnvelope(raw)) {
      const plaintext = await decryptValue(raw);
      if (!plaintext) return null;
      try { return JSON.parse(plaintext); } catch { return null; }
    }
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

export async function hasStaffSession(role) {
  const spec = staffSpec(role);
  if (!spec) return false;
  const { local, tab } = sessionStores(spec);
  const record = await readStaffSession(role);
  if (!record) return false;
  if (record.tab) return true;
  if (isSessionRecordValid(record)) return true;
  try { local?.removeItem(spec.sessionKey); tab?.removeItem(spec.sessionKey); } catch { /* no-op */ }
  return false;
}

/* Logging out never drops anyone on a panel's own entry screen: every role signs
   in on index.html, so that is where a logout returns to. */
export function goToLoginPage() {
  window.location.assign('index.html');
}

export function clearStaffSession(role) {
  const spec = staffSpec(role);
  if (!spec) return;
  try {
    window.localStorage.removeItem(spec.sessionKey);
    window.sessionStorage.removeItem(spec.sessionKey);
  } catch { /* no-op */ }
}

export const STAFF_SESSION_RULES = Object.freeze({ rememberDays: REMEMBER_DAYS, dayMs: DAY_MS });
