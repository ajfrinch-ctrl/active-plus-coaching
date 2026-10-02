/* The shared in-app dialog — the replacement for native window.confirm /
   window.prompt. The Manager panel relies on these promises, so a silent
   engine difference would mean a dropped registration/payment decision. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';

let ctx, dialog;

const $ = selector => ctx.$(selector);
const dialogRoot = () => $('[data-in-app-dialog]');
const settle = async () => { await ctx.flush(2); };

before(async () => {
  ctx = await loadPage('index.html');
  dialog = await import('../js/in-app-dialog.js');
});

test('the confirm dialog is a labelled, modal, in-page dialog — not native chrome', async () => {
  const promise = dialog.confirmAction({ kicker: 'নোটিশ', title: 'মুছে ফেলবেন?', message: 'এটি ফিরবে না।' });
  await settle();
  const root = dialogRoot();
  assert.ok(root, 'the app builds its own backdrop');
  const panel = root.querySelector('.modal');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');
  assert.equal(panel.querySelector('h2').textContent, 'মুছে ফেলবেন?');
  assert.equal(panel.getAttribute('aria-labelledby'), panel.querySelector('h2').id, 'the dialog is named by its own heading');
  assert.ok(root.querySelector('.modal-copy').textContent.includes('এটি ফিরবে না'), 'the message reaches the body');
  assert.ok(document.activeElement === panel || panel.contains(document.activeElement), 'focus moves into the dialog');
  ctx.click(root.querySelector('[data-dialog-confirm]'));
  assert.equal(await promise, true);
  assert.equal(dialogRoot(), null, 'and the dialog is gone afterwards');
});

test('cancel, Escape and a backdrop tap all resolve false', async () => {
  let promise = dialog.confirmAction({ title: 'বাতিল?' });
  await settle();
  ctx.click(dialogRoot().querySelector('[data-dialog-cancel]'));
  assert.equal(await promise, false);

  promise = dialog.confirmAction({ title: 'Escape?' });
  await settle();
  ctx.document.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(await promise, false);

  promise = dialog.confirmAction({ title: 'Backdrop?' });
  await settle();
  const backdrop = dialogRoot();
  ctx.click(backdrop);
  assert.equal(await promise, false);
  assert.equal(dialogRoot(), null);
});

test('a required field blocks the confirm and says why, in Bangla, without closing', async () => {
  const promise = dialog.askText({ title: 'বাতিলের কারণ', label: 'কারণ', required: true, maxLength: 500, multiline: true });
  await settle();
  const form = dialogRoot().querySelector('form');
  ctx.submit(form);
  await settle();
  assert.ok(dialogRoot(), 'an empty required field keeps the dialog open');
  const error = dialogRoot().querySelector('.finance-error');
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /তারকা/);
  assert.equal(error.getAttribute('role'), 'alert');
  assert.equal(dialogRoot().querySelector('textarea').getAttribute('aria-invalid'), 'true');
  ctx.type(dialogRoot().querySelector('textarea'), '  ফি বাকি  ');
  ctx.submit(dialogRoot().querySelector('form'));
  assert.equal(await promise, 'ফি বাকি', 'the answer is trimmed');
});

test('askFields collects several fields in one dialog and returns null on cancel', async () => {
  const promise = dialog.askFields({
    title: 'নোটিশ সম্পাদনা',
    fields: [
      { name: 'title', label: 'শিরোনাম', value: 'পুরোনো', required: true, maxLength: 120 },
      { name: 'body', label: 'বিবরণ', value: 'লেখা', required: true, type: 'textarea' }
    ]
  });
  await settle();
  assert.equal(dialogRoot().querySelectorAll('input, textarea').length, 2);
  ctx.type(dialogRoot().querySelector('input'), 'নতুন শিরোনাম');
  ctx.submit(dialogRoot().querySelector('form'));
  assert.deepEqual(await promise, { title: 'নতুন শিরোনাম', body: 'লেখা' });

  const cancelled = dialog.askFields({ title: 'বাতিল', fields: [{ name: 'title', label: 'শিরোনাম', value: 'অপরিবর্তিত' }] });
  await settle();
  ctx.click(dialogRoot().querySelector('.modal-close'));
  assert.equal(await cancelled, null, 'closing without confirming never returns half an edit');
});

test('focus returns to the control that opened the dialog', async () => {
  const opener = ctx.document.createElement('button');
  opener.type = 'button';
  opener.textContent = 'খুলুন';
  ctx.document.body.append(opener);
  opener.focus();
  const promise = dialog.confirmAction({ title: 'ফোকাস ফেরানো' });
  await settle();
  ctx.click(dialogRoot().querySelector('[data-dialog-confirm]'));
  await promise;
  assert.equal(ctx.document.activeElement, opener);
  opener.remove();
});

test('only one dialog exists at a time: a newer request cancels the older one', async () => {
  const first = dialog.confirmAction({ title: 'প্রথম' });
  await settle();
  const second = dialog.confirmAction({ title: 'দ্বিতীয়' });
  await settle();
  assert.equal(await first, false, 'the replaced dialog resolves as cancelled');
  assert.equal(ctx.document.querySelectorAll('[data-in-app-dialog]').length, 1);
  ctx.click(dialogRoot().querySelector('[data-dialog-confirm]'));
  assert.equal(await second, true);
});
