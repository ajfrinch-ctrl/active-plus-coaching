/* Active Plus — Realtime Database online test sync.
   Offline-first: localStorage remains the source used by the UI.
   SYNCABLE application data plus every cross-device LOGIN IDENTITY is
   mirrored: the four staff role accounts, the Staff Directory records, the
   claimed Login User ID registry, the local student login AND the exam
   database (exams + attempts, through a dedicated id-keyed mirror).
   Only records that already hold PBKDF2 password HASHES travel the bridge —
   a plaintext password or security answer never does, and sessions stay
   device-bound. This is a cross-device TEST bridge, not the final auth
   architecture. */
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp } from './firebase-config.js';
import { SYNCABLE, KEYS, STAFF_KEYS } from './database.js';
import { STAFF_ACCOUNTS } from './staff-auth.js';
import { STAFF_DIRECTORY_KEY } from './staff-directory.js';
import { isEncryptedEnvelope, decryptValue, encryptValue } from './secure-store.js';

const DB_ROOT = 'activePlusSync/v1';
let started = false;
let applyingRemote = false;
const lastRemote = new Map();
const STAFF_ROOT = DB_ROOT + '/staffAccounts';
const DIRECTORY_ROOT = DB_ROOT + '/staffDirectory';
const USERNAMES_ROOT = DB_ROOT + '/usernames';
const STUDENT_ROOT = DB_ROOT + '/studentAccount';
const EXAMDB_ROOT = DB_ROOT + '/examDb';
const EXAMDB_SEEN = EXAMDB_ROOT + '/meta/seen';

function localKey(collection) {
  return KEYS[collection];
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function staffRoleByAccountKey(key) {
  return Object.keys(STAFF_ACCOUNTS).find(role => STAFF_ACCOUNTS[role].accountKey === key) || null;
}

async function readStaffLocal(role) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec) return null;
  try {
    const raw = localStorage.getItem(spec.accountKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (isEncryptedEnvelope(parsed)) {
      const plaintext = await decryptValue(parsed);
      if (!plaintext) return null;
      return JSON.parse(plaintext);
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

async function writeStaffLocal(role, account) {
  const spec = STAFF_ACCOUNTS[role];
  if (!spec || !account || typeof account !== 'object') return false;
  try {
    localStorage.setItem(spec.accountKey, JSON.stringify(account));
    return true;
  } catch { return false; }
}

/* ---- Cross-device login identities (Staff Directory, Login User ID
   registry and the local student login). ------------------------------- */

/** Directory record: stored as an AES-GCM envelope when the platform allows,
    so accept both shapes on the way in and keep the envelope on the way out. */
async function readDirectoryLocal() {
  try {
    const raw = readLocal(STAFF_DIRECTORY_KEY);
    if (raw === null) return null;
    if (isEncryptedEnvelope(raw)) {
      const plaintext = await decryptValue(raw);
      if (!plaintext) return null;
      return JSON.parse(plaintext);
    }
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

async function writeDirectoryLocal(directory) {
  try {
    const envelope = await encryptValue(JSON.stringify(directory));
    localStorage.setItem(STAFF_DIRECTORY_KEY, JSON.stringify(envelope || directory));
    return true;
  } catch { return false; }
}

/** Claimed Login User IDs: username → owner marker. */
function readUsernamesLocal() {
  const value = readLocal(KEYS.usernames);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** The single local student login. Plaintext secrets never sync. */
function studentAccountPayload(account) {
  if (!account || typeof account !== 'object') return null;
  const safe = { ...account };
  delete safe.pin;
  delete safe.securityAnswer;
  return safe;
}

const isDirectoryRecord = value =>
  Boolean(value) && typeof value === 'object' && Array.isArray(value.records);
const isUsernamesRecord = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isStudentAccountRecord = value =>
  Boolean(value) && typeof value === 'object' &&
  Boolean(value.pinHash || value.username || value.student);

async function syncStaffRole(role, { forcePush = false } = {}) {
  const local = await readStaffLocal(role);
  const node = ref(getDatabase(firebaseApp), STAFF_ROOT + '/' + role);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    if (remote && typeof remote === 'object' && remote.username && remote.password) {
      // A valid remote staff account must contain both its identity and a
      // password record. Never replace a working local account with an
      // incomplete remote snapshot.
      await writeStaffLocal(role, remote);
      lastRemote.set('staff:' + role, JSON.stringify(remote));
      window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'staffAccounts', role } }));
      return;
    }
  }
  if (local) {
    await set(node, local);
    lastRemote.set('staff:' + role, JSON.stringify(local));
  }
}

async function pushStaffRole(role) {
  const local = await readStaffLocal(role);
  if (!local) return;
  const serialized = JSON.stringify(local);
  if (lastRemote.get('staff:' + role) === serialized) return;
  await set(ref(getDatabase(firebaseApp), STAFF_ROOT + '/' + role), local);
  lastRemote.set('staff:' + role, serialized);
}

/** Remote wins when present; otherwise the local store is uploaded. */
async function syncDirectory({ forcePush = false } = {}) {
  const local = await readDirectoryLocal();
  const node = ref(getDatabase(firebaseApp), DIRECTORY_ROOT);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    if (isDirectoryRecord(remote)) {
      lastRemote.set('staffDirectory', JSON.stringify(remote));
      applyingRemote = true;
      try { await writeDirectoryLocal(remote); } finally { applyingRemote = false; }
      window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'staffDirectory' } }));
      return;
    }
  }
  if (isDirectoryRecord(local)) {
    await set(node, local);
    lastRemote.set('staffDirectory', JSON.stringify(local));
  }
}

