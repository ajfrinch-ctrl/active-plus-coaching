/* Active Plus — Realtime Database online test sync.
   Offline-first: localStorage remains the source used by the UI.
   Only SYNCABLE application data is mirrored; credentials/sessions never leave
   the device. This is a cross-device TEST bridge, not the final auth architecture. */
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase, ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { firebaseApp } from './firebase-config.js';
import { SYNCABLE, KEYS } from './database.js';

const DB_ROOT = 'activePlusSync/v1';
let started = false;
let applyingRemote = false;
const lastRemote = new Map();

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
  });
  window.__apcRealtimeSyncBridge = true;
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

    window.addEventListener('online', () => {
      for (const collection of SYNCABLE) {
        syncCollection(collection).catch(error => console.warn('[Active Plus] reconnect sync failed', error));
      }
    });

    return { ok: true, mode: 'realtime-test-sync' };
  } catch (error) {
    started = false;
    console.warn('[Active Plus] Realtime Database sync failed:', error);
    return { ok: false, reason: 'sync-failed', error };
  }
}
