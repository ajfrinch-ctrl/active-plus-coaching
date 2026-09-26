/* Device account, session and username index. Document collections live in database.js.
   Phase 1 security: the student password (PIN) and the recovery answer are stored
   only as PBKDF2 hashes — never as plaintext — and sessions are random tokens
   bound to this device with an expiry (session.js). Records written by the
   retired plaintext scheme are upgraded to hashes on the next successful login
   or save, so no plaintext secret survives a normal session. */

import { protectAccountIdentity, normalizeUsername } from './account-policy.js';
import { normalizeAnswer } from './ui.js';
import { STORAGE_KEYS, defaultStudent, DEFAULT_APP_SETTINGS, DEFAULT_PIN } from './config.js';
import { rememberAccount } from './database.js';
import { hashPassword, verifyPassword, isPasswordRecord } from './password-hash.js';
import { encryptValue, decryptValue, isEncryptedEnvelope } from './secure-store.js';
import { buildSessionRecord, isSessionRecordValid, DAY_MS } from './session.js';

const SESSION_DAYS_REMEMBER = 90;
const SESSION_DAYS_TAB = 1;
const TAB_SESSION_MARKER = '1';

function getStorage(type = 'local') {
  try { return type === 'session' ? window.sessionStorage : window.localStorage; }
  catch { return null; }
}