async function pushDirectory() {
  if (applyingRemote) return;
  const local = await readDirectoryLocal();
  if (!isDirectoryRecord(local)) return;
  const serialized = JSON.stringify(local);
  if (lastRemote.get('staffDirectory') === serialized) return;
  await set(ref(getDatabase(firebaseApp), DIRECTORY_ROOT), local);
  lastRemote.set('staffDirectory', serialized);
}

/**
 * Login User ID registry. Remote wins when present; otherwise the local
 * registry is uploaded. With `merge` the local claims survive and remote
 * claims are added on top — used on the login path so an offline claim
 * made on this device is not lost mid-session.
 */
async function syncUsernames({ forcePush = false, merge = false } = {}) {
  const local = readUsernamesLocal();
  const node = ref(getDatabase(firebaseApp), USERNAMES_ROOT);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    if (isUsernamesRecord(remote)) {
      const next = merge && local ? { ...local, ...remote } : remote;
      lastRemote.set('usernames', JSON.stringify(next));
      applyingRemote = true;
      try { writeLocal(KEYS.usernames, next); } finally { applyingRemote = false; }
      window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'usernames' } }));
      return;
    }
  }
  if (isUsernamesRecord(local)) {
    await set(node, local);
    lastRemote.set('usernames', JSON.stringify(local));
  }
}

async function pushUsernames() {
  if (applyingRemote) return;
  const local = readUsernamesLocal();
  if (!isUsernamesRecord(local)) return;
  const serialized = JSON.stringify(local);
  if (lastRemote.get('usernames') === serialized) return;
  await set(ref(getDatabase(firebaseApp), USERNAMES_ROOT), local);
  lastRemote.set('usernames', serialized);
}

/** The local student login, so the same ID signs in on another device. */
async function syncStudentAccount({ forcePush = false } = {}) {
  const local = studentAccountPayload(readLocal(KEYS.account));
  const node = ref(getDatabase(firebaseApp), STUDENT_ROOT);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    if (isStudentAccountRecord(remote)) {
      lastRemote.set('studentAccount', JSON.stringify(remote));
      applyingRemote = true;
      try { writeLocal(KEYS.account, remote); } finally { applyingRemote = false; }
      window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'studentAccount' } }));
      return;
    }
  }
  if (local) {
    await set(node, local);
    lastRemote.set('studentAccount', JSON.stringify(local));
  }
}

async function pushStudentAccount() {
  if (applyingRemote) return;
  const local = studentAccountPayload(readLocal(KEYS.account));
  if (!local) return;
  const serialized = JSON.stringify(local);
  if (lastRemote.get('studentAccount') === serialized) return;
  await set(ref(getDatabase(firebaseApp), STUDENT_ROOT), local);
  lastRemote.set('studentAccount', serialized);
}

