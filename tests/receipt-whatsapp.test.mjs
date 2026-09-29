/* "হোয়াটসঅ্যাপে পাঠান" must land in the student's own WhatsApp chat, not in the
   generic OS share sheet. Drives the real payment.html + js/payment.js. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { toBanglaNumber as bn } from '../js/ui.js';

const raisa = adminStudents.find(s => s.id === 'AP-1024');
let ctx;
const opened = [];
const downloads = [];

before(async () => {
  ctx = await loadPage('payment.html', {
    seed: { 'activePlus.demo.autofill.v1': 'off', [ROSTER_KEY]: JSON.stringify(adminStudents) }
  });
  // jsdom has no canvas, font loading, blob URLs or popups — those are stubbed.
  const fake = {
    font: '', fillStyle: '', textAlign: 'left', strokeStyle: '', lineWidth: 1,
    measureText: text => ({ width: String(text).length * 8 }),
    fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, drawImage() {}, scale() {}
  };
  ctx.window.HTMLCanvasElement.prototype.getContext = () => fake;
  ctx.window.HTMLCanvasElement.prototype.toBlob = callback => callback(new ctx.window.Blob(['png'], { type: 'image/png' }));
  ctx.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  globalThis.FontFace = ctx.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  Object.defineProperty(ctx.window.document, 'fonts', { value: { add() {} }, configurable: true });
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  ctx.window.HTMLAnchorElement.prototype.click = function click() { downloads.push(this.download); };
  Object.defineProperty(ctx.window, 'open', { value: url => { opened.push(url); return null; }, configurable: true, writable: true });

  /* The counter signs in on the one shared login card, so the desk opens from
     the device-bound session that sign-in wrote rather than a local form. */
  await provisionStaff('payment');
  seedStaffSession(ctx.window, 'payment');
  await import('../js/payment.js');
  const { $, $$, submit, click, waitFor } = ctx;
  await waitFor(() => $('#payShell').hidden === false);
  ctx.type($('#payStudentSearch'), 'রাইসা');
  await waitFor(() => $$('#paySearchResults .fee-search-result').length > 0);
  click($$('#paySearchResults .fee-search-result')[0]);
  // The collect button stays disabled until the ledger has loaded, and a click
  // on a disabled button does nothing — so wait for the desk to be ready first.
  await waitFor(() => $('#payProfileCollect').disabled === false);
  click($('#payProfileCollect'));
  await waitFor(() => $('#payCollectionForm').hidden === false);
  submit($('#payCollectionForm'));
  await waitFor(() => $('#payReceiptBackdrop').hidden === false);
});

test('the receipt button names the student number it will use', () => {
  const { $ } = ctx;
  assert.match($('#payReceiptWhatsAppLabel').textContent, new RegExp(bn(raisa.mobile)));
  assert.match($('#payQuickProfile').textContent, new RegExp(bn(raisa.mobile)));
});

test('pressing it opens that student\'s WhatsApp chat with the receipt details', async () => {
  const { $, waitFor } = ctx;
  ctx.click($('#payReceiptWhatsApp'));
  await waitFor(() => opened.length > 0);

  assert.equal(opened.length, 1);
  const url = new URL(opened[0]);
  assert.equal(url.host, 'wa.me');
  assert.equal(url.pathname, `/880${raisa.mobile.slice(1)}`, 'the link carries the student\'s own number');

  const text = decodeURIComponent(url.searchParams.get('text'));
  assert.match(text, /রাইসা ইসলাম/);
  // The shared message must carry the same sequential receipt number the modal shows.
  const receiptNo = $('#payReceiptSub').textContent.match(/R\d{9}/);
  assert.ok(receiptNo, 'the modal shows a sequential receipt number');
  assert.match(text, new RegExp(receiptNo[0]));
  assert.match(text, /পরিশোধ হয়েছে/);
  assert.match(text, /Active Plus Coaching/);
});

test('the receipt image is saved alongside so it can be attached to that chat', async () => {
  const { $, waitFor } = ctx;
  await waitFor(() => downloads.length > 0);
  assert.equal(downloads.length, 1);
  assert.match(downloads[0], /^R\d{9}-[a-f0-9]{16}\.png$/);
  assert.match($('#payToast').textContent, new RegExp(bn(raisa.mobile)));
  assert.equal($('#payReceiptWhatsApp').disabled, false, 'the button is usable again');
});
