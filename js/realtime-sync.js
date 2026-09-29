/* Active Plus — Realtime Database online test sync.
   Offline-first: localStorage remains the source used by the UI.

   Mirrored, each with its own merge rules:
     • application collections (students, transactions, notices, routine,
       teaching, settings, teacher assignments) through a durable per-record
       outbox (js/record-sync.js) — offline edits and deletions survive
       reloads and are merged into current server state
     • the four staff role accounts and the AES-encrypted Staff Directory
     • the claimed Login User ID registry
     • one student login record per login ID (studentAccounts/<encoded-id>),
       selected on a device only after its password has been verified
     • the exam database (exams + attempts) through its dedicated mirror

   Only records that already hold PBKDF2 password HASHES travel the bridge — a
   plaintext password or security answer never does, and sessions stay
   device-bound. The bridge signs in anonymously and every authenticated user
   of the project can read/write these nodes: it is a cross-device TEST bridge,
   not the final authentication or authorization architecture. */
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, runTransaction, onValue as firebaseOnValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp, appCheckReady } from './firebase-config.js';
import { SYNCABLE, KEYS } from './database.js';
import { STAFF_ACCOUNTS } from './staff-auth.js';
import { encodeRealtimeRecords, decodeRealtimeRecords } from './realtime-value-codec.js';
import { collectionPayload, remoteToLocal } from './sync-collections.js';
import { createRecordSync, mergeRecordOperations } from './record-sync.js';
import { chooseStaffCopy, chooseStudentCopy, sameStudentRecord, loginIdOf, matchesLoginIdentifier, findLoginMatches, suggestIdentifiers } from './sync-merge.js';
import { reportSyncConflict, reportSyncError, setSyncStatus } from './sync-status.js';
import { isPasswordRecord, verifyPassword } from './password-hash.js';
import { normalizeUsername, contactNumber } from './account-policy.js';
import { TEACHER_ASSIGNMENTS_KEY } from './teacher-assignments.js';
import { STAFF_DIRECTORY_KEY } from './staff-directory.js';
import { encodeUsernameRegistry, decodeUsernameRegistry, encodeUsernameKey } from './username-sync-codec.js';
import { isEncryptedEnvelope, decryptValue, encryptValue } from './secure-store.js';

const DB_ROOT = 'activePlusSync/v1';
let started = false;
const lastRemote = new Map();
const STAFF_ROOT = DB_ROOT + '/staffAccounts';
const DIRECTORY_ROOT = DB_ROOT + '/staffDirectory';
const USERNAMES_ROOT = DB_ROOT + '/usernames';
const STUDENT_ROOT = DB_ROOT + '/studentAccount'; // read-only legacy migration
const STUDENTS_ROOT = DB_ROOT + '/studentAccounts';
const EXAMDB_ROOT = DB_ROOT + '/examDb';
const EXAMDB_SEEN = EXAMDB_ROOT + '/meta/seen';

const rawSetItem = Storage.prototype.setItem;
const subscriptions = new Set();
let booting = null;
let authFlight = null;
let connected = false;
let ready = false;
let syncFailed = false;

function notifyRemote(key, collection) {
  const event = new window.StorageEvent('storage', {
    key, newValue: localStorage.getItem(key), storageArea: localStorage,
    url: location.href
  });
  Object.defineProperty(event, 'apcRemote', { value: true });
  window.dispatchEvent(event);
  window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection, key } }));
}

function remoteWrite(key, value, collection) {
  const serialized = JSON.stringify(value);
  if (localStorage.getItem(key) === serialized) return true;
  rawSetItem.call(localStorage, key, serialized);
  notifyRemote(key, collection);
  return true;
}

function syncError(error) {
  syncFailed = true;
  reportSyncError(error);
}

/* A login ID claimed twice (two devices, one of them not synced yet) must stay
   visible instead of being retried away: it needs a human decision. */
let conflict = null;
function reportConflict(code) {
  conflict = { code };
  reportSyncConflict(code);
}
function clearConflict(code) {
  if (!conflict || (code && conflict.code !== code)) return;
  conflict = null;
  paintSyncStatus();
}

