import { mountStatusNotice } from './status-surface.js';
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
import { KEYS, STAFF_KEYS, listDocuments } from './database.js';
import { loadNotices, loadRoster } from './office-data.js';
import { getDeviceId } from './session.js';
import {
  BOOT_KEY_PREFIX, CLEARED_KEY_PREFIX, LOCAL_WRITE_KEY, PROMPT_HIDDEN_KEY, REGISTRATION_REVIEWERS,
  SEEN_KEY_PREFIX, SHOWN_KEY, claimDelivery, clearedRecord, nextExamBoundary, notificationFeed,
  planDeliveries, pushPayload, seenRecord, viewerKeyOf
} from './notification-rules.js';

/* A notification tapped while no app window was open: the service worker
   leaves the payload here and opens the panel, which picks it up once. */
export const PENDING_CLICK_PATH = './__apc-pending-click';
// Same cache name as js/panel-lockdown.js and sw.js (not imported: the student
// page must not load the staff lockdown module just for a constant).
const PANEL_HINT_CACHE = 'apc-panel-hint';
const PENDING_CLICK_MAX_AGE_MS = 10 * 60 * 1000;

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
const WATCHED_KEYS = new Set([KEYS.notices, KEYS.settings, KEYS.exams, KEYS.students, KEYS.transactions]);
const WATCHED_COLLECTIONS = Object.freeze(['notices', 'settings', 'exams', 'students', 'transactions']);
/* Which records each person's notifications are built from. */
const NEEDS = Object.freeze({
  student: { students: true, transactions: true, exams: true },
  admin: { students: true },
  manager: { students: true, transactions: true, exams: true },
  teacher: { exams: true },
  payment: { transactions: true }
});
/* Where a tapped item goes when the payload does not name a view. */
const KIND_TARGET = Object.freeze({
  exam: 'exams', 'exam-soon': 'exams', 'exam-live': 'exams', result: 'results',
  approved: 'home', rejected: 'home',
  'payment-review': 'cash-counter', 'exam-review': 'exams',
  'exam-returned': 'online-exams', 'exam-approved': 'online-exams'
});
const NAV_ATTRIBUTE = Object.freeze({
  student: 'data-view', manager: 'data-manager-view', teacher: 'data-teacher-view', admin: 'data-admin-view'
});
const MAX_TIMER_MS = 60 * 60 * 1000;
/* Kinds added on 2026-09-30. The first refresh after the update records them
   silently: old approvals/payments must not buzz a phone as if they were new.
   Their list entries still appear; only the system notification is skipped. */
export const RULES_VERSION = 2;
export const RULES_KEY_PREFIX = 'activePlus.notifications.rules.v1:';
const V2_KINDS = new Set([
  'registration', 'approved', 'rejected', 'exam-soon', 'exam-live', 'payment',
  'payment-review', 'payment-rejected', 'exam-review', 'exam-returned', 'exam-approved'
]);
let boundaryTimer = null;

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
  // A receipt file that cannot be parsed is kept, never overwritten: the person
  // is told the read state is only for this session instead of silently losing
  // whatever was in there.
  try {
    const raw = window.localStorage.getItem(SEEN_KEY_PREFIX + viewerKey);
    if (raw !== null) JSON.parse(raw);
  } catch { return false; }
  return writeJSON(SEEN_KEY_PREFIX + viewerKey, seenRecord(keys));
}

/** When the "later" period ends — the stamp plus the quiet week. */
function promptHiddenUntil() {
  const stamp = Number(readJSON(PROMPT_HIDDEN_KEY, null)?.at) || 0;
  return stamp ? stamp + PROMPT_HIDE_MS : 0;
}

/* ---- Feed ------------------------------------------------------------------- */

function reviewsRegistrations() {
  return viewer?.kind === 'staff' && REGISTRATION_REVIEWERS.includes(viewer.role);
}

function readCleared() {
  const record = readJSON(CLEARED_KEY_PREFIX + viewerKey, null);
  return Array.isArray(record?.keys) ? record.keys.filter(key => typeof key === 'string') : [];
}

function needs() {
  return NEEDS[viewer?.kind === 'staff' ? viewer.role : 'student'] || {};
}

function safely(read) {
  try { return read(); } catch { return null; }
}

function rawFeed(cleared = null) {
  const want = needs();
  return notificationFeed({
    notices: loadNotices(),
    config: loadAppConfig(),
    examDb: want.exams ? readJSON(KEYS.exams, null) : null,
    students: want.students ? safely(loadRoster) : null,
    transactions: want.transactions ? safely(() => listDocuments('transactions')) : null,
    viewer,
    cleared,
    localWrites: readJSON(LOCAL_WRITE_KEY, null)
  });
}

/* Exam reminders are time-based, not data-based: wake up at the next start /
   reminder / end moment (browsers may delay a background timer; the refresh on
   becoming visible covers that). */
