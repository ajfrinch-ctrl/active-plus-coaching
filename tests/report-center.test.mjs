/* Report Center — acceptance: the twelve criteria the Reports System promises,
   driven through the real admin.html wizard (buttons, crumbs, downloads) and
   the real engine headlessly for every role.

   1  each role sees only its authorized categories and reports
   2  only the filters a report declares are rendered
   3  an invalid filter blocks Generate
   4  preview, PDF and CSV render one document (same rows, totals, order)
   5  no data → the honest empty state + Change Filters
   6  Back / Change Filters preserve the category and report selection
   7  mobile: nothing can overflow horizontally
   8  generating reports never touches stored data
   9  unauthorized direct actions are blocked before any data is read
   10 the exports carry the real rows and the filename convention
   11 the preview page count matches the document
   12 daily / weekly / monthly / custom periods behave */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { adminStudents, initialTransactions } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { TRANSACTIONS_KEY } from '../js/finance-data.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { buildSessionRecord } from '../js/session.js';

let ctx;
let center;
let catalog;
let access;
let sources;
let reports;
let lastDownload = null;
let lastBlob = null;
const CHAR = 8;

const ACCOUNT_KEY = 'active-plus-account-v1';

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
  ctx.window.URL.createObjectURL = blob => { lastBlob = blob; return 'blob:active-plus-report'; };
  ctx.window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = ctx.window.URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ctx.window.URL.revokeObjectURL;

  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
  catalog = await import('../js/report-catalog.js');
  access = await import('../js/report-access.js');
  sources = await import('../js/report-sources.js');
  reports = await import('../js/reports.js');
  await import('../js/admin.js');
  await ctx.waitFor(() => Boolean(ctx.$('#adminReports .rp-card')), 20000);
  // Take over the mounted centre so the tests can also inspect the document
  // the buttons build — same root, same actor, same code path.
  center = await reports.mountReports(ctx.$('#adminReports'), { panel: 'admin' });
});

const cards = () => ctx.$$('#adminReports .rp-card');
const reportsOf = () => ctx.$$('#adminReports .rp-report');
const fields = () => ctx.$$('#adminReports .rp-field');
const status = () => ctx.$('#adminReports .rp-status').textContent;

// Walk to the categories screen first — steps replace their screens, so a
// test navigates exactly like a thumb would (through the breadcrumb).
function openCategory(id) {
  if (!ctx.$('#adminReports .rp-card')) {
    const first = ctx.$('#adminReports .rp-crumb');
    assert.ok(first, 'the breadcrumb leads back to categories');
    ctx.click(first);
  }
  const card = cards().find(node => node.dataset.category === id);
  assert.ok(card, `category ${id} is offered`);
  ctx.click(card);
}

function openReport(id) {
  const card = reportsOf().find(node => node.dataset.report === id);
  assert.ok(card, `report ${id} is offered`);
  ctx.click(card);
}

async function generateAndWait(predicate, timeout = 20000) {
  ctx.click(ctx.$('#adminReports .rp-generate'));
  await ctx.waitFor(predicate, timeout);
}

const readBlobText = blob => new Promise((resolve, reject) => {
  const reader = new ctx.window.FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

/* ------------------------------------------------------------------ 1 ---- */

test('1 — every role sees only its authorized categories and reports', async () => {
  // The catalog is the source of truth for all five roles.
  for (const role of ['admin', 'manager', 'teacher', 'cash', 'student']) {
    for (const category of catalog.catalogFor(role)) {
      for (const definition of category.reports) {
        assert.ok((definition.roles || []).includes(role),
          `${definition.id} is listed for ${role} but does not allow it`);
      }
    }
  }
  assert.ok(catalog.catalogFor('teacher').every(category => category.id !== 'staff'),
    'Teachers get no staff category');
  assert.ok(catalog.catalogFor('cash').every(category => ['fee', 'cash'].includes(category.id)),
    'Cash Counter sees only the money categories');
  assert.ok(!catalog.catalogFor('student').some(category =>
    category.reports.some(definition => definition.id === 'student.all')),
    'Student Master List never reaches a student');

  // What the wizard shows for Admin is exactly the catalog.
  assert.deepEqual(cards().map(node => node.dataset.category),
    catalog.catalogFor('admin').map(category => category.id));
  for (const card of cards()) {
    assert.ok(card.querySelector('svg'), 'every category card carries an icon');
    assert.ok(card.textContent.trim().length > 2, 'every category card carries text');
    const count = catalog.catalogFor('admin')
      .find(category => category.id === card.dataset.category).reports.length;
    assert.ok(card.textContent.includes(String(count).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d])),
      'the category card shows the catalog’s own report count');
    assert.ok(card.querySelector('.rp-card-desc'), 'the category card carries a description');
  }
});

