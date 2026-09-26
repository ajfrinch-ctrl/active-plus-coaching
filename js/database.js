/* Document database for Active Plus.
   Collection names below are the Firestore names to use later.
   This adapter only talks to localStorage. Do not import the Firebase SDK here.
   Passwords and security answers stay on this device — never copy them
   into a synced collection. */

export const COLLECTIONS = Object.freeze({
  students: 'students',
  transactions: 'transactions',
  notices: 'notices',
  routine: 'routine',
  teaching: 'teaching',
  exams: 'exams',
  settings: 'settings',
  account: 'account',
  accounts: 'accounts',
  usernames: 'usernames',
  studentProfile: 'studentProfile'
});

/** These must not be uploaded when Firebase is added. */
export const LOCAL_ONLY = Object.freeze([
  COLLECTIONS.account,
  COLLECTIONS.accounts,
  COLLECTIONS.usernames,
  COLLECTIONS.studentProfile
]);

/** Safe to mirror later. Staff passwords are not in this list. */
export const SYNCABLE = Object.freeze([
  COLLECTIONS.students,
  COLLECTIONS.transactions,
  COLLECTIONS.notices,
  COLLECTIONS.routine,
  COLLECTIONS.teaching,
  COLLECTIONS.exams,
  COLLECTIONS.settings
]);

export const STAFF_KEYS = Object.freeze({
  adminAccount: 'activePlus.adminAccount.v1',
  adminSession: 'activePlus.adminSession.v1',
  teacherAccount: 'activePlus.teacherAccount.v1',
  teacherSession: 'activePlus.teacherSession.v1',
  paymentAccount: 'activePlus.paymentAccount.v1',
  paymentSession: 'activePlus.paymentSession.v1'
});

export const KEYS = Object.freeze({
  students: 'activePlus.admin.students.v1',
  transactions: 'activePlus.admin.transactions.v1',
  notices: 'activePlus.admin.notices.v1',
  routine: 'activePlus.admin.routine.v1',
  teaching: 'activePlus.teaching.v1',
  exams: 'activePlus.exams.v1',
  settings: 'active-plus-app-config-v1',
  account: 'active-plus-account-v1',
  accounts: 'activePlus.db.accounts.v1',
  usernames: 'active-plus-usernames-v1',
  studentProfile: 'active-plus-student-v1'
});

function storage() {
  return window.localStorage;
}

export function readRaw(key) {
  return storage().getItem(key);
}

export function writeRaw(key, value) {
  storage().setItem(key, value);
}

export function readJSON(key, fallback = null) {
  try {
    const value = storage().getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    storage().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Missing key is null. Corrupt JSON throws and is left untouched. */
export function readJSONStrict(key) {
  const raw = storage().getItem(key);
  if (raw === null) return null;
  return JSON.parse(raw);
}

export function writeJSONStrict(key, value) {
  storage().setItem(key, JSON.stringify(value));
}

export function listDocuments(collection) {
  const stored = readJSON(KEYS[collection], null);
  if (!Array.isArray(stored)) return [];
  return stored.filter(doc => doc && typeof doc.id === 'string' && doc.id).map(doc => ({ ...doc }));
}

export function listDocumentsStrict(collection, valid) {
  const raw = storage().getItem(KEYS[collection]);
  if (raw === null) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records) || records.some(doc => !valid(doc))) {
    throw new Error('Invalid collection storage');
  }
  return records;
}

export function replaceDocuments(collection, docs) {
  return writeJSON(KEYS[collection], docs);
}

export function replaceDocumentsStrict(collection, docs) {
  writeJSONStrict(KEYS[collection], docs);
}

export function newId(prefix) {
  const token = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    .replace(/-/g, '');
  return `${prefix}-${token}`;
}

/** Fields safe to sync. Secrets never leave the device account. */
export function publicStudent(student) {
  if (!student || typeof student !== 'object') return null;
  const copy = { ...student };
  delete copy.pin;
  delete copy.password;
  delete copy.pinHash;
  delete copy.securityAnswer;
  delete copy.securityAnswerHash;
  delete copy.securityQuestion;
  return copy;
}

export function syncableAccount(account) {
  const id = account?.student?.id || account?.studentId;
  if (!id) return null;
  return {
    id,
    username: account.username || '',
    mobile: account.registrationMobile || account.mobile || '',
    status: account.status || 'pending',
    additionalMobiles: Array.isArray(account.additionalMobiles) ? [...account.additionalMobiles] : [],
    student: publicStudent(account.student) || { id },
    createdAt: account.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** Mirror the device account into a student-id map, without the password. */
export function rememberAccount(account) {
  const doc = syncableAccount(account);
  if (!doc) return false;
  const map = readJSON(KEYS.accounts, {}) || {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
  map[doc.id] = doc;
  return writeJSON(KEYS.accounts, map);
}
