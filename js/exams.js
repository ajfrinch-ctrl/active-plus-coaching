/* Exam feature: catalogue, offline runner, local scoring and answer review.
 * Attempts never leave the device — see js/storage.js for the stored shape. */
import { exams, examSubjectTones, subjectInitials } from './config.js';
import { loadExamAttempt, loadExamAttempts, saveExamAttempt, updateExamAttempt, loadExamDraft, saveExamDraft, clearExamDraft } from './storage.js';
import { $, $$, showFeedback, toBanglaNumber, openModal, closeModal } from './ui.js';
import { isCorrectAnswer } from './exam-hash.js';
import { setView } from './shell.js';

let filter = 'all';
let running = null;
let reviewExamId = null;
let canUseFeatures = () => true;

const OPTION_KEYS = 'কখগঘঙচছ';

function escapeText(value) {
  return String(value ?? '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}
const BADGE_TONES = Object.freeze({ green: 'green', blue: 'blue', yellow: 'orange', orange: 'orange', purple: '', coral: '' });

/* ---------- helpers ---------- */

function marksFor(exam, type) {
  return exam.questions.reduce((sum, item) => (item.type === type ? sum + item.marks : sum), 0);
}

function totalMarks(exam) {
  return marksFor(exam, 'mcq') + marksFor(exam, 'written');
}

function formatMarks(value) {
  return toBanglaNumber(Number.isInteger(value) ? String(value) : value.toFixed(1));
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return toBanglaNumber(`${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`);
}

function countAnswered(exam, answers) {
  return exam.questions.filter(question => String(answers[question.id] || '').trim() !== '').length;
}

export function examStatus(exam, now = Date.now()) {
  const starts = exam.startsAt ? Date.parse(exam.startsAt) : null;
  const ends = exam.endsAt ? Date.parse(exam.endsAt) : null;

  if (starts !== null && now < starts) {
    const hoursLeft = (starts - now) / 3600000;
    return {
      key: 'upcoming',
      label: 'আসন্ন',
      note: hoursLeft < 24 ? 'আজই শুরু হবে' : `${toBanglaNumber(Math.ceil(hoursLeft / 24))} দিন বাকি`
    };
  }
  if (ends !== null && now > ends) {
    return { key: 'closed', label: 'সময় শেষ', note: 'জমা দেওয়ার সময় শেষ হয়েছে' };
  }
  return {
    key: 'open',
    label: 'খোলা আছে',
    note: ends === null
      ? 'যেকোনো সময় দিতে পারবে'
      : `${new Date(ends).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })} পর্যন্ত খোলা`
  };
}

function findExam(examId) {
  return exams.find(exam => exam.id === examId) || null;
}

function gradeAttempt(exam, answers, checks) {
  const review = [];
  let objectiveMarks = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let writtenMarks = 0;

  exam.questions.forEach(question => {
    const answer = answers[question.id];
    const filled = answer !== undefined && answer !== null && String(answer).trim() !== '';
    if (!filled) unanswered += 1;

    if (question.type === 'mcq') {
      const isRight = filled && isCorrectAnswer(question, answer);
      if (isRight) {
        objectiveMarks += question.marks;
        correct += 1;
      } else if (filled) {
        wrong += 1;
      }
      review.push({ question, answer: filled ? answer : 'উত্তর দেওয়া হয়নি', state: filled ? (isRight ? 'right' : 'wrong') : 'skipped', earned: isRight ? question.marks : 0 });
      return;
    }

    const ticked = ((checks || {})[question.id] || []).filter(Boolean).length;
    const earned = question.checkpoints.length ? (question.marks * ticked) / question.checkpoints.length : 0;
    writtenMarks += earned;
    review.push({ question, answer: filled ? answer : 'উত্তর লেখা হয়নি', state: filled ? 'written' : 'skipped', earned, ticked });
  });

  const total = objectiveMarks + writtenMarks;
  const available = totalMarks(exam);

  return {
    review,
    correct,
    wrong,
    unanswered,
    marks: {
      objective: objectiveMarks,
      objectiveTotal: marksFor(exam, 'mcq'),
      written: Math.round(writtenMarks * 2) / 2,
      writtenTotal: marksFor(exam, 'written'),
      total: Math.round(total * 2) / 2,
      available,
      percent: available ? Math.round((total / available) * 100) : 0,
      passed: available ? (total / available) * 100 >= exam.passPercent : false
    }
  };
}

/* ---------- exams view ---------- */

function examCard(exam) {
  const status = examStatus(exam);
  const attempt = loadExamAttempt(exam.id);
  const draft = loadExamDraft(exam.id);
  const tone = examSubjectTones[exam.subject] || 'green';
  const actions = [];

  if (status.key === 'open') {
    actions.push(`<button class="exam-primary" type="button" data-exam-start="${exam.id}">${draft ? 'উত্তর চালিয়ে যাও' : attempt ? 'আবার পরীক্ষা দাও' : 'পরীক্ষা শুরু করো'}</button>`);
  }
  if (attempt) actions.push(`<button class="exam-ghost" type="button" data-exam-review="${exam.id}">রিভিউ দেখো</button>`);
  if (status.key !== 'open') actions.push(`<button class="exam-ghost" type="button" data-exam-notes="${exam.id}">নির্দেশনা দেখো</button>`);

  return `
    <article class="exam-card ${status.key}">
      <div class="exam-card-top">
        <span class="subject-icon ${tone}">${subjectInitials[exam.subject] || 'পর'}</span>
        <div class="exam-card-title"><strong>${exam.title}</strong><small>${exam.subject} · ${exam.scope}</small></div>
        <span class="exam-state ${status.key}">${status.label}</span>
      </div>
      <div class="exam-meta">
        <span>${exam.date}</span><span>${toBanglaNumber(exam.minutes)} মিনিট</span>
        <span>${formatMarks(totalMarks(exam))} নম্বর</span><span>${toBanglaNumber(exam.questions.length)}টি প্রশ্ন</span>
      </div>
      ${attempt ? `<p class="exam-attempt">সর্বশেষ ফল <b>${formatMarks(attempt.marks.total)}/${formatMarks(attempt.marks.available)}</b> · ${toBanglaNumber(attempt.marks.percent)}% · ${attempt.marks.passed ? 'উত্তীর্ণ' : 'আরও অনুশীলন দরকার'}${attempt.tries > 1 ? ` · ${toBanglaNumber(attempt.tries)} বার চেষ্টা` : ''}</p>` : ''}
      ${draft && status.key === 'open' ? `<p class="exam-draft">অসম্পন্ন উত্তর সংরক্ষিত আছে — ${toBanglaNumber(countAnswered(exam, draft.answers || {}))}/${toBanglaNumber(exam.questions.length)}টি প্রশ্নে উত্তর দিয়েছ, ${formatClock(draft.remaining || 0)} সময় বাকি।</p>` : ''}
      ${!attempt && !draft ? `<p class="exam-hint">${exam.teacher} · ${status.note}</p>` : ''}
      <div class="exam-card-actions">${actions.join('') || `<p class="exam-locked">${status.note}</p>`}</div>
    </article>
  `;
}

function renderExams() {
  const list = $('#examList');
  if (!list) return;

  const attempts = loadExamAttempts();
  const rows = exams.filter(exam => {
    if (filter === 'all') return true;
    if (filter === 'done') return Boolean(attempts[exam.id]);
    if (filter === 'progress') return Boolean(loadExamDraft(exam.id));
    return examStatus(exam).key === filter;
  });

  const summary = $('#examSummary');
  if (summary) {
    const openCount = exams.filter(exam => examStatus(exam).key === 'open').length;
    const finished = Object.values(attempts);
    const average = finished.length
      ? Math.round(finished.reduce((sum, item) => sum + (item.marks?.percent || 0), 0) / finished.length)
      : null;
    const pending = exams.filter(exam => loadExamDraft(exam.id)).length;

    summary.innerHTML = `
      <div class="exam-summary-hero">
        <div><span class="card-eyebrow">এই মুহূর্তে</span><h2>${toBanglaNumber(openCount)}টি পরীক্ষা খোলা আছে</h2><p>নিজের ফোনেই দাও; শিক্ষক নম্বর অনুমোদন করলে সেটাই চূড়ান্ত হবে।</p></div>
        <div class="exam-summary-score"><small>গড় ফল</small><strong>${average === null ? '—' : `${toBanglaNumber(average)}<small>%</small>`}</strong></div>
      </div>
      <div class="exam-summary-stats">
        <div><small>মোট পরীক্ষা</small><strong>${toBanglaNumber(exams.length)}</strong></div>
        <div><small>জমা দিয়েছ</small><strong>${toBanglaNumber(finished.length)}</strong></div>
        <div><small>অসম্পন্ন খসড়া</small><strong>${toBanglaNumber(pending)}</strong></div>
      </div>
    `;
  }

  list.innerHTML = rows.map(examCard).join('');
  list.hidden = rows.length === 0;

  const empty = $('#examEmpty');
  if (empty) {
    empty.hidden = rows.length !== 0;
    empty.textContent = filter === 'done'
      ? 'এখনো কোনো পরীক্ষা জমা দাওনি — “খোলা আছে” ট্যাব থেকে শুরু করো।'
      : 'এই ফিল্টারে এখন কোনো পরীক্ষা নেই।';
  }

  $$('.exam-tab').forEach(tab => {
    const selected = tab.dataset.examFilter === filter;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
}

/* ---------- runner ---------- */

function saveDraft() {
  if (!running) return;
  saveExamDraft(running.exam.id, {
    answers: running.answers,
    index: running.index,
    remaining: running.remaining,
    startedAt: running.startedAt
  });
}

/* A typed answer only reaches storage after a short debounce, so every path that
 * leaves or finalises the paper flushes it first. */
function flushDraft() {
  if (!running) return;
  if (running.saveTimer) window.clearTimeout(running.saveTimer);
  running.saveTimer = null;
  saveDraft();
}

function stopTimer() {
  if (running?.timer) window.clearInterval(running.timer);
  if (!running) return;
  if (running.timer) window.clearInterval(running.timer);
  if (running.saveTimer) window.clearTimeout(running.saveTimer);
  running.timer = null;
  running.saveTimer = null;
}

function guardUnload(event) {
  flushDraft();
  event.preventDefault();
  event.returnValue = '';
}

function startTimer() {
  stopTimer();
  running.timer = window.setInterval(() => {
    running.remaining -= 1;
    paintTimer();
    if (running.remaining % 15 === 0) saveDraft();
    if (running.remaining <= 0) {
      showFeedback('সময় শেষ — উত্তর স্বয়ংক্রিয়ভাবে জমা হয়েছে');
      submitExam({ auto: true });
    }
  }, 1000);
}

function paintTimer() {
  const value = $('#examTimeLeft');
  if (value) value.textContent = formatClock(running.remaining);
  const pill = $('#examTimer');
  if (pill) pill.classList.toggle('low', running.remaining <= 60);
}

function renderPalette() {
  const palette = $('#examPalette');
  if (!palette) return;

  palette.innerHTML = running.exam.questions.map((question, index) => {
    const filled = String(running.answers[question.id] || '').trim() !== '';
    return `<button type="button" class="exam-dot${filled ? ' filled' : ''}${index === running.index ? ' current' : ''}" data-exam-goto="${index}" aria-label="প্রশ্ন ${toBanglaNumber(index + 1)}">${toBanglaNumber(index + 1)}</button>`;
  }).join('');
}

function renderQuestion() {
  const { exam } = running;
  const question = exam.questions[running.index];
  const isLast = running.index === exam.questions.length - 1;
  const chosen = running.answers[question.id];

  $('#examRunnerSubject').textContent = `${exam.subject} · ${exam.scope}`;
  $('#examRunnerTitle').textContent = exam.title;
  $('#examProgressFill').style.width = `${Math.round(((running.index + 1) / exam.questions.length) * 100)}%`;
  $('#examProgressLabel').textContent = `প্রশ্ন ${toBanglaNumber(running.index + 1)}/${toBanglaNumber(exam.questions.length)}`;
  $('#examAnsweredLabel').textContent = `${toBanglaNumber(countAnswered(exam, running.answers))}টি উত্তর দেওয়া হয়েছে`;
  paintTimer();

  const body = $('#examQuestion');
  if (question.type === 'mcq') {
    body.innerHTML = `
      <p class="exam-question-marks">${formatMarks(question.marks)} নম্বর · একটি উত্তর বাছো</p>
      <h3 class="exam-question-text">${question.prompt}</h3>
      <div class="exam-options" role="radiogroup" aria-label="উত্তরের অপশন">
        ${question.options.map((option, index) => `
          <button type="button" role="radio" aria-checked="${option === chosen}" class="exam-option${option === chosen ? ' selected' : ''}" data-exam-option="${index}">
            <span class="exam-option-key">${OPTION_KEYS[index] || index + 1}</span>
            <span class="exam-option-text">${option}</span>
          </button>
        `).join('')}
      </div>
      <button type="button" class="exam-clear" data-exam-clear="1"${chosen ? '' : ' disabled'}>এই প্রশ্নের উত্তর মুছে ফেলো</button>
    `;
  } else {
    body.innerHTML = `
      <p class="exam-question-marks">${formatMarks(question.marks)} নম্বর · লিখিত প্রশ্ন</p>
      <h3 class="exam-question-text">${question.prompt}</h3>
      <label class="exam-written-label" for="examWritten">তোমার উত্তর</label>
      <textarea id="examWritten" class="exam-written" rows="8" placeholder="যেভাবে খাতায় লিখতে, এভাবেই লেখো…">${escapeText(chosen)}</textarea>
      <p class="exam-checklist-title">নম্বর দেওয়ার শিক্ষক যা যা খুঁজবেন</p>
      <ul class="exam-checklist">${question.checkpoints.map(point => `<li>${point}</li>`).join('')}</ul>
    `;
  }

  $('#examPrev').disabled = running.index === 0;
  const next = $('#examNext');
  next.textContent = isLast ? 'জমা দিন' : 'পরের প্রশ্ন';
  next.dataset.examNav = isLast ? 'submit' : 'next';
  renderPalette();
}

function openRunner(exam, draft) {
  running = {
    exam,
    answers: { ...(draft?.answers || {}) },
    index: Math.min(Math.max(0, draft?.index || 0), exam.questions.length - 1),
    remaining: Number.isFinite(draft?.remaining) ? draft.remaining : exam.minutes * 60,
    startedAt: draft?.startedAt || Date.now(),
    timer: null,
    saveTimer: null
  };

  if (running.remaining <= 0) {
    running.remaining = exam.minutes * 60;
    clearExamDraft(exam.id);
  }

  $('#examRunner').hidden = false;
  document.body.classList.add('exam-running');
  window.addEventListener('beforeunload', guardUnload);
  renderQuestion();
  startTimer();
  $('#examRunner').scrollTop = 0;
}

function closeRunner() {
  stopTimer();
  running = null;
  $('#examRunner').hidden = true;
  if (!$('#examReview') || $('#examReview').hidden) document.body.classList.remove('exam-running');
  window.removeEventListener('beforeunload', guardUnload);
}

function requestSubmit() {
  flushDraft();
  const missing = running.exam.questions.length - countAnswered(running.exam, running.answers);
  $('#examSubmitInfo').textContent = missing
    ? `${toBanglaNumber(missing)}টি প্রশ্নের উত্তর দিওনি। জমা দিলে আর পরিবর্তন করা যাবে না।`
    : `সব ${toBanglaNumber(running.exam.questions.length)}টি প্রশ্নের উত্তর দেওয়া আছে।`;
  openModal('examSubmitModal');
}

function submitExam({ auto = false } = {}) {
  if (!running) return;

  const { exam, answers } = running;
  const graded = gradeAttempt(exam, answers, {});

  saveExamAttempt(exam.id, {
    submittedAt: Date.now(),
    durationUsed: Math.max(0, Math.round((Date.now() - running.startedAt) / 1000)),
    autoSubmitted: auto,
    answers,
    marks: graded.marks,
    correct: graded.correct,
    unanswered: graded.unanswered,
    selfAssessed: marksFor(exam, 'written') === 0
  });

  closeModal('examSubmitModal');
  closeRunner();
  showFeedback(auto ? 'সময় শেষ হওয়ায় উত্তর জমা হয়েছে' : 'উত্তর জমা হয়েছে');
  renderExams();
  renderDeviceResults();
  openReview(exam.id);
}

/* ---------- review and written self-assessment ---------- */

function reviewRow(item, index) {
  const { question } = item;
  const label = { right: 'সঠিক', wrong: 'ভুল', skipped: 'অনুত্তর', written: 'লিখিত' }[item.state];
  const mark = { right: '✓', wrong: '✕', skipped: '—', written: '✓' }[item.state];
  const correctOption = question.type === 'mcq' && item.state !== 'right'
    ? question.options.find(option => isCorrectAnswer(question, option))
    : null;

  return `
    <article class="exam-review-item ${item.state}">
      <div class="exam-review-head">
        <span class="exam-review-no">${toBanglaNumber(index + 1)}</span>
        <span class="exam-review-mark ${item.state}">${mark} ${label}</span>
        <span class="exam-review-marks">${formatMarks(item.earned || 0)}/${formatMarks(question.marks)}</span>
      </div>
      <h4>${question.prompt}</h4>
      <p class="exam-review-answer">তোমার উত্তর: <b>${question.type === 'written' ? escapeText(item.answer) : item.answer}</b></p>
      ${correctOption ? `<p class="exam-review-answer">সঠিক উত্তর: <b>${correctOption}</b></p>` : ''}
      ${question.type === 'mcq' && question.explanation ? `<p class="exam-review-explain">${question.explanation}</p>` : ''}
    </article>
  `;
}

function selfAssessmentBlock(exam, attempt) {
  const written = exam.questions.filter(question => question.type === 'written');
  if (!written.length) return '';

  const checks = attempt.checks || {};
  return `
    <div class="exam-selfassess">
      <div class="section-heading section-heading-spaced"><div><p class="eyebrow">লিখিত অংশ</p><h2>নিজের মূল্যায়ন</h2></div></div>
      <p class="exam-selfassess-note">যে পয়েন্টগুলো তোমার উত্তরে লেখা হয়েছে সেগুলোতে টিক দাও। এটি শুধু আনুমানিক নম্বর — চূড়ান্ত নম্বর শিক্ষক নির্ধারণ করবেন।</p>
      ${written.map(question => `
        <fieldset class="exam-assess-card">
          <legend>${question.prompt}</legend>
          <p class="exam-assess-answer">${escapeText(attempt.answers?.[question.id] || 'উত্তর লেখা হয়নি')}</p>
          ${question.checkpoints.map((point, index) => `
            <label class="exam-check"><input type="checkbox" data-exam-check="${question.id}" data-exam-point="${index}" ${checks[question.id]?.[index] ? 'checked' : ''}><span>${point}</span></label>
          `).join('')}
        </fieldset>
      `).join('')}
      <button class="exam-primary exam-primary-block" type="button" data-exam="save-assessment">মূল্যায়ন সংরক্ষণ করো</button>
    </div>
  `;
}

function openReview(examId) {
  const exam = findExam(examId);
  const attempt = exam ? loadExamAttempt(examId) : null;
  if (!exam || !attempt) return;

  reviewExamId = examId;
  const graded = gradeAttempt(exam, attempt.answers || {}, attempt.checks || {});
  const pendingWritten = graded.marks.writtenTotal > 0 && !attempt.checks;

  $('#examReviewBody').innerHTML = `
    <div class="exam-score-hero ${graded.marks.passed && !pendingWritten ? 'pass' : 'review'}">
      <span class="card-eyebrow">${exam.title}</span>
      <h2 id="examScorePercent">${toBanglaNumber(graded.marks.percent)}<small>%</small></h2>
      <p id="examScoreLine"><b>${formatMarks(graded.marks.total)}</b> / ${formatMarks(graded.marks.available)} নম্বর · ${graded.marks.passed ? 'উত্তীর্ণ' : `পাস হতে ${toBanglaNumber(exam.passPercent)}% দরকার`}</p>
      ${pendingWritten ? '<span class="exam-pending-tag">লিখিত অংশের মূল্যায়ন বাকি</span>' : ''}
    </div>
    <div class="exam-score-stats">
      <div><small>সঠিক</small><strong>${toBanglaNumber(graded.correct)}</strong></div>
      <div><small>ভুল</small><strong>${toBanglaNumber(graded.wrong)}</strong></div>
      <div><small>অনুত্তর</small><strong>${toBanglaNumber(graded.unanswered)}</strong></div>
      <div><small>সময় লেগেছে</small><strong>${formatClock(attempt.durationUsed || 0)}</strong></div>
    </div>
    <div class="exam-review-note">
      <div><small>অবজেক্টিভ</small><strong>${formatMarks(graded.marks.objective)}/${formatMarks(graded.marks.objectiveTotal)}</strong></div>
      <div><small>লিখিত</small><strong id="examWrittenStat">${formatMarks(graded.marks.written)}/${formatMarks(graded.marks.writtenTotal)}</strong></div>
      <div><small>জমা</small><strong>${new Date(attempt.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</strong></div>
    </div>
    <div class="section-heading section-heading-spaced"><div><p class="eyebrow">বিস্তারিত</p><h2>উত্তর পর্যালোচনা</h2></div></div>
    <div class="exam-review-list">${exam.questions.map((question, index) => reviewRow(graded.review[index], index)).join('')}</div>
    ${selfAssessmentBlock(exam, attempt)}
    <div class="exam-review-actions">
      <button class="exam-primary" type="button" data-exam="review-close">পরীক্ষা তালিকায় ফিরে যাও</button>
      <button class="exam-ghost" type="button" data-exam="results">ফলাফল সেকশন</button>
    </div>
  `;

  $('#examReview').hidden = false;
  document.body.classList.add('exam-running');
  $('#examReview').scrollTop = 0;
}

function closeReview() {
  const review = $('#examReview');
  if (review) review.hidden = true;
  reviewExamId = null;
  if (!running) document.body.classList.remove('exam-running');
}

function applyAssessment({ announce = false } = {}) {
  const exam = findExam(reviewExamId);
  const attempt = exam ? loadExamAttempt(exam.id) : null;
  if (!exam || !attempt) return;

  const checks = {};
  $$('.exam-assess-card input[type="checkbox"]').forEach(input => {
    const id = input.dataset.examCheck;
    const question = exam.questions.find(item => item.id === id);
    checks[id] = checks[id] || new Array(question.checkpoints.length).fill(false);
    checks[id][Number(input.dataset.examPoint)] = input.checked;
  });

  const graded = gradeAttempt(exam, attempt.answers || {}, checks);
  updateExamAttempt(exam.id, { checks, marks: graded.marks, selfAssessed: true });

  const hero = $('.exam-score-hero', $('#examReviewBody'));
  if (hero) {
    hero.classList.toggle('pass', graded.marks.passed);
    $('#examScorePercent').innerHTML = `${toBanglaNumber(graded.marks.percent)}<small>%</small>`;
    $('#examScoreLine').innerHTML = `<b>${formatMarks(graded.marks.total)}</b> / ${formatMarks(graded.marks.available)} নম্বর · ${graded.marks.passed ? 'উত্তীর্ণ' : `পাস হতে ${toBanglaNumber(exam.passPercent)}% দরকার`}`;
    $('.exam-pending-tag', hero)?.remove();
    $('#examWrittenStat').textContent = `${formatMarks(graded.marks.written)}/${formatMarks(graded.marks.writtenTotal)}`;
  }

  renderExams();
  renderDeviceResults();
  if (announce) showFeedback('মূল্যায়ন সংরক্ষিত হয়েছে');
}

/* ---------- ফলাফল সেকশনে ডিভাইসের নিজস্ব পরীক্ষা ---------- */

export function renderDeviceResults() {
  const host = $('#deviceResults');
  if (!host) return;

  const rows = Object.values(loadExamAttempts())
    .sort((first, second) => (second.submittedAt || 0) - (first.submittedAt || 0))
    .map(attempt => {
      const exam = findExam(attempt.examId);
      if (!exam) return '';
      const tone = BADGE_TONES[examSubjectTones[exam.subject]] ?? '';
      return `
        <article class="result-row">
          <span class="result-badge ${tone}">${subjectInitials[exam.subject] || 'পর'}</span>
          <div><strong>${exam.title}</strong><small>${exam.date} · এই ডিভাইসে জমা · ${formatMarks(attempt.marks.total)}/${formatMarks(attempt.marks.available)}</small></div>
          <b>${toBanglaNumber(attempt.marks.percent || 0)}<small>%</small></b>
          <button type="button" class="result-arrow" data-exam-review="${exam.id}" aria-label="${exam.title} বিস্তারিত দেখুন">→</button>
        </article>
      `;
    })
    .join('');

  host.innerHTML = rows;
  const section = $('#deviceResultsSection');
  if (section) section.hidden = rows === '';
}

export function openExamCatalogue(nextFilter = 'all') {
  filter = nextFilter;
  renderExams();
  setView('exams');
}

/* ---------- wiring ---------- */

export function initExams(options = {}) {
  if (typeof options.canUseFeatures === 'function') canUseFeatures = options.canUseFeatures;

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-exam-filter]');
    if (tab) {
      filter = tab.dataset.examFilter;
      renderExams();
      return;
    }

    const review = event.target.closest('[data-exam-review]');
    if (review) {
      openReview(review.dataset.examReview);
      return;
    }

    if (event.target.closest('[data-exam="review-close"]')) {
      closeReview();
      renderExams();
      renderDeviceResults();
      return;
    }

    if (event.target.closest('[data-exam="results"]')) {
      closeReview();
      setView('results');
      return;
    }

    if (event.target.closest('[data-exam="save-assessment"]')) {
      applyAssessment({ announce: true });
      return;
    }

    const start = event.target.closest('[data-exam-start], [data-exam-retake]');
    if (start) {
      if (!canUseFeatures()) {
        showFeedback('অ্যাকাউন্ট অনুমোদিত হলে পরীক্ষা দিতে পারবে');
        return;
      }
      const exam = findExam(start.dataset.examStart || start.dataset.examRetake);
      if (!exam) return;
      if (examStatus(exam).key !== 'open') {
        showFeedback('এই পরীক্ষাটি এখন খোলা নেই');
        return;
      }
      const retake = Boolean(start.dataset.examRetake);
      const draft = retake ? null : loadExamDraft(exam.id);
      if (retake) clearExamDraft(exam.id);
      closeReview();
      openRunner(exam, draft);
      if (draft) showFeedback('সংরক্ষিত উত্তর থেকে চালিয়ে যাচ্ছ');
      return;
    }

    const notes = event.target.closest('[data-exam-notes]');
    if (notes) {
      const exam = findExam(notes.dataset.examNotes);
      if (exam) showFeedback(exam.instructions);
      return;
    }

    if (!running) return;

    const option = event.target.closest('[data-exam-option]');
    if (option) {
      running.answers[running.exam.questions[running.index].id] = running.exam.questions[running.index].options[Number(option.dataset.examOption)];
      saveDraft();
      renderQuestion();
      return;
    }

    if (event.target.closest('[data-exam-clear]')) {
      delete running.answers[running.exam.questions[running.index].id];
      saveDraft();
      renderQuestion();
      return;
    }

    const goto = event.target.closest('[data-exam-goto]');
    if (goto) {
      running.index = Number(goto.dataset.examGoto);
      renderQuestion();
      return;
    }

    const nav = event.target.closest('[data-exam-nav]');
    if (nav) {
      if (nav.dataset.examNav === 'submit') {
        requestSubmit();
        return;
      }
      const delta = nav.dataset.examNav === 'prev' ? -1 : 1;
      running.index = Math.min(Math.max(0, running.index + delta), running.exam.questions.length - 1);
      saveDraft();
      renderQuestion();
      return;
    }

    if (event.target.closest('[data-exam="confirm-submit"]')) {
      submitExam();
      return;
    }

    if (event.target.closest('[data-exam="cancel-submit"]')) {
      closeModal('examSubmitModal');
      return;
    }

    if (event.target.closest('[data-exam="exit"]')) {
      const answered = countAnswered(running.exam, running.answers);
      flushDraft();
      closeRunner();
      renderExams();
      showFeedback(answered ? 'উত্তর সংরক্ষিত — পরে যেখানে থামিয়েছিলে সেখান থেকে চালিয়ে যেতে পারবে' : 'পরীক্ষা বন্ধ করা হয়েছে');
    }
  });

  document.addEventListener('change', event => {
    if (event.target.closest('[data-exam-check]')) applyAssessment();
  });

  // Written answers are saved while typing, so a closed tab never loses work.
  document.addEventListener('input', event => {
    if (!running || event.target.id !== 'examWritten') return;
    running.answers[running.exam.questions[running.index].id] = event.target.value;
    if (running.saveTimer) window.clearTimeout(running.saveTimer);
    running.saveTimer = window.setTimeout(() => {
      if (!running) return;
      saveDraft();
      renderPalette();
      $('#examAnsweredLabel').textContent = `${toBanglaNumber(countAnswered(running.exam, running.answers))}টি উত্তর দেওয়া হয়েছে`;
    }, 400);
  });

  renderExams();
  renderDeviceResults();
}
