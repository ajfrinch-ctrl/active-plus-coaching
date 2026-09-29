/* Notification rules — pure functions only.
   No DOM, no Firebase, no storage access: everything here is data in → data out
   so the delivery decisions can be tested without a browser and reused by the
   page engine (js/notifications.js) and by the sender (functions/*).

   The system has two halves:
     • the notification centre (each device keeps its own read/seen receipts)
     • the push transport (FCM token per device, filled in by Cloud Functions)

   Secrets never appear here: a token record carries a role and an ID, never a
   password hash or a session token. */

export const NOTIFY_PREFIX = 'activePlus.notifications.';
export const SEEN_KEY_PREFIX = `${NOTIFY_PREFIX}seen.v1:`;
export const BOOT_KEY_PREFIX = `${NOTIFY_PREFIX}boot.v1:`;
export const PROMPT_HIDDEN_KEY = `${NOTIFY_PREFIX}promptHiddenAt.v1`;
export const LOCAL_WRITE_KEY = `${NOTIFY_PREFIX}localWrite.v1`;
/* The same event reaches a phone twice when the app is open — once through the
   sync bridge and once as an FCM push. Both paths claim the record here first,
   so exactly one notification is shown whichever arrives first. */
export const SHOWN_KEY = `${NOTIFY_PREFIX}shown.v1`;
export const SHOWN_WINDOW_MS = 2 * 60 * 1000;

/* A record written on this device is not announced back to the person who wrote
   it. The window is short on purpose: a genuinely re-published record notifies
   again a few minutes later. */
export const SELF_AUTHOR_WINDOW_MS = 10 * 60 * 1000;
/* Seen keys are a rolling window, not a permanent archive. */
export const MAX_SEEN = 300;
/* A backlog (offline for hours) must not fire twenty system notifications. */
export const MAX_BURST = 3;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = value => (typeof value === 'string' ? value.trim() : '');

/** Stable identity of the person using this device. */
export function viewerKeyOf(viewer) {
  if (!viewer) return 'guest';
  if (viewer.kind === 'staff') return `staff:${text(viewer.username) || text(viewer.role) || 'unknown'}`;
  return `student:${text(viewer.studentId) || text(viewer.username) || 'guest'}`;
}

/** Audience strings written by the Manager notice form. */
export const AUDIENCES = Object.freeze(['সকল শিক্ষার্থী', 'অভিভাবক', 'শিক্ষার্থী ও অভিভাবক']);

/**
 * Does this notice belong on this device's notice screen?
 *
 * The student app is where a student — or the guardian holding that phone —
 * signs in, so those three audiences all reach it. A record addressed to some
 * other group (a future staff-only audience) is not shown to students.
 * Staff devices see every notice: staff publish them and answer for them.
 */
export function audienceMatches(notice, viewer) {
  if (!notice) return false;
  if (viewer?.kind === 'staff') return true;
  const audience = text(notice.audience);
  if (!audience) return true;
  return AUDIENCES.includes(audience);
}

/** Revision of a notice: editing the text makes it unread / newsworthy again. */
export function noticeRevision(notice) {
  return text(notice?.updatedAt) || text(notice?.createdAt) ||
    `${text(notice?.title)}|${text(notice?.body)}|${text(notice?.date)}`;
}

export function noticeItem(notice) {
  const id = text(notice?.id);
  if (!id) return null;
  const title = text(notice?.title) || 'নোটিশ';
  const body = text(notice?.body);
  return {
    key: `notice:${id}:${noticeRevision(notice)}`,
    source: 'notices',
    sourceId: id,
    kind: 'notice',
    title,
    body,
    at: Date.parse(text(notice?.createdAt) || text(notice?.updatedAt) || '') || 0,
    audience: text(notice?.audience) || 'সকল শিক্ষার্থী'
  };
}

/** Urgent banner from System Settings — reaches every device, not a class. */
export function broadcastItem(config) {
  const message = text(config?.broadcastMessage);
  if (!config?.broadcastAlert || !message) return null;
  return {
    key: `broadcast:${message.slice(0, 160)}`,
    source: 'settings',
    sourceId: 'broadcast',
    kind: 'broadcast',
    title: 'জরুরি ঘোষণা',
    body: message,
    at: 0,
    audience: 'সকল'
  };
}