/* ---- Exam database (exams + attempts) ---------------------------------------
   `activePlus.exams.v1` is ONE document: { version: 1, exams: [], attempts: [] }.
   The generic collection bridge only mirrors id-lists, so the exam database
   gets a dedicated id-keyed mirror: examDb/exams/<id> and examDb/attempts/<id>.

   Merge rules per id — fill-missing, remote-wins on differing content, remote
   deletions honoured — with one protection: an id this device has just changed
   locally but has not pushed yet (offline write, slow network) is never
   overwritten, filled or deleted by a stale remote copy. That pending local
   write wins and reaches the cloud on the next successful push.

   Orphan attempts (their exam has not arrived here yet) wait in memory and are
   applied when the exam arrives, because the app's strict document validation
   rejects an attempt whose exam is missing from the same document. */
const EXAM_SYNC_SPACES = ['exams', 'attempts'];
const examSync = {
  lastRemote: { exams: new Map(), attempts: new Map() },
  lastLocal: { exams: new Map(), attempts: new Map() },
  pending: new Set(),   // `${space}/${id}` changed locally, not pushed yet
  orphans: new Map()    // attemptId -> remote attempt awaiting its exam
};

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Order-insensitive JSON — the database stores keys alphabetically. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readExamDbLocal() {
  let raw = null;
  try { raw = localStorage.getItem(KEYS.exams); } catch {}
  if (raw === null) return { db: { version: 1, exams: [], attempts: [] }, readable: true };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version === 1 &&
        Array.isArray(parsed.exams) && Array.isArray(parsed.attempts)) {
      return { db: parsed, readable: true };
    }
  } catch {}
  // Corrupt local document: the cloud copy may still repair it, but nothing
  // from this device may overwrite the cloud until the app rebuilds the file.
  return { db: { version: 1, exams: [], attempts: [] }, readable: false };
}

const examItemValid = item =>
  isPlainObject(item) && typeof item.id === 'string' && item.id &&
  typeof item.teacherId === 'string' && Array.isArray(item.participants) &&
  ['draft', 'pending', 'rejected', 'published'].includes(item.status);

const attemptItemValid = item =>
  isPlainObject(item) && typeof item.id === 'string' && item.id &&
  typeof item.examId === 'string' && typeof item.studentId === 'string' &&
  ['active', 'queued', 'submitted'].includes(item.status) &&
  (item.number === 1 || item.number === 2) && isPlainObject(item.answers) &&
  Array.isArray(item.order) && Number.isFinite(item.startedAt);

function markLocalExamChanges() {
  const { db, readable } = readExamDbLocal();
  if (!readable) return;
  for (const space of EXAM_SYNC_SPACES) {
    for (const item of db[space]) {
      if (examSync.lastLocal[space].get(item.id) !== stableStringify(item)) {
        examSync.pending.add(`${space}/${item.id}`);
      }
    }
  }
}

async function pushExamDb() {
  const { db, readable } = readExamDbLocal();
  if (!readable) return;
  const tasks = [];
  for (const space of EXAM_SYNC_SPACES) {
    const valid = space === 'exams' ? examItemValid : attemptItemValid;
    const localIds = new Set();
    for (const item of db[space]) {
      if (!valid(item)) continue;
      localIds.add(item.id);
      const json = stableStringify(item);
      const key = `${space}/${item.id}`;
      if (examSync.lastRemote[space].get(item.id) === json) {
        examSync.lastLocal[space].set(item.id, json);
        examSync.pending.delete(key);
        continue;
      }
      tasks.push(set(ref(getDatabase(firebaseApp), `${EXAMDB_ROOT}/${space}/${item.id}`), item).then(() => {
        examSync.lastRemote[space].set(item.id, json);
        examSync.lastLocal[space].set(item.id, json);
        examSync.pending.delete(key);
      }));
    }
    for (const id of [...examSync.lastRemote[space].keys()]) {
      if (localIds.has(id) || examSync.pending.has(`${space}/${id}`)) continue;
      tasks.push(set(ref(getDatabase(firebaseApp), `${EXAMDB_ROOT}/${space}/${id}`), null).then(() => {
        examSync.lastRemote[space].delete(id);
        examSync.lastLocal[space].delete(id);
      }));
    }
  }
  await Promise.all(tasks);
}

