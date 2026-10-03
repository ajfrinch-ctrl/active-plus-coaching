/* The homework editor, driven for real in jsdom.

   Until now the only coverage of this flow was tests/teacher.spec.cjs, a
   Playwright spec — and Playwright's browsers cannot be installed in this
   sandbox, so nothing runnable exercised creating a homework. These tests pin
   what the editor does today so the workflow can be rebuilt without silently
   losing behaviour: the form opens, required fields are enforced, a draft stays
   a draft, publishing is what makes it visible to the class, and a bad save
   reports itself instead of losing the typing. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { enabledClasses } from '../js/config.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { teachingRepository, TEACHING_KEY } from '../js/teaching-data.js';

let ctx;
const ASSIGNED_CLASS = 'দশম শ্রেণি';
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
/* The store does not exist at all until the first save, so an absent key means
   "no work yet" rather than a crash. */
const saved = () => JSON.parse(ctx.window.localStorage.getItem(TEACHING_KEY) || '{"activities":[]}').activities;

before(async () => {
  ctx = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      /* Only ONE class is assigned. Seeding all twelve — as the older panel
         tests do — would leave no real class for the refusal test below to
         attempt, and the guard would never be exercised. */
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{
        id: 'TAS-0', teacherUsername: 'teacher.apc', teacherName: 'Test Teacher',
        className: ASSIGNED_CLASS, group: '', subject: 'গণিত', subjects: ['গণিত']
      }])
    }
  });
  await openStaffPanel(ctx, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    ready: () => [...$('#teacherHomeClass').options].some(option => option.textContent === 'সব assigned class')
  });
  assert.equal($('#teacherShell').hidden, false, 'the panel must open');
});

test('the home screen offers a way to add homework', () => {
  const button = $('#teacherQuickActions [data-new-activity="homework"]');
  assert.ok(button, 'the add button exists');
  assert.equal(button.hidden, false);
  assert.equal($('#teacherQuickActions').hidden, false, 'and it is reachable when the teacher has assignments');
});

test('opening the editor presents the fields a homework needs', () => {
  ctx.click($('#teacherQuickActions [data-new-activity="homework"]'));
  assert.equal($('#teacherModalBackdrop').hidden, false, 'the editor opens');
  for (const id of ['#activity-title', '#activity-subject', '#activity-className', '#activity-group', '#activity-date', '#activity-time', '#activity-details', '#activity-status']) {
    assert.ok($(id), `${id} exists`);
  }
  assert.equal($('#activity-title').required, true, 'a title cannot be skipped');
  assert.equal($('#activity-subject').required, true, 'nor a subject');
  assert.equal($('#activity-className').required, true, 'nor the class');
  assert.deepEqual([...$('#activity-status').options].map(o => o.value), ['draft', 'published']);
});

test('saving as a draft keeps the work away from students', async () => {
  ctx.type($('#activity-title'), 'খসড়া অঙ্ক');
  ctx.type($('#activity-subject'), 'গণিত');
  ctx.type($('#activity-details'), 'অনুশীলনী ১ সমাধান করবে।');
  $('#activity-date').value = '2026-10-01';
  $('#activity-time').value = '17:00';
  $('#activity-status').value = 'draft';
  ctx.submit($('#teacherActivityForm'));
  await ctx.waitFor(() => saved().length === 1);

  const [activity] = saved();
  assert.equal(activity.status, 'draft');
  assert.equal(activity.title, 'খসড়া অঙ্ক');
  assert.equal(activity.type, 'homework');
  assert.equal($('#teacherModalBackdrop').hidden, true, 'the editor closes after a good save');
});

test('a draft is not published work', async () => {
  const db = await teachingRepository.list();
  const published = db.activities.filter(a => a.status === 'published');
  assert.equal(published.length, 0, 'the draft did not become visible');
});

test('publishing is what makes the same work visible', async () => {
  ctx.click($('#teacherQuickActions [data-new-activity="homework"]'));
  ctx.type($('#activity-title'), 'প্রকাশিত অঙ্ক');
  ctx.type($('#activity-subject'), 'গণিত');
  ctx.type($('#activity-details'), 'অনুশীলনী ২ সমাধান করবে।');
  $('#activity-date').value = '2026-10-02';
  $('#activity-time').value = '17:00';
  $('#activity-status').value = 'published';
  ctx.submit($('#teacherActivityForm'));
  await ctx.waitFor(() => saved().length === 2);

  const published = saved().filter(a => a.status === 'published');
  assert.equal(published.length, 1);
  assert.equal(published[0].title, 'প্রকাশিত অঙ্ক');
});

test('a class the teacher does not take is refused, and the typing survives', async () => {
  ctx.click($('#teacherQuickActions [data-new-activity="homework"]'));
  ctx.type($('#activity-title'), 'ভুল শ্রেণির কাজ');
  ctx.type($('#activity-subject'), 'গণিত');
  $('#activity-date').value = '2026-10-03';
  $('#activity-time').value = '17:00';
  $('#activity-status').value = 'published';
  /* A class that is real in the app but absent from this teacher's
     assignments — the guard under test. */
  const foreign = enabledClasses.find(name => name !== ASSIGNED_CLASS);
  assert.ok(foreign, 'there must be a real class this teacher does not take');
  assert.equal($('#activity-className').value, ASSIGNED_CLASS, 'the picker starts on the assigned class');
  $('#activity-className').innerHTML += `<option value="${foreign}">${foreign}</option>`;
  $('#activity-className').value = foreign;

  const before = saved().length;
  ctx.submit($('#teacherActivityForm'));
  await ctx.waitFor(() => $('#teacherSaveError').hidden === false);

  assert.equal(saved().length, before, 'nothing was written');
  assert.match($('#teacherSaveError').textContent, /assignment/, 'and the reason is stated');
  assert.equal($('#teacherModalBackdrop').hidden, false, 'the editor stays open');
  assert.equal($('#activity-title').value, 'ভুল শ্রেণির কাজ', 'the work typed so far is not lost');
});