/** Bengali-friendly date/time for a notification body. */
export function bnWhen(ms) {
  const when = new Date(Number(ms));
  if (!Number.isFinite(when.getTime())) return '';
  try {
    return when.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return when.toLocaleString();
  }
}

const participantIds = exam => (Array.isArray(exam?.participants) ? exam.participants : [])
  .map(person => text(person?.id))
  .filter(Boolean);

/**
 * Exam news for one student device: a published paper that has not started yet,
 * and a result the office has released. Only participants are told.
 */
export function examItems(examDb, viewer, now = Date.now()) {
  if (viewer?.kind !== 'student' || !isObject(examDb)) return [];
  const studentId = text(viewer.studentId);
  if (!studentId) return [];
  const items = [];
  for (const exam of Array.isArray(examDb.exams) ? examDb.exams : []) {
    if (!isObject(exam) || !text(exam.id)) continue;
    if (!participantIds(exam).includes(studentId)) continue;
    const name = text(exam.title) || 'পরীক্ষা';
    const subject = text(exam.subject);
    if (exam.resultsPublished === true) {
      items.push({
        key: `result:${text(exam.id)}:${Number(exam.resultsPublishedAt) || Number(exam.updatedAt) || 0}`,
        source: 'exams',
        sourceId: text(exam.id),
        kind: 'result',
        title: 'ফলাফল প্রকাশিত হয়েছে',
        body: `${name}${subject ? ` — ${subject}` : ''} পরীক্ষার ফলাফল এখন অ্যাপে দেখা যাচ্ছে।`,
        at: Number(exam.resultsPublishedAt) || Number(exam.updatedAt) || 0,
        audience: 'অংশগ্রহণকারী'
      });
    } else if (exam.status === 'published' && Number(exam.startAt) > now) {
      items.push({
        key: `exam:${text(exam.id)}:${Number(exam.publishedAt) || Number(exam.updatedAt) || 0}`,
        source: 'exams',
        sourceId: text(exam.id),
        kind: 'exam',
        title: 'নতুন পরীক্ষা নির্ধারিত হয়েছে',
        body: `${name}${subject ? ` — ${subject}` : ''} · শুরু ${bnWhen(exam.startAt)}`,
        at: Number(exam.publishedAt) || Number(exam.updatedAt) || 0,
        audience: 'অংশগ্রহণকারী'
      });
    }
  }
  return items;
}

/** Newest first, stable for equal timestamps. */
export function sortNewestFirst(items) {
  return [...items].sort((left, right) => (right.at || 0) - (left.at || 0));
}

/** The complete notification list for one device, deduplicated by key. */
export function notificationFeed({ notices = [], config = null, examDb = null, viewer = null, now = Date.now(), localWrites = null } = {}) {
  const items = [];
  const broadcast = broadcastItem(config);
  if (broadcast) items.push(broadcast);
  for (const notice of Array.isArray(notices) ? notices : []) {
    const item = noticeItem(notice);
    if (item && audienceMatches(notice, viewer)) items.push(item);
  }
  items.push(...examItems(examDb, viewer, now));
  const unique = new Map();
  for (const item of sortNewestFirst(items)) if (!unique.has(item.key)) unique.set(item.key, item);
  return [...unique.values()].map(item => ({ ...item, selfAuthored: isSelfAuthored(item, localWrites, now) }));
}

/* ---- "written on this device" marker ---------------------------------------
   saveNotices()/saveAppConfig() stamp what this device wrote. The person who
   typed the notice should not receive their own push. */

export function markLocalSource(localWrites, collection, id, at = Date.now()) {
  const record = isObject(localWrites) ? { ...localWrites } : {};
  const map = isObject(record[collection]) ? { ...record[collection] } : {};
  map[text(id)] = Number(at) || Date.now();
  const cutoff = (Number(at) || Date.now()) - 24 * 60 * 60 * 1000;
  for (const [key, stamp] of Object.entries(map)) if (Number(stamp) < cutoff) delete map[key];
  record[collection] = map;
  return record;
}

