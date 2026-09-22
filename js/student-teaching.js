/* Published teacher work, scoped to the signed-in student's class and group.
   No teacher editing controls are mounted in the student app. */
import { toBanglaNumber as bn, showFeedback } from './ui.js';
import { teachingRepository, publishedForStudent, ACTIVITY_TYPES, PROGRESS_LABELS, escapeText as esc, displayDate, safeResourceURL, watchTeachingData } from './teaching-data.js';

export function initStudentTeaching({ getStudent }) {
  let db = { activities: [] }, filter = 'all', request = 0;
  const pending = new Set();
  const $ = selector => document.querySelector(selector);
  const num = value => esc(bn(value));
  function card(a, student) {
    const progress = a.progress[student.id];
    const link = safeResourceURL(a.resourceURL);
    const outcome = a.type === 'exam' && progress ? `প্রাপ্ত নম্বর: ${bn(progress.value)} / ${bn(a.totalMarks)}` : progress ? PROGRESS_LABELS[progress.value] : '';
    const canComplete = a.type === 'homework' && !['done', 'reviewed'].includes(progress?.value);
    const complete = a.type === 'homework' && ['done', 'reviewed'].includes(progress?.value);
    const status = a.type === 'homework' ? (complete ? 'সম্পন্ন' : 'কাজ বাকি') : a.type === 'exam' ? (progress ? 'ফলাফল দেওয়া হয়েছে' : 'মূল্যায়ন') : a.type === 'routine' ? 'ক্লাস রুটিন' : 'পড়ার উপকরণ';
    return `<article class="teaching-card learning-card learning-${esc(a.type)}" data-learning-id="${esc(a.id)}">
      <div class="teaching-card-head"><span class="teaching-kind">${ACTIVITY_TYPES[a.type].label}</span><span class="learning-state${complete ? ' is-complete' : ''}">${status}</span></div>
      <h3>${esc(a.title)}</h3>
      <p class="learning-subject">${esc(a.subject)} <span>• ${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}</span></p>
      ${a.date || a.room || a.totalMarks ? `<div class="learning-meta">
        ${a.date ? `<div><small>${a.type === 'homework' ? 'জমার শেষ সময়' : a.type === 'routine' ? 'ক্লাসের সময়' : 'নির্ধারিত তারিখ'}</small><strong>${esc(displayDate(a.date))}</strong>${a.time ? `<span>${num(a.time)}${a.duration ? ' • ' + num(a.duration) + ' মিনিট' : ''}</span>` : ''}</div>` : ''}
        ${a.room ? `<div><small>স্থান</small><strong>${esc(a.room)}</strong></div>` : ''}
        ${a.totalMarks ? `<div><small>পূর্ণমান</small><strong>${num(a.totalMarks)}</strong></div>` : ''}
      </div>` : ''}
      <p class="teaching-body">${esc(a.details)}</p>
      ${outcome ? `<p class="learning-outcome">${esc(outcome)}</p>` : ''}
      <div class="learning-teacher"><span aria-hidden="true">${esc(Array.from(a.teacherName || 'শ')[0])}</span><small>শিক্ষক • ${esc(a.teacherName)}</small></div>
      ${link || canComplete ? `<div class="learning-card-actions">
        ${link ? `<a class="teaching-resource" href="${esc(link)}" target="_blank" rel="noopener noreferrer">সহায়ক উপকরণ খুলুন <span aria-hidden="true">↗</span></a>` : ''}
        ${canComplete ? `<div class="teaching-actions"><button class="primary" type="button" data-complete-homework="${esc(a.id)}" ${pending.has(a.id) ? 'disabled' : ''}>${pending.has(a.id) ? 'সংরক্ষণ হচ্ছে…' : 'কাজ সম্পন্ন হয়েছে জানাও'}</button></div><small class="learning-action-note">এটি শুধু সম্পন্ন হওয়ার খবর; খাতা/ফাইল জমা নয়।</small>` : ''}
      </div>` : ''}
    </article>`;
  }
  function render() {
    const student = getStudent();
    const activities = publishedForStudent(db.activities, student).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const visible = activities.filter(a => filter === 'all' || a.type === filter);
    $('#learningList').innerHTML = visible.map(a => card(a, student)).join('') || '<p class="teacher-empty">এই বিভাগে তোমার জন্য এখনও কোনো কাজ প্রকাশ হয়নি।</p>';
    $('#learningCount').textContent = `${bn(activities.length)}টি প্রকাশিত কাজ • ${student.className}`;
    $('#teacherHomeLink').hidden = activities.length === 0;
    const homework = activities.filter(a => a.type === 'homework');
    const done = homework.filter(a => ['done', 'reviewed'].includes(a.progress[student.id]?.value)).length;
    const remaining = homework.length - done;
    $('#teacherHomeCount').textContent = remaining ? `${bn(remaining)}টি বাড়ির কাজ বাকি • সব কাজ দেখো` : `${bn(activities.length)}টি কাজ ও উপকরণ • খুলে দেখো`;
    $('#learningSummary').innerHTML = `<div><strong>${bn(activities.length)}</strong><span>মোট কাজ</span></div><div class="learning-summary-pending"><strong>${bn(remaining)}</strong><span>বাড়ির কাজ বাকি</span></div><div><strong>${bn(done)}</strong><span>বাড়ির কাজ সম্পন্ন</span></div>`;
    $('#learningFilters').querySelectorAll('button').forEach(button => {
      const type = button.dataset.learningFilter;
      const count = type === 'all' ? activities.length : activities.filter(a => a.type === type).length;
      const label = type === 'all' ? 'সব' : type === 'routine' ? 'রুটিন' : ACTIVITY_TYPES[type].label;
      button.innerHTML = `${label} <span class="learning-filter-count">${bn(count)}</span>`;
    });
    const routines = activities.filter(a => a.type === 'routine').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    $('#teacherRoutineBoard').hidden = routines.length === 0;
    $('#teacherRoutineList').innerHTML = routines.map(a => card(a, student)).join('');
    const exams = activities.filter(a => a.type === 'exam' && a.progress[student.id]);
    $('#teacherResultsBoard').hidden = exams.length === 0;
    $('#teacherResultsList').innerHTML = exams.map(a => card(a, student)).join('');
  }
  async function refresh() {
    const current = ++request;
    try {
      const next = await teachingRepository.list();
      if (current !== request) return;
      db = next; $('#learningError').hidden = true; render();
    } catch {
      if (current !== request) return;
      db = { activities: [] }; render();
      $('#learningError').hidden = false;
      $('#learningError').textContent = 'শিক্ষকের কাজ লোড হয়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করো।';
    }
  }
  $('#learningFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-learning-filter]'); if (!button) return;
    filter = button.dataset.learningFilter;
    $('#learningFilters').querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el === button))); render();
  });
  $('#learningList').addEventListener('click', async event => {
    const button = event.target.closest('[data-complete-homework]'); if (!button) return;
    const id = button.dataset.completeHomework; if (pending.has(id)) return;
    pending.add(id); button.disabled = true; button.textContent = 'সংরক্ষণ হচ্ছে…';
    try { await teachingRepository.markHomeworkDone(id, getStudent()); showFeedback('কাজ সম্পন্ন হওয়ার খবর সংরক্ষিত হয়েছে'); }
    catch { showFeedback('সংরক্ষণ হয়নি। আবার চেষ্টা করো।'); }
    finally { pending.delete(id); await refresh(); }
  });
  watchTeachingData(refresh);
  refresh();
  return refresh;
}
