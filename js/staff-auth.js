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

import { STAFF_KEYS, KEYS, readJSON, writeJSON } from './database.js';
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
  manager: {
    role: 'manager',
    username: 'manager.apc',
    accountKey: STAFF_KEYS.managerAccount,
    sessionKey: STAFF_KEYS.managerSession
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

const INITIAL_ADMIN_USERNAME_KEY = 'activePlus.initialAdminUsername.v1';
const USERNAME_PATTERN = /^[a-z][a-z0-9._]{3,19}$/;
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
function generateTemporaryPassword() {
  const cryptoApi = globalThis.crypto || globalThis.window?.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error('নিরাপদ অটো-জেনারেটেড পাসওয়ার্ড তৈরি করা যাচ্ছে না।');
  const bytes = new Uint8Array(20);
  cryptoApi.getRandomValues(bytes);
  return [...bytes].map(byte => TEMP_PASSWORD_ALPHABET[byte % TEMP_PASSWORD_ALPHABET.length]).join('');
}

function normalizeBdMobile(value) {
  let mobile = String(value ?? '').trim().replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit));
  mobile = mobile.replace(/[\s()+-]/g, '');
  if (mobile.startsWith('+880')) mobile = `0${mobile.slice(4)}`;
  else if (mobile.startsWith('880')) mobile = `0${mobile.slice(3)}`;
  return mobile;
}

/** Create the one and only first-admin profile. Never leaves an incomplete record. */
export async function createInitialAdmin({ fullName, mobile, email = '', username, password, confirmPassword } = {}) {
  if (await readStaffAccount('admin')) return { ok: false, error: 'প্রথম Admin Account ইতিমধ্যে তৈরি হয়েছে।' };
  const name = String(fullName ?? '').trim().replace(/\s+/g, ' ');
  const phone = normalizeBdMobile(mobile);
  const mail = String(email ?? '').trim().toLowerCase();
  const handle = normalizeStaffUsername(username);
  if (name.length < 2 || name.length > 100) return { ok: false, error: 'পূর্ণ নাম লিখুন (২–১০০ অক্ষর)।' };
  if (!/^01[3-9]\d{8}$/.test(phone)) return { ok: false, error: 'সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।' };
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, error: 'সঠিক ইমেইল ঠিকানা লিখুন অথবা ফাঁকা রাখুন।' };
  if (!USERNAME_PATTERN.test(handle)) return { ok: false, error: 'ইউজারনেম ৪–২০ অক্ষরের হতে হবে; ইংরেজি ছোট হাতের অক্ষর দিয়ে শুরু করুন, অক্ষর/সংখ্যা/ডট/আন্ডারস্কোর ব্যবহার করুন।' };
  if (handle === 'admin' || handle === 'administrator' || handle === 'root' || handle === 'null' || handle === 'undefined') return { ok: false, error: 'এই ইউজারনেমটি সংরক্ষিত, অন্য একটি বেছে নিন।' };
  const passwordIssue = passwordProblem(password, confirmPassword);
  if (passwordIssue) return { ok: false, error: passwordIssue };

  const otherStaffNames = Object.values(STAFF_ACCOUNTS).filter(item => item.role !== 'admin').map(item => normalizeStaffUsername(item.username));
  const index = readJSON(KEYS.usernames, {}) || {};
  if (otherStaffNames.includes(handle) || Object.hasOwn(index, handle)) return { ok: false, error: 'এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত — অন্য একটি বেছে নিন।' };

  const createdAt = new Date().toISOString();
  const account = {
    role: 'admin', status: 'active', owner: 'first-admin',
    fullName: name, mobile: phone, email: mail,
    username: handle, password: await hashPassword(password),
    createdAt, accountStatus: 'active'
  };
  // Claim username first, then write the encrypted staff profile; roll back the
  // claim if storage fails so a half-created Admin cannot block future setup.
  const claimed = { ...index, [handle]: 'staff:admin' };
  if (!writeJSON(KEYS.usernames, claimed)) return { ok: false, error: PASSWORD_STORE_FAILED };
  if (!(await writeStaffAccount('admin', account))) {
    const rollback = readJSON(KEYS.usernames, {}) || {};
    if (rollback[handle] === 'staff:admin') { delete rollback[handle]; writeJSON(KEYS.usernames, rollback); }
    return { ok: false, error: PASSWORD_STORE_FAILED };
  }
  if (!writeJSON(INITIAL_ADMIN_USERNAME_KEY, handle)) {
    try { window.localStorage.removeItem(staffSpec('admin').accountKey); } catch {}
    const rollback = readJSON(KEYS.usernames, {}) || {};
    if (rollback[handle] === 'staff:admin') { delete rollback[handle]; writeJSON(KEYS.usernames, rollback); }
    return { ok: false, error: PASSWORD_STORE_FAILED };
  }
  const bootstrap = await ensureBootstrapStaffAccounts(handle);
  if (!bootstrap.ok) {
    try { window.localStorage.removeItem(staffSpec('admin').accountKey); window.localStorage.removeItem(INITIAL_ADMIN_USERNAME_KEY); } catch {}
    const rollback = readJSON(KEYS.usernames, {}) || {};
    if (rollback[handle] === 'staff:admin') { delete rollback[handle]; writeJSON(KEYS.usernames, rollback); }
    return { ok: false, error: bootstrap.error || PASSWORD_STORE_FAILED };
  }
  return { ok: true, account: { ...account, password: undefined }, bootstrapAccounts: bootstrap.accounts };
}