export function isSelfAuthored(item, localWrites, now = Date.now(), windowMs = SELF_AUTHOR_WINDOW_MS) {
  if (!item || !isObject(localWrites)) return false;
  const map = localWrites[item.source];
  if (!isObject(map)) return false;
  const stamp = Number(map[item.sourceId]);
  if (!Number.isFinite(stamp)) return false;
  return now - stamp <= windowMs;
}

/* ---- Delivery planning ------------------------------------------------------ */

/**
 * Which items should raise a system notification, and which keys become seen.
 *
 * `firstRun` is the first time this device runs the engine: the existing list is
 * recorded silently, because a fresh install must not replay old news. Later,
 * only keys that were never seen — and that this device did not write itself —
 * are announced, up to `maxBurst`, newest first. Everything in the feed is
 * marked seen either way, so a notification is never repeated.
 */
export function planDeliveries({ feed = [], seen = [], firstRun = false, maxBurst = MAX_BURST, maxSeen = MAX_SEEN } = {}) {
  const seenSet = new Set(Array.isArray(seen) ? seen : []);
  const ordered = sortNewestFirst(feed);
  const notify = firstRun ? [] : ordered
    .filter(item => !seenSet.has(item.key) && !item.selfAuthored)
    .slice(0, Math.max(0, maxBurst));
  const keys = [];
  for (const item of ordered) {
    if (keys.includes(item.key)) continue;
    keys.push(item.key);
    if (keys.length >= maxSeen) break;
  }
  return { notify, seen: keys };
}

export function seenRecord(keys, at = Date.now()) {
  return { version: 1, at: Number(at) || Date.now(), keys: Array.isArray(keys) ? keys : [] };
}

/**
 * Claim a record for display. The first caller wins; a second caller inside the
 * window is told 'already shown' instead of raising a duplicate notification.
 */
export function claimDelivery(shown, id, at = Date.now(), windowMs = SHOWN_WINDOW_MS) {
  const record = isObject(shown) ? { ...shown } : {};
  const stamp = Number(record[text(id)]);
  if (Number.isFinite(stamp) && Number(at) - stamp < windowMs) return { claim: false, record };
  for (const [key, value] of Object.entries(record)) if (Number(at) - Number(value) >= windowMs) delete record[key];
  record[text(id)] = Number(at) || Date.now();
  return { claim: true, record };
}

/* ---- Push transport --------------------------------------------------------- */

/** FCM payload shown by the service worker. Kept identical to the sender's. */
export function pushPayload(item) {
  const body = text(item?.body);
  return {
    title: text(item?.title) || 'Active Plus',
    body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    tag: text(item?.key) || 'active-plus',
    data: {
      collection: text(item?.source) || 'notices',
      id: text(item?.sourceId),
      key: text(item?.key),
      // No `url`: which page opens is the device's own decision (its panel hint
      // in the service worker), so no payload can send it into another panel.
      kind: text(item?.kind)
    }
  };
}

/**
 * The record a device stores in the cloud so the sender knows where to push.
 * No password, hash or session token may ever be added here.
 */
export function pushTokenRecord({ token, viewer, deviceId, at = Date.now(), platform = '', locale = '' } = {}) {
  const value = text(token);
  if (value.length < 20) return null;
  return {
    token: value,
    role: viewer?.kind === 'staff' ? text(viewer.role) || 'staff' : 'student',
    username: text(viewer?.username),
    studentId: viewer?.kind === 'student' ? text(viewer?.studentId) : '',
    deviceId: text(deviceId),
    platform: text(platform).slice(0, 120),
    locale: text(locale).slice(0, 20),
    notifications: true,
    updatedAt: Number(at) || Date.now()
  };
}

/** One device may hold several roles: the node key is device + person. */
export function tokenPathKey(deviceId, viewer) {
  const raw = `${text(deviceId) || 'device'}|${viewerKeyOf(viewer)}`;
  return raw.replace(/[.#$/[\]]/g, '-').slice(0, 200);
}
