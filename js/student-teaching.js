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
    return `<article class="teaching-card" data-learning-id="${esc(a.id)}">
      <div class="teaching-card-head"><span class="teaching-kind">${ACTIVITY_TYPES[a.type].label}</span><small>${esc(a.teacherName)}</small></div>
      <h3>${esc(a.title)}</h3><small>${esc(a.subject)} • ${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}</small>
      <p>${a.type === 'homework' ? 'জমার শেষ সময়: ' : ''}${esc(displayDate(a.date))}${a.time ? ' • ' + num(a.time) : ''}${a.duration ? ' • ' + num(a.duration) + ' মিনিট' : ''}</p>
      ${a.room ? `<p>স্থান: ${esc(a.room)}</p>` : ''}${a.totalMarks ? `<small>পূর্ণমান: ${num(a.totalMarks)}</small>` : ''}
      <p class="teaching-body">${esc(a.details)}</p>
      ${link ? `<a class="teaching-resource" href="${esc(link)}" target="_blank" rel="noopener noreferrer">সহায়ক উপকরণ খুলুন ↗</a>` : ''}
      ${outcome ? `<p class="learning-outcome">${esc(outcome)}</p>` : ''}
      ${canComplete ? `<div class="teaching-actions"><button type="button" data-complete-homework="${esc(a.id)}" ${pending.has(a.id) ? 'disabled' : ''}>${pending.has(a.id) ? 'সংরক্ষণ হচ্ছে…' : 'কাজ সম্পন্ন হয়েছে জানাও'}</button></div><small>এটি শুধু সম্পন্ন হওয়ার খবর; খাতা/ফাইল জমা নয়।</small>` : ''}
    </article>`;
  }
  function render() {
    const student = getStudent();
    const activities = publishedForStudent(db.activities, student).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const visible = activities.filter(a => filter === 'all' || a.type === filter);
    $('#learningList').innerHTML = visible.map(a => card(a, student)).join('') || '<p class="teacher-empty">এই বিভাগে তোমার জন্য এখনও কোনো কাজ প্রকাশ হয়নি।</p>';
    $('#learningCount').textContent = `${bn(activities.length)}টি প্রকাশিত কাজ • ${student.className}`;
    $('#teacherHomeLink').hidden = activities.length === 0;
    $('#teacherHomeCount').textContent = `${bn(activities.length)}টি কাজ • কোর্সে দেখো`;
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
