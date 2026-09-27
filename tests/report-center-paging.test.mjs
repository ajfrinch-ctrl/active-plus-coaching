/* Report Center at scale — a long report paginates honestly and the CSV keeps
   every row in the same order (replaces the old capped-list card test).

   Seeded with 60 students: the Student Master List must break across real A4
   pages, the page count must match what was laid out, and PDF/CSV naming and
   row order must survive the full document. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { ROSTER_KEY } from '../js/office-data.js';

const TOTAL = 60;
const roster = Array.from({ length: TOTAL }, (_, i) => ({
  id: `AP-${2000 + i}`,
  name: `শিক্ষার্থী ${i + 1}`,
  nameEn: `Student ${i + 1}`,
  className: ['নবম শ্রেণি', 'দশম শ্রেণি'][i % 2],
  group: i % 3 === 0 ? 'বিজ্ঞান বিভাগ' : 'সাধারণ',
  mobile: `017${String(1000000 + i)}`,
  guardianMobile: `018${String(1000000 + i)}`,
  status: 'approved',
  enrolledAt: '2026-09-01'
}));

let ctx;
let center;
let catalog;
let reports;
let lastDownload = null;
const CHAR = 8;

before(async () => {
  ctx = await loadPage('admin.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(roster),
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
  Object.defineProperty(ctx.window.document, 'fonts', {
    value: { add() {}, ready: Promise.resolve() },
    configurable: true
  });

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
  globalThis.URL.createObjectURL = ctx.window.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ctx.window.URL.revokeObjectURL;

  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  catalog = await import('../js/report-catalog.js');
  reports = await import('../js/reports.js');
  await import('../js/admin.js');
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-card')), 20000);
  center = await reports.mountReports(ctx.$('#adminReports'), { panel: 'admin' });
});

test('a long report paginates across real A4 pages with an honest count', async () => {
  ctx.click(ctx.$$('#adminReports .rp-card').find(node => node.dataset.category === 'student'));
  ctx.click(ctx.$$('#adminReports .rp-report').find(node => node.dataset.report === 'student.all'));
  ctx.click(ctx.$('#adminReports .rp-generate'));
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-download')), 30000);

  const pages = ctx.$$('#adminReports .rp-page');
  assert.ok(pages.length >= 2, `a ${TOTAL}-row report breaks across pages (got ${pages.length})`);
  assert.equal(center.built.total, pages.length, 'the engine and the preview agree');

  const meta = ctx.$('#adminReports .rp-preview-meta span').textContent;
  const bangla = String(pages.length).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
  assert.match(meta, new RegExp(`${bangla} পৃষ্ঠা`));

  const scaled = ctx.$('#adminReports .rp-pages');
  const scale = Number(scaled.style.getPropertyValue('--rp-scale'));
  assert.ok(Math.abs(Number(scaled.style.height.replace('px', '')) - pages.length * 1123 * scale) <= pages.length,
    'the stacked height covers every scaled page');
});

test('the CSV keeps every row of the document in the same order', () => {
  const rows = reports.csvRowsFor(center.doc);
  const table = center.doc.blocks.find(block => block.type === 'table' && block.rows.length === TOTAL);
  assert.ok(table, 'the document holds one full student table');

  const startIndex = rows.findIndex(row => row.length === table.columns.length
    && row.every((cell, i) => cell === table.columns[i].label));
  assert.ok(startIndex >= 0, 'the table header reaches the CSV');
  for (let i = 0; i < TOTAL; i += 1) {
    assert.deepEqual(rows[startIndex + 1 + i], table.rows[i], `row ${i} travels intact and in order`);
  }

  // The summary tiles travel too — the CSV shows the same totals as the PDF.
  for (const block of center.doc.blocks) {
    if (block.type !== 'tiles') continue;
    for (const tile of block.tiles) {
      assert.ok(rows.some(row => row[0] === tile.label && row[1] === tile.value), `tile ${tile.label} in the CSV`);
    }
  }
});

test('both downloads share the filename convention at scale', async () => {
  const today = new Date().toISOString().slice(0, 10);
  lastDownload = null;
  ctx.click(ctx.$('#adminReports .rp-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 30000);
  assert.equal(lastDownload.name, `ActivePlus_Student_Master_List_${today}.pdf`);

  lastDownload = null;
  ctx.click(ctx.$('#adminReports .rp-csv-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 10000);
  assert.equal(lastDownload.name, `ActivePlus_Student_Master_List_${today}.csv`);
  assert.equal(catalog.EMPTY_MESSAGE.length > 0, true);
});
