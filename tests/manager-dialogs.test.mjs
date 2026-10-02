/* Manager decisions ask with the app's own dialog instead of window.prompt /
   window.confirm. Reason: on an installed iOS/Android app the native prompt is
   browser chrome or simply ignored, so "Reject" could complete without a
   reason — or silently do nothing at all. These tests fail if a native dialog
   creeps back, and they check that the reason/edit actually reaches storage. */
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ROSTER_KEY, NOTICES_KEY, ROUTINE_KEY } from '../js/office-data.js';

let ctx;

const roster = [
  { id: 'S-PENDING', name: 'অপেক্ষমাণ শিক্ষার্থী', className: 'নবম শ্রেণি', group: 'A', mobile: '01700000000', guardianMobile: '01800000000', status: 'pending', enrolledAt: '২০২৬-১০-০১' },
  { id: 'S-KEEP', name: 'রাখার শিক্ষার্থী', className: 'নবম শ্রেণি', group: 'B', mobile: '01711111111', status: 'pending', enrolledAt: '২০২৬-১০-০১' }
];
const notices = [{ id: 'NOT-1', title: 'পুরোনো শিরোনাম', body: 'আগের বিবরণ', audience: 'সকল শিক্ষার্থী', date: '২০২৬-১০-০১', status: 'published', createdAt: '2026-10-01T06:00:00.000Z' }];
const routine = { sat: { date: '', classes: [{ id: 'RTN-1', className: 'নবম শ্রেণি', subject: 'গণিত', teacher: 'করিম স্যার', room: 'রুম ১', time: '১০:০০', period: 'সকাল', status: 'published' }] } };

before(async () => {
  ctx = await loadPage('manager.html', {
    seed: { [ROSTER_KEY]: JSON.stringify(roster), [NOTICES_KEY]: JSON.stringify(notices), [ROUTINE_KEY]: JSON.stringify(routine) }
  });
  await provisionStaff('manager');
  seedStaffSession(ctx.window, 'manager');
  await import('../js/manager.js');
  await ctx.waitFor(() => ctx.$('#managerShell').hidden === false);
  await ctx.flush();
});

const dialogRoot = () => ctx.$('[data-in-app-dialog]');
const openView = async view => {
  ctx.click(ctx.$(`.manager-bottom [data-manager-view="${view}"]`) || ctx.$(`[data-manager-view="${view}"]`));
  await ctx.flush(4);
  await new Promise(resolve => setTimeout(resolve, 10));   // let pending renders land
};

/* The panels re-render their lists after every decision, so a node captured a
   moment earlier can already be detached. Each action re-queries (and retries)
   until its dialog is really on screen. */
const actionDialog = async (action, id) => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const button = ctx.$$(`[data-manager-action="${action}"]`)
      .find(item => !id || item.dataset.id === id || item.dataset.index === id);
    if (button) {
      ctx.click(button);
      await ctx.waitFor(() => Boolean(dialogRoot()), 1500).catch(() => {});
      if (dialogRoot()) return dialogRoot();
    }
    await ctx.flush(4);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`no dialog opened for [${action}]`);
};
const dismissDialog = async () => {
  if (dialogRoot()) {
    ctx.click(dialogRoot().querySelector('[data-dialog-cancel]'));
    await ctx.flush(2);
  }
};
const storedStudents = () => JSON.parse(ctx.window.localStorage.getItem(ROSTER_KEY) || '[]');
const storedNotices = () => JSON.parse(ctx.window.localStorage.getItem(NOTICES_KEY) || '[]');
const storedRoutine = () => JSON.parse(ctx.window.localStorage.getItem(ROUTINE_KEY) || '{}');

beforeEach(async () => {
  if (ctx) await dismissDialog();
});

test('rejecting a registration asks for the reason in an in-app dialog and records it', async () => {
  await openView('approvals');
  assert.ok(ctx.$$('[data-manager-action="reject-student"]').some(button => button.dataset.id === 'S-PENDING'),
    'the pending registration is in the review queue');
  const root = await actionDialog('reject-student', 'S-PENDING');
  assert.equal(root.querySelector('.modal').getAttribute('role'), 'dialog');
  assert.match(root.querySelector('.modal-copy').textContent, /অপেক্ষমাণ শিক্ষার্থী/, 'the dialog says who is being decided');
  assert.equal(root.querySelector('h2').textContent.includes('কারণ'), true);

  ctx.submit(root.querySelector('form'));
  await ctx.flush(2);
  assert.ok(dialogRoot(), 'an empty reason cannot close the dialog');
  assert.match(dialogRoot().querySelector('.finance-error').textContent, /তারকা/);
  assert.equal(storedStudents().find(student => student.id === 'S-PENDING').status, 'pending', 'nothing was decided yet');

  ctx.type(dialogRoot().querySelector('textarea'), 'তথ্য অসম্পূর্ণ');
  ctx.submit(dialogRoot().querySelector('form'));
  await ctx.waitFor(() => storedStudents().find(student => student.id === 'S-PENDING')?.status === 'rejected');
  const decided = storedStudents().find(student => student.id === 'S-PENDING');
  assert.equal(decided.reviewNote, 'তথ্য অসম্পূর্ণ');
  assert.equal(decided.reviewedRole, 'manager');
  assert.equal(dialogRoot(), null);
});

