/* "What shows by default" is one rule, not a per-page decision.

   A list opens on the latest work; anything older sits behind a From → To
   range; "সব" always brings the history back. These tests pin the pure rule and
   then drive the two student surfaces that use it — the dashboard's Latest
   Homework (three days) and the homework panel (seven). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import {
  recencyDay, shiftDay, isoToday, inScope, applyScope, byRecency, scopeNote,
  latestScope, rangeScope, normalizeScope, readScopeBar, LATEST_DAYS_PANEL
} from '../js/latest-scope.js';

const TODAY = isoToday();
const daysAgo = n => shiftDay(TODAY, -n);
const homework = (id, day, extra = {}) => ({ id, title: `কাজ ${id}`, subject: 'গণিত', type: 'homework', date: day, updatedAt: `${day}T10:00:00.000Z`, teacherName: 'রহিম স্যার', progress: {}, ...extra });

/* ---- the pure rule ------------------------------------------------------------ */

test('recency is the record’s own date, and the last edit when it has none', () => {
  assert.equal(recencyDay(homework('A', daysAgo(2))), daysAgo(2));
  assert.equal(recencyDay({ id: 'B', updatedAt: `${daysAgo(9)}T08:00:00.000Z` }), daysAgo(9), 'an undated notice falls back to its edit day');
  assert.equal(recencyDay({ id: 'C' }), '', 'a record with neither has no day');
});

test('the default window keeps the last few days and leaves the rest out', () => {
  const scope = latestScope(7);
  assert.equal(inScope(homework('new', TODAY), scope, TODAY), true);
  assert.equal(inScope(homework('edge', daysAgo(6)), scope, TODAY), true, 'day 7 of the window is still inside');
  assert.equal(inScope(homework('old', daysAgo(7)), scope, TODAY), false, 'day 8 is history');
  assert.equal(inScope({ id: 'undated', updatedAt: '' }, scope, TODAY), true, 'a just-written record with no day still shows');
});

test('a From → To range replaces the window and “সব” restores everything', () => {
  const records = [homework('t', TODAY), homework('m', daysAgo(10)), homework('o', daysAgo(40))];
  assert.deepEqual(applyScope(records, latestScope(7), TODAY).map(r => r.id), ['t']);
  assert.deepEqual(applyScope(records, rangeScope(daysAgo(45), daysAgo(5)), TODAY).map(r => r.id), ['m', 'o']);
  assert.deepEqual(applyScope(records, rangeScope('', daysAgo(20)), TODAY).map(r => r.id), ['o'], 'a "শেষ" date alone means "older than this"');
  assert.deepEqual(applyScope(records, rangeScope(daysAgo(3), ''), TODAY).map(r => r.id), ['t'], 'a "শুরু" date alone means "from here on"');
  assert.deepEqual(applyScope(records, { mode: 'all' }, TODAY).map(r => r.id), ['t', 'm', 'o']);
  assert.equal(inScope(homework('x', ''), { mode: 'range', from: daysAgo(5), to: TODAY }, TODAY), false, 'a range cannot place an undated record');
});

test('a bad or empty range restricts nothing instead of hiding work', () => {
  /* A mistyped date must never narrow the view on its own: the range stays
     open and unbounded rather than snapping back to a smaller window. */
  assert.equal(normalizeScope({ mode: 'range', from: 'নonsense', to: '' }).mode, 'range');
  assert.equal(inScope(homework('o', daysAgo(40)), normalizeScope({ mode: 'range', from: 'নonsense', to: '' }), TODAY), true);
  assert.equal(normalizeScope(null).mode, 'latest');
  assert.equal(normalizeScope({ mode: 'latest', days: 0 }).days, LATEST_DAYS_PANEL);
  assert.equal(inScope(homework('o', daysAgo(40)), normalizeScope({ mode: 'nonsense' }), TODAY), false);
});

test('newest first, and a count line that says what is held back', () => {
  const records = [homework('o', daysAgo(30)), homework('t', TODAY), homework('m', daysAgo(3))];
  assert.deepEqual([...records].sort(byRecency).map(r => r.id), ['t', 'm', 'o']);
  assert.match(scopeNote(latestScope(7), { shown: 1, total: 3 }), /সর্বশেষ ৭ দিন/);
  assert.match(scopeNote(latestScope(7), { shown: 1, total: 3 }), /আরও ২টি পুরোনো/);
  assert.doesNotMatch(scopeNote({ mode: 'all' }, { shown: 3, total: 3 }), /পুরোনো/);
  assert.match(scopeNote(rangeScope(daysAgo(40), daysAgo(1)), { shown: 2, total: 3 }), /→/);
});