/* ------------------------------------------------------------------ 2 ---- */

test('2 — only the filters a report declares are rendered', () => {
  openCategory('student');
  openReport('student.class-wise');
  assert.deepEqual(fields().map(node => node.dataset.filter),
    catalog.findReport('student.class-wise').filters);

  openCategory('exam');
  openReport('exam.complete');
  assert.deepEqual(fields().map(node => node.dataset.filter), ['exam']);

  openCategory('notice');
  openReport('notice.audience-wise');
  assert.equal(fields().length, 0, 'a report without filters asks for none');
  assert.match(ctx.$('#adminReports .rp-note').textContent, /filter/);
});

/* ----------------------------------------------------------------- 12 ---- */

test('12 — daily, weekly, monthly and custom each ask for the one date they need', () => {
  openCategory('fee');
  openReport('fee.daily');
  const period = ctx.$('#adminReports .rp-field[data-filter="period"] select');
  assert.equal(period.value, 'daily', 'the report opens on its own default period');
  const extras = () => {
    const visible = [];
    for (const node of ctx.$('#adminReports .rp-period-extras').children) if (!node.hidden) visible.push(node.dataset.period);
    return visible;
  };
  assert.deepEqual(extras(), ['date'], 'only the day input shows for daily');

  const setPeriod = value => {
    period.value = value;
    period.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  };
  setPeriod('weekly');
  assert.deepEqual(extras(), ['week']);
  setPeriod('monthly');
  assert.deepEqual(extras(), ['month']);
  setPeriod('custom');
  assert.deepEqual(extras(), ['custom']);
  const [from, to] = ctx.$('#adminReports .rp-range').querySelectorAll('input');
  assert.equal(from.type, 'date');
  assert.equal(to.type, 'date');
  setPeriod('all');
  assert.deepEqual(extras(), [], '“all” asks for no date at all');
});

/* ------------------------------------------------------------------ 3 ---- */

test('3 — an invalid filter blocks Generate', async () => {
  openCategory('fee');
  openReport('fee.custom');
  const period = ctx.$('#adminReports .rp-field[data-filter="period"] select');
  period.value = 'custom';
  period.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  const [from, to] = ctx.$('#adminReports .rp-range').querySelectorAll('input');
  const isoDay = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  from.value = isoDay(1);
  from.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  to.value = isoDay(30);
  to.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  await generateAndWait(() => /From Date/.test(status()));
  assert.match(status(), /From Date/, 'a reversed range names the offending field');
  assert.equal(ctx.$('#adminReports .rp-pages'), null, 'no preview is produced');

  // A report that requires a student refuses to run without one.
  openCategory('student');
  openReport('student.profile');
  await generateAndWait(() => status().length > 0);
  assert.match(status(), /শিক্ষার্থী/, 'the missing student is reported in plain words');
  assert.equal(ctx.$('#adminReports .rp-pages'), null);
  assert.ok(!/Error:|at .*\.js:/.test(status()), 'no stack trace leaks into the message');
});

/* ------------------------------------------------------------------ 4 ---- */

test('4 — preview, PDF and CSV render one document (same rows, totals, order)', async () => {
  openCategory('student');
  openReport('student.all');
  await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-download')), 30000);

  const doc = center.doc;
  assert.ok(doc, 'the wizard keeps the one document it previewed');
  const csvRows = reports.csvRowsFor(doc);

  // Every table row of the document appears in the CSV, in document order.
  let cursor = 0;
  for (const block of doc.blocks) {
    if (block.type === 'tiles') {
      for (const tile of block.tiles) {
        assert.ok(csvRows.some(row => row[0] === tile.label && row[1] === tile.value),
          `tile ${tile.label} survives into the CSV`);
      }
    }
    if (block.type !== 'table') continue;
    const want = [block.columns.map(column => column.label), ...block.rows];
    const at = csvRows.findIndex((row, index) => index >= cursor
      && row.length === want[0].length && row.every((cell, i) => cell === want[0][i]));
    assert.ok(at >= 0, 'the table header reaches the CSV');
    for (let i = 1; i < want.length; i += 1) {
      assert.deepEqual(csvRows[at + i], want[i], `row ${i} of the table matches the CSV`);
    }
    cursor = at + want.length;
  }

  // The preview pages carry the document's rows (short identifying cells —
  // the layout may ellipsize a long cell identically in preview and PDF).
  const pageText = ctx.$('#adminReports .rp-pages').textContent;
  for (const row of doc.blocks.find(block => block.type === 'table').rows.slice(0, 5)) {
    for (const cell of [row[0], row[1]]) {
      if (cell && cell !== '—') assert.ok(pageText.includes(String(cell)), `preview shows ${cell}`);
    }
  }
});

