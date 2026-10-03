/* The learning-library editor, shared by the Teacher and Manager panels.

   It is one form and one list:
     • class → subject → chapter cascades, all from js/academics.js, so a
       subject Admin switched off is never offered;
     • a Teacher only ever sees the classes and subjects assigned to them
       (js/teacher-assignments.js), while a Manager sees the whole permitted
       structure;
     • every kind in js/course-content.js can be written (no dead buttons for a
       kind the UI does not support yet);
     • publish/unpublish, edit and archive — never a hard delete.

   The student app reads the same records through js/course-hub.js. */

import { iconMarkup } from './icons.js';
import { classByName, subjectsForClass } from './academics.js';
import { enabledClasses } from './config.js';
import { assignedClasses, subjectsForTeacherClass } from './teacher-assignments.js';
import {
  COURSE_TYPES, archiveCourseRecord, contentById, listChapters, listCourseContent,
  saveCourseRecord, setContentPublished, typeLabel, typeOf
} from './course-content.js';

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bn = value => String(value).replace(/\d/g, digit => BN_DIGITS[Number(digit)]);

const WRITABLE_TYPES = Object.entries(COURSE_TYPES)
  .filter(([type]) => type !== 'exam')          // exams belong to the Examination module
  .map(([type, meta]) => ({ type, label: meta.label }));

const $ = (root, selector) => root.querySelector(selector);

/**
 * @param {object} options { mount, role: 'teacher' | 'manager', actor, toast }
 * @returns {{ paint: Function }}
 */