function onValue(node, callback) {
  const unsubscribe = firebaseOnValue(node, snapshot => {
    Promise.resolve().then(() => callback(snapshot)).catch(syncError);
  }, syncError);
  subscriptions.add(unsubscribe);
  return unsubscribe;
}

/** Push everything still waiting in the durable outboxes. */
async function flushPending() {
  const bridges = [...recordBridges.values()];
  if (!bridges.length) return;
  await Promise.all(bridges.map(bridge => bridge.flush()));
}

function paintSyncStatus() {
  if (!navigator.onLine) setSyncStatus('offline');
  else if (syncFailed || conflict) return;
  else if (!connected) setSyncStatus('connecting');
  else if (!ready) setSyncStatus('connecting');
  else if ([...recordBridges.values()].some(bridge => bridge.hasPending())) setSyncStatus('pending');
  else setSyncStatus('online');
}

async function ensureCloudAuth() {
  if (authFlight) return authFlight;
  authFlight = (async () => {
    await appCheckReady;
    const auth = getAuth(firebaseApp);
    await auth.authStateReady();
    if (!auth.currentUser) {
      await setPersistence(auth, browserLocalPersistence);
      await signInAnonymously(auth);
    }
    return auth.currentUser;
  })().finally(() => { authFlight = null; });
  return authFlight;
}