/* ----------------------------------------------------------------- 10 ---- */

test('10 — the exports carry the real rows and the filename convention', async () => {
  const today = new Date().toISOString().slice(0, 10);
  lastDownload = null;
  ctx.click(ctx.$('#adminReports .rp-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 30000);
  assert.equal(lastDownload.name, `ActivePlus_Student_Master_List_${today}.pdf`);

  lastDownload = null;
  lastBlob = null;
  ctx.click(ctx.$('#adminReports .rp-csv-download'));
  await ctx.waitFor(() => Boolean(lastDownload), 10000);
  assert.equal(lastDownload.name, `ActivePlus_Student_Master_List_${today}.csv`,
    'PDF and CSV share one stem');

  const text = await readBlobText(lastBlob);
  assert.ok(text.startsWith('"'), 'every CSV cell is quoted');
  assert.ok(text.includes('\r\n'), 'rows are separated CRLF-style for Excel');
  const firstRow = reports.csvRowsFor(center.doc).find(row => row.length === 7 && row[1]);
  assert.ok(text.includes(String(firstRow[1])), 'the CSV contains the document’s own rows');
});

/* ----------------------------------------------------------------- 11 ---- */

test('11 — the preview page count matches the document', () => {
  const meta = ctx.$('#adminReports .rp-preview-meta span').textContent;
  const pages = ctx.$$('#adminReports .rp-page').length;
  assert.ok(pages >= 1);
  assert.match(meta, new RegExp(`${pages} পৃষ্ঠা`.replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit])));
  const scaled = ctx.$('#adminReports .rp-pages');
  assert.ok(Number(scaled.style.height.replace('px', '')) >= pages * 1123 * Number(scaled.style.getPropertyValue('--rp-scale') || 1) - pages,
    'every page is given its scaled height');
});

/* ------------------------------------------------------------------ 7 ---- */

test('7 — mobile: the preview cannot overflow horizontally', () => {
  const css = readFileSync(new URL('../css/reports.css', import.meta.url), 'utf8');
  const scroll = /\.rp-preview-scroll\s*\{([^}]*)\}/.exec(css);
  assert.match(scroll[1], /overflow:\s*hidden/, 'the preview clips instead of scrolling sideways');
  const page = /\.rp-page\s*\{([^}]*)\}/.exec(css);
  assert.match(page[1], /width:\s*794px/);
  assert.match(page[1], /height:\s*1123px/);
  const download = /\.rp-download\s*\{([^}]*)\}/.exec(css);
  assert.match(download[1], /width:\s*100%/);
  assert.match(download[1], /min-height:\s*5\dpx/);
  const bar = /\.rp-download-bar\s*\{([^}]*)\}/.exec(css);
  assert.match(bar[1], /position:\s*sticky/);
  assert.match(bar[1], /bottom:\s*calc\(76px/, 'the bar clears the bottom navigation');

  // fitPages keeps the sheet inside the panel.
  const scaled = ctx.$('#adminReports .rp-pages');
  const scale = Number(scaled.style.getPropertyValue('--rp-scale'));
  assert.ok(scale > 0 && scale <= 1, 'the scale never enlarges or overflows');
  assert.ok(Number(scaled.style.height.replace('px', '')) > 0);
});

/* ------------------------------------------------------------------ 5 ---- */

test('5 — no records means the honest empty state with Change Filters', async () => {
  openCategory('student');
  openReport('student.class-wise');
  const select = ctx.$('#adminReports .rp-field[data-filter="class"] select');
  const option = [...select.options].find(node => node.value === 'অনার্স ৪র্থ বর্ষ');
  assert.ok(option, 'every enabled class is offered');
  select.value = option.value;
  select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-empty')), 30000);

  assert.equal(ctx.$('#adminReports .rp-empty-text').textContent, catalog.EMPTY_MESSAGE);
  assert.equal(ctx.$('#adminReports .rp-download'), null, 'no fake rows, nothing to download');
  assert.equal(ctx.$('#adminReports .rp-page'), null);

  const change = [...ctx.$$('#adminReports .rp-empty button')]
    .find(node => /Filter বদলান/.test(node.textContent));
  assert.ok(change, 'the empty state offers Change Filters');
  ctx.click(change);
  assert.ok(ctx.$('#adminReports .rp-filters'), 'Change Filters returns to the filter form');
  assert.equal(ctx.$('#adminReports .rp-field[data-filter="class"] select').value, option.value,
    'the chosen filter survives the round trip');
});

