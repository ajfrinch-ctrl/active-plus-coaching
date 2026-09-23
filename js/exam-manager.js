import { examRepository as repo, EXAM_TYPES, TEACHER_ACTOR, ADMIN_ACTOR, examTemplate, parseQuestions, totalMarks, watchExams } from './exam-data.js';
import { examMeta, questionPreview, resultMarkup, downloadResults, esc, num } from './exam-ui.js';
import { downloadExamPDF } from './exam-pdf.js';
import { enabledClasses } from './config.js';

export function initExamManager(container, role) {
  const root = document.querySelector(container); if (!root) return;
  const actor = role === 'admin' ? ADMIN_ACTOR : TEACHER_ACTOR;
  let db = { exams: [], attempts: [] }, view = 'list', selected = null, filter = 'all', classFilter = 'all', busy = false, ready = false;
  root.classList.add('exam-workspace');
  root.innerHTML = '<p class="exam-note">লোকাল ডেমো • প্রশ্ন শিক্ষক তৈরি করবেন, Admin প্রকাশ করবেন। সব শ্রেণির অনুমোদিত শিক্ষার্থী অংশ নিতে পারবে। আলাদা মোবাইলে চালাতে অনলাইন ডেটাবেস প্রয়োজন।</p><p class="exam-error" role="alert" data-exam-error hidden></p><p class="exam-message" role="status" data-exam-message hidden></p><div data-exam-content></div>';
  const $ = selector => root.querySelector(selector), content = $('[data-exam-content]');
  const button = (action, label, id = '', cls = '') => `<button type="button" class="${cls}" data-exam-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const back = () => `<div class="exam-actions">${button('list', '← পরীক্ষার তালিকা')}</div>`;
  function error(text) { $('[data-exam-error]').textContent = text; $('[data-exam-error]').hidden = !text; }
  function message(text) { $('[data-exam-message]').textContent = text; $('[data-exam-message]').hidden = !text; }
  function scrollTop() { root.closest('main')?.scrollTo({ top: 0, behavior: 'instant' }); }
  function list() {
    view = 'list'; selected = null;
    const exams = db.exams.filter(e => (role === 'admin' || e.teacherId === actor.id) && (filter === 'all' || e.type === filter) && (classFilter === 'all' || e.className === classFilter));
    content.innerHTML = `${role === 'teacher' ? `<div class="exam-actions">${Object.entries(EXAM_TYPES).map(([type, label]) => button('new-' + type, '+ ' + label, '', 'primary')).join('')}</div>` : '<p class="exam-note">প্রশ্ন ও নম্বর দেখে অনুমোদন দিন। সংশোধন দরকার হলে কারণ লিখে ফেরত দিন।</p>'}
      <div class="exam-actions" aria-label="পরীক্ষার ধরন">${['all', ...Object.keys(EXAM_TYPES)].map(type => `<button type="button" data-exam-action="filter-${type}" aria-pressed="${filter === type}">${type === 'all' ? 'সব' : EXAM_TYPES[type]}</button>`).join('')}</div>
      <label class="exam-class-filter">শ্রেণি <select data-exam-class-filter><option value="all">সব শ্রেণি</option>${enabledClasses.map(c => `<option value="${esc(c)}" ${c === classFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <div class="exam-list">${exams.map(e => `<article class="exam-card" data-managed-exam="${esc(e.id)}">${examMeta(e)}${e.reviewNote ? `<p class="exam-error">${esc(e.reviewNote)}</p>` : ''}<div class="exam-actions">${button('detail', role === 'admin' && e.status === 'pending' ? 'পর্যালোচনা করুন' : 'বিস্তারিত', e.id)}${role === 'teacher' && e.status !== 'published' ? button('edit', 'সম্পাদনা', e.id) : ''}${role === 'teacher' && ['draft', 'rejected'].includes(e.status) ? button('request', 'অনুমতির জন্য পাঠান', e.id, 'primary') + button('delete', 'মুছুন', e.id, 'danger') : ''}${e.status === 'published' ? button('report', 'ফলাফল ও রিপোর্ট', e.id) : ''}${role === 'teacher' && e.status === 'published' && e.type !== 'mcq' ? button('grade', 'নম্বর / উপস্থিতি', e.id) : ''}</div></article>`).join('') || `<p class="exam-card">${classFilter === 'all' ? 'এখনও এই ধরনের পরীক্ষা নেই।' : `${esc(classFilter)} — এই শ্রেণির কোনো পরীক্ষা নেই।`}</p>`}</div>`;
  }
  async function reload() {
    try { db = await repo.list(); ready = true; if (view === 'list') list(); else if (view === 'report' && selected) report(db.exams.find(e => e.id === selected), false); }
    catch (e) { ready = false; error(e.message || 'পরীক্ষার ডেটা পড়া যায়নি।'); }
  }
  async function run(operation, success, next = list) {
    if (busy || !ready) return;
    busy = true; error(''); message(''); root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll('button, input, select, textarea')]; controls.forEach(el => { el.disabled = true; });
    try { const snapshot = await operation(); if (snapshot?.exams) db = snapshot; await next(); message(success); }
    catch (e) { error(e instanceof DOMException ? 'সংরক্ষণ/ডাউনলোড হয়নি। ব্রাউজারের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।' : e.message || 'সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); }
    finally { busy = false; root.removeAttribute('aria-busy'); controls.forEach(el => { el.disabled = false; }); }
  }
  function editor(type, e = null) {
    view = 'edit'; selected = e?.id;
    const nextDay = new Date(Date.now() + 86400000); nextDay.setHours(18, 0, 0, 0);
    const localTime = ms => { const d = new Date(ms); return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
    const data = e || { type, title: '', subject: '', startAt: nextDay.getTime(), endAt: nextDay.getTime() + 3600000, lateMinutes: 10, negative: 0, passPercent: 33, template: '', instructions: '' };
    const classOptions = value => `<option value="">শ্রেণি নির্বাচন করুন</option>${enabledClasses.map(c => `<option value="${esc(c)}" ${c === value ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
    const field = (name, label, kind = 'text', extra = '') => `<label>${label}<input name="${name}" type="${kind}" value="${esc(['startAt', 'endAt'].includes(name) ? localTime(data[name]) : data[name])}" ${extra}></label>`;
    content.innerHTML = `${back()}<h2>${e ? 'সম্পাদনা' : 'নতুন পরীক্ষা'} — ${EXAM_TYPES[type]}</h2><form class="exam-form" data-exam-form>
      ${field('title', 'পরীক্ষার নাম *', 'text', 'required maxlength="150"')}${field('subject', 'একটি বিষয় *', 'text', 'required maxlength="80"')}
      <label>কোন শ্রেণির জন্য *<select name="className" required>${classOptions(data.className)}</select></label>
      ${field('startAt', type === 'mcq' ? 'শুরুর সময় *' : 'প্রশ্ন ডাউনলোড শুরুর সময় *', 'datetime-local', 'required')}${field('endAt', type === 'mcq' ? 'সবার জন্য শেষ সময় *' : 'আজকের প্রস্তুতির শেষ সময় *', 'datetime-local', 'required')}
      <p class="exam-note">সময় এই মোবাইলের স্থানীয় সময় অনুযায়ী। ${type === 'mcq' ? 'মোট দুইবার; চলমান প্রথম-প্রচেষ্টার গড়ের নিচে থাকলে দ্বিতীয় সুযোগ। সময় বাড়বে না। সেরা নম্বর ফলাফলে থাকবে।' : 'শুরুর তারিখের পরের দিন (বাংলাদেশ সময়) ক্লাসে পরীক্ষা হবে। শিক্ষার্থী PDF নেবে, খাতায় উত্তর দেবে।'}</p>
      ${type === 'mcq' ? field('lateMinutes', 'দেরিতে প্রথম প্রবেশ: শুরুর পর কত মিনিট', 'number', 'required min="1" step="1"') : ''}
      ${type === 'mcq' ? field('negative', 'প্রতি ভুল উত্তরে কাটা নম্বর (০ হলে কাটবে না)', 'number', 'min="0" max="1000" step="0.01" required') : ''}
      ${field('passPercent', 'পাস নম্বরের হার (%)', 'number', 'min="1" max="100" required')}
      <label>নির্দেশনা<textarea name="instructions" maxlength="2000">${esc(data.instructions)}</textarea></label>
      <details><summary>প্রশ্নের টেমপ্লেট দেখুন</summary><textarea data-copy-template readonly aria-label="কপি করার টেমপ্লেট">${esc(examTemplate(type))}</textarea><div class="exam-actions">${button('copy-template', 'টেমপ্লেট কপি করুন')}${button('sample', 'উদাহরণ বসান')}</div><p class="exam-note">প্রশ্ন আলাদা করতে --- দিন। প্রতিটি লেখা একটি লাইনে রাখুন। নম্বর আলাদা হতে পারে। সর্বোচ্চ ১০০ প্রশ্ন; শুধু লেখা।</p></details>
      <label>টেমপ্লেট অনুযায়ী প্রশ্ন পেস্ট করুন *<textarea name="template" data-question-source rows="12" required maxlength="150000" placeholder="${type === 'mcq' ? 'প্রশ্ন: …\nA: …\nB: …\nC: …\nD: …\nউত্তর: A' : 'প্রশ্ন: …\nনম্বর: …'}">${esc(data.template)}</textarea><small class="exam-note">${type === 'mcq' ? 'MCQ-তে প্রতি প্রশ্নের নম্বর ১ নির্ধারিত — “নম্বর:” লাইন লিখতে হবে না। মোট নম্বর = প্রশ্ন সংখ্যা।' : 'প্রতি প্রশ্নের নম্বর আলাদা করে লিখুন।'}</small></label>
      <div class="exam-preview" data-parsed-preview aria-live="polite"></div>
      <button type="submit" class="primary">খসড়া সংরক্ষণ করুন</button>
    </form>`;
    function preview() { try { const questions = parseQuestions($('[name=template]').value, type); $('[data-parsed-preview]').innerHTML = `<strong>${num(questions.length)}টি প্রশ্ন • মোট ${num(totalMarks({ questions }))} নম্বর</strong>${questionPreview({ questions }, true)}`; } catch (e) { $('[data-parsed-preview]').textContent = e.message; } }
    $('[name=template]').addEventListener('input', preview); preview();
    $('[data-exam-form]').addEventListener('submit', event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      run(() => repo.saveDraft({ ...values, type, id: e?.id, startAt: new Date(values.startAt).getTime(), endAt: new Date(values.endAt).getTime() }, actor), 'খসড়া সংরক্ষিত। এখন অনুমতির জন্য পাঠাতে পারেন।');
    });
    scrollTop();
  }
  function detail(e) {
    view = 'detail'; selected = e.id;
    content.innerHTML = `${back()}<article class="exam-card">${examMeta(e)}<p>${esc(e.instructions)}</p><p class="exam-note">ভুলপ্রতি কাটা নম্বর ${num(e.negative)} • পাস ${num(e.passPercent)}% • প্রথম প্রবেশের সীমা ${num(e.lateMinutes)} মিনিট</p><div class="exam-actions">${button('paper', 'প্রশ্নপত্র PDF ডাউনলোড', e.id)}</div></article>
      ${role === 'admin' && e.status === 'pending' ? `<form class="exam-form" data-review-form><label>প্রতি ভুল উত্তরে কাটা নম্বর<input name="negative" type="number" min="0" max="1000" step="0.01" value="${e.negative}" ${e.type !== 'mcq' ? 'readonly' : ''}></label><label>সংশোধনের কারণ (ফেরত দিলে আবশ্যক)<textarea name="note" maxlength="500"></textarea></label><div class="exam-actions"><button type="submit" name="decision" value="publish" class="primary">অনুমোদন দিয়ে প্রকাশ করুন</button><button type="submit" name="decision" value="reject">সংশোধনের জন্য ফেরত দিন</button></div></form>` : ''}<h3>প্রশ্ন ও নম্বর যাচাই</h3>${questionPreview(e, true)}`;
    $('[data-review-form]')?.addEventListener('submit', event => { event.preventDefault(); const options = Object.fromEntries(new FormData(event.currentTarget)); const decision = event.submitter.value; run(() => repo.review(e.id, decision, options, actor), decision === 'publish' ? 'পরীক্ষা অনুমোদিত ও প্রকাশিত হয়েছে।' : 'শিক্ষকের কাছে ফেরত দেওয়া হয়েছে।'); }); scrollTop();
  }
  function report(e, reset = true) { view = 'report'; selected = e.id; content.innerHTML = `${back()}${examMeta(e)}<div class="exam-actions">${button('csv', 'রিপোর্ট ডাউনলোড (CSV)', e.id)}${e.type === 'mcq' && Date.now() >= e.endAt ? button('solutions', 'সঠিক উত্তরসহ PDF', e.id) : ''}</div>${resultMarkup(db, e, true)}`; if (reset) scrollTop(); }
  async function grade(e) {
    view = 'grade'; selected = e.id; const students = await repo.listStudents();
    content.innerHTML = `${back()}${examMeta(e)}<p class="exam-note">ক্লাসে খাতা দেখে প্রশ্নভিত্তিক নম্বর দিন। উপস্থিত না থাকলে অনুপস্থিত হিসেবে রাখুন।</p><form class="exam-form" data-grade-form><label>শিক্ষার্থী<select name="studentId" required><option value="">শিক্ষার্থী নির্বাচন করুন</option>${students.map(s => `<option value="${esc(s.id)}">${esc(s.name)} • ${esc(s.className)} • ${esc(s.id)}</option>`).join('')}</select></label>${e.questions.map(q => `<label>${esc(q.text)} (পূর্ণমান ${num(q.marks)})<input name="${q.id}" type="number" min="0" max="${q.marks}" step="0.01" placeholder="নম্বর দিন"></label>`).join('')}<div class="exam-actions"><button type="submit" name="decision" value="marks" class="primary">নম্বর প্রকাশ করুন</button><button type="submit" name="decision" value="absent">অনুপস্থিত রাখুন</button></div></form>`;
    $('[name=studentId]').addEventListener('change', event => { const saved = db.attempts.find(a => a.examId === e.id && a.studentId === event.target.value); e.questions.forEach(q => { $(`[name=${q.id}]`).value = saved?.questionScores?.[q.id] ?? ''; }); });
    $('[data-grade-form]').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const student = students.find(s => s.id === values.studentId); run(() => event.submitter.value === 'absent' ? repo.markWrittenAbsent(e.id, student, actor) : repo.saveWrittenScore(e.id, student, values, actor), 'নম্বর/উপস্থিতি সংরক্ষিত হয়েছে।', () => grade(db.exams.find(item => item.id === e.id))); }); scrollTop();
  }
  root.addEventListener('change', event => { const select = event.target.closest('[data-exam-class-filter]'); if (!select || busy) return; classFilter = select.value; list(); });
  root.addEventListener('click', async event => {
    const target = event.target.closest('[data-exam-action]'); if (!target || busy) return;
    const action = target.dataset.examAction, e = db.exams.find(e => e.id === target.dataset.id); error(''); message('');
    if (action === 'list') { list(); scrollTop(); }
    else if (!ready) error('ডেটা লোড হয়নি। পেজ রিফ্রেশ করুন।');
    else if (action.startsWith('filter-')) { filter = action.slice(7); list(); }
    else if (action.startsWith('new-')) editor(action.slice(4));
    else if (action === 'edit') editor(e.type, e);
    else if (action === 'detail') detail(e);
    else if (action === 'request') run(() => repo.requestApproval(e.id, actor), 'Admin-এর অনুমতির জন্য পাঠানো হয়েছে।');
    else if (action === 'delete' && window.confirm('এই খসড়া পরীক্ষাটি মুছে ফেলবেন?')) run(() => repo.deleteDraft(e.id, actor), 'খসড়া মুছে ফেলা হয়েছে।');
    else if (action === 'report') report(e);
    else if (action === 'grade') { try { await grade(e); } catch (e) { error(e.message); } }
    else if (action === 'csv') downloadResults(db, e);
    else if (action === 'paper' || action === 'solutions') run(() => downloadExamPDF(e, { authorPreview: true, solutions: action === 'solutions' }), 'PDF ডাউনলোড শুরু হয়েছে।', () => {});
    else if (action === 'copy-template') { try { await navigator.clipboard.writeText($('[data-copy-template]').value); message('টেমপ্লেট কপি হয়েছে।'); } catch { $('[data-copy-template]').select(); message('টেমপ্লেট নির্বাচন করা হয়েছে। মোবাইলের কপি অপশন চাপুন।'); } }
    else if (action === 'sample') { $('[name=template]').value = $('[data-copy-template]').value; $('[name=template]').dispatchEvent(new Event('input')); }
  });
  watchExams(() => { if (!busy) reload(); }); reload();
}
