/* The student Learning Hub (#coursesView): Class → Subject → Chapter → content,
   the section chips, and the two hard rules —
     • a student only ever sees their own class and only published content;
     • the exam and result sections read the existing Examination store, so a
       course never grows a second exam or result system. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { initCourseHub } from '../js/course-hub.js';
import { COURSE_SECTIONS } from '../js/course-content.js';
import { classByName, subjectByName } from '../js/academics.js';
import { COURSE_CONTENT_KEY } from '../js/course-content.js';
import { KEYS } from '../js/database.js';

const STUDENT = { id: 'S-HUB', name: 'Hub Student', className: 'দশম শ্রেণি', group: '' };
let ctx, hub;

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  /* Class and subject ids come from Academic Setup — never hard-coded here. */
  const classId = classByName('দশম শ্রেণি').id;
  const mathsId = subjectByName('গণিত').id;
  const banglaId = subjectByName('বাংলা').id;
  const records = [
    { id: 'CONTENT-0001', classId, subjectId: mathsId, chapterId: '', type: 'chapter', title: 'অধ্যায় ১', description: '', published: true, active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'CONTENT-0002', classId, subjectId: mathsId, chapterId: '', type: 'lesson', title: 'পাঠ ১.১', content: 'পাঠের লেখা', published: true, active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'CONTENT-0003', classId, subjectId: mathsId, chapterId: '', type: 'note', title: 'গোপন খসড়া নোট', content: 'এখনো প্রকাশ হয়নি', published: false, active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'CONTENT-0004', classId, subjectId: banglaId, chapterId: '', type: 'lesson', title: 'বাংলা পাঠ', content: 'অন্য বিষয়', published: true, active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'CONTENT-0005', classId: classByName('অষ্টম শ্রেণি').id, subjectId: mathsId, chapterId: '', type: 'lesson', title: 'অন্য ক্লাসের পাঠ', content: '', published: true, active: true, createdAt: Date.now(), updatedAt: Date.now() }
  ];
  ctx.window.localStorage.setItem(COURSE_CONTENT_KEY, JSON.stringify({ version: 1, records }));
  const content = JSON.parse(ctx.window.localStorage.getItem(COURSE_CONTENT_KEY));
  /* The chapter row is pointed at its own id, exactly like the editor does. */
  content.records[1].chapterId = 'CONTENT-0001';
  content.records[2].chapterId = 'CONTENT-0001';
  ctx.window.localStorage.setItem(COURSE_CONTENT_KEY, JSON.stringify(content));
  hub = initCourseHub({ getStudent: () => STUDENT });
  /* The first subject of the class opens by default; the test works in গণিত. */
  const maths = ctx.$$('#courseHub [data-course-subject]').find(button => button.textContent.trim() === 'গণিত');
  assert.ok(maths, 'গণিত is offered as a subject chip');
  ctx.click(maths);
});

after(() => ctx?.window.close());

test('the hub opens on the student’s own class, subject and chapter', () => {
  const root = ctx.$('#courseHub');
  assert.ok(root, 'the hub has its mount inside the courses view');
  assert.match(root.textContent, /দশম শ্রেণি/, 'the class is shown');
  const subjects = ctx.$$('#courseHub [data-course-subject]').map(button => button.textContent.trim());
  for (const name of ['বাংলা', 'ইংরেজি', 'গণিত', 'আইসিটি', 'পদার্থবিজ্ঞান', 'রসায়ন']) assert.ok(subjects.includes(name), `${name} comes from Academic Setup`);
  assert.equal(new Set(subjects).size, subjects.length, 'a subject is never offered twice');
  assert.equal(ctx.$('#courseHub [data-course-subject="' + subjectByName('গণিত').id + '"]')?.getAttribute('aria-selected'), 'true', 'the chosen subject stays selected');
  assert.deepEqual(COURSE_SECTIONS.map(entry => entry.key), ['read', 'notes', 'important', 'suggestion', 'questions', 'mcq', 'previous', 'model-test', 'exam', 'results']);
  const sections = ctx.$$('#courseHub [data-course-section]').map(button => button.dataset.courseSection);
  assert.deepEqual(sections, COURSE_SECTIONS.map(entry => entry.key), 'every section has a chip');
});

