/* Device account, session and username index. Document collections live in database.js. */
import { protectAccountIdentity, normalizeUsername } from './account-policy.js';
import { STORAGE_KEYS, defaultStudent, DEFAULT_APP_SETTINGS } from './config.js';
import { rememberAccount } from './database.js';

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

export function persistAccount(account) {
  const storage = getStorage();
  if (!storage) throw new Error('স্টোরেজ পাওয়া যায়নি');
  const raw = storage.getItem(STORAGE_KEYS.account);
  const previous = raw === null ? null : JSON.parse(raw);
  const value = protectAccountIdentity(account, previous);
  storage.setItem(STORAGE_KEYS.account, JSON.stringify(value));
  rememberAccount(value);
  return value;
}

export function saveAccount(account) {
  try { persistAccount(account); return true; } catch { return false; }
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

const SESSION_DAYS_REMEMBER = 90;
const SESSION_DAYS_SHORT = 1;

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

export function persistSession(remember = true) {
  try {
    const local = getStorage('local');
    const session = getStorage('session');
    local?.removeItem(STORAGE_KEYS.session);
    session?.removeItem(STORAGE_KEYS.session);

    // Always store main session in localStorage for persistence,
    // but track expiry for security. Long expiry when remember is checked.
    const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_SHORT;
    const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
    local?.setItem(STORAGE_KEYS.session, '1');
    local?.setItem(STORAGE_KEYS.sessionExpiry, String(expiry));

    if (remember) {
      local?.setItem(STORAGE_KEYS.trustedDevice, '1');
    }
  } catch { /* private browsing can disable storage */ }
}

export function hasSession() {
  try {
    // If user disabled security check, treat as having session
    if (isSecurityCheckDisabled()) return true;

    const local = getStorage('local');
    const sessionStore = getStorage('session');
    const hasFlag = local?.getItem(STORAGE_KEYS.session) === '1'
      || sessionStore?.getItem(STORAGE_KEYS.session) === '1';

    if (!hasFlag) return false;

    const expiryRaw = local?.getItem(STORAGE_KEYS.sessionExpiry);
    if (!expiryRaw) {
      // Backward compat: old flag without expiry -> migrate to long expiry
      const newExpiry = Date.now() + SESSION_DAYS_REMEMBER * 24 * 60 * 60 * 1000;
      local?.setItem(STORAGE_KEYS.sessionExpiry, String(newExpiry));
      return true;
    }

    const expiry = Number(expiryRaw);
    if (!expiry || Number.isNaN(expiry)) return true;
    if (Date.now() > expiry) {
      // Expired -> clear session but keep trusted flag for optional auto-login
      local?.removeItem(STORAGE_KEYS.session);
      local?.removeItem(STORAGE_KEYS.sessionExpiry);
      sessionStore?.removeItem(STORAGE_KEYS.session);
      // If trusted device, still allow auto-login
      return isTrustedDevice();
    }
    return true;
  } catch { return false; }
}

export function clearSession() {
  try {
    const local = getStorage('local');
    const sessionStore = getStorage('session');
    local?.removeItem(STORAGE_KEYS.session);
    local?.removeItem(STORAGE_KEYS.sessionExpiry);
    local?.removeItem(STORAGE_KEYS.trustedDevice);
    sessionStore?.removeItem(STORAGE_KEYS.session);
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
    local?.removeItem(STORAGE_KEYS.session);
    local?.removeItem(STORAGE_KEYS.sessionExpiry);
    local?.removeItem(STORAGE_KEYS.trustedDevice);
    local?.removeItem(STORAGE_KEYS.skipSecurity);
    getStorage('session')?.removeItem(STORAGE_KEYS.session);
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
