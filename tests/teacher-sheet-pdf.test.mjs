/* §14 / §40: the teacher can download a piece of work as a PDF, carrying the
   institution header and page numbers.

   The important assertion is not "a button exists" — it is that the sheet the
   teacher downloads is produced by the *same* generator the student app uses
   (js/material-pdf.js). One generator means the printed copy cannot drift from
   the copy that was actually sent.

   jsdom has no canvas, so the same cosmetic stubs tests/report-layout.test.mjs
   uses are installed here: only the browser APIs the engine needs, never app
   logic. What gets asserted is what the generator actually drew. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { validateActivity, TEACHING_KEY, DEMO_TEACHER } from '../js/teaching-data.js';

const CLASS = 'দশম শ্রেণি';
const GROUP = 'বিজ্ঞান বিভাগ';
const TITLE = 'PDF অঙ্ক';
const at = '2026-10-01T10:00:00.000Z';

test('the teacher downloads the same sheet the student gets, with header and page numbers', async () => {
  const activity = {
    id: 'HW-PDF',
    ...validateActivity({
      type: 'homework', title: TITLE, subject: 'গণিত', className: CLASS, group: GROUP,
      date: '2026-10-01', time: '18:00', duration: 60, status: 'published',
      room: '', details: 'অনুশীলনী ১ সমাধান করবে।', resourceURL: ''
    }),
    teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার', createdAt: at, updatedAt: at, progress: {}
  };

  const ctx = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{
        id: 'TAS-0', teacherUsername: 'teacher.apc', teacherName: 'রহিম স্যার',
        className: CLASS, group: '', subject: 'গণিত', subjects: ['গণিত']
      }]),
      [TEACHING_KEY]: JSON.stringify({ version: 1, activities: [activity] })
    }
  });

  /* --- cosmetic canvas stubs: record what is drawn --- */
  const drawn = [];
  const fake = {
    font: '', fillStyle: '', strokeStyle: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1,
    measureText: text => ({ width: String(text).length * 8 }),
    fillText: (text, x, y) => drawn.push({ text: String(text), x, y, align: fake.textAlign }),
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, drawImage() {}, scale() {}, setTransform() {}
  };
  const { window } = ctx;
  window.HTMLCanvasElement.prototype.getContext = () => fake;
  window.HTMLCanvasElement.prototype.toBlob = function toBlob(cb) {
    cb(new window.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
  };
  window.Blob.prototype.arrayBuffer = function arrayBuffer() { return Promise.resolve(new Uint8Array([1, 2, 3]).buffer); };
  window.Image.prototype.decode = function decode() { return Promise.resolve(); };
  globalThis.FontFace = window.FontFace = class FontFace { load() { return Promise.resolve(this); } };
  /* fixed-shell.js reads document.fonts.ready at import, so the stub must keep it. */
  Object.defineProperty(window.document, 'fonts', { value: { add() {}, ready: Promise.resolve() }, configurable: true });

  const downloads = [];
  const track = blob => { downloads.push(blob); return 'blob:stub'; };
  /* downloadBlob() resolves the bare `URL` identifier, which in this harness is
     Node's global — not the jsdom window's. Stubbing only the window copy
     leaves Node's real createObjectURL to reject the jsdom Blob with the
     misleading "must be an instance of Blob. Received an instance of Blob". */
  window.URL.createObjectURL = track; window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = track; globalThis.URL.revokeObjectURL = () => {};

  await openStaffPanel(ctx, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    ready: () => [...ctx.$('#teacherHomeClass').options].some(o => o.textContent === 'সব assigned class')
  });

  ctx.click(ctx.$('[data-type-tab="homework"]'));
  await ctx.flush(4);

  const card = ctx.$$('#teacherRecordList .teaching-card')
    .find(el => el.querySelector('h3')?.textContent === TITLE);
  assert.ok(card, 'the homework is listed');

  const button = card.querySelector('[data-record-action="pdf"]');
  assert.ok(button, 'the card offers a PDF download');

  ctx.click(button);
  await ctx.waitFor(() => downloads.length > 0, 8000);

  /* §40 — the institution header and the page numbers must really be drawn. */
  const text = drawn.map(d => d.text);
  assert.ok(text.includes('Active Plus Coaching'), 'the institution name heads the sheet');
  assert.ok(text.some(t => t.startsWith('পৃষ্ঠা')), 'the sheet is paginated');
  assert.ok(text.some(t => /^পৃষ্ঠা .+ \/ .+$/.test(t)), 'and the page count is exact, not open-ended');

  /* The work itself is on the sheet, not just the furniture. */
  assert.ok(text.includes(TITLE), 'the homework title is printed');
  assert.ok(text.some(t => t.includes('অনুশীলনী')), 'and so are the instructions');

  assert.equal(downloads.length, 1, 'one download, from one generator');
  assert.equal(downloads[0].type, 'application/pdf');
});
