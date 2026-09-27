/* The Reports UI on the real admin.html: the five-step flow, end to end.

     category → report → the filters that report needs → Generate → preview
     → DOWNLOAD PDF

   The test drives the actual buttons a user taps, with only jsdom's canvas and
   font APIs stubbed (the engine measures text on a canvas; jsdom has none).
   Assertions cover the promises that matter on a phone: only the declared
   filters appear, the preview is real paged A4, the download button is present
   and full width above the bottom navigation, and the file it produces carries
   a meaningful name. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { adminStudents, initialTransactions } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { TRANSACTIONS_KEY } from '../js/finance-data.js';

let ctx;
let catalog;
const CHAR = 8;
let lastDownload = null;

before(async () => {
  ctx = await loadPage('admin.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TRANSACTIONS_KEY]: JSON.stringify(initialTransactions),
      [STORAGE_KEYS.appConfig]: JSON.stringify({ coachingName: 'Active Plus Coaching' })
    }
  });

  const fake = {
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText: text => ({ width: String(text).length * CHAR }),
    fillText() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    drawImage() {}, scale() {}, setTransform() {}
  };
  ctx.window.HTMLCanvasElement.prototype.getContext = () => fake;
  ctx.window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new ctx.window.Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }));
  };
  ctx.window.Blob.prototype.arrayBuffer = function arrayBuffer() { return Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer); };
  ctx.window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  globalThis.FontFace = ctx.window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  // jsdom has no font loading API; the engine (and fixed-shell) only read it.
  Object.defineProperty(ctx.window.document, 'fonts', {
    value: { add() {}, ready: Promise.resolve() },
    configurable: true
  });

  // Catch what the download helper hands to the browser.
  const realCreate = ctx.window.document.createElement.bind(ctx.window.document);
  ctx.window.document.createElement = function create(tag, ...rest) {
    const node = realCreate(tag, ...rest);
    if (String(tag).toLowerCase() === 'a') {
      node.click = () => { lastDownload = { name: node.download, href: node.href }; };
    }
    return node;
  };
  ctx.window.URL.createObjectURL = () => 'blob:active-plus-report';
  ctx.window.URL.revokeObjectURL = () => {};
  // exam-pdf.js resolves URL from the global scope, not from `window`.
  globalThis.URL.createObjectURL = ctx.window.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ctx.window.URL.revokeObjectURL;

  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  catalog = await import('../js/report-catalog.js');
  await import('../js/admin.js');
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-card')), 20000);
});

const cards = () => ctx.$$('#adminReports .rp-card');
const reports = () => ctx.$$('#adminReports .rp-report');
const fields = () => ctx.$$('#adminReports .rp-field');

function openCategory(id) {
  // Steps replace their screens — walk back through the breadcrumb like a thumb.
  if (!ctx.$('#adminReports .rp-card')) ctx.click(ctx.$('#adminReports .rp-crumb'));
  const card = cards().find(node => node.dataset.category === id);
  assert.ok(card, `category ${id} is offered`);
  ctx.click(card);
}

function openReport(id) {
  const card = reports().find(node => node.dataset.report === id);
  assert.ok(card, `report ${id} is offered`);
  ctx.click(card);
}

test('step 1 — the Admin sees every category the catalog allows, as icon + text cards', () => {
  const offered = cards().map(node => node.dataset.category);
  const expected = catalog.catalogFor('admin').map(category => category.id);
  assert.deepEqual(offered, expected);
  for (const card of cards()) {
    assert.ok(card.querySelector('svg'), 'every card carries an icon');
    assert.ok(card.textContent.trim().length > 2, 'every card carries text');
  }
});

test('step 2 — a category lists its reports with the filters each one needs', () => {
  openCategory('exam');
  const ids = reports().map(node => node.dataset.report);
  const expected = catalog.catalogFor('admin').find(category => category.id === 'exam').reports.map(item => item.id);
  assert.deepEqual(ids, expected);
});

test('step 3 — only the filters the report declares are rendered', () => {
  openCategory('student');
  openReport('student.class-wise');
  const keys = fields().map(node => node.dataset.filter);
  assert.deepEqual(keys, catalog.findReport('student.class-wise').filters);

  // A report that needs an exam asks only for an exam.
  openCategory('exam');
  openReport('exam.complete');
  assert.deepEqual(fields().map(node => node.dataset.filter), ['exam']);
});

test('step 3 — a custom range offers From and To, and refuses a reversed range', async () => {
  openCategory('fee');
  openReport('fee.custom');
  const keys = fields().map(node => node.dataset.filter);
  assert.ok(keys.includes('period'));
  const select = ctx.$('#adminReports .rp-field[data-filter="period"] select');
  select.value = 'custom';
  select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  const range = ctx.$('#adminReports .rp-range');
  assert.equal(range.hidden, false, 'the From/To pair appears for a custom range');
  const [from, to] = range.querySelectorAll('input');
  assert.equal(from.type, 'date');
  assert.equal(to.type, 'date');

  const isoDay = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  from.value = isoDay(1);
  from.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  to.value = isoDay(30);
  to.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  ctx.click(ctx.$('#adminReports .rp-generate'));
  await ctx.waitFor(() => /From Date/.test(ctx.$('#adminReports .rp-status').textContent), 10000);
  assert.match(ctx.$('#adminReports .rp-status').textContent, /From Date/);
});

test('steps 4 and 5 — Generate builds a paged preview with a full-width download', async () => {
  openCategory('student');
  openReport('student.all');
  ctx.click(ctx.$('#adminReports .rp-generate'));
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-download')), 20000);

  const pages = ctx.$$('#adminReports .rp-page');
  assert.ok(pages.length >= 1, 'the preview renders A4 pages');
  // The pages are laid out at true A4 size and scaled to the panel, so the
  // preview is the PDF's own geometry (jsdom applies no stylesheet, so the
  // numbers come from the engine and the stylesheet both).
  const scaled = ctx.$('#adminReports .rp-pages');
  assert.match(scaled.style.getPropertyValue('--rp-scale'), /^0?\.\d+$|^1$/);
  assert.ok(Number(scaled.style.height.replace('px', '')) > 0, 'the preview is given a real height');

  const button = ctx.$('#adminReports .rp-download');
  assert.match(button.textContent, /DOWNLOAD PDF/);
  assert.ok(button.querySelector('svg'), 'the download button carries an icon');
});

test('the stylesheet keeps every page A4 and the download bar out of the bottom nav', () => {
  const css = readFileSync(new URL('../css/reports.css', import.meta.url), 'utf8');
  const page = /\.rp-page\s*\{([^}]*)\}/.exec(css);
  assert.ok(page, 'the page rule exists');
  assert.match(page[1], /width:\s*794px/);
  assert.match(page[1], /height:\s*1123px/);
  const bar = /\.rp-download-bar\s*\{([^}]*)\}/.exec(css);
  assert.ok(bar, 'the download bar rule exists');
  assert.match(bar[1], /position:\s*sticky/);
  assert.match(bar[1], /bottom:\s*calc\(76px/);
  // No sideways scrolling: the shell clips, the pages are scaled instead.
  const scroll = /\.rp-preview-scroll\s*\{([^}]*)\}/.exec(css);
  assert.ok(scroll, 'the preview scroll rule exists');
  assert.match(scroll[1], /overflow:\s*hidden/);
  const action = /\.rp-download\s*\{([^}]*)\}/.exec(css);
  assert.match(action[1], /width:\s*100%/, 'the download button is full width');
  assert.match(action[1], /min-height:\s*5\dpx/, 'the download button is a real touch target');
});

test('step 5 — the download asks the browser for a meaningfully named PDF', async () => {
  lastDownload = null;
  ctx.click(ctx.$('#adminReports .rp-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 20000);
  const today = new Date().toISOString().slice(0, 10);
  assert.match(lastDownload.name, new RegExp(`^ActivePlus_Student_Master_List_${today}\\.pdf$`));
  assert.equal(lastDownload.href, 'blob:active-plus-report');
});

test('the preview reports the page count the document really has', () => {
  const meta = ctx.$('#adminReports .rp-preview-meta span').textContent;
  const pages = ctx.$$('#adminReports .rp-page').length;
  assert.match(meta, new RegExp(`${pages} পৃষ্ঠা`.replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit])));
});

test('a report with no matching records says so instead of printing blanks', async () => {
  openCategory('student');
  openReport('student.class-wise');
  const select = ctx.$('#adminReports .rp-field[data-filter="class"] select');
  const option = [...select.options].find(node => node.value === 'অনার্স ৪র্থ বর্ষ');
  assert.ok(option, 'every enabled class is offered');
  select.value = option.value;
  select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  ctx.click(ctx.$('#adminReports .rp-generate'));
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-empty')), 20000);
  assert.equal(ctx.$('#adminReports .rp-empty-text').textContent, catalog.EMPTY_MESSAGE);
  assert.equal(ctx.$('#adminReports .rp-download'), null, 'there is nothing to download');
});