function localKey(collection) {
  return collection === 'teacherAssignments' ? TEACHER_ASSIGNMENTS_KEY : KEYS[collection];
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch { return null; }
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
  return remoteWrite(spec.accountKey, account, 'staffAccounts');
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
  Boolean(value) && typeof value === 'object' && isPasswordRecord(value.pinHash);

const staffFlights = new Map();
function syncStaffRole(role) {
  if (staffFlights.has(role)) return staffFlights.get(role);
  const flight = (async () => {
    const local = await readStaffLocal(role);
    const node = ref(getDatabase(firebaseApp), STAFF_ROOT + '/' + role);
    const snap = await get(node);
    const remote = snap.exists() ? snap.val() : null;
    const decision = chooseStaffCopy(local, remote, { role });
    if (decision === 'conflict') {
      // Two different Admin usernames: the account the other devices already
      // use wins, and the system created on this device is discarded.
      await writeStaffLocal(role, remote);
      lastRemote.set('staff:' + role, JSON.stringify(remote));
      reportConflict('admin-conflict');
      return;
    }
    if (decision === 'remote') {
      // The cloud copy (a real credential, or an account that was never
      // personalised here) must not be replaced by this device's copy.
      await writeStaffLocal(role, remote);
      lastRemote.set('staff:' + role, JSON.stringify(remote));
      return;
    }
    if (!local) return;
    await set(node, local);
    lastRemote.set('staff:' + role, JSON.stringify(local));
    if (role === 'admin') clearConflict('admin-conflict');
  })().finally(() => staffFlights.delete(role));
  staffFlights.set(role, flight);
  return flight;
}

const pushStaffRole = role => syncStaffRole(role);

/* Directory changes are merged by permanent record ID, not by replacing the
   entire staff list. The baseline only stores revision dates, never secrets. */
const DIRECTORY_BASELINE = 'activePlus.directorySyncBaseline.v2';
let directoryQueue = Promise.resolve();
function syncDirectory() {
  const work = directoryQueue.catch(() => {}).then(async () => {
    const beforeRaw = localStorage.getItem(STAFF_DIRECTORY_KEY);
    const local = await readDirectoryLocal();
    const baseline = readLocal(DIRECTORY_BASELINE);
    const records = Object.fromEntries((local?.records || []).map(record => [record.id, record]));
    const operations = {};
    for (const [id, record] of Object.entries(records)) {
      if (baseline && baseline[id] === record.updatedAt) continue;
      operations[id] = { value: record, ...(!baseline ? { seed: true } : {}) };
    }
    if (local && baseline) for (const id of Object.keys(baseline)) {
      if (!Object.hasOwn(records, id)) operations[id] = { value: null };
    }
    const node = ref(getDatabase(firebaseApp), DIRECTORY_ROOT);
    let remote;
    if (Object.keys(operations).length) {
      const result = await runTransaction(node, current => {
        const existing = Object.fromEntries((current?.records || []).map(record => [record.id, record]));
        return {
          version: 1,
          records: Object.values(mergeRecordOperations(existing, operations)),
          updatedAt: current?.updatedAt || local?.updatedAt || new Date().toISOString()
        };
      }, { applyLocally: false });
      remote = result.snapshot.val();
    } else remote = (await get(node)).val();
    if (!remote && !baseline) return;
    remote = { version: 1, ...remote, records: remote?.records || [] };
    if (!isDirectoryRecord(remote)) throw new Error('Invalid remote staff directory');
    const envelope = await encryptValue(JSON.stringify(remote));
    // A user may have edited while encryption/network was pending. Their next
    // queued write uses the old baseline and must not be overwritten here.
    if (localStorage.getItem(STAFF_DIRECTORY_KEY) !== beforeRaw) return;
    rawSetItem.call(localStorage, DIRECTORY_BASELINE, JSON.stringify(
      Object.fromEntries(remote.records.map(record => [record.id, record.updatedAt || '']))
    ));
    lastRemote.set('staffDirectory', JSON.stringify(remote));
    remoteWrite(STAFF_DIRECTORY_KEY, envelope || remote, 'staffDirectory');
  });
  directoryQueue = work;
  return work;
}
const pushDirectory = () => syncDirectory();

/**
 * Login User ID registry. Remote wins when present; otherwise the local
 * registry is uploaded. With `merge` the local claims survive and remote
 * claims are added on top — used on the login path so an offline claim
 * made on this device is not lost mid-session.
 */
async function syncUsernames() {
  const local = readUsernamesLocal() || {};
  const node = ref(getDatabase(firebaseApp), USERNAMES_ROOT);
  const result = await runTransaction(node, current => ({
    ...encodeUsernameRegistry(local), ...(current || {})
  }), { applyLocally: false });
  const remote = result.snapshot.val() || {};
  lastRemote.set('usernames', JSON.stringify(remote));
  remoteWrite(KEYS.usernames, decodeUsernameRegistry(remote), 'usernames');
}

const pushUsernames = () => syncUsernames();

/* Each student now has a separate login record. The old singleton is read
   only for migration and never copied over an unrelated signed-in student. */
function studentKey(account) {
  return normalizeUsername(account?.username || account?.student?.username || '') ||
    contactNumber(account?.registrationMobile || account?.mobile || '');
}
const studentMatches = (account, identifier) => matchesLoginIdentifier(account, identifier);
let studentFlight = null;
function syncStudentAccount() {
  if (studentFlight) return studentFlight;
  studentFlight = (async () => {
    const local = studentAccountPayload(readLocal(KEYS.account));
    const key = studentKey(local);
    if (!key || !isPasswordRecord(local?.pinHash)) return;
    const node = ref(getDatabase(firebaseApp), STUDENTS_ROOT + '/' + encodeUsernameKey(key));
    const result = await runTransaction(node, current => {
      // Only a write that really changes something is committed: 'remote'
      // needs no write, and a duplicate login ID must abort untouched.
      return chooseStudentCopy(local, current) === 'local' ? local : undefined;
    }, { applyLocally: false });
    const remote = result.snapshot.val();
    if (!isStudentAccountRecord(remote) || studentKey(remote) !== key) return;
    lastRemote.set('student:' + key, JSON.stringify(remote));
    if (sameStudentRecord(local, remote)) {
      clearConflict('login-id-conflict');
      // The cloud copy is what other devices use: adopt it when it is newer.
      remoteWrite(KEYS.account, remote, 'studentAccount');
    } else {
      // Another student owns this login ID in the cloud. Keep both records —
      // the local registration stays usable here, nothing is destroyed.
      reportConflict('login-id-conflict');
    }
  })().finally(() => { studentFlight = null; });
  return studentFlight;
}

const pushStudentAccount = () => syncStudentAccount();

/** Is this login ID already claimed in the cloud (by any role)? Best effort:
    a failed or offline lookup answers "unknown" and never blocks the caller. */
export async function usernameTakenOnline(username) {
  const name = loginIdOf({ username });
  if (!name) return { ok: true, taken: false };
  if (!navigator.onLine) return { ok: false, taken: false, offline: true };
  try {
    await ensureCloudAuth();
    const db = getDatabase(firebaseApp);
    const [claims, record, directory] = await Promise.all([
      get(ref(db, USERNAMES_ROOT)),
      get(ref(db, STUDENTS_ROOT + '/' + encodeUsernameKey(name))),
      get(ref(db, DIRECTORY_ROOT))
    ]);
    const claimed = decodeUsernameRegistry(claims.val() || {});
    const staff = Object.values(directory.val()?.records || {});
    const taken = Boolean(claimed[name]) || Boolean(record.val()) ||
      staff.some(employee => loginIdOf(employee) === name);
    return { ok: true, taken };
  } catch (error) {
    console.warn('[Active Plus] login-id check unavailable:', error?.code || error?.name || 'unknown');
    return { ok: false, taken: false, error };
  }
}
async function hydrateStudent(identifier, password) {
  if (!identifier) return { found: false };
  const db = getDatabase(firebaseApp);
  // The login ID is the key, so it is read directly. A mobile number or a
  // Student ID is not a key: those need a lookup (see below).
  let account = (await get(ref(db, STUDENTS_ROOT + '/' + encodeUsernameKey(normalizeUsername(identifier))))).val();
  if (!studentMatches(account, identifier)) account = null;
  // A miss is reported with what the cloud really holds, so "not found" can be
  // told apart from "nothing was ever uploaded from the other device".
  let cloudAccounts = 0;
  let similar = [];
  if (!account) {
    const snapshot = await get(ref(db, STUDENTS_ROOT));
    const records = Object.values(snapshot.val() || {}).filter(Boolean);
    cloudAccounts = records.length;
    const matches = findLoginMatches(records, identifier);
    // "s260929001" is only usable while exactly one student matches it.
    if (matches.length > 1) return { found: true, ambiguous: true };
    account = matches[0] || null;
    if (!account) similar = suggestIdentifiers(records, identifier);
  }
  if (!account) {
    const legacy = (await get(ref(db, STUDENT_ROOT))).val();
    if (studentMatches(legacy, identifier)) account = legacy;
    else return { found: false, cloudAccounts, similar };
  }
  if (!account || !isPasswordRecord(account.pinHash)) return { found: false };
  // Never replace the active local profile on a failed password attempt.
  if (!(await verifyPassword(password, account.pinHash))) return { found: true, credentialMismatch: true };
  // The password was verified against this cloud record, so it is this person's
  // account: a previous duplicate-ID warning is settled now.
  clearConflict('login-id-conflict');
  remoteWrite(KEYS.account, account, 'studentAccount');
  await syncStudentAccount();
  if (ready) listenStudentAccount();
  return { found: true };
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

  // Firebase returns an array when every child key is a sequential integer and
  // drops empty objects entirely; both shapes must be restored before the app's
  // strict document validation reads the file.
  const asMap = value => {
    if (!Array.isArray(value)) return value || {};
    const map = {};
    value.forEach((entry, index) => { if (entry !== null) map[String(index)] = entry; });
    return map;
  };
  const asList = value => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).sort((left, right) => Number(left) - Number(right)).map(key => value[key]);
  };

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
  for (const raw of Object.values(remoteExams)) {
    const item = { ...raw, participants: raw.participants || [] };
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
  for (const raw of Object.values(remoteAttempts)) {
    const item = { ...raw, answers: asMap(raw.answers), order: asList(raw.order) };
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
  remoteWrite(KEYS.exams, db, 'exams');
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
    try { applyExamDbRemote(snap.val() || {}); } catch (error) {
      console.warn('[Active Plus] exam db listener failed', error);
    }
  });
}