/* ---- the student surfaces ----------------------------------------------------- */

/* Four published homework records, one per age: today, yesterday, inside the
   panel's week, and old history. They are written the way a teacher's own save
   leaves them (js/demo-data.js does the same), so no staff session is needed to
   place work a teacher has already published.

   Note the assignment record: the student app reads teaching data through
   teachingRepository.list(), which returns the *teacher-scoped* snapshot
   (js/teaching-data.js → teacherSnapshot), so a device also has to hold
   teacher.apc's assignment for the class before a student sees anything. That
   coupling is recorded in the UX audit; this seed mirrors it. */
async function bootStudent() {
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
  window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
    { id: 'TAS-1', teacherUsername: 'teacher.apc', teacherName: 'রহিম স্যার', className: 'দশম শ্রেণি', group: '', subjects: ['গণিত', 'পদার্থ', 'রসায়ন'], subject: 'গণিত' }
  ]));
  const at = day => new Date(`${day}T10:00:00.000Z`).toISOString();
  const record = (id, title, subject, day, value) => ({
    ...validateActivity({ type: 'homework', title, subject, className: 'দশম শ্রেণি', group: 'A', date: day, time: '18:00', duration: 60, status: 'published', room: '', details: 'অনুশীলনী পড়বে।', resourceURL: '' }),
    id, teacherId: DEMO_TEACHER.id, teacherName: 'রহিম স্যার', createdAt: at(day), updatedAt: at(day),
    progress: { 'AP-1024': { value, updatedAt: at(day) } }
  });
  window.localStorage.setItem(TEACHING_KEY, JSON.stringify({
    version: 1,
    activities: [
      record('HW-TODAY', 'আজকের অঙ্ক', 'গণিত', TODAY, 'pending'),
      record('HW-YESTERDAY', 'গতকালের অঙ্ক', 'পদার্থ', daysAgo(1), 'done'),
      record('HW-WEEK', 'গত সপ্তাহের অঙ্ক', 'রসায়ন', daysAgo(5), 'done'),
      record('HW-OLD', 'পুরোনো অ্যাসাইনমেন্ট', 'রসায়ন', daysAgo(40), 'pending')
    ]
  }));

  await import(`../js/main.js?latest-scope=${Math.random()}`);
  await ctx.waitFor(() => ctx.$('#appShell') && ctx.$('#appShell').hidden === false);
  await ctx.waitFor(() => ctx.$$('#learningList .learning-card').length > 0, 5000);
  return ctx;
}

const cardTitles = ctx => ctx.$$('#learningList .learning-card-title').map(el => el.textContent);

test('the homework panel opens on the latest work, not the whole history', async () => {
  const ctx = await bootStudent();
  ctx.click(ctx.$('.bottom-link[data-view="courses"]'));
  await ctx.flush(4);

  assert.deepEqual(cardTitles(ctx).sort(), ['আজকের অঙ্ক', 'গতকালের অঙ্ক', 'গত সপ্তাহের অঙ্ক'].sort(), 'the 40-day-old work is not on the default view');
  assert.match(ctx.$('#learningScopeNote').textContent, /সর্বশেষ ৭ দিন/);
  assert.match(ctx.$('#learningScopeNote').textContent, /আরও ১টি পুরোনো/);
  assert.equal(ctx.$('#learningScope [data-scope-mode="latest"]').classList.contains('active'), true);

  // "সব" brings the history straight back — nothing was ever deleted.
  ctx.click(ctx.$('#learningScope [data-scope-mode="all"]'));
  await ctx.flush(4);
  assert.deepEqual(cardTitles(ctx).sort(), ['আজকের অঙ্ক', 'গতকালের অঙ্ক', 'গত সপ্তাহের অঙ্ক', 'পুরোনো অ্যাসাইনমেন্ট'].sort());

  // A custom range finds the old one on its own.
  ctx.click(ctx.$('#learningScope [data-scope-mode="range"]'));
  await ctx.flush(2);
  assert.equal(ctx.$('#learningScope [data-scope-range]').hidden, false, 'the From → To pair opens with the chip');
  ctx.$('#learningScopeFrom').value = daysAgo(60);
  ctx.$('#learningScopeTo').value = daysAgo(20);
  ctx.click(ctx.$('#learningScope [data-scope-apply]'));
  await ctx.flush(4);
  assert.deepEqual(cardTitles(ctx), ['পুরোনো অ্যাসাইনমেন্ট']);
  assert.match(ctx.$('#learningScopeNote').textContent, /→/);

  assert.deepEqual(ctx.jsdomErrors.filter(error => !/navigation/i.test(error)), []);
});

