/* §13: one status vocabulary on the teacher's own list.

   The badges are derived, not stored — the record still says draft|published and
   each pupil's progress is still pending|done|reviewed. That matters, because it
   means no existing record has to be migrated for the list to say something
   more useful than "প্রকাশিত".

   These tests pin the derivation, including the two cases that are easy to get
   wrong: work nobody has responded to yet, and work with an empty roster. */
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
/* The seeded roster has exactly two pupils in this class+group, which is what
   makes the "১/২" and "সব" cases assertable rather than approximate. */
const PUPILS = ['AP-1024', '260810021'];

const at = '2026-10-01T10:00:00.000Z';

/* validateActivity() checks a record but does not mint an id, and the data
   layer rejects an activity without one — the panel then boots into its
   "ডেটা পড়া যায়নি" state instead of the list under test. */
function activity(id, overrides) {
  const base = validateActivity({
    type: 'homework', title: 'কাজ', subject: 'গণিত', className: CLASS, group: GROUP,
    date: '2026-10-01', time: '18:00', duration: 60, status: 'published',
    room: '', details: 'অনুশীলনী', resourceURL: '', ...overrides
  });
  return { id, ...base, teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার', createdAt: at, updatedAt: at, progress: {} };
}

const recorded = ids => Object.fromEntries(ids.map(id => [id, { value: 'done', updatedAt: at }]));

const CASES = [
  { title: 'খসড়া কাজ', overrides: { status: 'draft' }, progress: {}, tone: 'draft', text: 'খসড়া' },
  { title: 'সদ্য দেওয়া', overrides: {}, progress: {}, tone: 'assigned', text: 'দেওয়া হয়েছে' },
  { title: 'অর্ধেক জমা', overrides: {}, progress: recorded([PUPILS[0]]), tone: 'partial', text: 'জমা পড়ছে ১/২' },
  { title: 'সবাই দিয়েছে', overrides: {}, progress: recorded(PUPILS), tone: 'complete', text: 'সব জমা হয়েছে' },
  { title: 'শিক্ষকের নোট', overrides: { type: 'suggestion' }, progress: {}, tone: 'published', text: 'প্রকাশিত' }
];

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);

test('the teacher list derives a status badge from the data it already has', async () => {
  const activities = CASES.map((c, i) => ({ ...activity(`HW-${i}`, { title: c.title, ...c.overrides }), progress: c.progress }));

  ctx = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{
        id: 'TAS-0', teacherUsername: 'teacher.apc', teacherName: 'রহিম স্যার',
        className: CLASS, group: '', subject: 'গণিত', subjects: ['গণিত']
      }]),
      [TEACHING_KEY]: JSON.stringify({ version: 1, activities })
    }
  });
  await openStaffPanel(ctx, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    ready: () => [...$('#teacherHomeClass').options].some(o => o.textContent === 'সব assigned class')
  });

  const badgeFor = title => {
    const card = $$('#teacherRecordList .teaching-card')
      .find(el => el.querySelector('h3')?.textContent === title);
    assert.ok(card, `the card for “${title}” is listed`);
    return card.querySelector('.teaching-status');
  };

  ctx.click($('[data-type-tab="homework"]'));
  await ctx.flush(4);

  for (const c of CASES.filter(c => c.overrides.type !== 'suggestion')) {
    const badge = badgeFor(c.title);
    assert.equal(badge.textContent, c.text, `“${c.title}” says ${c.text}`);
    assert.ok(badge.classList.contains(c.tone), `“${c.title}” carries the ${c.tone} tone`);
  }

  /* A notice has no roster to track, so it must not claim a submission state. */
  ctx.click($('[data-type-tab="suggestion"]'));
  await ctx.flush(4);
  const notice = badgeFor('শিক্ষকের নোট');
  assert.equal(notice.textContent, 'প্রকাশিত');
  assert.ok(notice.classList.contains('published'), 'a notice keeps the plain published badge');
});