const RECORD_COLLECTIONS = [...SYNCABLE.filter(name => name !== 'exams'), 'teacherAssignments'];
const recordBridges = new Map();

function normalizeCollectionSnapshot(collection, value) {
  const decoded = decodeRealtimeRecords(value || {});
  return collectionPayload(collection, remoteToLocal(collection, decoded)) || {};
}

function recordBridge(collection) {
  if (recordBridges.has(collection)) return recordBridges.get(collection);
  const key = localKey(collection);
  const stateKey = 'activePlus.syncOutbox.v2:' + collection;
  const node = ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection);
  const bridge = createRecordSync({
    loadState: () => readLocal(stateKey),
    saveState: value => rawSetItem.call(localStorage, stateKey, JSON.stringify(value)),
    readLocal: () => collectionPayload(collection, readLocal(key)),
    writeLocal: value => remoteWrite(key, remoteToLocal(collection, value), collection),
    commit: async operations => {
      const result = await runTransaction(node, current => {
        const decoded = decodeRealtimeRecords(current || {});
        return encodeRealtimeRecords(mergeRecordOperations(decoded, operations));
      }, { applyLocally: false });
      return normalizeCollectionSnapshot(collection, result.snapshot.val());
    }
  });
  recordBridges.set(collection, bridge);
  return bridge;
}

