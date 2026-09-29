/* Notification centre for every app page.

   Two layers, one list:
     • the in-app list (the student bell already renders it) and
     • a system notification (Android/desktop notification tray) raised when a
       new notice, urgent broadcast, exam or result arrives through the sync
       bridge while the app is open — including a backgrounded tab.

   The rules live in js/notification-rules.js (pure, tested). This file only
   reads local data, keeps this device's seen receipts and shows the
   notification. It never uploads anything: the FCM device token is handled by
   js/push-notifications.js, and that module is optional — if it fails, the
   centre still works.

   A brand-new device records the existing notices silently: a fresh install
   must never replay old news as a burst of notifications. */

import { readJSON, writeJSON, loadAppConfig, loadAccount } from './storage.js';
import { KEYS, STAFF_KEYS } from './database.js';
import { loadNotices } from './office-data.js';
import { getDeviceId } from './session.js';
import {
  BOOT_KEY_PREFIX, LOCAL_WRITE_KEY, PROMPT_HIDDEN_KEY, SEEN_KEY_PREFIX, SHOWN_KEY,
  claimDelivery, notificationFeed, planDeliveries, pushPayload, seenRecord, viewerKeyOf
} from './notification-rules.js';

const ROLE_PAGES = Object.freeze({
  'admin.html': 'admin',
  'manager.html': 'manager',
  'teacher.html': 'teacher',
  'payment.html': 'payment'
});
const ROLE_ACCOUNT_KEYS = Object.freeze({
  admin: STAFF_KEYS.adminAccount,
  manager: STAFF_KEYS.managerAccount,
  teacher: STAFF_KEYS.teacherAccount,
  payment: STAFF_KEYS.paymentAccount
});
const ROLE_USERNAMES = Object.freeze({
  admin: 'admin.apc', manager: 'manager.apc', teacher: 'teacher.apc', payment: 'payment.apc'
});

const PROMPT_HIDE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 400;
const ARM_FALLBACK_MS = 12000;
const SW_READY_TIMEOUT_MS = 2500;
const WATCHED_KEYS = new Set([KEYS.notices, KEYS.settings, KEYS.exams]);

let controller = null;
let viewer = null;
let viewerKey = '';
let armed = false;
let refreshTimer = null;
let armTimer = null;
let pill = null;
let pillDismiss = null;
let pillNote = '';
let pillNoteTimer = null;

/* ---- Who is using this device ---------------------------------------------- */

/* The shell in the DOM is the reliable signal (a rewritten URL still has it);
   the file name is the fallback for the moment before the body is parsed. */
const ROLE_MARKERS = Object.freeze([
  ['manager', '#managerShell'],
  ['teacher', '#teacherShell'],
  ['admin', '.admin-shell'],
  ['payment', '.pay-shell']
]);

function pageRole() {
  try {
    for (const [role, selector] of ROLE_MARKERS) {
      if (document.querySelector(selector)) return role;
    }
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return ROLE_PAGES[page] || null;
  } catch { return null; }
}

/** The staff record on this device (plain JSON only — an encrypted envelope is
    not needed here, the role username is enough for addressing). */
function readStaffAccount(key) {
  const record = readJSON(key, null);
  return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
}

export function currentViewer() {
  const role = pageRole();
  if (role) {
    const account = readStaffAccount(ROLE_ACCOUNT_KEYS[role]);
    return {
      kind: 'staff',
      role,
      username: String(account?.username || ROLE_USERNAMES[role] || role),
      name: String(account?.fullName || '')
    };
  }
  const account = loadAccount();
  const student = account?.student || {};
  const studentId = String(student.id || account?.studentId || '');
  return {
    kind: 'student',
    studentId,
    username: String(account?.username || student.username || ''),
    name: String(student.name || student.nameBn || '')
  };
}

/* ---- Receipts ---------------------------------------------------------------- */

function readSeen() {
  const record = readJSON(SEEN_KEY_PREFIX + viewerKey, null);
  if (Array.isArray(record)) return record.filter(key => typeof key === 'string');
  return Array.isArray(record?.keys) ? record.keys.filter(key => typeof key === 'string') : [];
}

function writeSeen(keys) {
  return writeJSON(SEEN_KEY_PREFIX + viewerKey, seenRecord(keys));
}

/** When the "later" period ends — the stamp plus the quiet week. */
function promptHiddenUntil() {
  const stamp = Number(readJSON(PROMPT_HIDDEN_KEY, null)?.at) || 0;
  return stamp ? stamp + PROMPT_HIDE_MS : 0;
}

/* ---- Feed ------------------------------------------------------------------- */

export function buildFeed() {
  const config = loadAppConfig();
  const examDb = viewer?.kind === 'student' ? readJSON(KEYS.exams, null) : null;
  return notificationFeed({
    notices: loadNotices(),
    config,
    examDb,
    viewer,
    localWrites: readJSON(LOCAL_WRITE_KEY, null)
  });
}