function scheduleExamBoundary() {
  clearTimeout(boundaryTimer);
  if (!needs().exams || viewer?.kind !== 'student') return;
  const next = nextExamBoundary(readJSON(KEYS.exams, null), viewer, Date.now());
  if (!next) return;
  const delay = Math.min(MAX_TIMER_MS, Math.max(1000, next - Date.now() + 500));
  boundaryTimer = setTimeout(() => refreshNotifications(), delay);
}

export function buildFeed() {
  return rawFeed(readCleared());
}

/**
 * Empty the list: the given keys, or everything currently shown. Cleared items
 * are also marked seen, so they never come back as a system notification.
 */
export function clearNotifications(keys = null) {
  const all = rawFeed(null).map(item => item.key);
  const target = Array.isArray(keys) ? keys : buildFeed().map(item => item.key);
  const saved = writeJSON(CLEARED_KEY_PREFIX + viewerKey, clearedRecord([...readCleared(), ...target], all));
  writeSeen([...new Set([...readSeen(), ...target])]);
  window.dispatchEvent(new CustomEvent('apc-notifications-updated', { detail: { cleared: target.length, saved } }));
  return { cleared: target.length, saved };
}

/** Put one cleared item back (e.g. "পরে দেখব" on a registration review). */
export function restoreNotification(key) {
  const all = rawFeed(null).map(item => item.key);
  const keys = readCleared().filter(item => item !== key);
  writeJSON(CLEARED_KEY_PREFIX + viewerKey, clearedRecord(keys, all));
  window.dispatchEvent(new CustomEvent('apc-notifications-updated', { detail: { restored: key } }));
}

/**
 * Open a registration for review from a notification (inbox or tray). The item
 * is cleared as soon as it has been looked at; "পরে দেখব" puts it back, and a
 * decision removes it for good (the student is no longer pending anywhere).
 */
export async function openRegistration(studentId) {
  const id = String(studentId || '').trim();
  if (!id || !reviewsRegistrations()) return false;
  const key = `registration:${id}`;
  clearNotifications([key]);
  try {
    const module = await import('./registration-review.js');
    const opened = await module.openRegistrationReview(id, {
      role: viewer.role,
      onLater: () => restoreNotification(key),
      onDone: () => scheduleRefresh()
    });
    if (!opened) restoreNotification(key);
    return opened;
  } catch (error) {
    console.warn('[Active Plus] registration review unavailable:', error?.name || 'unknown');
    restoreNotification(key);
    return false;
  }
}

/** Open the panel view a notification belongs to (bottom-bar button). */
function navigateTo(target) {
  const attribute = NAV_ATTRIBUTE[viewer?.kind === 'staff' ? viewer.role : 'student'];
  if (!attribute || !target) return false;
  const button = [...document.querySelectorAll(`[${attribute}]`)].find(item => item.getAttribute(attribute) === target);
  if (!button) return false;
  button.click();
  return true;
}

/**
 * A tapped notification (inbox or tray). A registration opens its review
 * dialog; every other item opens its view. Either way the item has now been
 * seen, so it is cleared from the list.
 */
export function openNotificationTarget(data) {
  const key = String(data?.key || '');
  if (data?.kind === 'registration' || key.startsWith('registration:')) {
    return openRegistration(data.id || key.slice('registration:'.length));
  }
  const item = key ? rawFeed(null).find(entry => entry.key === key) : null;
  const target = data?.target || item?.target || KIND_TARGET[data?.kind] || '';
  if (key && item) clearNotifications([key]);
  return Promise.resolve(navigateTo(target));
}

async function takePendingClick() {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(PANEL_HINT_CACHE);
    const response = await cache.match(PENDING_CLICK_PATH);
    if (!response) return null;
    await cache.delete(PENDING_CLICK_PATH);
    const record = JSON.parse(await response.text());
    if (!record || Date.now() - Number(record.at) > PENDING_CLICK_MAX_AGE_MS) return null;
    return record.data || null;
  } catch { return null; }
}

function watchNotificationClicks() {
  try {
    navigator.serviceWorker?.addEventListener?.('message', event => {
      if (event.data?.type === 'apc-notification-click') void openNotificationTarget(event.data.data);
    });
  } catch { /* no service worker: the inbox still works */ }
  // The panel restores its session asynchronously; give it a moment first.
  setTimeout(async () => {
    const data = await takePendingClick();
    if (data) void openNotificationTarget(data);
  }, 800);
}

/** The receipt keys this device already knows about (inbox + tray agree). */
export function seenKeys() {
  return readSeen();
}