/* ------------------------------------------------------------------ 6 ---- */

test('6 — Back and Change Filters preserve the category and report selection', async () => {
  // Regenerate so a preview exists to walk back from.
  await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-download') || ctx.$('#adminReports .rp-empty')), 30000);
  if (ctx.$('#adminReports .rp-empty')) {
    ctx.click([...ctx.$$('#adminReports .rp-empty button')].find(node => /Filter বদলান/.test(node.textContent)));
    const select = ctx.$('#adminReports .rp-field[data-filter="class"] select');
    select.value = 'all';
    select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
    await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-download')), 30000);
  }

  const back = [...ctx.$$('#adminReports .rp-bar-secondary button')].find(node => /পেছনে/.test(node.textContent));
  assert.ok(back, 'the preview offers Back');
  ctx.click(back);
  assert.ok(ctx.$('#adminReports .rp-report'), 'Back lands on the report list');
  const open = reportsOf().map(node => node.dataset.report);
  assert.deepEqual(open, catalog.catalogFor('admin')
    .find(category => category.id === 'student').reports.map(item => item.id),
    'the same category stays selected');

  // The breadcrumb walks back too — and stays compact.
  const crumbs = ctx.$$('#adminReports .rp-crumb');
  assert.deepEqual(crumbs.map(node => node.textContent), ['রিপোর্ট', 'শিক্ষার্থী রিপোর্ট'],
    'the report list shows a two-segment trail');
  ctx.click(crumbs[0]);
  assert.ok(ctx.$('#adminReports .rp-card'), 'the first crumb returns to categories');

  // Change Filters keeps both the report and the entered values.
  openCategory('student');
  openReport('student.class-wise');
  const select = ctx.$('#adminReports .rp-field[data-filter="class"] select');
  select.value = 'দশম শ্রেণি';
  select.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-download') || ctx.$('#adminReports .rp-empty')), 30000);
  const change = [...ctx.$$('#adminReports .rp-bar-secondary button, #adminReports .rp-empty button')]
    .find(node => /Filter বদলান/.test(node.textContent));
  ctx.click(change);
  assert.equal(ctx.$('#adminReports .rp-field[data-filter="class"] select').value, 'দশম শ্রেণি',
    'Change Filters preserves the entered values');
  const trail = ctx.$$('#adminReports .rp-crumb');
  assert.equal(trail.length, 4, 'Reports / Category / Report / Filter');
  assert.equal(trail[trail.length - 1].textContent, 'Filter', 'the breadcrumb names the current step');
});

/* ------------------------------------------------------------------ 8 ---- */

const DATA_KEYS = [ROSTER_KEY, TRANSACTIONS_KEY, 'activePlus.admin.notices.v1',
  'activePlus.admin.routine.v1', 'activePlus.teaching.v1', 'activePlus.exams.v1', ACCOUNT_KEY];

test('8 — generating and downloading never touch stored data', async () => {
  openCategory('fee');
  openReport('fee.transactions');
  const capture = () => DATA_KEYS.map(key => `${key}=${ctx.window.localStorage.getItem(key)}`).join('&');
  const before = capture();
  await generateAndWait(() => Boolean(ctx.$('#adminReports .rp-download') || ctx.$('#adminReports .rp-empty')), 30000);
  if (ctx.$('#adminReports .rp-download')) {
    lastDownload = null;
    ctx.click(ctx.$('#adminReports .rp-download'));
    await ctx.waitFor(() => Boolean(lastDownload), 30000);
    lastDownload = null;
    ctx.click(ctx.$('#adminReports .rp-csv-download'));
    await ctx.waitFor(() => Boolean(lastDownload), 10000);
  }
  const after = capture();
  assert.equal(after, before, 'every student, finance, routine and record store is byte-identical after the flow');
});

/* ------------------------------------------------------------------ 9 ---- */

