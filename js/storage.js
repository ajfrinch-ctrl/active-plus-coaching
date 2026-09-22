/* One place for local persistence. Replacing these adapters with an API later keeps UI modules unchanged. */
import { STORAGE_KEYS, defaultStudent } from './config.js';

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
  try { getStorage()?.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function loadStudent() {
  return { ...defaultStudent, ...(readJSON(STORAGE_KEYS.student, {}) || {}) };
}

export function saveStudent(student) {
  return writeJSON(STORAGE_KEYS.student, student);
}

export function loadAccount() {
  return readJSON(STORAGE_KEYS.account, null);
}

export function saveAccount(account) {
  return writeJSON(STORAGE_KEYS.account, account);
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
  return `${year}${month}${classCodes[className] || '0'}${String(sequence).padStart(3, '0')}`;
}
