import { prepareDemoData } from './demo-data.js';
import { initDemoForms } from './demo-forms.js';
import { enabledClasses } from './config.js';
import { toBanglaNumber as bn } from './ui.js';
import { initExamManager } from './exam-manager.js';
import { initFixedShell } from './fixed-shell.js';
import { registerServiceWorker } from './service-worker.js';
import { teachingRepository, DEMO_TEACHER, ACTIVITY_TYPES, PROGRESS_LABELS, escapeText as esc, todayISO, displayDate, safeResourceURL, matchesStudent, searchTeachingStudents, watchTeachingData } from './teaching-data.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { db: { activities: [] }, students: [], view: 'home', status: 'all', ready: false, busy: false };
let modalTrigger, toastTimer;
const demoWarnings = await prepareDemoData();
initFixedShell();
initExamManager('#teacherExamWorkspace', 'teacher');
registerServiceWorker();

function toast(message) {
  $('.admin-toast')?.remove();
  const el = document.createElement('p'); el.className = 'admin-toast'; el.setAttribute('role', 'status'); el.textContent = message;
  document.body.append(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3200);
}
const own = () => state.db.activities.filter(a => a.teacherId === DEMO_TEACHER.id);
const classOptions = value => enabledClasses.map(c => `<option ${c === value ? 'selected' : ''}>${esc(c)}</option>`).join('');
function activityMeta(a) {
  const date = `${displayDate(a.date)}${a.time ? ' • ' + bn(a.time) : ''}`;
  return `${a.type === 'homework' ? 'শেষ সময়: ' : ''}${date}${a.duration ? ' • ' + bn(a.duration) + ' মিনিট' : ''}${a.totalMarks ? ' • পূর্ণমান ' + bn(a.totalMarks) : ''}`;
}
function recordCard(a) {
  return `<article class="teaching-card" data-activity-id="${esc(a.id)}">
    <div class="teaching-card-head"><span class="teaching-kind">${ACTIVITY_TYPES[a.type].label}</span><span class="teaching-status ${a.status}">${a.status === 'published' ? 'প্রকাশিত' : 'খসড়া'}</span></div>
    <h3>${esc(a.title)}</h3><small>${esc(a.subject)} • ${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}</small>
    <p>${esc(activityMeta(a))}</p>${a.room ? `<small>স্থান: ${esc(a.room)}</small>` : ''}
    <p class="teaching-preview">${esc(a.details)}</p>
    <div class="teaching-actions">
      <button type="button" data-record-action="detail" data-id="${esc(a.id)}">বিস্তারিত</button>
      <button type="button" data-record-action="edit" data-id="${esc(a.id)}">সম্পাদনা</button>
      ${a.status === 'published' && ACTIVITY_TYPES[a.type].progress ? `<button class="primary" type="button" data-record-action="progress" data-id="${esc(a.id)}">${ACTIVITY_TYPES[a.type].progress}</button>` : ''}
      <button class="danger" type="button" data-record-action="delete" data-id="${esc(a.id)}">মুছুন</button>
    </div></article>`;
}
function renderHome() {
  $('#teacherToday').textContent = displayDate(todayISO());
  const records = own();
  $('#teacherPublishedCount').textContent = bn(records.filter(a => a.status === 'published').length);
  $('#teacherDraftCount').textContent = bn(records.filter(a => a.status === 'draft').length);
  $('#teacherRecent').innerHTML = records.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(recordCard).join('') || '<p class="teacher-empty">এখনও কোনো কাজ যোগ করেননি। উপরের বাটন থেকে প্রথম কাজটি তৈরি করুন।</p>';
}
function renderRecords() {
  if (!ACTIVITY_TYPES[state.view]) return;
  $('#teacherRecordsTitle').textContent = ACTIVITY_TYPES[state.view].plural;
  $('#teacherRecordsBack').hidden = state.view !== 'suggestion';
  $('#teacherOnlineExamHint').hidden = state.view !== 'exam';
  const query = $('#teacherRecordSearch').value.trim().toLocaleLowerCase();
  const className = $('#teacherClassFilter').value;
  const list = own().filter(a => a.type === state.view && (state.status === 'all' || a.status === state.status) && (className === 'all' || a.className === className) && `${a.title} ${a.subject}`.toLocaleLowerCase().includes(query));
  list.sort(state.view === 'routine' ? (a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) : (a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#teacherRecordCount').textContent = `${bn(list.length)}টি ${ACTIVITY_TYPES[state.view].label}`;
  $('#teacherRecordList').innerHTML = list.map(recordCard).join('') || '<p class="teacher-empty">কোনো কাজ পাওয়া যায়নি। নতুন কাজ যোগ করুন অথবা ফিল্টার বদলান।</p>';
}
function renderStudents() {
  const className = $('#teacherStudentClass').value;
  if (!$('#teacherStudentSearch').value.trim()) {
    $('#teacherStudentCount').textContent = '';
    $('#teacherStudentList').innerHTML = '<p class="teacher-empty">শিক্ষার্থী খুঁজতে নাম, Student ID বা মোবাইল লিখুন।</p>';
    return;
  }
  const students = searchTeachingStudents(state.students, $('#teacherStudentSearch').value).filter(s => className === 'all' || s.className === className);
  $('#teacherStudentCount').textContent = `${bn(students.length)} জন অনুমোদিত শিক্ষার্থী`;
  $('#teacherStudentList').innerHTML = students.map(s => `<article class="teaching-card"><span class="student-avatar" aria-hidden="true">${esc(s.name.charAt(0))}</span><h3>${esc(s.name)}</h3><small>Student ID: ${esc(s.id)}</small><p>${esc(s.className)} • ${esc(s.group || '—')}</p><small>মোবাইল: ${esc(s.mobile || s.studentMobile || '—')}</small><div class="teaching-actions"><button type="button" data-student-detail="${esc(s.id)}">শেখার অগ্রগতি</button></div></article>`).join('') || '<p class="teacher-empty">কোনো শিক্ষার্থী পাওয়া যায়নি</p>';
}
function render() { renderHome(); renderRecords(); renderStudents(); }
function setView(view) {
  if (!['home', 'more', 'students', 'online-exams', ...Object.keys(ACTIVITY_TYPES)].includes(view)) return;
  state.view = view;
  const panel = ACTIVITY_TYPES[view] ? 'teacherRecords' : { home: 'teacherHome', more: 'teacherMore', students: 'teacherStudents', 'online-exams': 'teacherOnlineExams' }[view];
  $$('.teacher-view').forEach(el => { el.hidden = el.id !== panel; });
  $$('.admin-bottom [data-teacher-view]').forEach(el => {
    const active = el.dataset.teacherView === (['suggestion', 'students', 'online-exams'].includes(view) ? 'more' : view);
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#teacherMain').scrollTo({ top: 0, behavior: 'instant' }); render();
}
async function reload() {
  try {
    const [db, students] = await Promise.all([teachingRepository.list(), teachingRepository.listStudents()]);
    state.db = db; state.students = students; state.ready = true;
    $('#teacherDataError').hidden = true; render(); return true;
  } catch {
    state.ready = false; $('#teacherDataError').hidden = false; return false;
  }
}
function openModal(title, html) {
  if ($('#teacherModalBackdrop').hidden) modalTrigger = document.activeElement;
  $('#teacherModalTitle').textContent = title;
  $('#teacherModalBody').innerHTML = html;
  $('#teacherModalBackdrop').hidden = false; document.body.classList.add('admin-modal-open');
  $('#teacherModalBackdrop .admin-modal').scrollTop = 0;
  $('#teacherModalClose').focus();
}
function closeModal() {
  if (state.busy) return;
  $('#teacherModalBackdrop').hidden = true; document.body.classList.remove('admin-modal-open');
  const target = modalTrigger?.isConnected && modalTrigger.getClientRects().length && !modalTrigger.disabled ? modalTrigger : $('.admin-bottom-item.active');
  target?.focus({ preventScroll: true });
}
function showEditor(type, old = null) {
  if (!state.ready || state.busy) return toast('আগে ডেটা লোড হতে দিন বা আবার চেষ্টা করুন।');
  const a = old || { type, date: todayISO(), time: '17:00', duration: 60, totalMarks: 100, status: 'draft', className: 'দশম শ্রেণি' };
  const timed = ['exam', 'routine'].includes(type);
  const field = (name, label, inputType = 'text', extra = '') => `<div><label for="activity-${name}">${label}</label><input id="activity-${name}" name="${name}" type="${inputType}" value="${esc(a[name] ?? '')}" ${extra}></div>`;
  openModal(`${old ? 'সম্পাদনা: ' : 'নতুন '}${ACTIVITY_TYPES[type].label}`, `<form id="teacherActivityForm" class="teacher-form">
    ${field('title', 'শিরোনাম *', 'text', 'required maxlength="150"')}
    ${field('subject', 'বিষয় *', 'text', 'required maxlength="80"')}
    <div><label for="activity-className">শ্রেণি *</label><select id="activity-className" name="className" required>${classOptions(a.className)}</select></div>
    ${field('group', 'বিভাগ (খালি রাখলে সব বিভাগ)', 'text', 'maxlength="80" list="teacherGroups" placeholder="যেমন: বিজ্ঞান বিভাগ"')}
    <datalist id="teacherGroups">${[...new Set(['বিজ্ঞান বিভাগ', 'মানবিক', 'ব্যবসায় শিক্ষা', 'সাধারণ', ...state.students.map(s => s.group).filter(Boolean)])].map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
    ${type !== 'suggestion' ? field('date', type === 'homework' ? 'জমার শেষ তারিখ *' : 'তারিখ *', 'date', 'required') + field('time', type === 'homework' ? 'জমার শেষ সময় *' : 'শুরুর সময় *', 'time', 'required') : ''}
    ${timed ? field('duration', 'সময়কাল (মিনিট) *', 'number', 'min="5" max="300" step="1" required') + field('room', 'রুম / স্থান', 'text', 'maxlength="120"') : ''}
    ${type === 'exam' ? field('totalMarks', 'পূর্ণমান *', 'number', 'min="1" max="1000" step="1" required') : ''}
    <div><label for="activity-details">${type === 'exam' ? 'সিলেবাস / প্রশ্ন ও নির্দেশনা' : type === 'homework' ? 'কাজের বিবরণ ও নির্দেশনা' : type === 'suggestion' ? 'সাজেশন / নোট' : 'ক্লাসের বিবরণ'}</label><textarea id="activity-details" name="details" rows="5" maxlength="3000">${esc(a.details || '')}</textarea></div>
    ${field('resourceURL', 'সহায়ক লিংক (ঐচ্ছিক)', 'url', 'maxlength="1000" placeholder="https://…"')}
    <div><label for="activity-status">অবস্থা *</label><select id="activity-status" name="status"><option value="draft" ${a.status === 'draft' ? 'selected' : ''}>খসড়া — শুধু শিক্ষক দেখবেন</option><option value="published" ${a.status === 'published' ? 'selected' : ''}>প্রকাশিত — শিক্ষার্থী দেখবে</option></select></div>
    <p class="finance-hint">প্রকাশিত কাজ নির্দিষ্ট শ্রেণি/বিভাগের শিক্ষার্থী অ্যাপে দেখা যাবে (একই ব্রাউজারে)।</p>
    <p class="finance-error" id="teacherSaveError" role="alert" hidden></p>
    <div class="modal-actions"><button class="admin-btn primary" type="submit">সংরক্ষণ করুন</button><button class="admin-btn ghost" type="button" data-close-teacher>বাতিল</button></div>
  </form>`);
  $('#teacherActivityForm').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    save(form, () => teachingRepository.saveActivity({ ...values, type, id: old?.id, date: type === 'suggestion' ? a.date : values.date }), 'কাজটি সংরক্ষণ করা হয়েছে');
  });
}
async function save(form, operation, message) {
  if (state.busy || !state.ready) return;
  state.busy = true; form.setAttribute('aria-busy', 'true'); $('#teacherSaveError').hidden = true;
  const controls = [...form.querySelectorAll('input, select, textarea, button')];
  controls.forEach(el => { el.disabled = true; });
  const submit = form.querySelector('[type=submit]'), label = submit.textContent; submit.textContent = 'সংরক্ষণ হচ্ছে…';
  let success = false;
  try { state.db = await operation(); render(); success = true; }
  catch (error) {
    $('#teacherSaveError').textContent = error instanceof DOMException ? 'সংরক্ষণ হয়নি। ব্রাউজারের স্টোরেজ/খালি জায়গা পরীক্ষা করে আবার চেষ্টা করুন।' : error.message || 'সংরক্ষণ হয়নি। আবার চেষ্টা করুন।';
    $('#teacherSaveError').hidden = false;
  } finally { state.busy = false; form.removeAttribute('aria-busy'); controls.forEach(el => { el.disabled = false; }); submit.textContent = label; }
  if (success) { closeModal(); toast(message); }
}
function showDetail(a) {
  const link = safeResourceURL(a.resourceURL);
  openModal(a.title, `<article class="teaching-card"><span class="teaching-kind">${ACTIVITY_TYPES[a.type].label} • ${a.status === 'draft' ? 'খসড়া' : 'প্রকাশিত'}</span><h3>${esc(a.subject)}</h3><small>${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}</small><p>${esc(activityMeta(a))}</p><small>${esc(a.room)}</small><p class="teaching-body">${esc(a.details || 'অতিরিক্ত নির্দেশনা নেই।')}</p>${link ? `<a class="teaching-resource" href="${esc(link)}" target="_blank" rel="noopener noreferrer">সহায়ক উপকরণ খুলুন ↗</a>` : ''}<div class="teaching-actions"><button type="button" data-record-action="edit" data-id="${esc(a.id)}">সম্পাদনা</button>${ACTIVITY_TYPES[a.type].progress && a.status === 'published' ? `<button type="button" class="primary" data-record-action="progress" data-id="${esc(a.id)}">${ACTIVITY_TYPES[a.type].progress}</button>` : ''}</div></article>`);
}
function showProgress(a) {
  if (a.status !== 'published' || !ACTIVITY_TYPES[a.type].progress) return;
  const students = state.students.filter(s => matchesStudent(a, s));
  const options = a.type === 'homework' ? ['pending', 'done', 'reviewed'] : ['present', 'absent', 'late'];
  openModal(`${ACTIVITY_TYPES[a.type].progress} • ${a.title}`, `<p class="modal-copy">${esc(a.className)} • ${esc(a.group || 'সব বিভাগ')}${a.type === 'exam' ? ` • পূর্ণমান ${bn(a.totalMarks)}। খালি রাখলে নম্বর প্রকাশ হবে না।` : ''}</p>
    ${students.length ? `<form id="teacherProgressForm"><div class="teacher-progress-list">${students.map((student, index) => {
      const value = a.progress[student.id]?.value ?? '';
      return `<div class="teacher-progress-row"><label for="progress-${index}">${esc(student.name)}<small>${esc(student.id)}</small></label>${a.type === 'exam' ? `<input type="number" id="progress-${index}" data-progress-id="${esc(student.id)}" data-original="${esc(value)}" value="${esc(value)}" min="0" max="${a.totalMarks}" step="0.5" placeholder="নম্বর দিন">` : `<select id="progress-${index}" data-progress-id="${esc(student.id)}" data-original="${esc(value)}"><option value="">এখনও নথিভুক্ত হয়নি</option>${options.map(v => `<option value="${v}" ${v === value ? 'selected' : ''}>${PROGRESS_LABELS[v]}</option>`).join('')}</select>`}</div>`;
    }).join('')}</div><p class="finance-error" id="teacherSaveError" role="alert" hidden></p><div class="modal-actions"><button class="admin-btn primary" type="submit">সংরক্ষণ করুন</button><button class="admin-btn ghost" type="button" data-close-teacher>বাতিল</button></div></form>` : '<p class="teacher-empty">এই শ্রেণি/বিভাগে কোনো অনুমোদিত শিক্ষার্থী নেই।</p>'}`);
  $('#teacherProgressForm')?.addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const entries = Object.fromEntries([...form.querySelectorAll('[data-progress-id]')].filter(el => el.value !== el.dataset.original).map(el => [el.dataset.progressId, el.value]));
    save(form, () => teachingRepository.saveProgress(a.id, entries), 'শিক্ষার্থীদের অগ্রগতি সংরক্ষণ করা হয়েছে');
  });
}
function showDelete(a) {
  openModal('কাজটি মুছে ফেলবেন?', `<form id="teacherDeleteForm"><p class="modal-copy"><strong>${esc(a.title)}</strong> মুছে গেলে শিক্ষার্থী অ্যাপ থেকেও সরে যাবে। এই কাজের নম্বর, জমার অবস্থা বা উপস্থিতিও মুছে যাবে।</p><p class="finance-error" id="teacherSaveError" role="alert" hidden></p><div class="modal-actions"><button class="admin-btn ghost" type="button" data-close-teacher>না, রাখুন</button><button class="admin-btn primary" type="submit">হ্যাঁ, মুছে ফেলুন</button></div></form>`);
  $('#teacherDeleteForm').addEventListener('submit', event => { event.preventDefault(); save(event.currentTarget, () => teachingRepository.deleteActivity(a.id), 'কাজটি মুছে ফেলা হয়েছে'); });
}
function showStudent(id) {
  const s = state.students.find(student => student.id === id); if (!s) return;
  const records = own().filter(a => a.status === 'published' && matchesStudent(a, s) && a.progress[s.id]);
  openModal(s.name, `<p class="modal-copy">Student ID: ${esc(s.id)} • ${esc(s.className)} • ${esc(s.group || '—')}</p><div class="teacher-record-list">${records.map(a => `<article class="teaching-card"><small>${ACTIVITY_TYPES[a.type].label}</small><h3>${esc(a.title)}</h3><p>${a.type === 'exam' ? `${bn(a.progress[s.id].value)} / ${bn(a.totalMarks)}` : PROGRESS_LABELS[a.progress[s.id].value] || '—'}</p></article>`).join('') || '<p class="teacher-empty">এখনও কোনো নম্বর বা অগ্রগতি নথিভুক্ত হয়নি।</p>'}</div>`);
}

