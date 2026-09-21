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

export function persistSession(remember = true) {
  try {
    getStorage('local')?.removeItem(STORAGE_KEYS.session);
    getStorage('session')?.removeItem(STORAGE_KEYS.session);
    getStorage(remember ? 'local' : 'session')?.setItem(STORAGE_KEYS.session, '1');
  } catch { /* private browsing can disable storage */ }
}

export function hasSession() {
  try {
    return getStorage('local')?.getItem(STORAGE_KEYS.session) === '1'
      || getStorage('session')?.getItem(STORAGE_KEYS.session) === '1';
  } catch { return false; }
}

export function clearSession() {
  try {
    getStorage('local')?.removeItem(STORAGE_KEYS.session);
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
