/* ইনস্ট্যান্ট MCQ অনুশীলন (Instant MCQ practice) — the self-study companion
   of the examination module.
   ---------------------------------------------------------------------------
   Official papers stay exactly as they are: scheduled, rostered, time-boxed,
   Manager-published results. Practice is a separate, instant lane:
     • source — the question bank, which every taken MCQ paper joins the
       moment it is published (js/exam-data.js) or is backfilled on load
       (questionBank.ensureExamsInBank), so past exams accumulate here;
     • when — any moment: no start/end gate, no late window, no roster, no
       timer. The student sets their own pace and submits whenever ready;
     • result — instant and self-marked: the correct answer sits next to
       every question, so a practice session doubles as a study session;
     • no leaks — a paper only becomes practicable after its official window
       has ended (bank rows carry the exam's endAt), so an upcoming exam's
       questions can never be drilled early;
     • no contamination — nothing is written to the official attempt store,
       so a practice session can never touch a real result, a rank, or a
       retry.
   Sessions live in `activePlus.mcqPractice.v1`, local to this device —
   self-study history is personal and offline, like the rest of the demo. */
import { examRepository as repo, examMatchesStudent } from './exam-data.js';
import { ensureExamsInBank, listQuestions } from './question-bank.js';
import { esc, num, when } from './exam-ui.js';

const PRACTICE_KEY = 'activePlus.mcqPractice.v1';
const MAX_SESSIONS = 20;
const RANDOM_SIZE = 20;

