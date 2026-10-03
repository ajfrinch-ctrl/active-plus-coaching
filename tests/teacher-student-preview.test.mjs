/* §39: the teacher's "how will my students see this" preview must BE the
   student screen, not an approximation of it.

   The way that is guaranteed here is structural: js/learning-card.js exports one
   renderer, the student app calls it, and the teacher editor calls it. This test
   holds that invariant from the outside — it renders the same homework through
   both paths and requires the markup to be identical, so if someone later
   hand-rolls a second card for the preview, this fails.

   Ids and the teacher's name are normalised: the preview has no saved id, and
   the name is read live from the teacher profile on one side and from the stored
   record on the other. Neither is what the card *looks like*. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';

const CLASS = 'দশম শ্রেণি';
const GROUP = 'A';
const TITLE = 'প্রিভিউ অঙ্ক';
const SUBJECT = 'গণিত';
const DATE = '2026-10-01';
const TIME = '18:00';
const DETAILS = 'অনুশীলনী ১ সমাধান করবে।';

/* Ids differ by design (a preview is not saved) and the teacher name arrives
   from two different places; everything else must match exactly. */
function normalise(html) {
  return html
    /* A preview is not a saved record, so it has no id of its own. */
    .replace(/data-learning-id="[^"]*"/g, 'data-learning-id="X"')
    .replace(/learning-details-[^"]*/g, 'learning-details-X')
    .replace(/data-material="[^"]*"/g, 'data-material="X"')
    .replace(/data-complete-homework="[^"]*"/g, 'data-complete-homework="X"')
    /* The name is read live from the teacher profile on one side and from the
       stored record on the other; the initial is derived from it. */
    .replace(/(<small>শিক্ষক • )[^<]*/, '$1X')
    .replace(/(<div class="learning-teacher"><span aria-hidden="true">)[^<]*/, '$1X')
    /* The preview opens the card so it can be reviewed in one glance. That is a
       deliberate state difference, not a markup difference. */
    .replace(/aria-expanded="(true|false)"/g, 'aria-expanded="S"')
    .replace(/(<div class="learning-card-details" id="learning-details-X") hidden=""/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

test('the teacher preview and the student card are the same markup', async () => {
  /* --- teacher side: fill the form, open the preview --- */
  const teacher = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{
        id: 'TAS-0', teacherUsername: 'teacher.apc', teacherName: 'Test Teacher',
        className: CLASS, group: '', subject: SUBJECT, subjects: [SUBJECT]
      }])
    }
  });
  await openStaffPanel(teacher, 'teacher', {
    importPanel: () => import(`../js/teacher.js?pv=${Math.random()}`),
    shellId: 'teacherShell',
    ready: () => [...teacher.$('#teacherHomeClass').options].some(o => o.textContent === 'সব assigned class')
  });

  teacher.click(teacher.$('#teacherQuickActions [data-new-activity="homework"]'));
  const $ = teacher.$;
  teacher.type($('#activity-title'), TITLE);
  teacher.type($('#activity-subject'), SUBJECT);
  teacher.type($('#activity-details'), DETAILS);
  teacher.type($('#activity-group'), GROUP);
  $('#activity-date').value = DATE;
  $('#activity-time').value = TIME;
  $('#activity-status').value = 'published';

  assert.equal($('#activityPreviewBox').hidden, true, 'the preview starts closed');
  teacher.click($('#activityPreviewToggle'));
  assert.equal($('#activityPreviewBox').hidden, false, 'and opens on request');
  assert.equal($('#activityPreviewToggle').getAttribute('aria-expanded'), 'true');

  const previewCard = $('#activityPreviewBox .learning-card');
  assert.ok(previewCard, 'the preview renders a real student card');
  const previewHTML = normalise(previewCard.outerHTML);
  const previewTitle = $('#activityPreviewBox .learning-card-title').textContent;
  assert.equal(previewTitle, TITLE, 'the preview shows what was typed');

  /* --- student side: the same work, published, seen by a pupil --- */
  const student = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const { window } = student;
  const { hashPassword } = await import('../js/password-hash.js');
  window.localStorage.setItem('active-plus-account-v1', JSON.stringify({
    mobile: '01700000000', registrationMobile: '01700000000', username: 'raisa.islam',
    pinHash: await hashPassword('246810'), status: 'active',
    student: { id: 'AP-1024', name: 'রাইসা আক্তার', className: CLASS, group: GROUP }
  }));
  const { buildSessionRecord } = await import('../js/session.js');
  window.localStorage.setItem('active-plus-session-v1', JSON.stringify(buildSessionRecord({ owner: 'raisa.islam' })));

  const { validateActivity, TEACHING_KEY, DEMO_TEACHER } = await import('../js/teaching-data.js');
  const at = `${DATE}T10:00:00.000Z`;
  window.localStorage.setItem(TEACHING_KEY, JSON.stringify({
    version: 1,
    activities: [{
      ...validateActivity({
        type: 'homework', title: TITLE, subject: SUBJECT, className: CLASS, group: GROUP,
        date: DATE, time: TIME, duration: 60, status: 'published', room: '',
        details: DETAILS, resourceURL: ''
      }),
      id: 'HW-PREVIEW', teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার',
      createdAt: at, updatedAt: at, progress: {}
    }]
  }));

  await import(`../js/main.js?preview=${Math.random()}`);
  await student.waitFor(() => student.$('#appShell') && student.$('#appShell').hidden === false, 8000);
  student.click(student.$('.bottom-link[data-view="courses"]'));
  await student.flush(5);

  const studentCard = student.$('#learningList .learning-card');
  assert.ok(studentCard, 'the pupil sees the work');
  assert.equal(student.$('#learningList .learning-card-title').textContent, TITLE);

  /* --- the actual claim --- */
  assert.equal(previewHTML, normalise(studentCard.outerHTML),
    'the preview must be byte-identical to what the student sees');
});

test('the preview follows the form as the teacher types', async () => {
  const teacher = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{
        id: 'TAS-0', teacherUsername: 'teacher.apc', teacherName: 'Test Teacher',
        className: CLASS, group: '', subject: SUBJECT, subjects: [SUBJECT]
      }])
    }
  });
  await openStaffPanel(teacher, 'teacher', {
    importPanel: () => import(`../js/teacher.js?pv=${Math.random()}`),
    shellId: 'teacherShell',
    ready: () => [...teacher.$('#teacherHomeClass').options].some(o => o.textContent === 'সব assigned class')
  });
  const $ = teacher.$;
  teacher.click($('#teacherQuickActions [data-new-activity="homework"]'));
  teacher.type($('#activity-title'), 'প্রথম শিরোনাম');
  teacher.click($('#activityPreviewToggle'));
  assert.equal($('#activityPreviewBox .learning-card-title').textContent, 'প্রথম শিরোনাম');

  teacher.type($('#activity-title'), 'বদলে যাওয়া শিরোনাম');
  await teacher.flush(2);
  assert.equal($('#activityPreviewBox .learning-card-title').textContent, 'বদলে যাওয়া শিরোনাম',
    'editing the form updates the preview');
});