function notificationsEnabled() {
  try { return loadAppConfig().pushNotifications !== false; } catch { return true; }
}

function permission() {
  try {
    if (!('Notification' in window)) return 'unsupported';
    return window.Notification.permission || 'default';
  } catch { return 'unsupported'; }
}

/* ---- System notification ----------------------------------------------------- */

async function serviceWorkerRegistration() {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS));
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch { return null; }
}

function notificationOptions(payload) {
  return {
    body: payload.body,
    icon: './assets/icons/icon-192.png',
    tag: payload.tag,
    data: payload.data
  };
}

/** Android Chrome refuses `new Notification(...)`; the service worker is the
    supported path there, with the constructor as a desktop fallback. */
async function showSystemNotification(title, options) {
  const registration = await serviceWorkerRegistration();
  if (registration && typeof registration.showNotification === 'function') {
    return registration.showNotification(title, options);
  }
  return new window.Notification(title, options);
}

function deliver(item) {
  const { claim, record } = claimDelivery(readJSON(SHOWN_KEY, null), item.sourceId || item.key);
  writeJSON(SHOWN_KEY, record);
  if (!claim) return;                      // the push already showed this one
  const payload = pushPayload(item);
  Promise.resolve()
    .then(() => showSystemNotification(payload.title, notificationOptions(payload)))
    .catch(error => console.warn('[Active Plus] notification not shown:', error?.name || 'unknown'));
  window.dispatchEvent(new CustomEvent('apc-notification', { detail: item }));
}

/* ---- Refresh loop ------------------------------------------------------------ */

export function refreshNotifications() {
  if (!viewer) return { delivered: 0 };
  const feed = buildFeed();
  // While the device is not "armed" (see below) the list is only recorded, so a
  // fresh install or a half-finished cloud load cannot fire old news.
  const plan = planDeliveries({ feed, seen: readSeen(), firstRun: !armed });
  writeSeen(plan.seen);
  let delivered = 0;
  if (armed && notificationsEnabled() && permission() === 'granted') {
    for (const item of plan.notify) { deliver(item); delivered += 1; }
  }
  paintPill();
  return { delivered, feed };
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshNotifications(), REFRESH_DEBOUNCE_MS);
}

/**
 * A brand-new device waits for the first cloud load before it announces
 * anything; a device that already holds data starts immediately. The fallback
 * timer arms the engine even if the sync never reports a status.
 */
function armWhenReady() {
  if (armed) return;
  armed = true;
  clearTimeout(armTimer);
  scheduleRefresh();
}

function watchSyncStatus(event) {
  const state = event?.detail?.state || document.documentElement.dataset.realtimeSync;
  if (state && state !== 'connecting') armWhenReady();
}

/* ---- Permission UI ----------------------------------------------------------- */

function paintPill() {
  if (!pill || !pill.isConnected) return;
  const state = permission();
  const setVisible = visible => {
    pill.hidden = !visible;
    if (pillDismiss) pillDismiss.hidden = !visible;
  };
  if (pillNote) {
    pill.hidden = false;
    if (pillDismiss) pillDismiss.hidden = true;
    pill.textContent = pillNote;
    return;
  }
  if (state === 'granted') return setVisible(false);
  if (!notificationsEnabled()) return setVisible(false);
  if (state === 'unsupported') return setVisible(false);
  if (state === 'default' && Date.now() < promptHiddenUntil()) return setVisible(false);
  setVisible(true);
  pill.textContent = state === 'denied'
    ? '🔕 নোটিফিকেশন বন্ধ — চালু করার নিয়ম'
    : '🔔 নোটিফিকেশন চালু করুন';
}

function noteThenHide(message, ms = 5000) {
  pillNote = message;
  clearTimeout(pillNoteTimer);
  paintPill();
  pillNoteTimer = setTimeout(() => { pillNote = ''; paintPill(); }, ms);
}