async function syncCollection(collection) {
  const bridge = recordBridge(collection);
  const snapshot = await get(ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection));
  bridge.receive(normalizeCollectionSnapshot(collection, snapshot.val()));
  await bridge.flush();
}

async function pushCollection(collection) {
  const bridge = recordBridge(collection);
  bridge.capture();
  if (!ready || !navigator.onLine) { paintSyncStatus(); return; }
  setSyncStatus('pending');
  await bridge.flush();
  paintSyncStatus();
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
    if (this === window.localStorage) {
      const staffRole = staffRoleByAccountKey(key);
      if (staffRole) pushStaffRole(staffRole).catch(syncError);
      for (const collection of RECORD_COLLECTIONS) {
        if (collection === 'exams') continue;   // mirrored by the dedicated examDb path
        if (localKey(collection) === key) {
          pushCollection(collection).catch(syncError);
        }
      }
      try { pushIdentityKey(key)?.catch(syncError); } catch {}
    }
    return result;
  };
  window.addEventListener('storage', event => {
    if (event.apcRemote || event.storageArea !== window.localStorage) return;
    for (const collection of RECORD_COLLECTIONS) {
      if (collection === 'exams') continue;     // mirrored by the dedicated examDb path
      if (localKey(collection) === event.key) {
        pushCollection(collection).catch(syncError);
      }
    }
    const role = staffRoleByAccountKey(event.key);
    if (role) pushStaffRole(role).catch(syncError);
    try { pushIdentityKey(event.key)?.catch(syncError); } catch {}
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
    await applyLocal(remote);
    window.dispatchEvent(new CustomEvent('apc-sync-updated', { detail: { collection: label } }));
  });
}

const listenDirectory = () => onValue(ref(getDatabase(firebaseApp), DIRECTORY_ROOT), snap => {
  if (lastRemote.get('staffDirectory') === JSON.stringify(snap.val())) return;
  return syncDirectory();
});
const listenUsernames = () =>
  listenIdentity(USERNAMES_ROOT, 'usernames', isUsernamesRecord, value => { remoteWrite(KEYS.usernames, decodeUsernameRegistry(value), 'usernames'); });
let stopStudent = null;
let studentListeningKey = null;
function listenStudentAccount() {
  const key = studentKey(readLocal(KEYS.account));
  if (studentListeningKey === key && stopStudent) return;
  stopStudent?.();
  subscriptions.delete(stopStudent);
  studentListeningKey = key;
  if (!key) { stopStudent = null; return; }
  stopStudent = onValue(ref(getDatabase(firebaseApp), STUDENTS_ROOT + '/' + encodeUsernameKey(key)), snap => {
    const remote = snap.val();
    const local = readLocal(KEYS.account);
    if (studentKey(local) !== key || !isStudentAccountRecord(remote)) return;
    if (!sameStudentRecord(local, remote)) {
      // Another student owns this login ID in the cloud: never adopt their
      // record here (that would silently replace this device's account).
      reportConflict('login-id-conflict');
      return;
    }
    lastRemote.set('student:' + key, JSON.stringify(remote));
    remoteWrite(KEYS.account, remote, 'studentAccount');
  });
}

export async function hydrateStaffAccounts({ preserveLocalAdmin = false } = {}) {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    await ensureCloudAuth();
    for (const role of Object.keys(STAFF_ACCOUNTS)) {
      if (role === 'admin' && preserveLocalAdmin && await readStaffLocal(role)) continue;
      await syncStaffRole(role);
    }
    return { ok: true };
  } catch (error) {
    syncError(error);
    return { ok: false, reason: 'staff-sync-failed', error };
  }
}

