/* One confirmation, everywhere.

   Delete, publish and archive used to ask through the browser's own
   window.confirm on the exam desk and the Manager panel while the rest of the
   app used its own modal. These tests hold the shared dialog to its promise —
   it only answers "yes" on the confirm button, and it really is the dialog the
   Manager's delete flow now opens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { KEYS } from '../js/database.js';
import { confirmAction, confirmIsOpen } from '../js/confirm-dialog.js';

const ask = options => confirmAction({ title: 'পরীক্ষা মুছে ফেলবেন?', message: 'এটি ফেরানো যাবে না।', ...options });
const press = (ctx, key) => ctx.window.document.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

/* A bare page is enough for the dialog itself: it builds its own markup. */
async function barePage() { return loadPage('offline-roles.html'); }

test('the dialog asks in one card and answers only on the confirm button', async () => {
  const ctx = await loadPage('offline-roles.html');
  const { confirmAction: ask2 } = await import(`../js/confirm-dialog.js?dialog=${Math.random()}`);
  const pending = ask2({ title: 'পরীক্ষা মুছে ফেলবেন?', message: 'এটি ফেরানো যাবে না।', confirmLabel: 'মুছে ফেলুন', tone: 'danger' });
  await ctx.flush();

  const backdrop = ctx.$('.apc-confirm-backdrop');
  assert.ok(backdrop && backdrop.hidden === false, 'the dialog is on screen');
  assert.equal(ctx.$('#apcConfirmTitle').textContent, 'পরীক্ষা মুছে ফেলবেন?');
  assert.equal(ctx.$('#apcConfirmText').textContent, 'এটি ফেরানো যাবে না।');
  assert.equal(ctx.$('.apc-confirm-actions [data-apc-confirm="ok"]').textContent, 'মুছে ফেলুন');
  assert.equal(ctx.$('.apc-confirm-actions [data-apc-confirm="cancel"]').textContent, 'বাতিল');
  assert.equal(ctx.$('.apc-confirm').getAttribute('role'), 'alertdialog');
  assert.equal(ctx.$('.apc-confirm').classList.contains('is-danger'), true, 'a destructive question is marked as one');
  assert.equal(ctx.window.document.activeElement, ctx.$('.apc-confirm-actions [data-apc-confirm="ok"]'), 'the action button takes the focus');
  assert.equal(ctx.window.document.body.classList.contains('admin-modal-open'), true);

  ctx.click(ctx.$('.apc-confirm-actions [data-apc-confirm="ok"]'));
  assert.equal(await pending, true);
  assert.equal(backdrop.hidden, true, 'the dialog closes itself');
  assert.equal(ctx.window.document.body.classList.contains('admin-modal-open'), false);
});

test('cancel, the cross, Escape and the backdrop all mean “no”', async () => {
  const ctx = await barePage();

  const byCancel = ask({ confirmLabel: 'মুছে ফেলুন' });
  await ctx.flush();
  ctx.click(ctx.$('.apc-confirm-actions [data-apc-confirm="cancel"]'));
  assert.equal(await byCancel, false);

  const byCross = ask();
  await ctx.flush();
  ctx.click(ctx.$('.apc-confirm .admin-modal-close'));
  assert.equal(await byCross, false);

  const byEscape = ask();
  await ctx.flush();
  press(ctx, 'Escape');
  assert.equal(await byEscape, false);

  const byBackdrop = ask();
  await ctx.flush();
  ctx.click(ctx.$('.apc-confirm-backdrop'));
  assert.equal(await byBackdrop, false);
});

test('a second question never stacks on an unanswered one', async () => {
  const ctx = await barePage();
  const first = ask({ title: 'প্রথম প্রশ্ন' });
  await ctx.flush();
  const second = ask({ title: 'দ্বিতীয় প্রশ্ন' });
  await ctx.flush();
  assert.equal(ctx.$$('#apcConfirmTitle').length, 1, 'only one card is on screen');
  assert.equal(ctx.$('#apcConfirmTitle').textContent, 'দ্বিতীয় প্রশ্ন');
  assert.equal(await first, false, 'the interrupted question answers no, so its action cannot run');
  ctx.click(ctx.$('.apc-confirm-actions [data-apc-confirm="ok"]'));
  assert.equal(await second, true);
  assert.equal(confirmIsOpen(), false);
});

/* ---- and it is really the dialog the Manager's delete flow opens -------------- */

test('deleting a Manager notice asks through the shared dialog, not the browser', async () => {
  const ctx = await loadPage('manager.html', {
    seed: {
      [KEYS.notices]: JSON.stringify([
        { id: 'N-1', title: 'ঈদের ছুটি', body: 'ছুটি থাকবে', audience: 'সকল শিক্ষার্থী', status: 'published', date: '৩ অক্টোবর', createdAt: new Date().toISOString() }
      ])
    }
  });
  const asked = [];
  ctx.window.confirm = message => { asked.push(message); return true; };   // must stay unused
  await openStaffPanel(ctx, 'manager', { importPanel: () => import('../js/manager.js'), shellId: 'managerShell' });

  ctx.click(ctx.$('[data-manager-view="notices"]'));
  await ctx.waitFor(() => ctx.$$('#managerNoticeList .manager-record').length === 1, 5000);

  ctx.click(ctx.$('#managerNoticeList [data-manager-action="delete-notice"]'));
  await ctx.waitFor(() => ctx.$('.apc-confirm-backdrop') && ctx.$('.apc-confirm-backdrop').hidden === false, 5000);
  assert.deepEqual(asked, [], 'window.confirm is no longer used anywhere in the flow');
  assert.equal(ctx.$('#apcConfirmTitle').textContent, 'নোটিশ মুছে ফেলবেন?');
  assert.equal(ctx.$('#apcConfirmText').textContent.includes('শিক্ষার্থী'), true, 'the message says who is affected');

  // Cancelling keeps the record.
  ctx.click(ctx.$('[data-apc-confirm="cancel"]'));
  await ctx.flush(6);
  assert.equal(ctx.$$('#managerNoticeList .manager-record').length, 1, 'বাতিল changes nothing');

  // Confirming deletes it, through the same card.
  ctx.click(ctx.$('#managerNoticeList [data-manager-action="delete-notice"]'));
  await ctx.waitFor(() => ctx.$('.apc-confirm-backdrop').hidden === false, 5000);
  ctx.click(ctx.$('[data-apc-confirm="ok"]'));
  await ctx.waitFor(() => ctx.$$('#managerNoticeList .manager-record').length === 0, 5000);
  const saved = JSON.parse(ctx.window.localStorage.getItem(KEYS.notices));
  assert.deepEqual(saved, [], 'the notice is gone from storage');
  assert.deepEqual(ctx.jsdomErrors, [], 'no script error while asking');
});
