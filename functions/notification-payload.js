/* Pure push payload rules for the sender.
   Data in → data out, so the Cloud Functions' decisions can be tested with
   plain `node --test` (no emulator, no network): see test/notification-payload.test.js.

   The web client builds the same shape in js/notification-rules.js — a notice
   sent from the Manager panel and a notice pushed by the function must read the
   same on the phone. */

const MAX_BODY = 140;

const text = value => (value === null || value === undefined ? '' : String(value));
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function oneLine(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function short(value, max = MAX_BODY) {
  const line = oneLine(value);
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A notice that was just published — or re-published with new text. */
function noticePush(before, after) {
  if (!isObject(after)) return null;                       // deleted: nothing to send
  if (text(after.status) !== 'published') return null;     // draft/pending stay internal
  const changed = !isObject(before) ||
    text(before.status) !== 'published' ||
    text(before.title) !== text(after.title) ||
    text(before.body) !== text(after.body) ||
    text(before.audience) !== text(after.audience);
  if (!changed) return null;                               // an unrelated field write
  const title = oneLine(after.title) || 'নোটিশ';
  return {
    kind: 'notice',
    title: `নতুন নোটিশ: ${title}`,
    body: short(after.body),
    data: {
      collection: 'notices',
      id: text(after.id),
      kind: 'notice',
      audience: text(after.audience),
      url: './index.html'
    }
  };
}

/** The urgent announcement in System Settings — every device, high priority. */
function broadcastPush(before, after) {
  if (!isObject(after) || after.broadcastAlert !== true) return null;
  const message = oneLine(after.broadcastMessage);
  if (!message) return null;
  const sameMessage = isObject(before) && oneLine(before.broadcastMessage) === message;
  if (sameMessage && before.broadcastAlert === true) return null;
  return {
    kind: 'broadcast',
    title: 'জরুরি ঘোষণা — Active Plus',
    body: short(message),
    data: { collection: 'settings', id: 'broadcast', kind: 'broadcast', url: './index.html' }
  };
}

const participantIds = exam => (Array.isArray(exam?.participants) ? exam.participants : [])
  .map(person => text(person?.id))
  .filter(Boolean);

/** Exam news for the students of one paper: a new exam, or released results. */
function examPushes(before, after) {
  if (!isObject(after)) return [];
  const studentIds = participantIds(after);
  if (!studentIds.length) return [];
  const label = oneLine(after.title) || 'পরীক্ষা';
  const subject = oneLine(after.subject);
  const pushed = [];
  // Re-publishing (a new publishedAt) is news again; an unrelated write on an
  // already published paper must stay quiet — hence the explicit numbers.
  const wasPublished = isObject(before) && text(before.status) === 'published';
  const samePublication = wasPublished && Number(before.publishedAt || 0) === Number(after.publishedAt || 0);
  const justPublished = text(after.status) === 'published' && !samePublication;
  if (justPublished) {
    pushed.push({
      kind: 'exam',
      title: 'নতুন পরীক্ষা নির্ধারিত হয়েছে',
      body: short(`${label}${subject ? ` — ${subject}` : ''} · সময়সূচি অ্যাপে দেখুন`),
      studentIds,
      data: { collection: 'exams', id: text(after.id), kind: 'exam', url: './index.html' }
    });
  }
  const resultsJustOut = after.resultsPublished === true && (!isObject(before) || before.resultsPublished !== true);
  if (resultsJustOut) {
    pushed.push({
      kind: 'result',
      title: 'ফলাফল প্রকাশিত হয়েছে',
      body: short(`${label}${subject ? ` — ${subject}` : ''} পরীক্ষার ফলাফল এখন অ্যাপে দেখা যাচ্ছে।`),
      studentIds,
      data: { collection: 'exams', id: text(after.id), kind: 'result', url: './index.html' }
    });
  }
  return pushed;
}

/** FCM accepts 500 recipients per request. */
function chunkTokens(tokens, size = 500) {
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

const PERMANENT = ['registration-token-not-registered', 'invalid-registration-token', 'invalid-argument'];

/** Tokens whose device no longer exists — the sender deletes those records. */
function tokensToPrune(results, tokens) {
  const responses = Array.isArray(results?.responses) ? results.responses : [];
  const dead = [];
  responses.forEach((response, index) => {
    if (response?.success) return;
    const code = text(response?.error?.code);
    if (PERMANENT.some(needle => code.includes(needle))) dead.push(tokens[index]);
  });
  return dead.filter(Boolean);
}

/** The FCM message for one payload (data-only devices still get the data). */
function messageFor(token, payload) {
  return {
    token,
    notification: { title: payload.title, body: payload.body },
    data: Object.fromEntries(Object.entries(payload.data || {}).map(([key, value]) => [key, text(value)])),
    webpush: {
      fcmOptions: { link: payload.data?.url || './index.html' },
      notification: { icon: './assets/icons/icon-192.png', tag: payload.data?.key || payload.kind || 'active-plus' }
    }
  };
}

module.exports = { noticePush, broadcastPush, examPushes, chunkTokens, tokensToPrune, messageFor, short, oneLine, MAX_BODY };