test('only the student’s class and published content ever reach the DOM', () => {
  const root = ctx.$('#courseHub');
  assert.match(root.textContent, /অধ্যায় ১/, 'the chapter is listed');
  assert.doesNotMatch(root.textContent, /গোপন খসড়া নোট/, 'an unpublished note stays hidden');
  assert.doesNotMatch(root.textContent, /অন্য ক্লাসের পাঠ/, 'another class never appears');
  ctx.click(ctx.$('#courseHub [data-course-chapter-toggle]'));
  assert.match(ctx.$('#courseHub').textContent, /পাঠ ১\.১/, 'opening a chapter lists its published content');
  assert.equal(ctx.$$('#courseHub .course-item-body').length >= 1, true);
});

test('a student can search inside the subject and switch sections', () => {
  ctx.type(ctx.$('#courseHub #courseSearch'), 'নেই এমন কিছু');
  return new Promise(resolve => setTimeout(() => {
    assert.match(ctx.$('#courseHub').textContent, /কিছু পাওয়া যায়নি/);
    ctx.type(ctx.$('#courseHub #courseSearch'), '');
    setTimeout(() => {
      ctx.click(ctx.$('#courseHub [data-course-section="notes"]'));
      assert.equal(ctx.$('#courseHub [data-course-section="notes"]').getAttribute('aria-selected'), 'true');
      assert.doesNotMatch(ctx.$('#courseHub').textContent, /পাঠ ১\.১/, 'the notes section is not the reading list');
      const bangla = ctx.$$('#courseHub [data-course-subject]').find(button => button.textContent.trim() === 'বাংলা');
      ctx.click(bangla);
      assert.match(ctx.$('#courseHub').textContent, /বাংলা পাঠ|এই বিষয়ে এখনো কিছু যোগ করা হয়নি/);
      ctx.click(ctx.$$('#courseHub [data-course-subject]').find(button => button.textContent.trim() === 'গণিত'));
      ctx.click(ctx.$('#courseHub [data-course-section="read"]'));
      resolve();
    }, 260);
  }, 260));
});

test('the exam and result sections reuse the existing examination data', () => {
  const now = Date.now();
  ctx.window.localStorage.setItem(KEYS.exams, JSON.stringify({
    version: 1,
    exams: [{
      id: 'E-HUB', code: 'M2610MT01', title: 'হাব পরীক্ষা', subject: 'গণিত', className: 'দশম শ্রেণি', group: '',
      type: 'mcq', status: 'completed', startAt: now - 7200000, endAt: now - 3600000, lateMinutes: 10,
      negative: 0, passPercent: 33, template: 'প্রশ্ন: ২+২?\nA: ৩\nB: ৪\nC: ৫\nD: ৬\nউত্তর: B',
      questions: [{ id: 'q1', uid: 'E-HUB-q1', examId: 'E-HUB', text: '২+২?', marks: 1, options: [{ id: 'A', text: '৩' }, { id: 'B', text: '৪' }, { id: 'C', text: '৫' }, { id: 'D', text: '৬' }], answer: 'B' }],
      teacherId: 'teacher.apc', teacherName: 'T', createdBy: 'T', createdByRole: 'teacher',
      participants: [{ id: STUDENT.id, name: STUDENT.name, className: STUDENT.className, group: '' }],
      resultsPublished: true, createdAt: now, updatedAt: now
    }],
    attempts: [{ id: 'A-HUB', examId: 'E-HUB', studentId: STUDENT.id, name: STUDENT.name, className: STUDENT.className, number: 1, status: 'submitted', startedAt: now - 7200000, finishedAt: now - 6300000, score: 1, correct: 1, wrong: 0, unanswered: 0, order: [{ id: 'q1', options: ['A', 'B', 'C', 'D'] }], answers: { q1: 'B' } }]
  }));
  hub.paint();
  ctx.click(ctx.$('#courseHub [data-course-section="exam"]'));
  assert.match(ctx.$('#courseHub').textContent, /হাব পরীক্ষা/, 'a published exam of this class is listed');
  ctx.click(ctx.$('#courseHub [data-course-section="results"]'));
  const results = ctx.$('#courseHub').textContent;
  assert.match(results, /হাব পরীক্ষা/);
  assert.match(results, /১/, 'the student’s own score is shown');
  /* Nothing hidden: a draft exam of the same class never shows up. */
  const stored = JSON.parse(ctx.window.localStorage.getItem(KEYS.exams));
  stored.exams.push({ ...stored.exams[0], id: 'E-DRAFT', title: 'খসড়া পরীক্ষা', status: 'draft' });
  ctx.window.localStorage.setItem(KEYS.exams, JSON.stringify(stored));
  hub.paint();
  ctx.click(ctx.$('#courseHub [data-course-section="exam"]'));
  assert.doesNotMatch(ctx.$('#courseHub').textContent, /খসড়া পরীক্ষা/);
});
