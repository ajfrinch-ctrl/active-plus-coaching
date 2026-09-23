/* The money receipt header: institution name, tagline, and the address on its
   own line underneath. Covers both the HTML receipt (admin panel + payment
   counter) and the canvas receipt that becomes the PDF/PNG download. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';

const TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';
const ADDRESS = 'কলেজ রোড, দিনাজপুর সদর';
const tx = {
  id: 'TRX-1', receiptNo: 'REC-2609-01', date: '২৩ সেপ্টেম্বর ২০২৬',
  studentName: 'রাইসা ইসলাম', studentId: 'AP-1024', className: 'দশম শ্রেণি',
  feeType: 'মাসিক বেতন', month: 'সেপ্টেম্বর ২০২৬', method: 'নগদ', trxRef: '',
  amount: 1500, note: '', collectedBy: 'এডমিন'
};

let ctx, receiptMarkup, renderReceiptCanvas;
const drawn = [];

before(async () => {
  ctx = await loadPage('index.html', {
    seed: { [STORAGE_KEYS.appConfig]: JSON.stringify({ tagline: TAGLINE, campusAddress: ADDRESS }) }
  });
  // jsdom has no canvas/font/image decoding; only those cosmetic APIs are stubbed.
  const fake = {
    font: '', fillStyle: '', textAlign: 'left', strokeStyle: '', lineWidth: 1,
    measureText: text => ({ width: String(text).length * 8 }),
    fillText: (text, x, y) => drawn.push({ text: String(text), x, y, font: fake.font }),
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {}, scale() {}
  };
  ctx.window.HTMLCanvasElement.prototype.getContext = () => fake;
  ctx.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  // The module resolves these from the global scope, not from `window`.
  globalThis.FontFace = ctx.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  Object.defineProperty(ctx.window.document, 'fonts', { value: { add() {} }, configurable: true });
  ({ receiptMarkup, renderReceiptCanvas } = await import('../js/finance-receipt.js'));
});

test('the HTML receipt puts the address on its own line under the tagline', () => {
  ctx.document.body.innerHTML = receiptMarkup(tx);
  const tagline = ctx.$('.receipt-sub');
  const address = ctx.$('.receipt-address');
  assert.equal(tagline.textContent, TAGLINE);
  assert.equal(address.textContent, ADDRESS);
  assert.equal(address.previousElementSibling, tagline, 'the address sits directly below the tagline');
  assert.equal(tagline.textContent.includes(ADDRESS), false, 'the tagline no longer carries the address');
  // Still above the paid badge and the rest of the receipt.
  assert.equal(ctx.$('.receipt-badge-title').previousElementSibling, address);
});

test('the canvas receipt draws the address below the tagline', async () => {
  await renderReceiptCanvas(tx);
  const at = y => drawn.filter(item => item.y === y);
  assert.deepEqual(at(192).map(item => item.text), [TAGLINE]);
  assert.deepEqual(at(214).map(item => item.text), [ADDRESS], 'the address line is drawn under the tagline');
  assert.ok(drawn.some(item => item.text === 'মানি রসিদ • পরিশোধিত' && item.y > 214), 'the paid badge stays below both');
  assert.equal(drawn.some(item => item.text.includes(`${TAGLINE} •`)), false, 'no combined tagline/address line');
});

test('a long address wraps onto extra lines without crowding the badge', async () => {
  drawn.length = 0;
  ctx.window.localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify({ tagline: TAGLINE, campusAddress: 'অত্যন্ত লম্বা একটি ঠিকানা যা এক লাইনে ধরবে না বলে দুই লাইনে ভাগ হবে এবং নিচে আরও লেখা থাকলে সেটিও যুক্ত হবে' }));
  const canvas = await renderReceiptCanvas(tx);
  const headerLines = drawn.filter(item => item.y > 192 && item.y < 280 && item.font.endsWith('15px ReceiptBangla'));
  assert.ok(headerLines.length >= 2, 'the address wrapped onto more than one line');
  assert.deepEqual(headerLines.map(l => l.y), [214, 236]);
  const badge = drawn.find(item => item.text === 'মানি রসিদ • পরিশোধিত');
  assert.ok(badge.y > headerLines.at(-1).y, 'the badge moved down for the extra line');
  assert.ok(canvas.height > 0);
});