/** Ensure one temporary bootstrap identity exists for each operational staff role. */
export async function ensureBootstrapStaffAccounts(ownerUsername = 'admin.apc') {
  const index = readJSON(KEYS.usernames, {}) || {};
  const pending = [];
  try {
    for (const role of ['manager', 'teacher', 'payment']) {
      if (await readStaffAccount(role)) continue;
      const spec = staffSpec(role);
      const username = normalizeStaffUsername(spec.username);
      if (Object.hasOwn(index, username)) return { ok: false, error: `Bootstrap username ${username} আগেই ব্যবহৃত।` };
      const password = generateTemporaryPassword();
      pending.push({
        role, username, password,
        profile: {
          role, status: 'active', accountStatus: 'active', owner: normalizeStaffUsername(ownerUsername),
          fullName: `প্রাথমিক ${role} অ্যাকাউন্ট`, mobile: '', email: '', username,
          password: await hashPassword(password), mustChangePassword: true,
          createdAt: new Date().toISOString(), bootstrapAccount: true
        }
      });
    }
  } catch { return { ok: false, error: PASSWORD_STORE_FAILED }; }
  if (!pending.length) return { ok: true, accounts: [] };
  const claimed = { ...index };
  pending.forEach(account => { claimed[account.username] = `staff:${account.role}`; });
  if (!writeJSON(KEYS.usernames, claimed)) return { ok: false, error: PASSWORD_STORE_FAILED };
  const written = [];
  for (const account of pending) {
    if (!(await writeStaffAccount(account.role, account.profile))) {
      written.forEach(role => { try { window.localStorage.removeItem(staffSpec(role).accountKey); } catch {} });
      writeJSON(KEYS.usernames, index);
      return { ok: false, error: PASSWORD_STORE_FAILED };
    }
    written.push(account.role);
  }
  return { ok: true, accounts: pending.map(({ role, username, password }) => ({ role, username, password })) };
}

export async function resolveStaffRoleByUsername(value) {
  const username = normalizeStaffUsername(value);
  const fixed = Object.keys(STAFF_ACCOUNTS).find(role => normalizeStaffUsername(STAFF_ACCOUNTS[role].username) === username);
  if (fixed) {
    if (fixed === 'admin' || fixed === 'manager') {
      const account = await readStaffAccount(fixed);
      if (!account) return null; // only Admin provisioning creates these owner/approval roles
      if (account.username) return normalizeStaffUsername(account.username) === username ? fixed : null;
    }
    return fixed;
  }
  const admin = await readStaffAccount('admin');
  return admin?.status === 'active' && normalizeStaffUsername(admin.username) === username ? 'admin' : null;
}

export function staffSpec(role) {
  return STAFF_ACCOUNTS[role] || null;
}

/** The stored record, decrypted when possible. Null when never provisioned. */
export function staffAccountRecordExists(role) {
  const spec = staffSpec(role);
  if (!spec) return false;
  try { return window.localStorage.getItem(spec.accountKey) !== null; } catch { return true; }
}

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
  if (!spec) return { ok: false, error: WRONG_CREDENTIALS };
  const account = await readStaffAccount(role);
  const expectedUsername = role === 'admin' && account?.username
    ? normalizeStaffUsername(account.username)
    : normalizeStaffUsername(spec.username);
  if (normalizeStaffUsername(username) !== expectedUsername) {
    return { ok: false, error: WRONG_CREDENTIALS };
  }
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
    username: account.username || spec.username,
    fullName: account.fullName || '',
    mobile: account.mobile || '',
    email: account.email || '',
    status: account.status || 'active',
    createdAt: account.createdAt || null,
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
  const existing = await readStaffAccount(role);
  const { mustChangePassword: _mustChangePassword, ...profile } = existing || {};
  const saved = await writeStaffAccount(role, {
    ...profile,
    username: existing?.username || spec.username,
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
  const existing = await readStaffAccount(role);
  const { mustChangePassword: _mustChangePassword, ...profile } = existing || {};
  const saved = await writeStaffAccount(role, {
    ...profile,
    username: existing?.username || spec.username,
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