/** Merge one cloud snapshot of examDb into the local document (single write). */
function applyExamDbRemote(remoteRoot) {
  const remoteExams = isPlainObject(remoteRoot?.exams) ? remoteRoot.exams : {};
  const remoteAttempts = isPlainObject(remoteRoot?.attempts) ? remoteRoot.attempts : {};
  const { db } = readExamDbLocal();
  let changed = false;

  const upsert = (space, item) => {
    const remoteJson = stableStringify(item);
    const key = `${space}/${item.id}`;
    if (examSync.pending.has(key)) return;
    const items = db[space];
    const index = items.findIndex(entry => entry.id === item.id);
    if (index === -1) {
      items.push(item);
      examSync.lastLocal[space].set(item.id, remoteJson);
      changed = true;
    } else if (stableStringify(items[index]) !== remoteJson) {
      items[index] = item;
      examSync.lastLocal[space].set(item.id, remoteJson);
      changed = true;
    }
  };

  const remoteExamIds = new Set();
  for (const item of Object.values(remoteExams)) {
    if (!examItemValid(item)) continue;
    remoteExamIds.add(item.id);
    examSync.lastRemote.exams.set(item.id, stableStringify(item));
    upsert('exams', item);
  }
  for (let i = db.exams.length - 1; i >= 0; i -= 1) {
    const id = db.exams[i].id;
    if (remoteExamIds.has(id) || examSync.pending.has(`exams/${id}`)) continue;
    if (!examSync.lastRemote.exams.has(id)) continue;   // the cloud never had it
    db.exams.splice(i, 1);
    examSync.lastRemote.exams.delete(id);
    examSync.lastLocal.exams.delete(id);
    changed = true;
  }

  const liveExamIds = new Set(db.exams.map(item => item.id));
  const remoteAttemptIds = new Set();
  for (const item of Object.values(remoteAttempts)) {
    if (!attemptItemValid(item)) continue;
    remoteAttemptIds.add(item.id);
    examSync.lastRemote.attempts.set(item.id, stableStringify(item));
    if (!liveExamIds.has(item.examId)) { examSync.orphans.set(item.id, item); continue; }
    examSync.orphans.delete(item.id);
    upsert('attempts', item);
  }
  for (const [id, item] of [...examSync.orphans]) {
    if (!liveExamIds.has(item.examId)) continue;
    examSync.orphans.delete(id);
    upsert('attempts', item);
  }
  for (let i = db.attempts.length - 1; i >= 0; i -= 1) {
    const attempt = db.attempts[i];
    if (examSync.pending.has(`attempts/${attempt.id}`)) continue;
    const examGone = !liveExamIds.has(attempt.examId);
    const deletedRemotely = !remoteAttemptIds.has(attempt.id) && examSync.lastRemote.attempts.has(attempt.id);
    if (!examGone && !deletedRemotely) continue;
    db.attempts.splice(i, 1);
    examSync.lastRemote.attempts.delete(attempt.id);
    examSync.lastLocal.attempts.delete(attempt.id);
    changed = true;
  }

  if (!changed) return false;
  applyingRemote = true;
  try { localStorage.setItem(KEYS.exams, JSON.stringify(db)); } finally { applyingRemote = false; }
  window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'exams' } }));
  window.dispatchEvent(new Event('exam-data-updated'));
  return true;
}

async function syncExamDb() {
  const node = ref(getDatabase(firebaseApp), EXAMDB_ROOT);
  const snap = await get(node);
  if (!snap.exists()) {
    // Fresh cloud space: this device seeds it and marks the space managed.
    await pushExamDb();
    try { await set(ref(getDatabase(firebaseApp), EXAMDB_SEEN), true); } catch {}
    return;
  }
  applyExamDbRemote(snap.val());
  await pushExamDb();
}

function listenExamDb() {
  onValue(ref(getDatabase(firebaseApp), EXAMDB_ROOT), snap => {
    if (!snap.exists()) return;
    try { applyExamDbRemote(snap.val()); } catch (error) {
      console.warn('[Active Plus] exam db listener failed', error);
    }
  });
}

