/* A pupil reads the work their teacher published. That must not depend on
   whether their own phone happens to hold the teacher's Manager assignment
   records.

   It did. The student app read through teachingRepository.list(), which returns
   the *teacher-scoped* snapshot (js/teaching-data.js → teacherSnapshot) and so
   also required isTeacherAssigned('teacher.apc', …) to pass on the reader's
   device. On a pupil's phone those assignment records are not guaranteed to
   exist, so the homework list came up empty while the data was sitting right
   there in localStorage.

   These tests boot the real index.html twice — identical seeds except for the
   assignment records — and require the same work to appear both times. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { isoToday } from '../js/latest-scope.js';

const TITLE = 'আজকের অঙ্ক';

async function bootStudent({ withAssignments }) {
  const ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const { window } = ctx;

  const { hashPassword } = await import('../js/password-hash.js');
  window.localStorage.setItem('active-plus-account-v1', JSON.stringify({
    mobile: '01700000000', registrationMobile: '01700000000', username: 'raisa.islam',
    pinHash: await hashPassword('246810'), status: 'active',
    student: { id: 'AP-1024', name: 'রাইসা আক্তার', className: 'দশম শ্রেণি', group: 'A' }
  }));
  const { buildSessionRecord } = await import('../js/session.js');
  window.localStorage.setItem('active-plus-session-v1', JSON.stringify(buildSessionRecord({ owner: 'raisa.islam' })));

  const { validateActivity, TEACHING_KEY, DEMO_TEACHER } = await import('../js/teaching-data.js');
  const { TEACHER_ASSIGNMENTS_KEY } = await import('../js/teacher-assignments.js');
  if (withAssignments) {
    window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
      { id: 'TAS-1', teacherUsername: 'teacher.apc', teacherName: 'রহিম স্যার', className: 'দশম শ্রেণি', group: '', subjects: ['গণিত'], subject: 'গণিত' }
    ]));
  } else {
    window.localStorage.removeItem(TEACHER_ASSIGNMENTS_KEY);
  }

  const day = isoToday();
  const at = `${day}T10:00:00.000Z`;
  window.localStorage.setItem(TEACHING_KEY, JSON.stringify({
    version: 1,
    activities: [{
      ...validateActivity({
        type: 'homework', title: TITLE, subject: 'গণিত', className: 'দশম শ্রেণি', group: 'A',
        date: day, time: '18:00', duration: 60, status: 'published', room: '',
        details: 'অনুশীলনী পড়বে।', resourceURL: ''
      }),
      id: 'HW-TODAY', teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার',
      createdAt: at, updatedAt: at, progress: { 'AP-1024': { value: 'pending', updatedAt: at } }
    }]
  }));

  await import(`../js/main.js?datapath=${withAssignments}-${Math.random()}`);
  await ctx.waitFor(() => ctx.$('#appShell') && ctx.$('#appShell').hidden === false, 8000);
  ctx.click(ctx.$('.bottom-link[data-view="courses"]'));
  await ctx.flush(5);
  return ctx;
}

const cardTitles = ctx => ctx.$$('#learningList .learning-card-title').map(el => el.textContent);

test('published homework reaches the pupil without the teacher’s assignment records', async () => {
  const ctx = await bootStudent({ withAssignments: false });
  assert.deepEqual(cardTitles(ctx), [TITLE], 'the work is on the panel');
  assert.equal(ctx.$('#learningError').hidden, true, 'and it is not reported as a load failure');
  assert.equal(ctx.$$('#learningList .apc-empty').length, 0, 'no empty state over real data');
});

test('the same work appears whether or not the device holds those records', async () => {
  const withRecords = await bootStudent({ withAssignments: true });
  const without = await bootStudent({ withAssignments: false });
  assert.deepEqual(cardTitles(without), cardTitles(withRecords), 'reading does not depend on the teacher’s assignment data');
});

test('work for another class or group still stays hidden', async () => {
  /* Reading is scoped to the pupil — the fix widens who may read their own
     work, it does not widen what any pupil may read. */
  const ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const { window } = ctx;
  const { hashPassword } = await import('../js/password-hash.js');
  window.localStorage.setItem('active-plus-account-v1', JSON.stringify({
    mobile: '01700000000', registrationMobile: '01700000000', username: 'raisa.islam',
    pinHash: await hashPassword('246810'), status: 'active',
    student: { id: 'AP-1024', name: 'রাইসা আক্তার', className: 'দশম শ্রেণি', group: 'A' }
  }));
  const { buildSessionRecord } = await import('../js/session.js');
  window.localStorage.setItem('active-plus-session-v1', JSON.stringify(buildSessionRecord({ owner: 'raisa.islam' })));

  const { validateActivity, TEACHING_KEY, DEMO_TEACHER } = await import('../js/teaching-data.js');
  const day = isoToday();
  const at = `${day}T10:00:00.000Z`;
  const work = (id, title, over) => ({
    ...validateActivity({
      type: 'homework', title, subject: 'গণিত', className: 'দশম শ্রেণি', group: 'A',
      date: day, time: '18:00', duration: 60, status: 'published', room: '',
      details: 'পড়বে।', resourceURL: '', ...over
    }),
    id, teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার', createdAt: at, updatedAt: at, progress: {}
  });
  window.localStorage.setItem(TEACHING_KEY, JSON.stringify({
    version: 1,
    activities: [
      work('MINE', 'আমার কাজ', {}),
      work('OTHER-GROUP', 'অন্য বিভাগের কাজ', { group: 'B' }),
      work('OTHER-CLASS', 'অন্য শ্রেণির কাজ', { className: 'নবম শ্রেণি', group: '' }),
      work('DRAFT', 'খসড়া কাজ', { status: 'draft' })
    ]
  }));

  await import(`../js/main.js?datapath-scope-${Math.random()}`);
  await ctx.waitFor(() => ctx.$('#appShell') && ctx.$('#appShell').hidden === false, 8000);
  ctx.click(ctx.$('.bottom-link[data-view="courses"]'));
  await ctx.flush(5);

  assert.deepEqual(cardTitles(ctx), ['আমার কাজ'], 'only this pupil’s own published work');
});
