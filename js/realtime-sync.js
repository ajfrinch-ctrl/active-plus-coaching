/* Active Plus — Realtime Database online test sync.
   Offline-first: localStorage remains the source used by the UI.
   Only SYNCABLE application data is mirrored; credentials/sessions never leave
   the device. This is a cross-device TEST bridge, not the final auth architecture. */
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp } from './firebase-config.js';
import { SYNCABLE, KEYS, STAFF_KEYS } from './database.js';
import { STAFF_ACCOUNTS } from './staff-auth.js';
import { isEncryptedEnvelope, decryptValue } from './secure-store.js';

const DB_ROOT = 'activePlusSync/v1';
let started = false;
let applyingRemote = false;
const lastRemote = new Map();
const STAFF_ROOT = DB_ROOT + '/staffAccounts';

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

async function syncStaffRole(role, { forcePush = false } = {}) {
  const local = await readStaffLocal(role);
  const node = ref(getDatabase(firebaseApp), STAFF_ROOT + '/' + role);
  const snap = await get(node);
  if (snap.exists() && !forcePush) {
    const remote = snap.val();
    if (remote && typeof remote === 'object' && remote.username && remote.password) {
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

    window.addEventListener('online', () => {
      for (const collection of SYNCABLE) {
        syncCollection(collection).catch(error => console.warn('[Active Plus] reconnect sync failed', error));
      }
      for (const role of Object.keys(STAFF_ACCOUNTS)) {
        syncStaffRole(role).catch(error => console.warn('[Active Plus] reconnect staff sync failed', error));
      }
    });

    return { ok: true, mode: 'realtime-test-sync' };
  } catch (error) {
    started = false;
    console.warn('[Active Plus] Realtime Database sync failed:', error);
    return { ok: false, reason: 'sync-failed', error };
  }
}