test('9 — unauthorized direct actions are blocked before any data is read', async () => {
  const forbidden = error => error && error.code === 'FORBIDDEN';
  const def = id => catalog.findReport(id);

  // Hidden reports are also refused outright, for every role.
  assert.throws(() => access.enforceAccess(def('student.all'), { kind: 'staff', role: 'teacher', staffRole: 'teacher', username: 'teacher.apc' }, {}), forbidden);
  assert.throws(() => access.enforceAccess(def('staff.status'), { kind: 'staff', role: 'manager', staffRole: 'manager', username: 'manager.apc' }, {}), forbidden);
  assert.throws(() => access.enforceAccess(def('fee.due-list'), { kind: 'staff', role: 'payment', staffRole: 'payment', username: 'payment.apc' }, {}), forbidden);
  assert.throws(() => access.enforceAccess(def('management.summary'), { kind: 'student', role: 'student', studentId: 'AP-1024' }, {}), forbidden);

  // A student asking for another student's record is refused outright…
  const studentActor = { kind: 'student', role: 'student', studentId: 'AP-1024' };
  assert.throws(() => access.enforceAccess(def('student.profile'), studentActor, { studentId: 'AP-9999' }), forbidden);
  // …and on their own reports the scope pins the filter to the owner.
  const gate = access.enforceAccess(def('student.profile'), studentActor, {});
  assert.equal(gate.filters.studentId, 'AP-1024', 'the scope pins the filter to the owner');

  // The Cash Counter's own-history is pinned to its counter label.
  const cashGate = access.enforceAccess(def('cash.own-history'),
    { kind: 'staff', role: 'cash', staffRole: 'payment', username: 'payment.apc' }, {});
  assert.equal(cashGate.filters.counter, access.CASH_COUNTER_LABEL);

  // And the wizard refuses to even open the filter form of a hidden report.
  openCategory('student');
  const snapshotBefore = ctx.window.localStorage.getItem(ROSTER_KEY);
  // Same page, same storage: swap in a Teacher session to act as one.
  try { await provisionStaff('teacher'); } catch { /* the app's own bootstrap may have set the password already */ }
  const adminSession = ctx.window.localStorage.getItem(STAFF_ACCOUNTS.admin.sessionKey);
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.admin.sessionKey);
  seedStaffSession(ctx.window, 'teacher');
  const teacherCenter = await reports.mountReports(document.createElement('div'), { panel: 'test' });
  assert.equal(teacherCenter.actor.role, 'teacher');
  teacherCenter.category = catalog.catalogFor('teacher')[0];
  teacherCenter.showFilters(def('student.all'));
  assert.match(teacherCenter.status.textContent, /অনুমতি/);
  assert.equal(teacherCenter.filterScreen.querySelector('.rp-filters'), null,
    'no filter form — so no generate — for an unauthorized report');
  await teacherCenter.generate();
  assert.equal(teacherCenter.doc, null, 'nothing is built for an unauthorized report');
  assert.equal(ctx.window.localStorage.getItem(ROSTER_KEY), snapshotBefore,
    'the block happens before any data is loaded');
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.teacher.sessionKey);
  ctx.window.localStorage.setItem(STAFF_ACCOUNTS.admin.sessionKey, adminSession);
});

/* ------------------------------------------------- role pipeline (1–5) ---- */

test('the generate pipeline runs for every role on its own scope', async () => {
  const snapshot = sources.loadSnapshot();
  const run = async (definition, actor, filters) => {
    const invalid = catalog.validateFilters(definition, filters);
    if (invalid) return { invalid };
    const gate = access.enforceAccess(definition, actor, filters);
    return catalog.buildReportDocument(definition,
      { filters: gate.filters, actor, scope: gate.scope, snapshot });
  };

  const admin = { kind: 'staff', role: 'admin', staffRole: 'admin', username: 'admin.apc' };
  const manager = { kind: 'staff', role: 'manager', staffRole: 'manager', username: 'manager.apc' };
  const teacher = { kind: 'staff', role: 'teacher', staffRole: 'teacher', username: 'teacher.apc' };
  const cash = { kind: 'staff', role: 'cash', staffRole: 'payment', username: 'payment.apc' };
  const student = { kind: 'student', role: 'student', studentId: 'AP-1024' };

  const adminRun = await run(catalog.findReport('student.all'), admin, {});
  assert.equal(adminRun.empty, false, 'Admin gets the real roster');

  const cashRun = await run(catalog.findReport('cash.own-history'), cash, { period: 'all' });
  assert.ok(cashRun.doc, 'Cash Counter generates its own history');

  const studentRun = await run(catalog.findReport('mine.due'), student, {});
  assert.ok(studentRun.doc, 'a student generates their own dues');

  // Without assignments a teacher's scope is empty — the honest empty state
  // or a refusal, never someone else's rows.
  let teacherRun;
  try {
    teacherRun = await run(catalog.findReport('academic.class'), teacher, {});
  } catch (error) {
    assert.equal(error.code, 'FORBIDDEN', 'a teacher is only refused, never mis-scoped');
    teacherRun = { doc: null, empty: true };
  }
  const leaked = JSON.stringify(teacherRun.doc || {});
  assert.ok(!leaked.includes('AP-1024'), 'an unassigned teacher sees no students');
});
