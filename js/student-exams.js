import { examRepository as repo, examMatchesClass, retryEligibility, firstAttemptMean, examResults, totalMarks, watchExams } from './exam-data.js';
import { examMeta, resultMarkup, esc, num } from './exam-ui.js';
import { downloadExamPDF } from './exam-pdf.js';

export function initStudentExams({ getStudent, getAccount }) {
  const root = document.querySelector('#studentExamWorkspace'); if (!root) return () => {};
  let db = { exams: [], attempts: [] }, view = 'list', examId = null, attemptId = null, busy = false, ready = false, pdfBusy = false;
  const autoTried = new Set();
  root.classList.add('exam-workspace');
  root.innerHTML = '<p class="exam-note">নিজের শ্রেণির অনলাইন পরীক্ষা • এটি একই ব্রাউজারে চলা লোকাল ডেমো।</p><p class="exam-error" data-exam-error role="alert" hidden></p><p class="exam-message" data-exam-message role="status" hidden></p><p class="exam-auto-notice" data-auto-download role="status"></p><div data-exam-content></div>';
  const $ = selector => root.querySelector(selector), content = $('[data-exam-content]');
  const activeAccount = () => getAccount()?.status === 'active';
  const button = (action, label, id = '', cls = '') => `<button type="button" class="${cls}" data-student-exam-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const own = e => db.attempts.filter(a => a.examId === e.id && a.studentId === getStudent().id);
  function error(text) { $('[data-exam-error]').textContent = text; $('[data-exam-error]').hidden = !text; }
  function message(text) { $('[data-exam-message]').textContent = text; $('[data-exam-message]').hidden = !text; }
  function scrollTop() { if (document.querySelector('#examsView').classList.contains('active')) root.closest('main')?.scrollTo({ top: 0, behavior: 'instant' }); }
  function list() {
    view = 'list'; examId = null; attemptId = null;
    if (!activeAccount()) { content.innerHTML = '<p class="exam-card">অনুমোদিত অ্যাকাউন্ট দিয়ে লগইন করতে হবে।</p>'; return; }
    const exams = db.exams.filter(e => e.status === 'published' && examMatchesClass(e, getStudent().className)).sort((a, b) => b.startAt - a.startAt), now = Date.now();
    content.innerHTML = `<div class="exam-actions">${button('refresh', 'তালিকা / জমার অবস্থা হালনাগাদ')}</div><div class="exam-list">${exams.map(e => {
      const attempts = own(e), active = attempts.find(a => a.status === 'active'), queued = attempts.some(a => a.status === 'queued');
      const canFirst = !attempts.length && now >= e.startAt && now < e.endAt && now <= e.startAt + e.lateMinutes * 60000;
      const retry = retryEligibility(db, e, getStudent().id);
      return `<article class="exam-card" data-student-exam="${esc(e.id)}">${examMeta(e)}<p class="exam-note">${esc(e.instructions)}</p>${e.type === 'mcq' ? `<p class="exam-note">সব প্রশ্ন একসঙ্গে থাকবে। প্রতি ভুলে ${num(e.negative)} নম্বর কাটা হবে; সর্বনিম্ন মোট ০। প্রথম প্রবেশের সীমা ${num(e.lateMinutes)} মিনিট।</p>${queued ? '<p class="exam-message">উত্তর ফোনে সংরক্ষিত—অনলাইনে এলে জমা হবে।</p>' : ''}` : ''}
        <div class="exam-actions">${e.type === 'mcq' ? active && now < e.endAt ? button('resume', 'পরীক্ষায় ফিরে যাও', e.id, 'primary') : canFirst ? button('start', 'পরীক্ষা শুরু করো', e.id, 'primary') : retry ? button('start', 'দ্বিতীয়বার পরীক্ষা দাও', e.id, 'primary') : `<small>${now < e.startAt ? 'নির্ধারিত সময়ে পরীক্ষা শুরু হবে।' : now >= e.endAt ? 'পরীক্ষার সময় শেষ।' : attempts.length ? 'চলমান গড়ের নিচে হলে দ্বিতীয় সুযোগ এখানে আসবে।' : 'প্রথম প্রবেশের সময়সীমা শেষ।'}</small>` : now >= e.startAt ? button('paper', 'প্রশ্নপত্র PDF ডাউনলোড', e.id, 'primary') : '<small>শুরুর সময় হলে PDF পাওয়া যাবে।</small>'}
        ${button('results', 'সবার ফলাফল', e.id)}${e.type === 'mcq' && now >= e.endAt ? button('solutions', 'সঠিক উত্তরসহ PDF', e.id) : ''}</div></article>`;
    }).join('') || '<p class="exam-card">Admin এখনও কোনো পরীক্ষা প্রকাশ করেননি।</p>'}</div>`;
  }
  function activeExam(e, a) {
    view = 'active'; examId = e.id; attemptId = a.id;
    content.innerHTML = `<div class="exam-actions">${button('list', '← তালিকা (উত্তর সংরক্ষিত থাকবে)')}</div><div class="exam-timer"><span>সবার জন্য একই শেষ সময় • চেষ্টা ${num(a.number)}</span><strong data-exam-clock></strong><small data-answer-status>উত্তর এই ফোনে সংরক্ষিত হচ্ছে।</small></div><h2>${esc(e.title)}</h2><p class="exam-note">প্রথম লোডেই সব প্রশ্ন এসেছে। নেট না থাকলেও উত্তর দাও। শেষ সময়ে উত্তর লক হবে; সংযোগ ফিরলে জমা হবে। অ্যাপ বন্ধ থাকলে পুনরায় খুললে বাকি জমা সম্পন্ন হবে।</p>
      <div class="exam-question-list">${a.order.map((item, i) => {
        const q = e.questions.find(q => q.id === item.id);
        return `<fieldset class="exam-question"><legend>প্রশ্ন ${num(i + 1)} • ${num(q.marks)} নম্বর</legend><p>${esc(q.text)}</p>${item.options.map((id, j) => {
          const option = q.options.find(o => o.id === id);
          return `<label class="exam-option"><input type="radio" name="answer-${q.id}" value="${id}" data-answer-question="${q.id}" ${a.answers[q.id] === id ? 'checked' : ''}><span>${'ABCD'[j]}. ${esc(option.text)}</span></label>`;
        }).join('')}</fieldset>`;
      }).join('')}</div><div class="exam-actions">${button('confirm', 'উত্তরপত্র জমা দাও', e.id, 'primary')}</div>
      <div class="exam-card" data-submit-confirm hidden><h3>এখনই জমা দেবে?</h3><p>জমা দেওয়ার পর এই প্রচেষ্টার উত্তর বদলানো যাবে না।</p><div class="exam-actions">${button('finish', 'হ্যাঁ, জমা দাও', e.id, 'primary')}${button('cancel-confirm', 'উত্তরে ফিরে যাও')}</div></div>`;
    clock(); scrollTop();
  }
  function results(e, reset = true) {
    view = 'results'; examId = e.id; attemptId = null;
    const mine = own(e), pending = mine.some(a => a.status === 'queued'), mean = firstAttemptMean(db, e.id);
    content.innerHTML = `<div class="exam-actions">${button('list', '← পরীক্ষার তালিকা')}${button('refresh', 'হালনাগাদ')}</div>${examMeta(e)}
      ${pending ? '<p class="exam-message">তোমার উত্তর ফোনে রাখা আছে। অনলাইনে এলে জমা ও মূল্যায়ন হবে।</p>' : ''}
      ${mine.filter(a => a.status === 'submitted').map(a => `<div class="exam-summary"><h3>তোমার প্রচেষ্টা ${num(a.number)}</h3><strong>${num(a.score)} / ${num(totalMarks(e))}</strong>${e.type === 'mcq' ? `<p>সঠিক ${num(a.correct)} • ভুল ${num(a.wrong)} • অনুত্তরিত ${num(a.unanswered)}</p>` : ''}</div>`).join('')}
      <p class="exam-note">${e.type === 'mcq' ? `দ্বিতীয় সুযোগ: জমা হওয়া প্রথম প্রচেষ্টার চলমান গড় ${mean === null ? 'এখনও নেই' : num(mean.toFixed(2))}। তার নিচে থাকলে সর্বোচ্চ দুইবার; শেষ সময় একই। শুরু করা দ্বিতীয় সুযোগ পরে গড় বদলালেও বাতিল হবে না।` : 'ক্লাসে পরীক্ষার পরে শিক্ষক নম্বর প্রকাশ করবেন।'}</p>
      <div class="exam-actions">${retryEligibility(db, e, getStudent().id) ? button('start', 'দ্বিতীয়বার পরীক্ষা দাও', e.id, 'primary') : ''}${e.type === 'mcq' && Date.now() >= e.endAt ? button('solutions', 'সঠিক উত্তরসহ PDF ডাউনলোড', e.id, 'primary') : e.type === 'mcq' ? '<small>সঠিক উত্তরসহ PDF সবার পরীক্ষা শেষ হলে পাওয়া যাবে।</small>' : ''}</div>${resultMarkup(db, e)}`;
    if (reset) scrollTop();
  }
  function repaint() {
    if (!activeAccount()) { list(); return; }
    const e = db.exams.find(e => e.id === examId && e.status === 'published');
    if (view === 'active' && e) {
      const a = own(e).find(a => a.id === attemptId);
      if (a?.status === 'active') root.querySelectorAll('[data-answer-question]').forEach(input => { input.checked = a.answers[input.dataset.answerQuestion] === input.value; });
      else results(e);
    } else if (view === 'results' && e) results(e, false);
    else list();
  }
  async function refresh() {
    try { db = await repo.list(); ready = true; repaint(); }
    catch (e) { ready = false; content.innerHTML = ''; error(e.message || 'পরীক্ষার ডেটা লোড হয়নি।'); }
  }
  async function run(operation, after = repaint) {
    if (busy || !ready || !activeAccount()) return;
    busy = true; error('');
    const controls = [...root.querySelectorAll('button, input')]; controls.forEach(el => { el.disabled = true; });
    try { const snapshot = await operation(); if (snapshot?.exams) db = snapshot; await after(); }
    catch (e) { error(e instanceof DOMException ? 'সংরক্ষণ/ডাউনলোড হয়নি। ফোনের স্টোরেজ পরীক্ষা করে আবার চেষ্টা করো।' : e.message || 'সংরক্ষণ হয়নি। আবার চেষ্টা করো।'); }
    finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
  }
  function clock() {
    const e = db.exams.find(e => e.id === examId);
    if ($('[data-exam-clock]') && e) {
      const seconds = Math.max(0, Math.ceil((e.endAt - Date.now()) / 1000));
      $('[data-exam-clock]').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`.replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);
      const count = Object.keys(db.attempts.find(a => a.id === attemptId)?.answers || {}).length;
      $('[data-answer-status]').textContent = !$('[data-exam-error]').hidden ? $('[data-exam-error]').textContent : `${count} / ${e.questions.length} উত্তর ফোনে সংরক্ষিত • ${navigator.onLine ? 'অনলাইন' : 'অফলাইন'}`;
    }
  }
  async function sync() {
    if (busy || !ready || !activeAccount()) return;
    const pending = db.attempts.some(a => a.studentId === getStudent().id && (a.status === 'queued' && navigator.onLine !== false || a.status === 'active' && Date.now() >= db.exams.find(e => e.id === a.examId).endAt));
    if (pending) await run(() => repo.syncStudent(getStudent().id));
  }
  async function automaticPDF() {
    if (busy || pdfBusy || !ready || !activeAccount() || document.querySelector('#appShell').hidden || document.visibilityState !== 'visible') return;
    for (const e of db.exams.filter(e => e.type === 'mcq' && e.status === 'published' && examMatchesClass(e, getStudent().className) && Date.now() >= e.endAt && own(e).some(a => !a.demoFixture))) {
      const key = `activePlus.examPDF.${e.id}.${getStudent().id}`;
      let done = false; try { done = window.localStorage.getItem(key) === 'started'; } catch { /* Manual download remains available. */ }
      if (done || autoTried.has(key)) continue;
      autoTried.add(key); pdfBusy = true;
      try {
        const attempt = examResults(db, e).find(a => a.studentId === getStudent().id) || own(e).at(-1);
        await downloadExamPDF(e, { solutions: true, attempt });
        try { window.localStorage.setItem(key, 'started'); } catch { /* Do not retry repeatedly. */ }
        $('[data-auto-download]').textContent = 'সঠিক উত্তরসহ PDF ডাউনলোডের অনুরোধ পাঠানো হয়েছে। না নামলে পরীক্ষার ফলাফল থেকে PDF বাটন চাপো।';
      } catch { $('[data-auto-download]').textContent = 'স্বয়ংক্রিয় PDF নামেনি। পরীক্ষার ফলাফল থেকে PDF ডাউনলোড বাটন চাপো।'; }
      finally { pdfBusy = false; }
      break;
    }
  }
  root.addEventListener('change', event => {
    const input = event.target.closest('[data-answer-question]'); if (!input) return;
    run(() => repo.saveAnswer(attemptId, getStudent().id, input.dataset.answerQuestion, input.value), clock).then(() => repaint());
  });
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-student-exam-action]'); if (!target || busy) return;
    const action = target.dataset.studentExamAction, e = db.exams.find(e => e.id === target.dataset.id); error(''); message('');
    if (action === 'list') { list(); scrollTop(); }
    else if (action === 'refresh') refresh().then(sync);
    else if (!ready) error('ডেটা লোড হয়নি। আবার চেষ্টা করো।');
    else if (action === 'start') run(() => repo.startAttempt(e.id, getStudent()), () => { const current = db.exams.find(item => item.id === e.id); activeExam(current, own(current).find(a => a.status === 'active')); });
    else if (action === 'resume') activeExam(e, own(e).find(a => a.status === 'active'));
    else if (action === 'results') results(e);
    else if (action === 'confirm') { $('[data-submit-confirm]').hidden = false; $('[data-student-exam-action=finish]').focus(); }
    else if (action === 'cancel-confirm') $('[data-submit-confirm]').hidden = true;
    else if (action === 'finish') run(() => repo.finishAttempt(attemptId, getStudent().id), () => results(db.exams.find(item => item.id === e.id)));
    else if (action === 'paper' || action === 'solutions') run(() => downloadExamPDF(e, { solutions: action === 'solutions', attempt: examResults(db, e).find(a => a.studentId === getStudent().id) || own(e).at(-1) }), () => message('PDF ডাউনলোড শুরু হয়েছে।'));
  });
  watchExams(() => { if (!busy) refresh(); });
  window.addEventListener('online', () => refresh().then(sync));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh().then(sync); });
  let lastMinute = -1;
  setInterval(() => {
    clock(); sync(); automaticPDF();
    const minute = Math.floor(Date.now() / 1000);
    if (ready && !busy && minute !== lastMinute && view !== 'active') {
      // Refresh time-based buttons without moving focus away from the current control.
      const transition = db.exams.some(e => [e.startAt, e.endAt, e.startAt + e.lateMinutes * 60000 + 1000].some(t => t > lastMinute * 1000 && t <= Date.now()));
      if (transition) repaint();
    }
    lastMinute = minute;
  }, 1000);
  refresh();
  return () => refresh().then(sync);
}
