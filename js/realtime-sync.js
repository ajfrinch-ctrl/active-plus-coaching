/* Active Plus — Realtime Database online test sync.
   Offline-first: localStorage remains the source used by the UI.
   SYNCABLE application data plus every cross-device LOGIN IDENTITY is
   mirrored: the four staff role accounts, the Staff Directory records, the
   claimed Login User ID registry and the local student login. Only records
   that already hold PBKDF2 password HASHES travel the bridge — a plaintext
   password or security answer never does, and sessions stay device-bound.
   This is a cross-device TEST bridge, not the final auth architecture. */
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
    return null;
  };
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const result = originalSetItem.call(this, key, value);
    if (this === window.localStorage && !applyingRemote) {
      const staffRole = staffRoleByAccountKey(key);
      if (staffRole) pushStaffRole(staffRole).catch(error => console.warn('[Active Plus] staff sync write failed', error));
      for (const collection of SYNCABLE) {
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
 * registry and (on a device with no account yet) the local student login.
 * Called from the login path, so records that already exist on this device
 * are never replaced here — only missing ones are filled in from the cloud.
 */
export async function hydrateUserIdentifiers() {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    const auth = getAuth(firebaseApp);
    if (!auth.currentUser) await signInAnonymously(auth);
    const tasks = [syncUsernames({ merge: true })];
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
    listenDirectory();
    listenUsernames();
    listenStudentAccount();

    window.addEventListener('online', () => {
      for (const collection of SYNCABLE) {
        syncCollection(collection).catch(error => console.warn('[Active Plus] reconnect sync failed', error));
      }
      for (const role of Object.keys(STAFF_ACCOUNTS)) {
        syncStaffRole(role).catch(error => console.warn('[Active Plus] reconnect staff sync failed', error));
      }
      syncDirectory().catch(error => console.warn('[Active Plus] reconnect directory sync failed', error));
      syncUsernames().catch(error => console.warn('[Active Plus] reconnect usernames sync failed', error));
      syncStudentAccount().catch(error => console.warn('[Active Plus] reconnect student sync failed', error));
    });

    return { ok: true, mode: 'realtime-test-sync' };
  } catch (error) {
    started = false;
    console.warn('[Active Plus] Realtime Database sync failed:', error);
    return { ok: false, reason: 'sync-failed', error };
  }
}
