/* The student's learning hub (Courses).

   Class → Subject → Chapter → content, with the sections the school asked for:
   পড়ুন / নোট / গুরুত্বপূর্ণ / সাজেশন / প্রশ্ন / MCQ / পূর্বের প্রশ্ন / মডেল টেস্ট /
   পরীক্ষা / আমার ফলাফল.

   Three rules shape this screen:
     • The class comes from the student's own record, and the subjects are the
       ones Admin enabled for that class (js/academics.js) — nothing else is
       ever offered.
     • Only published content is shown. Drafts stay in the panel that wrote
       them.
     • Exams are NOT duplicated here: the পরীক্ষা tab lists the real exams from
       the Examination module and opens it, and আমার ফলাফল shows the marks that
       module already recorded for this student.
*/

import { loadNotices } from './office-data.js';
import { emptyState } from './ui-states.js';
import { classByName, subjectsForClass } from './academics.js';
import { KEYS, readRaw } from './database.js';
import { iconMarkup } from './icons.js';
import {
  COURSE_SECTIONS, COURSE_TYPES, listChapters, listCourseContent, typeLabel, typeOf
} from './course-content.js';
import { examMatchesClass, isStudentVisibleExam } from './exam-data.js';

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bn = value => String(value).replace(/\d/g, digit => BN_DIGITS[Number(digit)]);

function whenText(value) {
  const at = Date.parse(value || '');
  if (!Number.isFinite(at)) return '';
  try { return new Date(at).toLocaleDateString('bn-BD', { dateStyle: 'medium' }); }
  catch { return new Date(at).toLocaleDateString(); }
}

/* ---- Which exams belong to this student's class+subject ---------------------- */
function examDb() {
  try {
    const raw = readRaw(KEYS.exams);
    const parsed = typeof raw === 'string' && raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.exams) ? parsed : { exams: [], attempts: [] };
  } catch { return { exams: [], attempts: [] }; }
}

function examsFor(student, subjectName) {
  const db = examDb();
  return db.exams
    .filter(exam => isStudentVisibleExam(exam) && examMatchesClass(exam, student.className))
    .filter(exam => !subjectName || !exam.subject || exam.subject === subjectName)
    .sort((left, right) => (right.startAt || 0) - (left.startAt || 0));
}

function resultsFor(student, subjectName) {
  const db = examDb();
  const own = new Map();
  for (const attempt of db.attempts || []) {
    if (attempt.studentId !== student.id || attempt.status !== 'submitted') continue;
    own.set(attempt.examId, attempt);
  }
  return db.exams
    .filter(exam => own.has(exam.id))
    .filter(exam => !subjectName || !exam.subject || exam.subject === subjectName)
    .map(exam => ({ exam, attempt: own.get(exam.id) }))
    .sort((left, right) => (right.attempt.finishedAt || 0) - (left.attempt.finishedAt || 0));
}

/* ---- mount ------------------------------------------------------------------- */

/**
 * @param {object} options { getStudent }
 * @returns {{ paint: Function }}
 */
