/* Teacher panel on the real teacher.html (jsdom): the home work queue, bulk
   marking, grouping and paging. The Playwright spec covers CRUD end to end;
   this file covers the management layer added on top of it. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { teachingRepository, todayISO } from '../js/teaching-data.js';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { STAFF_TEST_PASSWORD, provisionStaff, completeStaffPasswordDialog } from './staff-harness.mjs';

const shift = days => {
  const d = new Date(`${todayISO()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
};
const settle = () => new Promise(resolve => setTimeout(resolve, 40));

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
const cards = sel => $$(`${sel} .teaching-card`);
const queueTitle = () => $$('#teacherAttention .teaching-card h3').map(el => el.textContent);

before(async () => {
  ctx = await loadPage('teacher.html', {
    seed: { 'activePlus.demo.autofill.v1': 'off', [ROSTER_KEY]: JSON.stringify(adminStudents) }
  });
  await import('../js/teacher.js');
  await provisionStaff('teacher');
  ctx.type($('#teacherLoginUser'), STAFF_ACCOUNTS.teacher.username);
  ctx.type($('#teacherLoginPin'), STAFF_TEST_PASSWORD);
  ctx.click($('#teacherEnter'));
  // A role with no password yet is asked to set one before the panel opens.
  await ctx.waitFor(() => Boolean($('.staff-pw-backdrop')) || $('#teacherShell').hidden === false);
  if ($('.staff-pw-backdrop')) await completeStaffPasswordDialog(ctx);
  await ctx.waitFor(() => $('#teacherShell').hidden === false);
  assert.equal($('#teacherShell').hidden, false, 'the panel must open');
});

test('an empty panel reports that nothing is pending', () => {
  assert.equal($('#teacherPendingCount').textContent, '০');
  assert.match($('#teacherAttention').textContent, /সব কাজ শেষ/);
  assert.equal($('#teacherAttentionHint').textContent, 'সব কাজ শেষ');
});

test('the home queue lists exactly the work that is still open', async () => {
  await teachingRepository.saveActivity({ type: 'exam', title: 'গণিত মূল্যায়ন', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '10:00', duration: 60, totalMarks: 100, status: 'published', details: 'প্রথম অধ্যায়' });
  await teachingRepository.saveActivity({ type: 'routine', title: 'অতিরিক্ত ক্লাস', subject: 'গণিত', className: 'দশম শ্রেণি', date: shift(-1), time: '17:00', duration: 60, status: 'published', details: 'অনুশীলনী' });
  await teachingRepository.saveActivity({ type: 'homework', title: 'আজকের কাজ', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '20:00', status: 'published', details: 'অনুশীলনী ১' });
  await teachingRepository.saveActivity({ type: 'suggestion', title: 'খসড়া সাজেশন', subject: 'গণিত', className: 'দশম শ্রেণি', status: 'draft', details: 'নোট' });
  await settle();

  // Three open items: marks, attendance and a draft. The suggestion draft has no
  // progress of its own but must still surface as "not published yet".
  assert.equal($('#teacherPublishedCount').textContent, '৩');
  assert.equal($('#teacherDraftCount').textContent, '১');
  assert.equal($('#teacherPendingCount').textContent, '৪');
  assert.equal($('#teacherAttentionHint').textContent, '৪টি কাজ বাকি');
  assert.deepEqual(queueTitle().sort(), ['আজকের কাজ', 'অতিরিক্ত ক্লাস', 'গণিত মূল্যায়ন', 'খসড়া সাজেশন'].sort());

  const examCard = $$('#teacherAttention .teaching-card').find(c => c.querySelector('h3').textContent === 'গণিত মূল্যায়ন');
  assert.match(examCard.querySelector('.teaching-progress-line').textContent, /২ জনের নম্বর বাকি/);
  assert.equal(examCard.querySelector('.teaching-actions .primary').textContent, 'নম্বর দিন');
  const draftCard = $$('#teacherAttention .teaching-card').find(c => c.querySelector('h3').textContent === 'খসড়া সাজেশন');
  assert.equal(draftCard.querySelector('.teaching-actions .primary').textContent, 'সম্পাদনা করুন');

  // An overdue class puts a count on the bottom nav so it cannot be missed.
  assert.equal($('#navDot-routine').hidden, false);
  assert.equal($('#navDot-routine').textContent, '১');
  assert.equal($('#navDot-exam').textContent, '১');
  assert.equal($('#tabCount-exam').textContent, '১');
});

test('work whose date has not arrived yet is not counted as pending', async () => {
  await teachingRepository.saveActivity({ type: 'exam', title: 'পরের সপ্তাহের পরীক্ষা', subject: 'রসায়ন', className: 'দশম শ্রেণি', date: shift(7), time: '10:00', duration: 60, totalMarks: 100, status: 'published', details: 'দ্বিতীয় অধ্যায়' });
  await settle();
  assert.ok(!queueTitle().includes('পরের সপ্তাহের পরীক্ষা'), 'a future exam cannot have marks pending');
  const card = $$('#teacherRecent .teaching-card').find(c => c.querySelector('h3').textContent === 'পরের সপ্তাহের পরীক্ষা');
  // Nothing is claimed as recorded, and nothing is claimed as pending either.
  assert.equal(card.querySelector('.teaching-progress-line').textContent, 'অগ্রগতি ০/২ জন');
  assert.equal(card.querySelector('.teaching-progress-line').classList.contains('idle'), true);
});

test('a queue card opens the marking sheet and bulk fill marks the whole class', async () => {
  const examCard = $$('#teacherAttention .teaching-card').find(c => c.querySelector('h3').textContent === 'অতিরিক্ত ক্লাস');
  ctx.click(examCard.querySelector('.teaching-actions .primary'));
  assert.equal($('#teacherModalBackdrop').hidden, false);
  const fields = $$('[data-progress-id]');
  assert.equal(fields.length, 2, 'দশম শ্রেণি has two approved students');
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ০ জন নথিভুক্ত • বাকি ২ জন/);

  const allPresent = $$('.teacher-quick-fill [data-quick-fill]').find(b => b.textContent === 'সবাই উপস্থিত');
  ctx.click(allPresent);
  assert.deepEqual(fields.map(f => f.value), ['present', 'present']);
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ২ জন নথিভুক্ত • সব সম্পূর্ণ/);

  ctx.submit($('#teacherProgressForm'));
  await settle();
  assert.equal($('#teacherModalBackdrop').hidden, true);
  const record = $$('#teacherRecordList .teaching-card, #teacherRecent .teaching-card')
    .find(c => c.querySelector('h3')?.textContent === 'অতিরিক্ত ক্লাস');
  assert.match(record.querySelector('.teaching-progress-line').textContent, /২\/২ জন • সব নথিভুক্ত/);
  assert.equal($('#navDot-routine').hidden, true, 'nothing pending on that tab any more');
});

test('"শুধু বাকিরা" hides the students who are already recorded', async () => {
  const card = $$('#teacherRecent .teaching-card').find(c => c.querySelector('h3').textContent === 'গণিত মূল্যায়ন');
  ctx.click(card.querySelector('[data-record-action="progress"]'));
  const fields = $$('[data-progress-id]');
  fields[0].value = '80';
  fields[0].dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
  assert.match($('#teacherProgressSummary').textContent, /২ জনের ১ জন নথিভুক্ত/);

  ctx.click($('#teacherOnlyMissing'));
  const rows = $$('[data-progress-row]');
  assert.deepEqual(rows.map(r => r.hidden), [true, false], 'the already-marked student is filtered out');

  // Bulk fill respects the filter: the hidden, already-marked row is untouched.
  ctx.click($$('.teacher-quick-fill [data-quick-fill]').find(b => b.textContent === 'সব ঘর খালি করুন'));
  assert.equal(fields[0].value, '80');
  assert.equal(fields[1].value, '');
  ctx.click($('#teacherOnlyMissing'));
  assert.deepEqual($$('[data-progress-row]').map(r => r.hidden), [false, false]);
  ctx.click($('#teacherModalClose'));
});

test('type tabs switch the list, group it by day and report the split', async () => {
  await teachingRepository.saveActivity({ type: 'exam', title: 'দ্বিতীয় পরীক্ষা', subject: 'পদার্থ', className: 'দশম শ্রেণি', date: shift(1), time: '10:00', duration: 60, totalMarks: 50, status: 'draft', details: 'দ্বিতীয় অধ্যায়' });
  await settle();
  ctx.click($('[data-type-tab="exam"]'));

  assert.equal($('#teacherRecords').hidden, false);
  assert.equal($('#teacherHome').hidden, true);
  assert.equal($('#teacherRecordsTitle').textContent, 'পরীক্ষা');
  assert.equal($('[data-type-tab="exam"]').getAttribute('aria-selected'), 'true');
  assert.equal($('[data-type-tab="homework"]').getAttribute('aria-selected'), 'false');
  assert.equal($('#teacherRecordCount').textContent, '৩টি পরীক্ষা • প্রকাশিত ২ • খসড়া ১');
  // Deadline order: today, then the nearest upcoming day, then the rest.
  const labels = $$('#teacherRecordList .teacher-group-label').map(el => el.firstChild.textContent);
  assert.equal(labels[0], 'আজ');
  assert.equal(labels[1], 'আগামীকাল');
  assert.equal(labels.length, 3);
  assert.equal($$('#tabCount-exam')[0].textContent, '৩');
});

test('a long list pages instead of scrolling forever', async () => {
  for (let i = 0; i < 17; i += 1) {
    await teachingRepository.saveActivity({ type: 'suggestion', title: `সাজেশন ${i + 1}`, subject: 'গণিত', className: 'দশম শ্রেণি', status: 'published', details: 'নোট' });
  }
  await settle();
  ctx.click($('[data-type-tab="suggestion"]'));
  await settle();

  assert.equal(cards('#teacherRecordList').length, 15);
  assert.equal($('#teacherRecordMore').hidden, false);
  assert.equal($('#teacherRecordMore').textContent, 'আরও ৩টি সাজেশন দেখুন');
  ctx.click($('#teacherRecordMore'));
  assert.equal(cards('#teacherRecordList').length, 18);
  assert.equal($('#teacherRecordMore').hidden, true);

  // A new search starts from the first page again.
  ctx.type($('#teacherRecordSearch'), 'সাজেশন ১');
  assert.ok(cards('#teacherRecordList').length < 18);
});

test('the student roster still needs a search before listing anyone', () => {
  ctx.click($('[data-teacher-view="students"]'));
  assert.equal($('#teacherStudents').hidden, false);
  assert.equal(cards('#teacherStudentList').length, 0);
  ctx.type($('#teacherStudentSearch'), 'AP-1024');
  assert.equal(cards('#teacherStudentList').length, 1);
  assert.match($('#teacherStudentCount').textContent, /১ জন অনুমোদিত শিক্ষার্থী/);
});

test('a class with everything recorded leaves the queue and reads as done', async () => {
  // The recent list is dominated by the seeded suggestions, so open it from its own tab.
  ctx.click($('[data-type-tab="exam"]'));
  const card = $$('#teacherRecordList .teaching-card').find(c => c.querySelector('h3').textContent === 'গণিত মূল্যায়ন');
  ctx.click(card.querySelector('[data-record-action="progress"]'));
  $$('[data-progress-id]').forEach((field, i) => { field.value = String(70 + i); });
  ctx.submit($('#teacherProgressForm'));
  await settle();

  ctx.click($('[data-teacher-view="home"]'));
  const todayCard = $$('#teacherTodayClasses .teaching-card').find(c => c.querySelector('h3').textContent === 'গণিত মূল্যায়ন');
  assert.equal(todayCard.querySelector('.teaching-progress-line').classList.contains('clear'), true);
  assert.match(todayCard.querySelector('.teaching-progress-line').textContent, /বাকি নেই/);
  assert.ok(!queueTitle().includes('গণিত মূল্যায়ন'), 'nothing pending means it leaves the queue');
  // Only the draft exam is left waiting on this tab now.
  assert.equal($('#navDot-exam').textContent, '১');
});

test('the home screen can be scoped to one class', async () => {
  const select = () => $('#teacherHomeClass');
  const pick = value => {
    select().value = value;
    select().dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
  };
  const digits = text => Number(String(text).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
  const pendingAll = digits($('#teacherPendingCount').textContent);
  assert.equal(select().options[0].value, 'all');
  assert.ok(select().options.length > 5, 'the picker offers every class the app runs');

  // Both classes below have approved students, so both pieces of work are pending.
  await teachingRepository.saveActivity({ type: 'homework', title: 'দশম শ্রেণির কাজ', subject: 'গণিত', className: 'দশম শ্রেণি', date: todayISO(), time: '20:00', status: 'published', details: 'অধ্যায় ২' });
  await teachingRepository.saveActivity({ type: 'homework', title: 'অনার্সের কাজ', subject: 'বাংলা', className: 'অনার্স ১ম বর্ষ', date: todayISO(), time: '20:00', status: 'published', details: 'রচনা' });
  await settle();
  assert.equal(digits($('#teacherPendingCount').textContent), pendingAll + 2, 'both count while সব শ্রেণি is selected');
  assert.ok(queueTitle().includes('দশম শ্রেণির কাজ') && queueTitle().includes('অনার্সের কাজ'));

  pick('দশম শ্রেণি');
  assert.equal(queueTitle().includes('দশম শ্রেণির কাজ'), true);
  assert.equal(queueTitle().includes('অনার্সের কাজ'), false, 'another class drops out of the queue');
  assert.equal(digits($('#teacherPendingCount').textContent), pendingAll + 1, 'and out of the counter');
  assert.match($('#teacherAttentionHint').textContent, /দশম শ্রেণি/, 'the hint names the class');

  pick('অনার্স ১ম বর্ষ');
  assert.deepEqual(queueTitle(), ['অনার্সের কাজ'], 'that class shows only its own work');
  assert.equal($('#teacherTodayClassCount').textContent, '০');

  pick('all');
  assert.equal(digits($('#teacherPendingCount').textContent), pendingAll + 2, 'সব শ্রেণি brings everything back');
  assert.equal(/শ্রেণি|বর্ষ/.test($('#teacherAttentionHint').textContent), false, 'and the hint stops naming a class');
});
