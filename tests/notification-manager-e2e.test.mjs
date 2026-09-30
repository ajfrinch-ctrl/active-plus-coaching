/* End to end on the real Manager panel (manager.js + notification engine +
   bell inbox): a counter entry waiting for approval rings, "পেমেন্ট দেখুন"
   closes the inbox and really opens the Cash Counter with that entry's
   Approve button; approving it there removes the notification. A paper sent by
   the teacher opens the Examination view the same way. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { KEYS } from '../js/database.js';

const VIEWER = `staff:${STAFF_ACCOUNTS.manager.username}`;
let ctx;
let controller;
const shown = [];

before(async () => {
  const now = Date.now();
  ctx = await loadPage('manager.html', { seed: {
    [KEYS.transactions]: JSON.stringify([
      { id: 'TX-9', receiptNo: 'R-9', studentId: 'S-1', studentName: 'রহিম উদ্দিন', className: 'দশম', feeType: 'মাসিক বেতন', month: 'অক্টোবর', amount: 1500, method: 'Cash', status: 'pending', reviewHistory: [], recordedAt: now }
    ]),
    [KEYS.exams]: JSON.stringify({ version: 1, attempts: [], exams: [] }),
    // This device already ran the current engine.
    [`activePlus.notifications.boot.v1:${VIEWER}`]: JSON.stringify({ version: 1, at: now - 60000 }),
    [`activePlus.notifications.rules.v1:${VIEWER}`]: JSON.stringify({ version: 2, at: now - 60000 })
  } });
  class FakeNotification { constructor(title, options) { shown.push({ title, options: options || {} }); } close() {} }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = async () => 'granted';
  ctx.window.Notification = FakeNotification;
  await provisionStaff('manager');
  seedStaffSession(ctx.window, 'manager');
  await import('../js/manager.js');
  await ctx.waitFor(() => ctx.$('#managerShell').hidden === false);
  controller = (await import('../js/notifications.js')).initNotifications();
  await ctx.flush();
});

const activeView = () => ctx.$('.manager-view.active')?.dataset.viewPanel;
const inboxOpen = () => { const modal = ctx.$('#noticeModal'); return Boolean(modal && !modal.hidden && !modal.classList.contains('hidden')); };

test('the pending counter entry rings on the Manager phone', () => {
  assert.equal(controller.viewer()?.role, 'manager');
  assert.ok(shown.some(item => item.title === 'পেমেন্ট অনুমোদনের অপেক্ষায়' && /রহিম উদ্দিন/.test(item.options.body)));
  assert.equal(activeView(), 'dashboard');
});

test('"পেমেন্ট দেখুন" closes the inbox and opens the Cash Counter at that entry', async () => {
  ctx.click(ctx.$('#notificationButton'));
  await ctx.flush();
  const open = ctx.$('button[data-apc-notice-open="payment-review:TX-9"]');
  assert.ok(open);
  ctx.click(open);
  await ctx.flush();
  assert.equal(activeView(), 'cash-counter');
  assert.equal(inboxOpen(), false, 'the bell list is closed');
  // The panel loads its ledger asynchronously and repaints the open view.
  await ctx.waitFor(() => ctx.$('#managerCashList [data-manager-action="approve-payment"][data-id="TX-9"]'), 5000);
});

test('approving it in the Cash Counter removes the notification', async () => {
  ctx.click(ctx.$('#managerCashList [data-manager-action="approve-payment"][data-id="TX-9"]'));
  await ctx.waitFor(() => JSON.parse(ctx.window.localStorage.getItem(KEYS.transactions))[0].status === 'approved');
  controller.refresh();
  await ctx.flush();
  assert.ok(!controller.feed().some(item => item.kind === 'payment-review'));
});

test('a paper from the teacher opens the Examination view', async () => {
  ctx.window.localStorage.setItem(KEYS.exams, JSON.stringify({ version: 1, attempts: [], exams: [
    { id: 'EX-1', title: 'রসায়ন', subject: 'রসায়ন', status: 'pending', teacherId: 'T', teacherName: 'করিম', className: 'দশম', startAt: Date.now() + 86400000, endAt: Date.now() + 90000000, updatedAt: 1, submittedAt: Date.now(), participants: [], questions: [] }
  ] }));
  controller.refresh();
  await ctx.flush();
  assert.equal(shown.at(-1).title, 'পরীক্ষা অনুমোদনের অপেক্ষায়');
  ctx.click(ctx.$('#notificationButton'));
  await ctx.flush();
  const open = ctx.$('button[data-apc-notice-open^="exam-review:EX-1:"]');
  assert.equal(open?.textContent, 'পরীক্ষা দেখুন');
  ctx.click(open);
  await ctx.flush();
  assert.equal(activeView(), 'exams');
  assert.equal(inboxOpen(), false);
});

test('no page errors', () => assert.deepEqual(ctx.jsdomErrors, []));