export function initCourseHub({ getStudent }) {
  const root = document.querySelector('#courseHub');
  if (!root) return { paint: () => {} };
  let subjectId = '';
  let section = 'read';
  let search = '';
  let openChapter = '';

  const student = () => getStudent?.() || { id: '', name: '', className: '' };

  function subjects() {
    const current = student();
    return subjectsForClass(current.className).map(item => ({ id: item.id, name: item.name }));
  }

  function selectedSubject() {
    const list = subjects();
    if (!list.length) return null;
    return list.find(item => item.id === subjectId) || list[0];
  }

  function recordsFor(subject) {
    const current = student();
    const academic = classByName(current.className);
    if (!subject || !academic) return [];
    return listCourseContent({
      classId: academic.id, subjectId: subject.id, publishedOnly: true, search, includeInactive: false
    });
  }

  /* ---- cards ---------------------------------------------------------------- */

  function contentCard(record) {
    const type = typeOf(record);
    const link = /^https?:\/\//i.test(record.attachmentUrl || '') ? record.attachmentUrl : '';
    const body = esc(record.content || '').replace(/\n/g, '<br>');
    return '<article class="course-item" data-course-item="' + esc(record.id) + '">' +
        '<header class="course-item-head">' +
          '<span class="course-item-icon" aria-hidden="true">' + iconMarkup(COURSE_TYPES[type].icon) + '</span>' +
          '<div><small class="course-item-type">' + esc(typeLabel(record)) + '</small>' +
          '<h4>' + esc(record.title) + '</h4></div>' +
        '</header>' +
        (record.description ? '<p class="course-item-desc">' + esc(record.description) + '</p>' : '') +
        (body ? '<div class="course-item-body">' + body + '</div>' : '') +
        (link
          ? '<a class="course-item-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' +
              (type === 'video' ? 'ভিডিও দেখুন' : type === 'pdf' ? 'PDF খুলুন' : 'সংযুক্তি খুলুন') +
              ' <svg class="resource-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>'
          : '') +
        '<small class="course-item-when">' + esc(whenText(record.updatedAt || record.createdAt)) + '</small>' +
      '</article>';
  }

  function chapterBlock(chapter, items) {
    const open = openChapter === chapter.id;
    return '<section class="course-chapter' + (open ? ' is-open' : '') + '" data-course-chapter="' + esc(chapter.id) + '">' +
        '<button class="course-chapter-toggle" type="button" data-course-chapter-toggle="' + esc(chapter.id) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="course-chapter-copy"><strong>' + esc(chapter.title) + '</strong>' +
          '<small>' + bn(items.length) + 'টি কনটেন্ট</small></span>' +
          '<span class="course-chapter-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>' +
        '</button>' +
        (chapter.description ? '<p class="course-chapter-note">' + esc(chapter.description) + '</p>' : '') +
        (open ? '<div class="course-chapter-body">' + (items.map(contentCard).join('') || emptyState({ icon: 'book', title: 'এই চ্যাপ্টারে এখনো কিছু যোগ করা হয়নি।' })) + '</div>' : '') +
      '</section>';
  }

  function examSection(subject) {
    const current = student();
    const exams = examsFor(current, subject?.name);
    if (!exams.length) return emptyState({ icon: 'exam', title: 'এই বিষয়ে এখন কোনো পরীক্ষা প্রকাশ হয়নি।' });
    return exams.map(exam => {
      const when = exam.startAt ? new Date(exam.startAt) : null;
      const label = when && Number.isFinite(when.getTime())
        ? when.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })
        : '';
      return '<article class="course-item course-item-exam">' +
          '<header class="course-item-head"><span class="course-item-icon" aria-hidden="true">' + iconMarkup('icon-exam') + '</span>' +
          '<div><small class="course-item-type">পরীক্ষা</small><h4>' + esc(exam.title || exam.subject || 'পরীক্ষা') + '</h4></div></header>' +
          (label ? '<p class="course-item-desc">' + esc(label) + '</p>' : '') +
          '<button class="mini-btn primary" type="button" data-view="exams">পরীক্ষা দাও</button>' +
        '</article>';
    }).join('');
  }

  function resultSection(subject) {
    const current = student();
    const rows = resultsFor(current, subject?.name);
    if (!rows.length) return emptyState({ icon: 'result', title: 'এখনো কোনো ফলাফল প্রকাশ হয়নি।' });
    return rows.map(({ exam, attempt }) => '<article class="course-item">' +
        '<header class="course-item-head"><span class="course-item-icon" aria-hidden="true">' + iconMarkup('icon-result') + '</span>' +
        '<div><small class="course-item-type">ফলাফল</small><h4>' + esc(exam.title || exam.subject || 'পরীক্ষা') + '</h4></div></header>' +
        '<p class="course-result-marks">প্রাপ্ত নম্বর: <strong>' + bn(attempt.score ?? 0) + '</strong> / ' + bn(attempt.total ?? '') + '</p>' +
      '</article>').join('');
  }

  function noticeStrip() {
    const current = student();
    let notices = [];
    try { notices = loadNotices() || []; } catch { notices = []; }
    const mine = notices
      .filter(notice => (notice.status || 'published') === 'published')
      .filter(notice => !notice.className || notice.className === current.className)
      .slice(0, 2);
    if (!mine.length) return '';
    return '<div class="course-notices"><p class="eyebrow">নোটিশ</p>' +
        mine.map(notice => '<button type="button" class="course-notice" data-course-notice>' +
          '<strong>' + esc(notice.title) + '</strong><small>' + esc(whenText(notice.createdAt)) + '</small></button>').join('') +
      '</div>';
  }

  /* ---- paint ---------------------------------------------------------------- */

  function paint() {
    const current = student();
    const list = subjects();
    const subject = selectedSubject();
    subjectId = subject?.id || '';
    const records = recordsFor(subject);
    const chapters = listChapters(classByName(current.className)?.id || '', subjectId, { publishedOnly: true, search });
    const items = records.filter(record => typeOf(record) !== 'chapter');
    const byChapter = new Map(chapters.map(chapter => [chapter.id, []]));
    const loose = [];
    for (const item of items) {
      if (byChapter.has(item.chapterId)) byChapter.get(item.chapterId).push(item);
      else loose.push(item);
    }
    const inSection = list => (section === 'read' ? list : list.filter(record => COURSE_TYPES[typeOf(record)].section === section));
    const counts = new Map(COURSE_SECTIONS.map(entry => [entry.key, 0]));
    for (const record of [...chapters, ...items]) {
      const key = typeOf(record) === 'chapter' ? 'read' : COURSE_TYPES[typeOf(record)].section;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const body = () => {
      if (section === 'exam') return examSection(subject);
      if (section === 'results') return resultSection(subject);
      const visibleChapters = chapters.filter(chapter => inSection(byChapter.get(chapter.id) || []).length || section === 'read');
      const blocks = visibleChapters.map(chapter => chapterBlock(chapter, inSection(byChapter.get(chapter.id) || [])));
      const looseItems = inSection(loose);
      const empty = !blocks.length && !looseItems.length;
      if (empty) {
        return '<div class="notice-empty course-empty"><span class="notice-empty-art" aria-hidden="true">' + iconMarkup('icon-book') + '</span>' +
            '<strong>' + (search ? 'কিছু পাওয়া যায়নি' : 'এই বিষয়ে এখনো কিছু যোগ করা হয়নি') + '</strong>' +
            '<p>' + (search ? 'অন্য শব্দ দিয়ে খুঁজে দেখুন।' : 'শিক্ষক কনটেন্ট যোগ করলে এখানে দেখা যাবে।') + '</p></div>';
      }
      return blocks.join('') + (looseItems.length ? '<div class="course-loose">' + looseItems.map(contentCard).join('') + '</div>' : '');
    };

    root.innerHTML =
      '<div class="course-head">' +
        '<div class="course-class"><small>শ্রেণি</small><strong>' + esc(current.className || 'শ্রেণি যোগ হয়নি') + '</strong></div>' +
        '<label class="course-search"><span class="course-search-icon" aria-hidden="true">' + iconMarkup('icon-search') + '</span>' +
          '<input type="search" id="courseSearch" placeholder="এই বিষয়ের ভেতরে খুঁজুন" value="' + esc(search) + '"></label>' +
      '</div>' +
      (list.length
        ? '<div class="course-subjects chip-row" role="tablist" aria-label="বিষয়">' + list.map(item =>
            '<button class="chip' + (item.id === subjectId ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (item.id === subjectId ? 'true' : 'false') + '" data-course-subject="' + esc(item.id) + '">' + esc(item.name) + '</button>').join('') + '</div>'
        : emptyState({ icon: 'classes', title: 'Admin এখনো এই শ্রেণির কোনো বিষয় চালু করেননি।' })) +
      noticeStrip() +
      '<div class="course-sections chip-row" role="tablist" aria-label="বিভাগ">' + COURSE_SECTIONS.map(entry =>
        '<button class="chip' + (entry.key === section ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (entry.key === section ? 'true' : 'false') + '" data-course-section="' + entry.key + '">' +
          esc(entry.label) + (entry.key in Object.fromEntries(counts) && counts.get(entry.key) ? ' <span class="chip-count">' + bn(counts.get(entry.key)) + '</span>' : '') +
        '</button>').join('') + '</div>' +
      '<div class="course-list" id="courseList">' + body() + '</div>';
  }

  root.addEventListener('click', event => {
    const subject = event.target.closest('[data-course-subject]');
    if (subject) { subjectId = subject.dataset.courseSubject; openChapter = ''; paint(); return; }
    const tab = event.target.closest('[data-course-section]');
    if (tab) { section = tab.dataset.courseSection; openChapter = ''; paint(); return; }
    const chapter = event.target.closest('[data-course-chapter-toggle]');
    if (chapter) {
      const id = chapter.dataset.courseChapterToggle;
      openChapter = openChapter === id ? '' : id;
      paint();
      return;
    }
    const notice = event.target.closest('[data-course-notice]');
    if (notice) {
      document.getElementById('notificationButton')?.click();
    }
  });
  root.addEventListener('input', event => {
    if (event.target.id !== 'courseSearch') return;
    search = event.target.value.trim();
    clearTimeout(root.dataset.searchTimer);
    const timer = setTimeout(() => {
      paint();
      const box = root.querySelector('#courseSearch');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }, 220);
    root.dataset.searchTimer = timer;
  });
  window.addEventListener('apc-course-updated', paint);
  window.addEventListener('storage', event => {
    if (!event.key || event.key === KEYS.courseContent || event.key === KEYS.notices || event.key === KEYS.exams) paint();
  });

  paint();
  return { paint };
}