test('cancelling the reject dialog leaves the registration pending', async () => {
  await openView('approvals');
  assert.ok(ctx.$$('[data-manager-action="reject-student"]').some(button => button.dataset.id === 'S-KEEP'),
    'the second pending registration is still in the queue');
  const root = await actionDialog('reject-student', 'S-KEEP');
  ctx.click(root.querySelector('[data-dialog-cancel]'));
  await ctx.flush(2);
  assert.equal(dialogRoot(), null);
  assert.equal(storedStudents().find(student => student.id === 'S-KEEP').status, 'pending');
});

test('editing a notice is one dialog for title and body — a cancelled edit changes nothing', async () => {
  await openView('notices');
  await actionDialog('edit-notice', 'NOT-1');
  const fields = ctx.$$('[data-in-app-dialog] input, [data-in-app-dialog] textarea');
  assert.equal(fields.length, 2, 'title and body are edited together, not through two prompts');
  assert.equal(fields[0].value, 'পুরোনো শিরোনাম');
  assert.equal(fields[1].value, 'আগের বিবরণ');

  ctx.click(dialogRoot().querySelector('[data-dialog-cancel]'));
  await ctx.flush(2);
  assert.equal(storedNotices()[0].title, 'পুরোনো শিরোনাম', 'cancel writes nothing');

  await actionDialog('edit-notice', 'NOT-1');
  ctx.type(ctx.$$('[data-in-app-dialog] input')[0], 'নতুন শিরোনাম');
  ctx.submit(dialogRoot().querySelector('form'));
  await ctx.waitFor(() => storedNotices()[0]?.title === 'নতুন শিরোনাম');
  assert.equal(storedNotices()[0].body, 'আগের বিবরণ', 'the untouched field keeps its value');
});

test('deleting a notice confirms in the app, then removes it', async () => {
  await openView('notices');
  const root = await actionDialog('delete-notice', 'NOT-1');
  assert.match(root.querySelector('.modal-copy').textContent, new RegExp(storedNotices()[0].title));
  ctx.click(root.querySelector('[data-dialog-confirm]'));
  await ctx.waitFor(() => storedNotices().length === 0);
  assert.equal(ctx.$('#managerNoticeList').textContent.includes('কোনো operational notice নেই'), true);
});

test('routine edit and delete use the same dialog, and Escape keeps the row', async () => {
  await openView('routine');
  await actionDialog('edit-routine', '0');
  ctx.type(ctx.$$('[data-in-app-dialog] input')[0], 'পদার্থবিজ্ঞান');
  ctx.submit(dialogRoot().querySelector('form'));
  await ctx.waitFor(() => storedRoutine().sat.classes[0].subject === 'পদার্থবিজ্ঞান');
  assert.equal(storedRoutine().sat.classes[0].teacher, 'করিম স্যার');

  await actionDialog('delete-routine', '0');
  ctx.document.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await ctx.flush(2);
  assert.equal(storedRoutine().sat.classes.length, 1, 'Escape never deletes');

  const deleteRoot = await actionDialog('delete-routine', '0');
  ctx.click(deleteRoot.querySelector('[data-dialog-confirm]'));
  await ctx.waitFor(() => storedRoutine().sat.classes.length === 0);
});

test('no Manager/Teacher/exam offline flow uses a native prompt or confirm', () => {
  const files = ['../js/manager.js', '../js/exam-manager.js', '../js/offline-role-ui.js', '../js/registration-review.js'];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bwindow\.prompt\s*\(/, `${file} must not use window.prompt`);
    assert.doesNotMatch(source, /\bwindow\.confirm\s*\(/, `${file} must not use window.confirm`);
    assert.doesNotMatch(source, /(?<![.\w])confirm\s*\(/, `${file} must not fall back to a bare confirm()`);
  }
});

test('the whole run stayed free of uncaught errors', () => {
  assert.deepEqual(ctx.jsdomErrors, []);
});