['teacherClassFilter', 'teacherStudentClass'].forEach(id => { $('#' + id).insertAdjacentHTML('beforeend', classOptions()); });
$('#teacherEnter').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true; $('#teacherEntryError').hidden = true;
  if (await reload()) {
    $('#teacherEntry').hidden = true; $('#teacherShell').hidden = false; setView('home');
  } else { $('#teacherEntryError').textContent = 'ডেটা পড়া যায়নি। ব্রাউজারের স্টোরেজ চালু করে আবার চেষ্টা করুন।'; $('#teacherEntryError').hidden = false; }
  button.disabled = false;
});
$('#teacherExit').addEventListener('click', () => { $('#teacherShell').hidden = true; $('#teacherEntry').hidden = false; $('#teacherEntry').scrollTop = 0; });
$('#teacherRetry').addEventListener('click', reload);
$('#teacherNewActivity').addEventListener('click', () => showEditor(state.view));
['teacherRecordSearch', 'teacherClassFilter'].forEach(id => $('#' + id).addEventListener(id.includes('Search') ? 'input' : 'change', renderRecords));
['teacherStudentSearch', 'teacherStudentClass'].forEach(id => $('#' + id).addEventListener(id.includes('Search') ? 'input' : 'change', renderStudents));
$('#teacherStatusFilter').addEventListener('click', event => {
  const button = event.target.closest('[data-status]'); if (!button) return;
  state.status = button.dataset.status;
  $$('#teacherStatusFilter button').forEach(el => { el.classList.toggle('active', el === button); el.setAttribute('aria-pressed', String(el === button)); }); renderRecords();
});
document.addEventListener('click', event => {
  if (state.busy) return;
  const nav = event.target.closest('[data-teacher-view]'); if (nav) setView(nav.dataset.teacherView);
  const create = event.target.closest('[data-new-activity]'); if (create) showEditor(create.dataset.newActivity);
  if (event.target.closest('[data-close-teacher]')) closeModal();
  const record = event.target.closest('[data-record-action]');
  if (record) {
    if (!state.ready) return toast('ডেটা পড়া যায়নি। আবার চেষ্টা করুন।');
    const a = own().find(item => item.id === record.dataset.id); if (!a) return;
    ({ detail: showDetail, edit: a => showEditor(a.type, a), progress: showProgress, delete: showDelete })[record.dataset.recordAction]?.(a);
  }
  const student = event.target.closest('[data-student-detail]'); if (student) showStudent(student.dataset.studentDetail);
});
$('#teacherModalClose').addEventListener('click', closeModal);
$('#teacherModalBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
document.addEventListener('keydown', event => {
  if ($('#teacherModalBackdrop').hidden) return;
  if (event.key === 'Escape') closeModal();
  if (event.key === 'Tab') {
    const items = [...$('#teacherModalBackdrop').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(el => el.getClientRects().length);
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
});
watchTeachingData(() => { if (!state.busy && !$('#teacherShell').hidden) reload(); });

initDemoForms(demoWarnings);