const readStore = () => { try { return JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}') || {}; } catch { return {}; } };
const writeStore = store => localStorage.setItem(PRACTICE_KEY, JSON.stringify(store));
const shuffle = items => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const sessionId = () => `P${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const storeFor = student => readStore()[student.id] || { active: null, sessions: [] };
const saveFor = (student, entry) => { const store = readStore(); store[student.id] = entry; writeStore(store); };

/** Papers a student may drill: bank questions grouped by the examination
    they came from, class/batch-matched, and only after the official window
    has ended. */
function practicePapers(student, now = Date.now()) {
  const rows = listQuestions().filter(row => row.type === 'mcq' && row.active && row.source?.examId && row.endAt > 0 && row.endAt < now);
  const byExam = new Map();
  for (const row of rows) {
    const paper = byExam.get(row.source.examId) || {
      examId: row.source.examId, examCode: row.source.examCode || '', title: row.source.examTitle || 'অতীত পরীক্ষা',
      className: row.className, group: row.group || '', subject: row.subject, endAt: row.endAt, questions: []
    };
    paper.questions.push(row);
    byExam.set(row.source.examId, paper);
  }
  return [...byExam.values()]
    .filter(paper => examMatchesStudent({ className: paper.className, group: paper.group }, student))
    .sort((a, b) => b.endAt - a.endAt);
}
/** The pool the random drill draws from — the questions of every practicable
    paper, class/batch-matched. */
function practicePool(student, now = Date.now()) {
  const ids = new Set();
  for (const paper of practicePapers(student, now)) paper.questions.forEach(row => ids.add(row.id));
  return listQuestions().filter(row => ids.has(row.id));
}
const bestScore = (sessions, examId) => {
  const own = sessions.filter(session => session.kind === 'paper' && session.examId === examId);
  return own.length ? own.reduce((best, session) => (session.score > best.score ? session : best)) : null;
};
function startSession(student, { kind, title, examId = '', examCode = '', questions }) {
  const session = {
    id: sessionId(), at: Date.now(), kind, title, examId, examCode,
    className: student.className || '', subject: '',
    order: shuffle(questions).map(row => ({ id: row.id, options: row.options.map(option => option.id) })),
    total: questions.length, answers: {},
    /* A copy, on purpose: a practice sheet keeps working even if the shelf
       row is edited or removed while the student is mid-session. */
    questions: questions.map(row => ({ id: row.id, text: row.text, answer: row.answer, options: row.options.map(option => ({ id: option.id, text: option.text })) }))
  };
  saveFor(student, { ...storeFor(student), active: session });
  return session;
}
function finishSession(student, session) {
  const results = {}; let correct = 0, wrong = 0, unanswered = 0;
  for (const question of session.questions) {
    const chosen = session.answers[question.id] || '';
    const isCorrect = !!chosen && chosen === question.answer;
    if (!chosen) unanswered += 1; else if (isCorrect) correct += 1; else wrong += 1;
    results[question.id] = { chosen, correct: isCorrect };
  }
  const record = {
    id: session.id, at: session.at, kind: session.kind, title: session.title, examId: session.examId,
    total: session.total, score: correct, correct, wrong, unanswered,
    results, order: session.order, answers: session.answers, questions: session.questions
  };
  const entry = storeFor(student);
  entry.active = null;
  entry.sessions = [record, ...entry.sessions].slice(0, MAX_SESSIONS);
  saveFor(student, entry);
  return record;
}

export function initStudentPractice({ getStudent, getAccount }) {
  const root = document.querySelector('#studentPracticeWorkspace'); if (!root) return () => {};
  let view = 'list', activeSession = null, lastRecord = null, busy = false;
  root.classList.add('exam-workspace', 'practice-workspace');
  root.innerHTML = '<p class="exam-error" data-practice-error role="alert" hidden></p><p class="exam-message" data-practice-message role="status" hidden></p><div data-practice-content></div>';
  const $ = selector => root.querySelector(selector), content = $('[data-practice-content]');
  const activeAccount = () => getAccount()?.status === 'active';
  const button = (action, label, id = '', cls = '') => `<button type="button" class="${cls}" data-practice-action="${action}" data-id="${esc(id)}">${label}</button>`;
  function error(text) { const node = $('[data-practice-error]'); node.textContent = text; node.hidden = !text; }
  function message(text) { const node = $('[data-practice-message]'); node.textContent = text; node.hidden = !text; }

  function historyMarkup(sessions) {
    if (!sessions.length) return '';
    return `<section aria-label="সাম্প্রতিক অনুশীলন"><h3>সাম্প্রতিক অনুশীলন</h3><div class="practice-history">${sessions.slice(0, 10).map(session => {
      const percent = session.total ? Math.round(session.score / session.total * 100) : 0;
      return `<p class="practice-history-row"><span>${when(session.at)}</span><span>${esc(session.title)}</span><strong>${num(session.score)}/${num(session.total)} • ${num(percent)}%</strong></p>`;
    }).join('')}</div></section>`;
  }
  function list() {
    view = 'list'; activeSession = null; lastRecord = null;
    if (!activeAccount()) { content.innerHTML = '<p class="exam-card">অনুমোদিত অ্যাকাউন্ট দিয়ে লগইন করতে হবে।</p>'; return; }
    const student = getStudent(), now = Date.now();
    const papers = practicePapers(student, now), pool = practicePool(student, now), entry = storeFor(student);
    const poolSize = pool.length ? Math.min(RANDOM_SIZE, pool.length) : 0;
    content.innerHTML = `
      <section class="exam-card practice-card" aria-label="ইনস্ট্যান্ট MCQ অনুশীলন">
        <h2>ইনস্ট্যান্ট MCQ অনুশীলন</h2>
        <p class="exam-note">কোনো সময়সূচি বা সময়সীমা নেই — যেকোনো মুহূর্তে শুরু করো, জমা দিলেই সাথে সাথে ফলাফল ও সঠিক উত্তর। এটি নিজের অনুশীলন; আনুষ্ঠানিক পরীক্ষার ফলাফলে এর কোনো প্রভাব পড়ে না।</p>
        ${entry.active ? `<div class="exam-actions">${button('resume-active', 'চলন্ত অনুশীলনে ফিরে যাও', entry.active.id, 'primary')}</div>` : ''}
        <div class="exam-actions">${poolSize ? button('start-random', `র‍্যান্ডম অনুশীলন (${num(poolSize)}টি প্রশ্ন)`, '', 'primary') : '<small>অনুশীলনের জন্য এখনও প্রশ্ন নেই — MCQ পরীক্ষার সময় শেষ হলে তার প্রশ্নগুলো নিজে থেকেই এখানে আসবে।</small>'}</div>
      </section>
      <section aria-label="গত পরীক্ষা অনুশীলন"><h3>গত পরীক্ষা অনুশীলন</h3>
        <div class="exam-list">${papers.map(paper => {
          const best = bestScore(entry.sessions, paper.examId);
          return `<article class="exam-card">
            <h4>${esc(paper.title)}</h4>
            <p class="exam-note">${when(paper.endAt)} • ${num(paper.questions.length)}টি প্রশ্ন${paper.subject ? ` • ${esc(paper.subject)}` : ''}</p>
            <p class="exam-note practice-best">${best ? `তোমার সেরা: ${num(best.score)}/${num(best.total)}` : 'এখনও অনুশীলন করা হয়নি।'}</p>
            <div class="exam-actions">${button('start-paper', 'অনুশীলন শুরু করুন', paper.examId, 'primary')}</div>
          </article>`;
        }).join('') || '<p class="exam-card">এখনও কোনো গত MCQ পরীক্ষার প্রশ্ন ব্যাংকে নেই।</p>'}</div>
      </section>
      ${historyMarkup(entry.sessions)}`;
  }
  function updateStatus() {
    const node = $('[data-practice-status]');
    if (node && activeSession) node.textContent = `${num(Object.keys(activeSession.answers).length)} / ${num(activeSession.total)} উত্তর দেওয়া • এই ফোনে সংরক্ষিত`;
  }
  function active(session) {
    view = 'active'; activeSession = session; lastRecord = null;
    content.innerHTML = `
      <div class="exam-actions">${button('keep', '← তালিকা (চলন্ত উত্তর সংরক্ষিত থাকবে)')}</div>
      <div class="exam-timer practice-timer"><span>ইনস্ট্যান্ট অনুশীলন • সময়সীমা নেই</span><strong>নিজের পিচে দাও</strong><small data-practice-status></small></div>
      <h2>${esc(session.title)}</h2>
      <p class="exam-note">সব প্রশ্ন একসঙ্গে দেখানো হয়েছে — খুঁজতে স্ক্রল করো। চাইলে যেকোনো উত্তর বদলাও; জমা দিলে সাথে সাথে সঠিক/ভুল ও সঠিক উত্তর দেখাবে।</p>
      <div class="exam-question-list">${session.order.map((item, i) => {
        const question = session.questions.find(q => q.id === item.id);
        return `<fieldset class="exam-question"><legend>প্রশ্ন ${num(i + 1)}</legend><p>${esc(question.text)}</p>${item.options.map(id => {
          const option = question.options.find(o => o.id === id);
          return `<label class="exam-option"><input type="radio" name="practice-${question.id}" value="${id}" data-practice-answer="${question.id}" ${session.answers[question.id] === id ? 'checked' : ''}><span>${id}. ${esc(option.text)}</span></label>`;
        }).join('')}</fieldset>`;
      }).join('')}</div>
      <div class="exam-actions">${button('confirm', 'উত্তরপত্র জমা দাও', '', 'primary')}</div>
      <div class="exam-card" data-practice-confirm hidden><h3>এখনই জমা দেবে?</h3><p>জমা দেওয়ার পর এই অনুশীলনের উত্তর বদলানো যাবে না — ফলাফলের স্ক্রিন থেকে আবার শুরু করা যাবে।</p><div class="exam-actions">${button('finish', 'হ্যাঁ, জমা দাও', '', 'primary')}${button('cancel-confirm', 'উত্তরে ফিরে যাও')}</div></div>`;
    updateStatus();
  }
  function result(record) {
    view = 'result'; activeSession = null; lastRecord = record;
    const percent = record.total ? Math.round(record.score / record.total * 100) : 0;
    content.innerHTML = `
      <div class="exam-actions">${button('list', '← অনুশীলনের তালিকা')}${button('repeat', record.kind === 'paper' ? 'আবার অনুশীলন করো' : 'নতুন র‍্যান্ডম অনুশীলন', record.examId, 'primary')}</div>
      <div class="exam-summary"><h3>${esc(record.title)}</h3>
        <strong>${num(record.score)} / ${num(record.total)} (${num(percent)}%)</strong>
        <p>সঠিক ${num(record.correct)} • ভুল ${num(record.wrong)} • অনুত্তরিত ${num(record.unanswered)}</p>
        <p class="exam-note">এটি অনুশীলনের ফলাফল — আনুষ্ঠানিক ফলাফল, র‍্যাংক বা দ্বিতীয় সুযোগে যুক্ত হয় না।</p>
      </div>
      <div class="exam-question-list practice-review">${record.order.map((item, i) => {
        const question = record.questions.find(q => q.id === item.id);
        const res = record.results[item.id] || { chosen: '', correct: false };
        const mark = res.correct ? '✓ সঠিক' : res.chosen ? '✗ ভুল' : '— অনুত্তরিত';
        const state = res.correct ? 'practice-correct' : res.chosen ? 'practice-wrong' : 'practice-skip';
        const chosenText = question.options.find(o => o.id === res.chosen)?.text || '';
        const answerText = question.options.find(o => o.id === question.answer)?.text || '';
        return `<fieldset class="exam-question ${state}"><legend>প্রশ্ন ${num(i + 1)} • ${mark}</legend><p>${esc(question.text)}</p>
          <p class="exam-note">তোমার উত্তর: ${res.chosen ? `${res.chosen}. ${esc(chosenText)}` : 'অনুত্তরিত'} • সঠিক উত্তর: <strong>${question.answer}. ${esc(answerText)}</strong></p>
        </fieldset>`;
      }).join('')}</div>`;
  }
  function repaint() {
    if (view === 'active' && activeSession) active(activeSession);
    else if (view === 'result' && lastRecord) result(lastRecord);
    else list();
  }
  async function refresh() {
    if (busy || !activeAccount()) { if (view === 'list') list(); return; }
    busy = true; error('');
    try {
      /* The student's own device also fills the shelf from its papers, so
         practice works offline on a device that never saw the manager. */
      const db = await repo.list();
      await ensureExamsInBank(db.exams, 'Student');
      repaint();
    } catch (e) { error(e.message || 'অনুশীলনের ডেটা লোড হয়নি। আবার চেষ্টা করো।'); }
    finally { busy = false; }
  }
  root.addEventListener('change', event => {
    const input = event.target.closest('[data-practice-answer]');
    if (!input || !activeSession) return;
    activeSession.answers[input.dataset.practiceAnswer] = input.value;
    saveFor(getStudent(), { ...storeFor(getStudent()), active: activeSession });
    updateStatus();
  });
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-practice-action]');
    if (!target || busy) return;
    const action = target.dataset.practiceAction, student = getStudent();
    error(''); message('');
    if (action === 'list') { view = 'list'; lastRecord = null; refresh(); return; }
    if (action === 'refresh') { refresh(); return; }
    if (!activeAccount()) { error('অনুমোদিত অ্যাকাউন্ট দিয়ে লগইন করতে হবে।'); return; }
    if (action === 'start-random') {
      const pool = shuffle(practicePool(student));
      if (!pool.length) { error('অনুশীলনের জন্য ব্যাংকে প্রশ্ন নেই।'); return; }
      const session = startSession(student, { kind: 'random', title: 'র‍্যান্ডম অনুশীলন (গত পরীক্ষার প্রশ্ন)', questions: pool.slice(0, RANDOM_SIZE) });
      active(session);
    } else if (action === 'start-paper') {
      const paper = practicePapers(student).find(p => p.examId === target.dataset.id);
      if (!paper) { error('এই পরীক্ষাটি এখন অনুশীলন করা যাচ্ছে না।'); return; }
      const session = startSession(student, { kind: 'paper', title: paper.title, examId: paper.examId, examCode: paper.examCode, questions: paper.questions });
      active(session);
    } else if (action === 'resume-active') {
      const entry = storeFor(student);
      if (entry.active) active(entry.active); else list();
    } else if (action === 'keep') {
      /* The in-progress sheet is already saved to this device on every
         answer, so leaving it keeps the work. */
      list();
    } else if (action === 'confirm') {
      const node = $('[data-practice-confirm]');
      if (node) { node.hidden = false; $('[data-practice-action="finish"]')?.focus(); }
    } else if (action === 'cancel-confirm') { const node = $('[data-practice-confirm]'); if (node) node.hidden = true; }
    else if (action === 'finish') {
      if (!activeSession) return;
      const record = finishSession(student, activeSession);
      result(record);
    } else if (action === 'repeat') {
      if (lastRecord?.kind === 'paper') {
        const paper = practicePapers(student).find(p => p.examId === lastRecord.examId);
        if (paper) active(startSession(student, { kind: 'paper', title: paper.title, examId: paper.examId, examCode: paper.examCode, questions: paper.questions }));
        else message('এই পরীক্ষাটি এখন আর অনুশীলন করা যাচ্ছে না।');
      } else {
        const pool = shuffle(practicePool(student));
        if (pool.length) active(startSession(student, { kind: 'random', title: 'র‍্যান্ডম অনুশীলন (গত পরীক্ষার প্রশ্ন)', questions: pool.slice(0, RANDOM_SIZE) }));
        else message('অনুশীলনের জন্য ব্যাংকে প্রশ্ন নেই।');
      }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  refresh();
  return () => refresh();
}
