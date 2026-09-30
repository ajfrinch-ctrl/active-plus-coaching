/* "Showing notifications when the app is opened is enough" (owner 2026-09-30).
   Real index.html + engine + bell, with NO Notification API at all (no phone
   permission): new items must still appear on a card inside the app — only
   once the signed-in app is on screen, once per item, and tapping opens them. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { KEYS } from '../js/database.js';
import { planInAppAlerts } from '../js/notification-rules.js';

const STUDENT_ID = 's260930002-inap';
const VIEWER = `student:${STUDENT_ID}`;
const INAPP_KEY = `activePlus.notifications.inapp.v1:${VIEWER}`;
const notice = (id, title, createdAt = new Date().toISOString()) => ({ id, title, body: `${title} — বিস্তারিত`, audience: 'সকল শিক্ষার্থী', status: 'published', createdAt });

let ctx;
let controller;
const clicks = [];
const card = () => ctx.$('#apcInAppAlert');
const cardVisible = () => Boolean(card() && !card().hidden);
const inbox = () => ctx.$('#noticeModal');

test('the pure plan: new items once; a first run shows only tasks and running exams', () => {
  const feed = [
    { key: 'notice:old', kind: 'notice', at: 1 },
    { key: 'registration:s1', kind: 'registration', actionable: true, at: 2 },
    { key: 'exam-live:E1:5', kind: 'exam-live', at: 3 }
  ];
  const first = planInAppAlerts({ feed, known: feed, initialise: true });
  assert.deepEqual(first.show.map(item => item.key), ['exam-live:E1:5', 'registration:s1']);
  assert.deepEqual(first.record.sort(), feed.map(item => item.key).sort(), 'everything current is the baseline');
  const next = planInAppAlerts({ feed: [...feed, { key: 'notice:new', kind: 'notice', at: 9 }], known: feed, shown: first.record });
  assert.deepEqual(next.show.map(item => item.key), ['notice:new']);
  assert.deepEqual(next.record.sort(), first.record.sort(), 'an item counts as shown only when the card shows it');
  const pruned = planInAppAlerts({ feed: [], known: [], shown: ['gone'] });
  assert.deepEqual(pruned.record, [], 'receipts of vanished items are dropped');
});

before(async () => {
  ctx = await loadPage('index.html');
  assert.equal('Notification' in ctx.window, false, 'no phone notification permission exists here');
  const store = ctx.window.localStorage;
  store.setItem(KEYS.account, JSON.stringify({ username: 'nadia', status: 'active', student: { id: STUDENT_ID, name: 'নাদিয়া' } }));
  store.setItem(KEYS.notices, JSON.stringify([notice('N-OLD', 'পুরোনো নোটিশ', '2026-09-01T00:00:00.000Z')]));
  store.setItem(`activePlus.notifications.boot.v1:${VIEWER}`, JSON.stringify({ version: 1, at: Date.now() - 60000 }));
  store.setItem(`activePlus.notifications.rules.v1:${VIEWER}`, JSON.stringify({ version: 2, at: Date.now() - 60000 }));
  store.setItem(INAPP_KEY, JSON.stringify({ version: 1, at: 0, keys: ['notice:N-OLD:2026-09-01T00:00:00.000Z'] }));
  // A notice published while the phone was off.
  store.setItem(KEYS.notices, JSON.stringify([notice('N-OLD', 'পুরোনো নোটিশ', '2026-09-01T00:00:00.000Z'), notice('N-NEW', 'কাল ক্লাস বন্ধ')]));
  for (const button of ctx.$$('[data-view]')) button.addEventListener('click', () => clicks.push(button.dataset.view));
  controller = (await import('../js/notifications.js')).initNotifications();
  await ctx.flush();
});

test('nothing is shown over the login screen', async () => {
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(cardVisible(), false);
  const stored = JSON.parse(ctx.window.localStorage.getItem(INAPP_KEY)).keys;
  assert.ok(!stored.some(key => key.startsWith('notice:N-NEW')), 'not counted as shown yet');
});

test('entering the app shows the new notice on a card, without any permission', async () => {
  ctx.$('#appShell').hidden = false;            // the student is signed in
  await ctx.waitFor(() => cardVisible(), 3000);
  assert.match(card().textContent, /নতুন নোটিফিকেশন/);
  assert.match(card().textContent, /কাল ক্লাস বন্ধ/);
  assert.doesNotMatch(card().textContent, /পুরোনো নোটিশ/, 'old news is not repeated');
  const stored = JSON.parse(ctx.window.localStorage.getItem(INAPP_KEY)).keys;
  assert.ok(stored.some(key => key.startsWith('notice:N-NEW')), 'now it counts as shown');
});

test('tapping plain news opens the bell list', async () => {
  ctx.click(ctx.$('#apcInAppAlert [data-apc-alert-open^="notice:N-NEW"]'));
  await ctx.flush();
  assert.equal(cardVisible(), false);
  assert.equal(inbox().hidden, false, 'the list is open');
  ctx.window.document.querySelector('#noticeModal [data-close-notice], #noticeModal .modal-close, #noticeModal [data-close-modal], #noticeModal [data-apc-notice-close]')?.click();
});

test('an item is not shown on the card a second time', async () => {
  controller.refresh();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(cardVisible(), false);
});

test('something arriving while the app is open appears at once; tapping a result opens Results', async () => {
  const at = Date.now();
  ctx.window.localStorage.setItem(KEYS.exams, JSON.stringify({ version: 1, attempts: [], exams: [
    { id: 'E-R', title: 'গণিত', subject: 'গণিত', status: 'published', teacherId: 'T', startAt: at - 7200000, endAt: at - 3600000, publishedAt: at - 86400000, resultsPublished: true, resultsPublishedAt: at, participants: [{ id: STUDENT_ID, name: 'নাদিয়া', className: 'দশম' }] }
  ] }));
  controller.refresh();
  await ctx.waitFor(() => cardVisible(), 3000);
  assert.match(card().textContent, /ফলাফল প্রকাশিত হয়েছে/);
  clicks.length = 0;
  ctx.click(ctx.$('#apcInAppAlert [data-apc-alert-open^="result:E-R"]'));
  await ctx.waitFor(() => clicks.includes('results'), 3000);
  assert.equal(cardVisible(), false);
});

test('× closes the card; the items stay in the bell list', async () => {
  ctx.window.localStorage.setItem(KEYS.notices, JSON.stringify([notice('N-3', 'তৃতীয় নোটিশ'), notice('N-4', 'চতুর্থ নোটিশ')]));
  controller.refresh();
  await ctx.waitFor(() => cardVisible(), 3000);
  assert.match(card().textContent, /২টি/);
  ctx.click(ctx.$('#apcInAppAlert [data-apc-alert-close]'));
  assert.equal(cardVisible(), false);
  assert.ok(controller.feed().some(item => item.key.startsWith('notice:N-3')));
});

test('"সব দেখুন" opens the list', async () => {
  ctx.window.localStorage.setItem(KEYS.notices, JSON.stringify([notice('N-5', 'পঞ্চম নোটিশ')]));
  controller.refresh();
  await ctx.waitFor(() => cardVisible(), 3000);
  ctx.click(ctx.$('#apcInAppAlert [data-apc-alert-all]'));
  assert.equal(cardVisible(), false);
  assert.equal(inbox().hidden, false);
});

test('no page errors', () => assert.deepEqual(ctx.jsdomErrors, []));