/** Everything in the feed is read: used when the inbox is opened. */
export function markAllSeen() {
  const feed = buildFeed();
  const keys = [...new Set([...readSeen(), ...feed.map(item => item.key)])];
  const saved = writeSeen(keys);
  window.dispatchEvent(new CustomEvent('apc-notifications-updated', { detail: { read: keys.length, saved } }));
  return { count: keys.length, saved };
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
  const { claim, record } = claimDelivery(readJSON(SHOWN_KEY, null), item.key || item.sourceId);
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
  // Receipts are kept for the whole feed, cleared items included: an item put
  // back with "পরে দেখব" must not be announced a second time.
  const cleared = new Set(readCleared());
  const full = rawFeed(null);
  const feed = full.filter(item => !cleared.has(item.key));
  // While the device is not "armed" (see below) the list is only recorded, so a
  // fresh install or a half-finished cloud load cannot fire old news.
  const plan = planDeliveries({ feed: full, seen: readSeen(), firstRun: !armed });
  plan.notify = plan.notify.filter(item => !cleared.has(item.key));
  const rulesVersion = Number(readJSON(RULES_KEY_PREFIX + viewerKey, null)?.version) || 1;
  if (rulesVersion < RULES_VERSION) {
    // Time-based exam reminders are always current, so they may still ring.
    plan.notify = plan.notify.filter(item => !V2_KINDS.has(item.kind) || item.kind === 'exam-soon' || item.kind === 'exam-live');
    if (armed) writeJSON(RULES_KEY_PREFIX + viewerKey, { version: RULES_VERSION, at: Date.now() });
  }
  writeSeen(plan.seen);
  let delivered = 0;
  if (armed && notificationsEnabled() && permission() === 'granted') {
    for (const item of plan.notify) { deliver(item); delivered += 1; }
  }
  paintPill();
  scheduleExamBoundary();
  window.dispatchEvent(new CustomEvent('apc-notifications-updated', { detail: { delivered } }));
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
    ? 'নোটিফিকেশন বন্ধ — চালু করার নিয়ম'
    : 'নোটিফিকেশন চালু করুন';
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
  pill = document.createElement('button');
  pill.type = 'button';
  pill.id = 'apcNotifyToggle';
  pill.setAttribute('aria-live', 'polite');
  // A one-time decision is allowed: the nudge can be put away for a week.
  pillDismiss = document.createElement('button');
  pillDismiss.type = 'button';
  pillDismiss.id = 'apcNotifyDismiss';
  pillDismiss.setAttribute('aria-label', 'নোটিফিকেশনের কথা পরে দেখাব');
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
  mountStatusNotice(bar);
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

/** The bell and its inbox. Optional: if this import fails, notifications still
    arrive in the tray and the pill still works. */
function mountNoticeCenter() {
  import('./notice-center.js')
    .then(module => module.mountNoticeCenter(controller))
    .catch(error => console.warn('[Active Plus] notification inbox unavailable:', error?.name || 'unknown'));
}



export function initNotifications() {
  if (controller) return controller;
  try {
    viewer = currentViewer();
    viewerKey = viewerKeyOf(viewer);
    const firstRun = !Number(readJSON(BOOT_KEY_PREFIX + viewerKey, null)?.at);
    if (firstRun) {
      writeJSON(BOOT_KEY_PREFIX + viewerKey, { version: 1, at: Date.now() });
      writeJSON(RULES_KEY_PREFIX + viewerKey, { version: RULES_VERSION, at: Date.now() });
    }
    armed = !firstRun;                       // a device with data notifies at once
    // Permission remains available in the notice inbox; no unsolicited banner.
    const register = () => { refreshNotifications(); };
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
      if (!collection || WATCHED_COLLECTIONS.includes(collection)) scheduleRefresh();
    });
    // A decision taken on this device does not fire a storage event here.
    window.addEventListener('apc-registration-decided', scheduleRefresh);
    watchNotificationClicks();
    window.addEventListener('apc-sync-status', () => { if (!armed) return; paintPill(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && armed) refreshNotifications();
    });
    if (permission() === 'granted') void registerPushTransport();
    controller = {
      refresh: refreshNotifications,
      feed: buildFeed,
      seen: seenKeys,
      markAllSeen,
      clear: clearNotifications,
      restore: restoreNotification,
      openItem: item => openNotificationTarget({ kind: item?.kind, id: item?.sourceId, key: item?.key, target: item?.target }),
      enable: enableNotifications,
      disable: disableNotifications,
      pushSupport: async () => (await import('./push-notifications.js')).pushSupport(),
      viewer: () => ({ ...viewer }),
      viewerKey: () => viewerKey,
      armed: () => armed,
      permission,
      deviceId: getDeviceId
    };
    window.apcNotifications = controller;
    // The bell/inbox needs the controller, so it is mounted after it exists.
    if (document.body) mountNoticeCenter();
    else window.addEventListener('DOMContentLoaded', mountNoticeCenter, { once: true });
    return controller;
  } catch (error) {
    console.warn('[Active Plus] notification centre failed to start:', error?.name || 'unknown');
    return null;
  }
}
