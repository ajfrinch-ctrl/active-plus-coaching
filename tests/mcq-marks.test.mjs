/* MCQ marks are fixed at 1 — checked through the real teacher exam editor
   (teacher.html + js/exam-manager.js), not just the parser. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { EXAM_KEY, examTemplate, totalMarks } from '../js/exam-data.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { STAFF_TEST_PASSWORD, provisionStaff, completeStaffPasswordDialog } from './staff-harness.mjs';

let ctx;
const $ = sel => ctx.$(sel);
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
const storedExam = () => JSON.parse(ctx.window.localStorage.getItem(EXAM_KEY)).exams[0];

before(async () => {
  ctx = await loadPage('teacher.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await import('../js/teacher.js');
  await provisionStaff('teacher');
  ctx.type($('#teacherLoginUser'), STAFF_ACCOUNTS.teacher.username);
  ctx.type($('#teacherLoginPin'), STAFF_TEST_PASSWORD);
  ctx.click($('#teacherEnter'));
  // A role with no password yet is asked to set one before the panel opens.
  await ctx.waitFor(() => Boolean($('.staff-pw-backdrop')) || $('#teacherShell').hidden === false);
  if ($('.staff-pw-backdrop')) await completeStaffPasswordDialog(ctx);
  await ctx.waitFor(() => $('#teacherShell').hidden === false);
  ctx.click($('[data-teacher-view="online-exams"]'));
  ctx.click($('#teacherExamWorkspace [data-exam-action="new-mcq"]'));
});

test('the MCQ editor no longer asks for marks and says the value is fixed', () => {
  const workspace = $('#teacherExamWorkspace');
  assert.match(workspace.textContent, /প্রতি প্রশ্নের নম্বর ১ নির্ধারিত/);
  assert.equal($('textarea[data-copy-template]').value.includes('নম্বর'), false, 'the copyable template has no marks line');
  assert.equal($('textarea[name=template]').placeholder.includes('নম্বর'), false);
});

test('the live preview totals one mark per question', () => {
  ctx.type($('textarea[name=template]'), examTemplate('mcq'));
  assert.match($('[data-parsed-preview]').textContent, /২টি প্রশ্ন • মোট ২ নম্বর/);
});

test('writing any other mark is refused with a Bengali explanation', () => {
  ctx.type($('textarea[name=template]'), examTemplate('mcq').replace('A: ঢাকা', 'নম্বর: ২\nA: ঢাকা'));
  assert.match($('[data-parsed-preview]').textContent, /নম্বর ১ নির্ধারিত/);
  ctx.type($('textarea[name=template]'), examTemplate('mcq').replace('A: ঢাকা', 'নম্বর: ১\nA: ঢাকা'));
  assert.match($('[data-parsed-preview]').textContent, /২টি প্রশ্ন • মোট ২ নম্বর/, 'an explicit 1 is accepted');
});

test('a saved MCQ draft stores one mark per question', async () => {
  ctx.type($('textarea[name=template]'), examTemplate('mcq'));
  $('input[name=title]').value = 'গণিত MCQ';
  $('input[name=subject]').value = 'গণিত';
  $('input[name=startAt]').value = '2026-10-01T10:00';
  $('input[name=endAt]').value = '2026-10-01T11:00';
  $('input[name=passPercent]').value = '33';
  ctx.submit($('#teacherExamWorkspace [data-exam-form]'));
  await settle();

  const exam = storedExam();
  assert.equal(exam.type, 'mcq');
  assert.deepEqual(exam.questions.map(q => q.marks), [1, 1]);
  assert.equal(totalMarks(exam), exam.questions.length);
});