export function initCourseEditor({ mount, role = 'teacher', actor = '', toast = () => {} } = {}) {
  const root = typeof mount === 'string' ? document.querySelector(mount) : mount;
  if (!root || root.dataset.ready === '1') return { paint: () => {} };
  root.dataset.ready = '1';
  let editing = null;
  let pickedClass = '';
  let pickedSubject = '';
  let status = '';

  /* The Teacher's own username decides which classes they may write for. It is
     read from the same stored account every other teacher screen uses. */
  let teacherUser = '';
  /* assignedClasses() already answers with class names. */
  const assignedClassNames = () => (role === 'teacher' ? assignedClasses(teacherUser) : null);
  if (role === 'teacher') {
    import('./staff-auth.js')
      .then(module => module.readStaffAccount('teacher'))
      .then(account => { teacherUser = String(account?.username || ''); paint(); })
      .catch(error => console.warn('[Active Plus] course editor without a teacher account:', error?.name || 'unknown'));
  }

  /* Teacher: only the classes Manager assigned. Manager: the whole
     Admin-configured structure (Academic Setup), never a hard-coded list. */
  function classOptions() {
    const names = role === 'teacher' ? (assignedClassNames() || []) : [...enabledClasses];
    return names.map(name => classByName(name)).filter(Boolean);
  }

  function subjectOptions(className) {
    if (!className) return [];
    if (role === 'teacher') {
      /* Only the subjects Manager assigned to *this* teacher in *this* class —
         never every subject Academic Setup happens to enable for the class. */
      const assigned = subjectsForTeacherClass(teacherUser, className);
      return assigned.filter(name => subjectsForClass(className).some(subject => subject.name === name));
    }
    return subjectsForClass(className).map(subject => subject.name);
  }

  function typeOptions(selected) {
    return WRITABLE_TYPES
      .map(({ type, label }) => `<option value="${esc(type)}"${type === selected ? ' selected' : ''}>${esc(label)}</option>`)
      .join('');
  }

  function card(record) {
    const type = typeOf(record);
    const published = record.published === true;
    const archived = record.active === false;
    return `<article class="course-manage-card${archived ? ' is-archived' : ''}" data-course-record="${esc(record.id)}">
      <header><span class="course-item-icon" aria-hidden="true">${iconMarkup(COURSE_TYPES[type].icon)}</span>
        <div><small>${esc(typeLabel(record))}</small><h4>${esc(record.title)}</h4>
        <p class="course-manage-meta">${published ? 'প্রকাশিত' : 'খসড়া'}${archived ? ' • সংরক্ষণাগারভুক্ত' : ''} • ${esc(record.id)}</p></div>
      </header>
      ${record.description ? `<p>${esc(record.description)}</p>` : ''}
      <div class="course-manage-actions">
        <button class="mini-btn" type="button" data-course-edit="${esc(record.id)}">সম্পাদনা</button>
        <button class="mini-btn ${published ? 'reject' : 'approve'}" type="button" data-course-publish="${esc(record.id)}" data-next="${published ? 'off' : 'on'}">${published ? 'প্রকাশ বাতিল' : 'প্রকাশ করুন'}</button>
        ${archived ? '' : `<button class="mini-btn reject" type="button" data-course-archive="${esc(record.id)}">সংরক্ষণাগারে নিন</button>`}
      </div>
    </article>`;
  }

  function paint() {
    const classes = classOptions();
    if (!classes.some(item => item.id === pickedClass)) pickedClass = classes[0]?.id || '';
    const className = classByName(classes.find(item => item.id === pickedClass)?.name)?.name || classes[0]?.name || '';
    const subjects = subjectOptions(className);
    if (!subjects.includes(pickedSubject)) pickedSubject = subjects[0] || '';
    const record = editing ? contentById(editing) : null;
    if (record) {
      pickedClass = record.classId;
      const classRecord = classes.find(item => item.id === record.classId);
      const subjectRecord = subjectsForClass(classRecord?.name || '').find(item => item.id === record.subjectId);
      pickedSubject = subjectRecord?.name || pickedSubject;
    }
    const academic = classByName(className);
    const subjectRecord = subjectsForClass(className).find(item => item.name === pickedSubject);
    const chapters = academic && subjectRecord ? listChapters(academic.id, subjectRecord.id, { includeInactive: true }) : [];
    const listed = academic && subjectRecord
      ? listCourseContent({ classId: academic.id, subjectId: subjectRecord.id, includeInactive: true })
      : [];
    const isChapter = record && typeOf(record) === 'chapter';

    root.innerHTML = `
      <div class="course-manage">
        <form class="course-manage-form admin-card" data-course-form>
          <header class="admin-card-head"><div><p class="eyebrow">Learning library</p>
            <h2>${record ? 'কনটেন্ট সম্পাদনা' : 'নতুন কনটেন্ট'}</h2></div>
            ${record ? '<button class="mini-btn" type="button" data-course-cancel>নতুন কিছু লিখুন</button>' : ''}</header>
          ${classes.length ? '' : '<p class="admin-empty">আপনার জন্য এখনো কোনো ক্লাস বরাদ্দ হয়নি — Manager থেকে ক্লাস ও বিষয় নিন।</p>'}
          <label>ক্লাস<select name="className"${classes.length ? '' : ' disabled'}>${classes.map(item => `<option value="${esc(item.name)}"${item.name === className ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
          <label>বিষয়<select name="subject"${subjects.length ? '' : ' disabled'}>${subjects.map(name => `<option value="${esc(name)}"${name === pickedSubject ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
          <label>ধরন<select name="type">${typeOptions(record ? typeOf(record) : 'lesson')}</select></label>
          <label>চ্যাপ্টার<select name="chapterId"${isChapter ? ' disabled' : ''}>
            <option value="">চ্যাপ্টার ছাড়া</option>
            ${chapters.map(chapter => `<option value="${esc(chapter.id)}"${record?.chapterId === chapter.id ? ' selected' : ''}>${esc(chapter.title)}</option>`).join('')}
          </select></label>
          <label>শিরোনাম<input name="title" maxlength="160" required value="${esc(record?.title || '')}"></label>
          <label>সংক্ষিপ্ত বর্ণনা<input name="description" maxlength="600" value="${esc(record?.description || '')}"></label>
          <label>মূল লেখা<textarea name="content" rows="5" maxlength="8000">${esc(record?.content || '')}</textarea></label>
          <label>সংযুক্তি লিংক (ভিডিও/PDF)<input name="attachmentUrl" maxlength="1000" inputmode="url" value="${esc(record?.attachmentUrl || '')}"></label>
          <label class="course-manage-publish"><input type="checkbox" name="published"${record?.published === true ? ' checked' : ''}> শিক্ষার্থীদের জন্য প্রকাশ করুন</label>
          <button class="admin-btn primary" type="submit"${classes.length && subjects.length ? '' : ' disabled'}>${record ? 'পরিবর্তন সংরক্ষণ করুন' : 'সংরক্ষণ করুন'}</button>
          <p class="form-note" data-course-status role="status">${esc(status)}</p>
        </form>
        <div class="course-manage-list">
          <h2 class="exam-section-title">এই বিষয়ের কনটেন্ট <span>${bn(listed.length)}</span></h2>
          ${listed.length ? listed.map(card).join('') : '<p class="admin-empty">এই বিষয়ে এখনো কিছু যোগ করা হয়নি।</p>'}
        </div>
      </div>`;
  }

  function say(message, isError = false) {
    status = message;
    const line = $(root, '[data-course-status]');
    if (line) { line.textContent = message; line.classList.toggle('admin-error-text', isError); }
    if (isError) toast(message, true);
  }

  root.addEventListener('change', event => {
    if (event.target.name === 'className') { pickedClass = classByName(event.target.value)?.id || ''; pickedSubject = ''; editing = null; paint(); return; }
    if (event.target.name === 'subject') { pickedSubject = event.target.value; editing = null; paint(); return; }
    if (event.target.name === 'type') { paint(); return; }
  });

  root.addEventListener('submit', event => {
    const form = event.target.closest('[data-course-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const className = String(data.get('className') || '');
    const subjectName = String(data.get('subject') || '');
    const academic = classByName(className);
    const subject = subjectsForClass(className).find(item => item.name === subjectName);
    if (!academic || !subject) { say('আগে ক্লাস ও বিষয় নির্বাচন করুন।', true); return; }
    if (role === 'teacher' && !subjectOptions(className).includes(subjectName)) {
      say('এই ক্লাস বা বিষয় আপনার জন্য বরাদ্দ নয় — Manager-এর সঙ্গে কথা বলুন।', true);
      return;
    }
    try {
      const saved = saveCourseRecord({
        id: editing || '',
        classId: academic.id,
        subjectId: subject.id,
        chapterId: String(data.get('chapterId') || ''),
        type: String(data.get('type') || 'lesson'),
        title: String(data.get('title') || ''),
        description: String(data.get('description') || ''),
        content: String(data.get('content') || ''),
        attachmentUrl: String(data.get('attachmentUrl') || ''),
        thumbnail: '',
        published: data.get('published') === 'on',
        createdBy: actor,
        active: true
      }, { actor });
      editing = null;
      say(`${saved.id} সংরক্ষিত হয়েছে।`);
      toast('কনটেন্ট সংরক্ষিত হয়েছে।');
      paint();
      announce();
    } catch (error) {
      say(error?.message || 'সংরক্ষণ করা যায়নি।', true);
    }
  });

  root.addEventListener('click', event => {
    const edit = event.target.closest('[data-course-edit]');
    if (edit) { editing = edit.dataset.courseEdit; paint(); return; }
    const cancel = event.target.closest('[data-course-cancel]');
    if (cancel) { editing = null; paint(); return; }
    const publish = event.target.closest('[data-course-publish]');
    if (publish) {
      const next = publish.dataset.next === 'on';
      const saved = setContentPublished(publish.dataset.coursePublish, next);
      say(saved ? (next ? `${saved.id} প্রকাশিত হয়েছে।` : `${saved.id} প্রকাশ বাতিল হয়েছে।`) : 'পরিবর্তন হয়নি।', !saved);
      paint();
      announce();
      return;
    }
    const archive = event.target.closest('[data-course-archive]');
    if (archive) {
      const saved = archiveCourseRecord(archive.dataset.courseArchive);
      say(saved ? `${saved.id} সংরক্ষণাগারে নেওয়া হয়েছে — মুছে ফেলা হয়নি।` : 'পরিবর্তন হয়নি।', !saved);
      paint();
      announce();
    }
  });

  function announce() {
    try { window.dispatchEvent(new CustomEvent('apc-course-updated', { detail: { role } })); } catch { /* headless */ }
  }

  paint();
  return { paint };
}