function collectionPayload(collection, value) {
  if (collection === 'settings') return value;
  if (Array.isArray(value)) {
    const map = {};
    for (const item of value) {
      if (item && typeof item === 'object' && item.id) map[item.id] = item;
    }
    return map;
  }
  return {};
}

function remoteToLocal(collection, value) {
  if (collection === 'settings') return value && typeof value === 'object' ? value : {};
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).filter(Boolean);
}

async function syncCollection(collection, { forcePush = false } = {}) {
  const key = localKey(collection);
  if (!key) return;
  const local = readLocal(key);
  const node = ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    const next = remoteToLocal(collection, remote);
    applyingRemote = true;
    writeLocal(key, next);
    applyingRemote = false;
    lastRemote.set(collection, JSON.stringify(remote));
    window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection } }));
    return;
  }
  if (local !== null) {
    const payload = collectionPayload(collection, local);
    await set(node, payload);
    lastRemote.set(collection, JSON.stringify(payload));
  }
}

async function pushCollection(collection) {
  if (applyingRemote) return;
  const key = localKey(collection);
  const value = readLocal(key);
  if (value === null) return;
  const payload = collectionPayload(collection, value);
  const serialized = JSON.stringify(payload);
  if (lastRemote.get(collection) === serialized) return;
  await set(ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection), payload);
  lastRemote.set(collection, serialized);
}

function installLocalWriteBridge() {
  if (window.__apcRealtimeSyncBridge) return;
  const pushIdentityKey = key => {
    if (key === STAFF_DIRECTORY_KEY) return pushDirectory();
    if (key === KEYS.usernames) return pushUsernames();
    if (key === KEYS.account) return pushStudentAccount();
    if (key === KEYS.exams) { markLocalExamChanges(); return pushExamDb(); }
    return null;
  };
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const result = originalSetItem.call(this, key, value);
    if (this === window.localStorage && !applyingRemote) {
      const staffRole = staffRoleByAccountKey(key);
      if (staffRole) pushStaffRole(staffRole).catch(error => console.warn('[Active Plus] staff sync write failed', error));
      for (const collection of SYNCABLE) {
        if (collection === 'exams') continue;   // mirrored by the dedicated examDb path
        if (localKey(collection) === key) {
          pushCollection(collection).catch(error => console.warn('[Active Plus] sync write failed', error));
        }
      }
      try { pushIdentityKey(key)?.catch(error => console.warn('[Active Plus] identity sync write failed', error)); } catch {}
    }
    return result;
  };
  window.addEventListener('storage', event => {
    if (event.storageArea !== window.localStorage || applyingRemote) return;
    for (const collection of SYNCABLE) {
      if (collection === 'exams') continue;     // mirrored by the dedicated examDb path
      if (localKey(collection) === event.key) {
        pushCollection(collection).catch(error => console.warn('[Active Plus] sync storage event failed', error));
      }
    }
    const role = staffRoleByAccountKey(event.key);
    if (role) pushStaffRole(role).catch(error => console.warn('[Active Plus] staff sync storage event failed', error));
    try { pushIdentityKey(event.key)?.catch(error => console.warn('[Active Plus] identity sync storage event failed', error)); } catch {}
  });
  window.__apcRealtimeSyncBridge = true;
}

function listenStaffRole(role) {
  const node = ref(getDatabase(firebaseApp), STAFF_ROOT + '/' + role);
  onValue(node, snap => {
    if (!snap.exists()) return;
    const remote = snap.val();
    if (!remote || typeof remote !== 'object' || !remote.username || !remote.password) return;
    const serialized = JSON.stringify(remote);
    if (lastRemote.get('staff:' + role) === serialized) return;
    lastRemote.set('staff:' + role, serialized);
    writeStaffLocal(role, remote).then(() => {
      window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: 'staffAccounts', role } }));
    }).catch(error => console.warn('[Active Plus] staff listener failed', error));
  });
}

function listenIdentity(rootPath, label, isValid, applyLocal) {
  const node = ref(getDatabase(firebaseApp), rootPath);
  onValue(node, async snap => {
    if (!snap.exists()) return;
    const remote = snap.val();
    if (!isValid(remote)) return;
    const serialized = JSON.stringify(remote);
    if (lastRemote.get(label) === serialized) return;
    lastRemote.set(label, serialized);
    applyingRemote = true;
    try { await applyLocal(remote); } finally { applyingRemote = false; }
    window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: label } }));
  });
}