/**
 * Cross-device Login IDs: Staff Directory records, the claimed Login User ID
 * registry and the requested student login. The student account is only
 * selected after its password has been verified. Unrelated collections never
 * gate this login path. This remains a compatibility bridge, not server auth.
 */
export async function hydrateUserIdentifiers({ identifier = '', password = '' } = {}) {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    await ensureCloudAuth();
    // Refresh even an existing directory: another device may have added staff.
    // Exams and unrelated records must not gate credential lookup.
    const results = await Promise.allSettled([syncDirectory(), syncUsernames(), hydrateStudent(identifier, password)]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return { ok: true, ...results[2].value };
  } catch (error) {
    syncError(error);
    return { ok: false, reason: 'identity-sync-failed', error };
  }
}

function listenCollection(collection) {
  const bridge = recordBridge(collection);
  onValue(ref(getDatabase(firebaseApp), DB_ROOT + '/' + collection), snapshot => {
    bridge.receive(normalizeCollectionSnapshot(collection, snapshot.val()));
  });
}

let pendingTimer = null;
let attemptTimer = null;

/** A record left in the outbox (failed write, or an edit made before startup)
    is retried by itself, so nothing waits for a reload or a new click. */
function schedulePendingFlush() {
  clearInterval(pendingTimer);
  pendingTimer = setInterval(() => {
    if (!ready || !navigator.onLine) return;
    if (![...recordBridges.values()].some(bridge => bridge.hasPending())) return;
    flushPending().catch(syncError);
  }, 3000);
}

window.addEventListener('apc-student-login', () => {
  // The student just signed in with a verified password: pull their exam data
  // in the background. The background startup does the same, only later.
  if (!ready) return;
  void syncExamDb().catch(syncError);
});

export async function startRealtimeSync() {
  if (!navigator.onLine) { setSyncStatus('offline'); return { ok: false, reason: 'offline' }; }
  if (booting) return booting;
  if (started && !syncFailed) {
    // Already running: still push anything the outbox is holding. A database
    // reconnect does not fire the browser's `online` event, so without this the
    // pending change could sit unsent until the next reload.
    try { await flushPending(); } catch (error) { syncError(error); }
    paintSyncStatus();
    return { ok: true };
  }
  booting = (async () => {
    ready = false;
    syncFailed = false;
    setSyncStatus('connecting');
    for (const stop of subscriptions) stop();
    subscriptions.clear();
    clearInterval(pendingTimer);
    clearTimeout(attemptTimer);
    stopStudent = null;
    studentListeningKey = null;
    try {
      // Capture local changes even if authentication later fails.
      for (const collection of RECORD_COLLECTIONS) recordBridge(collection);
      installLocalWriteBridge();
      await ensureCloudAuth();
      onValue(ref(getDatabase(firebaseApp), '.info/connected'), snap => {
        connected = snap.val() === true;
        paintSyncStatus();
      });
      const tasks = [
        ...RECORD_COLLECTIONS.map(collection => syncCollection(collection)),
        ...Object.keys(STAFF_ACCOUNTS).map(role => syncStaffRole(role)),
        syncDirectory(), syncUsernames(), syncStudentAccount(), syncExamDb()
      ];
      // One failed collection must not prevent account hydration or other reads.
      const results = await Promise.allSettled(tasks);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      for (const collection of RECORD_COLLECTIONS) listenCollection(collection);
      for (const role of Object.keys(STAFF_ACCOUNTS)) listenStaffRole(role);
      listenDirectory();
      listenUsernames();
      listenStudentAccount();
      listenExamDb();
      ready = true;
      started = true;
      schedulePendingFlush();
      paintSyncStatus();
      return { ok: true, mode: 'realtime-test-sync' };
    } catch (error) {
      started = false;
      syncError(error);
      return { ok: false, reason: 'sync-failed', error };
    }
  })().finally(() => { booting = null; });
  return booting;
}

window.addEventListener('offline', () => { connected = false; setSyncStatus('offline'); });
window.addEventListener('online', () => { started = false; void startRealtimeSync(); });
// A reconnect that never reaches a listener must still not leave data unsent.
attemptTimer = setInterval(() => {
  if (navigator.onLine && ready && !connected) void startRealtimeSync();
}, 20000);