export function readJSON(key, fallback = null) {
  try {
    const value = getStorage()?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}

export function writeJSON(key, value) {
  try { const storage = getStorage(); if (!storage) return false; storage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function loadStudent() {
  return { ...defaultStudent, ...(readJSON(STORAGE_KEYS.student, {}) || {}) };
}

export function saveStudent(student) {
  const account = loadAccount();
  const value = account?.student?.id && account.student.id === student.id ? { ...student, studentMobile: account.registrationMobile || account.mobile } : student;
  return writeJSON(STORAGE_KEYS.student, value);
}

export function loadAccount() {
  const account = readJSON(STORAGE_KEYS.account, null);
  if (!account) return null;
  try { return protectAccountIdentity(account, account); } catch { return account; }
}

/** Plaintext secrets provided by the caller become hashes; they are never stored. */
async function hashSecrets(value, source) {
  const stored = { ...value };
  const pin = typeof source?.pin === 'string' && source.pin ? source.pin : (stored.pinHash ? null : DEFAULT_PIN);
  if (pin) stored.pinHash = await hashPassword(pin);
  if (typeof source?.securityAnswer === 'string' && source.securityAnswer) {
    stored.securityAnswerHash = await hashPassword(normalizeAnswer(source.securityAnswer));
  }
  delete stored.pin;
  delete stored.securityAnswer;
  return stored;
}

export async function persistAccount(account) {
  const storage = getStorage();
  if (!storage) throw new Error('স্টোরেজ পাওয়া যায়নি');
  const raw = storage.getItem(STORAGE_KEYS.account);
  const previous = raw === null ? null : JSON.parse(raw);
  const value = protectAccountIdentity(account, previous);
  const stored = await hashSecrets(value, account);
  storage.setItem(STORAGE_KEYS.account, JSON.stringify(stored));
  rememberAccount(stored);
  return stored;
}

export async function saveAccount(account) {
  try { await persistAccount(account); return true; } catch { return false; }
}

/* ---------- Password and recovery-answer checks ---------- */

/** True when the typed password matches the stored hash (or a legacy record). */
export async function verifyAccountPassword(account, password) {
  if (!account) return false;
  if (isPasswordRecord(account.pinHash)) return verifyPassword(password, account.pinHash);
  if (typeof account.pin === 'string' && account.pin) {
    return String(password ?? '') === account.pin;
  }
  return false;
}

/** True when the typed answer matches the stored answer hash (or legacy text). */
export async function verifySecurityAnswer(account, answer) {
  if (!account) return false;
  const typed = normalizeAnswer(answer);
  if (isPasswordRecord(account.securityAnswerHash)) return verifyPassword(typed, account.securityAnswerHash);
  if (typeof account.securityAnswer === 'string' && account.securityAnswer) {
    return typed === normalizeAnswer(account.securityAnswer);
  }
  return false;
}

/**
 * Upgrade a legacy plaintext account to hashes. Called after a successful
 * login or recovery so the plaintext PIN/answer is replaced on the spot.
 */
export async function upgradeAccountSecrets(account, { pin, securityAnswer } = {}) {
  if (!account) return null;
  const needsPin = Boolean(pin) && !isPasswordRecord(account.pinHash);
  const needsAnswer = Boolean(securityAnswer) && !isPasswordRecord(account.securityAnswerHash);
  if (!needsPin && !needsAnswer) return account;
  try {
    return await persistAccount({
      ...account,
      ...(needsPin ? { pin } : {}),
      ...(needsAnswer ? { securityAnswer } : {})
    });
  } catch { return account; }
}

/* ---------- Username registry ----------
   Device-local claim table so two accounts on the same phone cannot pick the
   same username. A real server replaces these four helpers with one API call. */

export function readUsernameIndex() {
  return readJSON(STORAGE_KEYS.usernames, {}) || {};
}

export function usernameOwner(username) {
  const name = normalizeUsername(username);
  if (!name) return null;
  return readUsernameIndex()[name] || null;
}

export function usernameTaken(username) {
  return Boolean(usernameOwner(username));
}

/** Claim the name for this owner; false when somebody else already holds it. */
export function reserveUsername(username, owner) {
  const name = normalizeUsername(username);
  if (!name || !owner) return false;
  const index = readUsernameIndex();
  if (index[name] && index[name] !== owner) return false;
  index[name] = owner;
  return writeJSON(STORAGE_KEYS.usernames, index);
}

/** Only the owner can release a claim (keeps a name from being reused silently). */
export function releaseUsername(username, owner) {
  const name = normalizeUsername(username);
  const index = readUsernameIndex();
  if (!name || index[name] !== owner) return false;
  delete index[name];
  return writeJSON(STORAGE_KEYS.usernames, index);
}

const SESSION_KEY = STORAGE_KEYS.session;

export function isSecurityCheckDisabled() {
  try {
    return getStorage('local')?.getItem(STORAGE_KEYS.skipSecurity) === '1';
  } catch { return false; }
}

export function setSecurityCheckDisabled(disabled = true) {
  try {
    if (disabled) {
      getStorage('local')?.setItem(STORAGE_KEYS.skipSecurity, '1');
    } else {
      getStorage('local')?.removeItem(STORAGE_KEYS.skipSecurity);
    }
    return true;
  } catch { return false; }
}

export function isTrustedDevice() {
  try {
    return getStorage('local')?.getItem(STORAGE_KEYS.trustedDevice) === '1';
  } catch { return false; }
}

export function setTrustedDevice(trusted = true) {
  try {
    if (trusted) {
      getStorage('local')?.setItem(STORAGE_KEYS.trustedDevice, '1');
    } else {
      getStorage('local')?.removeItem(STORAGE_KEYS.trustedDevice);
    }
    return true;
  } catch { return false; }
}

/* ---------- Sessions: token + device binding + expiry ---------- */

export async function persistSession(remember = true) {
  try {
    const local = getStorage('local');
    const tab = getStorage('session');
    local?.removeItem(SESSION_KEY);
    local?.removeItem(STORAGE_KEYS.sessionExpiry);
    tab?.removeItem(SESSION_KEY);

    if (!remember) {
      // Tab-only session: it disappears when the tab closes.
      tab?.setItem(SESSION_KEY, TAB_SESSION_MARKER);
      return true;
    }
    const record = buildSessionRecord({ owner: 'student', ttlDays: SESSION_DAYS_REMEMBER });
    const envelope = await encryptValue(JSON.stringify(record));
    return envelope ? writeJSON(SESSION_KEY, envelope) : writeJSON(SESSION_KEY, record);
  } catch { /* private browsing can disable storage */ }
}

async function readStudentSession() {
  try {
    const tab = getStorage('session');
    if (tab?.getItem(SESSION_KEY) === TAB_SESSION_MARKER) return { tab: true };
    const raw = readJSON(SESSION_KEY);
    if (raw === null) return null;
    if (isEncryptedEnvelope(raw)) {
      const plaintext = await decryptValue(raw);
      if (!plaintext) return null;
      try { return JSON.parse(plaintext); } catch { return null; }
    }
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

export async function hasSession() {
  // An explicit on-device preference can skip the password prompt; it is a
  // product choice, not a session, and it never reveals any secret.
  if (isSecurityCheckDisabled()) return true;
  const record = await readStudentSession();
  if (!record) return false;
  if (record.tab) return true;
  if (isSessionRecordValid(record)) return true;
  try {
    getStorage('local')?.removeItem(SESSION_KEY);
    getStorage('local')?.removeItem(STORAGE_KEYS.sessionExpiry);
    getStorage('session')?.removeItem(SESSION_KEY);
  } catch { /* no-op */ }
  return false;
}

export function clearSession() {
  try {
    const local = getStorage('local');
    const sessionStore = getStorage('session');
    local?.removeItem(SESSION_KEY);
    local?.removeItem(STORAGE_KEYS.sessionExpiry);
    local?.removeItem(STORAGE_KEYS.trustedDevice);
    sessionStore?.removeItem(SESSION_KEY);
  } catch { /* no-op */ }
}

export function loadAppConfig() {
  const custom = readJSON(STORAGE_KEYS.appConfig, {});
  return {
    ...DEFAULT_APP_SETTINGS,
    ...custom,
    modules: {
      ...DEFAULT_APP_SETTINGS.modules,
      ...(custom?.modules || {})
    }
  };
}

export function saveAppConfig(config) {
  return writeJSON(STORAGE_KEYS.appConfig, config);
}

export function clearAllSecurity() {
  try {
    const local = getStorage('local');
    local?.removeItem(SESSION_KEY);
    local?.removeItem(STORAGE_KEYS.sessionExpiry);
    local?.removeItem(STORAGE_KEYS.trustedDevice);
    local?.removeItem(STORAGE_KEYS.skipSecurity);
    getStorage('session')?.removeItem(SESSION_KEY);
  } catch { /* no-op */ }
}

export function generateStudentId(className) {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const classCodes = {
    'অষ্টম শ্রেণি': '8', 'নবম শ্রেণি': '9', 'দশম শ্রেণি': '0',
    'একাদশ শ্রেণি': '1', 'দ্বাদশ শ্রেণি': '2', 'ডিগ্রি ১ম বর্ষ': '3',
    'ডিগ্রি ২য় বর্ষ': '4', 'ডিগ্রি ৩য় বর্ষ': '5', 'অনার্স ১ম বর্ষ': '6',
    'অনার্স ২য় বর্ষ': '7', 'অনার্স ৩য় বর্ষ': '8', 'অনার্স ৪র্থ বর্ষ': '9'
  };
  let sequence = 1;
  try {
    sequence = Number(getStorage()?.getItem(STORAGE_KEYS.idSequence) || '0') + 1;
    getStorage()?.setItem(STORAGE_KEYS.idSequence, String(sequence));
  } catch { /* first sequence is a safe fallback */ }
  const salt = (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2))
    .replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${year}${month}${classCodes[className] || '0'}${salt}${String(sequence).padStart(3, '0')}`;
}

export const STUDENT_SESSION_RULES = Object.freeze({
  rememberDays: SESSION_DAYS_REMEMBER, tabDays: SESSION_DAYS_TAB, dayMs: DAY_MS
});