const listenDirectory = () =>
  listenIdentity(DIRECTORY_ROOT, 'staffDirectory', isDirectoryRecord, writeDirectoryLocal);
const listenUsernames = () =>
  listenIdentity(USERNAMES_ROOT, 'usernames', isUsernamesRecord, value => { writeLocal(KEYS.usernames, value); });
const listenStudentAccount = () =>
  listenIdentity(STUDENT_ROOT, 'studentAccount', isStudentAccountRecord, value => { writeLocal(KEYS.account, value); });

export async function hydrateStaffAccounts() {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    for (const role of Object.keys(STAFF_ACCOUNTS)) await syncStaffRole(role);
    return { ok: true };
  } catch (error) {
    console.warn('[Active Plus] staff account hydration failed:', error);
    return { ok: false, reason: 'staff-sync-failed', error };
  }
}

/**
 * Cross-device Login IDs: Staff Directory records, the claimed Login User ID
 * registry, the student login (on a device with no account yet) and the exam
 * database. Called from the login path, so records that already exist on this
 * device are never replaced here — only missing/changed ones are filled in
 * from the cloud (the exam merge rules live in applyExamDbRemote).
 */
export async function hydrateUserIdentifiers() {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    const tasks = [syncUsernames({ merge: true }), syncExamDb()];
    try {
      if (localStorage.getItem(STAFF_DIRECTORY_KEY) === null) tasks.push(syncDirectory());
      if (localStorage.getItem(KEYS.account) === null) tasks.push(syncStudentAccount());
    } catch {}
    await Promise.all(tasks);
    return { ok: true };
  } catch (error) {
    console.warn('[Active Plus] user id hydration failed:', error);
    return { ok: false, reason: 'identity-sync-failed', error };
  }
}

function listenCollection(collection) {
  const key = localKey(collection);
  const node = ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection);
  onValue(node, snap => {
    if (!snap.exists()) return;
    const serialized = JSON.stringify(snap.val());
    if (lastRemote.get(collection) === serialized) return;
    lastRemote.set(collection, serialized);
    const next = remoteToLocal(collection, snap.val());
    applyingRemote = true;
    writeLocal(key, next);
    applyingRemote = false;
    window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection } }));
  });
}

export async function startRealtimeSync() {
  if (started || !navigator.onLine) return { ok: false, reason: 'offline' };
  started = true;
  try {
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    const db = getDatabase(firebaseApp);
    void db;
    installLocalWriteBridge();

    for (const collection of SYNCABLE) {
      if (collection === 'exams') continue;     // mirrored by the dedicated examDb path
      await syncCollection(collection);
      listenCollection(collection);
    }
    for (const role of Object.keys(STAFF_ACCOUNTS)) {
      await syncStaffRole(role);
      listenStaffRole(role);
    }
    await syncDirectory();
    await syncUsernames();
    await syncStudentAccount();
    await syncExamDb();
    listenDirectory();
    listenUsernames();
    listenStudentAccount();
    listenExamDb();

    window.addEventListener('online', () => {
      for (const collection of SYNCABLE) {
        if (collection === 'exams') continue;   // mirrored by the dedicated examDb path
        syncCollection(collection).catch(error => console.warn('[Active Plus] reconnect sync failed', error));
      }
      for (const role of Object.keys(STAFF_ACCOUNTS)) {
        syncStaffRole(role).catch(error => console.warn('[Active Plus] reconnect staff sync failed', error));
      }
      syncDirectory().catch(error => console.warn('[Active Plus] reconnect directory sync failed', error));
      syncUsernames().catch(error => console.warn('[Active Plus] reconnect usernames sync failed', error));
      syncStudentAccount().catch(error => console.warn('[Active Plus] reconnect student sync failed', error));
      syncExamDb().catch(error => console.warn('[Active Plus] reconnect exam sync failed', error));
    });

    return { ok: true, mode: 'realtime-test-sync' };
  } catch (error) {
    started = false;
    console.warn('[Active Plus] Realtime Database sync failed:', error);
    return { ok: false, reason: 'sync-failed', error };
  }
}