test('the panel search finds work by subject, teacher or title', async () => {
  const ctx = await bootStudent();
  ctx.click(ctx.$('.bottom-link[data-view="courses"]'));
  ctx.click(ctx.$('#learningScope [data-scope-mode="all"]'));
  await ctx.flush(4);
  const search = ctx.$('#learningSearch');

  ctx.type(search, 'রসায়ন');
  await ctx.flush(4);
  assert.deepEqual(cardTitles(ctx).sort(), ['গত সপ্তাহের অঙ্ক', 'পুরোনো অ্যাসাইনমেন্ট'].sort(), 'search by subject');

  ctx.type(search, 'রহিম');
  await ctx.flush(4);
  assert.equal(cardTitles(ctx).length, 4, 'every record names the same teacher');

  ctx.type(search, 'এমন কিছু নেই');
  await ctx.flush(4);
  assert.equal(ctx.$$('#learningList .learning-card').length, 0);
  assert.ok(ctx.$('#learningList .apc-empty'), 'an empty result says so instead of showing a blank screen');
  ctx.click(ctx.$('#learningList [data-scope-show-all]'));
  await ctx.flush(4);
  assert.equal(readScopeBar(ctx.$('#learningScope')).mode, 'all', 'the empty state offers the way back to everything');
});

test('the dashboard shows three days of homework and one way to the rest', async () => {
  const ctx = await bootStudent();
  const section = ctx.$('#latestHomeworkSection');
  assert.equal(section.hidden, false, 'the section opens when there is recent homework');

  const rows = ctx.$$('#latestHomeworkList .latest-work-row');
  assert.deepEqual(rows.map(row => row.querySelector('strong').textContent).sort(), ['আজকের অঙ্ক', 'গতকালের অঙ্ক'].sort(), 'three days at most, never the whole history');
  for (const row of rows) {
    assert.match(row.querySelector('.latest-work-subject').textContent, /গণিত|পদার্থ/, 'the subject is on the row');
    assert.match(row.querySelector('.latest-work-meta').textContent, /শিক্ষক/, 'the teacher is on the row');
    assert.match(row.querySelector('.latest-work-meta').textContent, /জমার শেষ/, 'the submission date is on the row');
    assert.match(row.querySelector('.latest-work-state').textContent, /সম্পন্ন|কাজ বাকি/, 'the status badge is on the row');
  }
  const doneRow = rows.find(row => row.querySelector('strong').textContent === 'গতকালের অঙ্ক');
  assert.equal(doneRow.querySelector('.latest-work-state').textContent, 'সম্পন্ন');
  assert.equal(doneRow.querySelector('.latest-work-state').classList.contains('is-done'), true);
  assert.match(ctx.$('#latestHomeworkNote').textContent, /সর্বশেষ ৩ দিনের ২টি কাজ/);

  // One tap from the dashboard into the panel that holds everything.
  ctx.click(ctx.$('#latestHomeworkSection [data-action="homework"]'));
  await ctx.waitFor(() => ctx.$('[data-view-panel="courses"]').classList.contains('active'), 5000);
  await ctx.waitFor(() => ctx.$('#learningFilters [data-learning-filter="homework"]').getAttribute('aria-pressed') === 'true', 5000);
  assert.deepEqual(cardTitles(ctx).sort(), ['আজকের অঙ্ক', 'গতকালের অঙ্ক', 'গত সপ্তাহের অঙ্ক'].sort(), 'the panel opens on its own seven-day window');
  assert.deepEqual(ctx.jsdomErrors.filter(error => !/navigation/i.test(error)), []);
});