function mountPill() {
  if (pill || !document.body) return;
  const bar = document.createElement('div');
  bar.id = 'apcNotifyBar';
  bar.style.cssText = 'position:fixed;left:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:999;display:flex;gap:6px;align-items:center;max-width:min(80vw,360px);';
  pill = document.createElement('button');
  pill.type = 'button';
  pill.id = 'apcNotifyToggle';
  pill.setAttribute('aria-live', 'polite');
  pill.style.cssText = 'padding:7px 11px;border:1px solid #1d4ed8;border-radius:999px;background:#eff6ff;color:#1e3a8a;font:12px/1.5 sans-serif;box-shadow:0 2px 8px #0002;text-align:left;';
  // A one-time decision is allowed: the nudge can be put away for a week.
  pillDismiss = document.createElement('button');
  pillDismiss.type = 'button';
  pillDismiss.id = 'apcNotifyDismiss';
  pillDismiss.setAttribute('aria-label', 'নোটিফিকেশনের কথা পরে দেখাব');
  pillDismiss.style.cssText = 'width:26px;height:26px;border:1px solid #93c5fd;border-radius:50%;background:#ffffff;color:#1e3a8a;font:14px/1 sans-serif;';
  pillDismiss.textContent = '×';
  pillDismiss.addEventListener('click', () => {
    writeJSON(PROMPT_HIDDEN_KEY, { version: 1, at: Date.now() });
    paintPill();
  });
  pill.hidden = true;
  pill.addEventListener('click', () => {
    if (pillNote) { pillNote = ''; paintPill(); return; }
    if (permission() === 'denied') {
      pillNote = 'ব্রাউজার সেটিংসে এই সাইটের নোটিফিকেশন ব্লক করা আছে — Chrome/Safari সেটিংস থেকে অনুমতি দিন।';
      paintPill();
      return;
    }
    void enableNotifications();
  });
  bar.append(pill, pillDismiss);
  document.body.append(bar);
  paintPill();
}

/* ---- Enable / disable -------------------------------------------------------- */

async function registerPushTransport({ ask = false } = {}) {
  try {
    const module = await import('./push-notifications.js');
    return ask ? module.enablePush({ viewer }) : module.syncPushRegistration({ viewer });
  } catch (error) {
    console.warn('[Active Plus] push transport unavailable:', error?.name || 'unknown');
    return { ok: false, status: 'unavailable' };
  }
}

export async function enableNotifications() {
  try {
    if (!('Notification' in window)) {
      noteThenHide('এই ব্রাউজারে সিস্টেম নোটিফিকেশন নেই।');
      return { ok: false, status: 'unsupported' };
    }
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') {
      pillNote = permission === 'denied'
        ? 'অনুমতি দেওয়া হয়নি — ব্রাউজার সেটিংস থেকে নোটিফিকেশন চালু করুন।'
        : '';
      paintPill();
      return { ok: false, status: permission };
    }
    writeJSON(PROMPT_HIDDEN_KEY, { version: 1, at: 0 });
    const result = await registerPushTransport({ ask: true });
    noteThenHide(result?.status === 'registered'
      ? '✅ নোটিফিকেশন চালু হয়েছে — অ্যাপ বন্ধ থাকলেও নোটিশ পাবেন।'
      : '✅ নোটিফিকেশন চালু হয়েছে (এই ডিভাইসেই দেখাবে)।');
    refreshNotifications();
    return { ok: true, status: result?.status || 'granted' };
  } catch (error) {
    console.warn('[Active Plus] notification permission failed:', error?.name || 'unknown');
    return { ok: false, status: 'error' };
  }
}

export async function disableNotifications() {
  try {
    const module = await import('./push-notifications.js');
    const result = await module.disablePush({ viewer });
    noteThenHide('নোটিফিকেশন বন্ধ করা হয়েছে।');
    return result;
  } catch {
    return { ok: false, status: 'unavailable' };
  }
}

/* ---- Mount ------------------------------------------------------------------- */

export function initNotifications() {
  if (controller) return controller;
  try {
    viewer = currentViewer();
    viewerKey = viewerKeyOf(viewer);
    const firstRun = !Number(readJSON(BOOT_KEY_PREFIX + viewerKey, null)?.at);
    if (firstRun) writeJSON(BOOT_KEY_PREFIX + viewerKey, { version: 1, at: Date.now() });
    armed = !firstRun;                       // a device with data notifies at once
    const register = () => { mountPill(); refreshNotifications(); };
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', register, { once: true });
    else register();
    if (!armed) {
      window.addEventListener('apc-sync-status', watchSyncStatus);
      armTimer = setTimeout(armWhenReady, ARM_FALLBACK_MS);
      watchSyncStatus();
    }
    window.addEventListener('storage', event => {
      if (!event.key || WATCHED_KEYS.has(event.key)) scheduleRefresh();
    });
    window.addEventListener('apc-sync-updated', event => {
      const collection = event.detail?.collection;
      if (!collection || ['notices', 'settings', 'exams'].includes(collection)) scheduleRefresh();
    });
    window.addEventListener('apc-sync-status', () => { if (!armed) return; paintPill(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && armed) refreshNotifications();
    });
    if (permission() === 'granted') void registerPushTransport();
    controller = {
      refresh: refreshNotifications,
      feed: buildFeed,
      enable: enableNotifications,
      disable: disableNotifications,
      viewer: () => ({ ...viewer }),
      viewerKey: () => viewerKey,
      armed: () => armed,
      permission,
      deviceId: getDeviceId
    };
    window.apcNotifications = controller;
    return controller;
  } catch (error) {
    console.warn('[Active Plus] notification centre failed to start:', error?.name || 'unknown');
    return null;
  }
}
