/* The student's exam list, grouped (§24).

   It used to be one flat list sorted by start date, so an exam that could be
   started this minute sat beside one due next week and one that finished last
   month — the student had to read every date to find the one they could act on.
   These tests pin the grouping: the same cards, filed into "এখন দেওয়া যাবে",
   "আসন্ন" and "সম্পন্ন", with empty groups left out entirely. */

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { examTemplate, validateExam, EXAM_KEY } from '../js/exam-data.js';
import { initStudentExams } from '../js/student-exams.js';

const student = { id: 'AP-GRP-1', name: 'পরীক্ষার্থী শিক্ষার্থী', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ' };
const now = Date.now();

/* Three published papers for this student's class, one in each bucket. */
const paper = (id, title, startAt, endAt) => ({
  ...validateExam({
    type: 'mcq', title, subject: 'গণিত', className: 'দশম শ্রেণি',
    startAt, endAt, lateMinutes: 30, negative: 0, passPercent: 33,
    template: examTemplate('mcq')
  }),
  id, teacherId: 'DEMO-TEACHER', teacherName: 'Demo Teacher', status: 'published',
  resultsPublished: false, participants: [student], createdAt: now, updatedAt: now
});

const live = paper('EX-LIVE', 'চলমান পরীক্ষা', now - 10 * 60000, now + 50 * 60000);
const upcoming = paper('EX-SOON', 'আগামীকালের পরীক্ষা', now + 60 * 60000, now + 2 * 60 * 60000);
const ended = paper('EX-DONE', 'গত সপ্তাহের পরীক্ষা', now - 3 * 60 * 60000, now - 2 * 60 * 60000);

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
/* The group a card landed in, read back from the DOM rather than assumed. */
const groupOf = id => $(`[data-student-exam="${id}"]`)?.closest('.exam-group')?.querySelector('.exam-group-title')?.textContent.trim();
const titles = () => $$('.exam-group-title').map(node => node.childNodes[0].textContent.trim());
const counts = () => $$('.exam-group-count').map(node => node.textContent.trim());

const seedExams = exams => {
  ctx.window.localStorage.setItem(EXAM_KEY, JSON.stringify({ version: 1, exams, attempts: [] }));
  initStudentExams({ getStudent: () => student, getAccount: () => ({ status: 'active' }) });
};

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
});

test('each exam is filed by when the student can act on it', async () => {
  seedExams([upcoming, live, ended]);
  await ctx.waitFor(() => $$('[data-student-exam]').length === 3);

  assert.deepEqual(titles(), ['এখন দেওয়া যাবে', 'আসন্ন', 'সম্পন্ন'],
    'the three groups appear in the order a student would act on them');
  assert.equal(groupOf('EX-LIVE')?.startsWith('এখন দেওয়া যাবে'), true, 'the open paper is first');
  assert.equal(groupOf('EX-SOON')?.startsWith('আসন্ন'), true, 'next week\'s paper is filed as upcoming');
  assert.equal(groupOf('EX-DONE')?.startsWith('সম্পন্ন'), true, 'last month\'s paper is filed as finished');
});

test('the start button is still on the paper that can be started now', async () => {
  const start = $('[data-student-exam-action="start"]');
  assert.ok(start, 'the live paper still offers a way in');
  assert.equal(start.closest('[data-student-exam]').dataset.studentExam, 'EX-LIVE',
    'and it belongs to the open paper, not a future one');
});

test('a group with nothing in it is not shown at all', async () => {
  seedExams([upcoming]);
  await ctx.waitFor(() => $$('[data-student-exam]').length === 1);

  assert.deepEqual(titles(), ['আসন্ন'], 'only the group that holds something is rendered');
  assert.deepEqual(counts(), ['১'], 'and it says how many are in it');
  assert.equal($$('.exam-group').length, 1);
});

test('no published exams falls back to the shared empty card', async () => {
  seedExams([]);
  await ctx.waitFor(() => Boolean($('.apc-empty')));

  assert.match($('.apc-empty').textContent, /কোনো পরীক্ষা প্রকাশ করেননি/,
    'the shared card explains the absence');
  assert.equal($$('.exam-group').length, 0, 'no empty group scaffolding is left behind');
});
