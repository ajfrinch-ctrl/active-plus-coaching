/* Demo admin panel: one click in from the login screen, no accounts to create.
 *
 * It manages the things a teacher asked for first — the question bank and test
 * sets — plus the enrolment desk and notices. All writes go to localStorage via
 * js/admin-data.js; js/exams.js reads the published result, so anything saved
 * here is instantly live for the student on this device.
 */
import { $, $$, escapeText, showFeedback, toBanglaNumber } from './ui.js';
import { exams as shippedExams, examSubjectTones, subjectInitials } from './config.js';
import { loadExamAttempts } from './storage.js';
import { renderExams, renderDeviceResults } from './exams.js';
import { renderNotices } from './notices.js';
import {
  authoredExam, clearAdminData, hiddenExams, clearTeacherMarks, deleteAuthoredExam, deleteNotice, effectiveExams,
  endAdminSession, examIsHidden, isAdminSession, isAuthored, patchShippedExam, publishNotice, publishedNotices,
  resetApplicantPin, roster, savePublishedExam, setApplicantStatus, setExamHidden, setTeacherMarks, startDemoAdmin,
  teacherMarks
} from './admin-data.js';

const SUBJECTS = ['উচ্চতর গণিত', 'পদার্থবিজ্ঞান', 'রসায়ন', 'ইংরেজি', 'বাংলা', 'মডেল টেস্ট'];
const TABS = [
  { key: 'overview', label: 'সারসংক্ষেপ' },
  { key: 'bank', label: 'প্রশ্নব্যাংক' },
  { key: 'builder', label: 'পরীক্ষা বানাও' },
  { key: 'attempts', label: 'নম্বর দাও' },
  { key: 'approvals', label: 'অনুমোদন' },
  { key: 'notices', label: 'নোটিশ' }
];

let tab = 'overview';
let draft = null;
let flash = null;
let onExit = null;

/* ---------- open / close ---------- */

export function openAdminPanel(nextTab = 'overview') {
  tab = nextTab;
  const auth = $('#authScreen');
  const shell = $('#appShell');
  const panel = $('#adminScreen');
  if (!panel) return;
  if (auth) auth.hidden = true;
  if (shell) shell.hidden = true;
  panel.hidden = false;
  document.body.classList.add('admin-mode');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderPanel();
}

export function closeAdminPanel() {
  const panel = $('#adminScreen');
  if (panel) panel.hidden = true;
  document.body.classList.remove('admin-mode');
  draft = null;
  renderPanel();
}

export function isPanelOpen() {
  const panel = $('#adminScreen');
  return Boolean(panel && !panel.hidden);
}

/** Keeps the student topbar shortcut honest: only an active demo session shows it. */
export function syncAdminShortcut() {
  const shortcut = $('#adminShortcut');
  if (!shortcut) return;
  shortcut.hidden = !isAdminSession();
}

/* ---------- small render helpers ---------- */

const num = value => toBanglaNumber(String(value ?? ''));
const mark = value => num(Math.round(Number(value) * 2) / 2);

function statTile(label, value, hint) {
  return `<div class="admin-stat"><small>${escapeText(label)}</small><strong>${value}</strong>${hint ? `<p>${escapeText(hint)}</p>` : ''}</div>`;
}

function rowActions(buttons) {
  return `<div class="admin-row-actions">${buttons.filter(Boolean).join('')}</div>`;
}

function adminButton(label, act, extra = '', tone = '') {
  return `<button type="button" class="admin-btn ${tone}" data-admin-act="${act}" ${extra}>${label}</button>`;
}

function flashNote() {
  if (!flash) return '';
  const note = `<p class="admin-flash ${flash.tone}">${escapeText(flash.message)}</p>`;
  flash = null;
  return note;
}

function announce(message, tone = 'good') {
  flash = { message, tone };
  renderPanel();
}

/* ---------- panels ---------- */

function panelOverview() {
  const all = effectiveExams(shippedExams);
  const authored = Object.keys(rosterAuthored()).length;
  const attempts = Object.values(loadExamAttempts());
  const pending = roster().filter(item => item.status === 'pending').length;
  const graded = attempts.filter(attempt => teacherMarks(attempt.examId)).length;
  const overrides = Object.keys(allState().overrides || {}).length;

  return `
    ${flashNote()}
    <div class="admin-lede">
      <h2>এক ক্লিকে ডেমো এডমিন</h2>
      <p>এই প্যানেলটি কোনো সার্ভারে যায় না — যা যা সেভ করো সব এই ব্রাউজারের localStorage-এ থাকে, আর সঙ্গে সঙ্গে শিক্ষার্থীর অ্যাপে দেখা যায়। আসল অ্যাপে এডমিন প্যানেল যুক্ত হলে একই ডেটা শেপ সার্ভার থেকে আসবে।</p>
    </div>
    <div class="admin-stats">
      ${statTile('মোট পরীক্ষা', num(all.length), `${num(authored)}টি এই প্যানেল থেকে`)}
      ${statTile('জমা পড়েছে', num(attempts.length), `${num(graded)}টিতে নম্বর দেওয়া হয়েছে`)}
      ${statTile('অনুমোদন বাকি', num(pending), pending ? 'ডেমো আবেদন' : 'সব দেখা হয়েছে')}
      ${statTile('নোটিশ', num(publishedNotices().length), 'শিক্ষার্থীর ঘণ্টা বাজনে')}
    </div>
    <div class="admin-card">
      <h3>দ্রুত শুরু</h3>
      <ol class="admin-steps">
        <li><b>পরীক্ষা বানাও</b> — প্রশ্ন লেখো, সঠিক অপশন বাছো; সেভ করলে উত্তর হ্যাশ হয়ে যায়।</li>
        <li><b>নম্বর দাও</b> — শিক্ষার্থীর দেওয়া attempt দেখে চূড়ান্ত নম্বর বসাও।</li>
        <li><b>অনুমোদন</b> — pending অ্যাকাউন্ট ছাড়ো, ডেমো অ্যাকাউন্টের PIN রিসেট করো।</li>
      </ol>
      <div class="admin-row-actions">
        ${adminButton('প্রশ্নব্যাংক দেখি', 'tab', 'data-admin-tab="bank"')}
        ${adminButton('নতুন পরীক্ষা', 'new-exam', '', 'primary')}
      </div>
    </div>
    <div class="admin-card admin-danger">
      <h3>লোকাল ডেটা</h3>
      <p>শিপ করা <code>js/config.js</code> কখনো বদলায় না। ${num(overrides)}টি ওভাররাইড ও ${num(authored)}টি লোকাল পরীক্ষা এই ডিভাইসে সংরক্ষিত।</p>
      <div class="row-actions admin-row-actions">
        ${adminButton('JSON এক্সপোর্ট', 'export')}
        ${adminButton('এডমিন ডেটা রিসেট', 'clear-data', '', 'danger')}
      </div>
      <pre class="admin-export" id="adminExport" hidden></pre>
    </div>`;
}

function allState() {
  // reading through the public API keeps this module ignorant of the storage shape
  return { overrides: publishedOverrides() };
}

function publishedOverrides() {
  const list = effectiveExams(shippedExams);
  const overrides = {};
  list.forEach(exam => {
    const original = shippedExams.find(item => item.id === exam.id);
    if (!original) return;
    Object.keys(exam).forEach(key => {
      if (JSON.stringify(exam[key]) !== JSON.stringify(original[key])) overrides[exam.id] = true;
    });
  });
  return overrides;
}

function rosterAuthored() {
  const authored = {};
  effectiveExams(shippedExams).forEach(exam => {
    if (isAuthored(exam.id)) authored[exam.id] = exam;
  });
  return authored;
}

function panelBank() {
  const attempts = loadExamAttempts();
  const rows = effectiveExams(shippedExams).map(exam => {
    const local = isAuthored(exam.id);
    const hidden = examIsHidden(exam.id);
    const mcq = exam.questions.filter(question => question.type !== 'written').length;
    const written = exam.questions.length - mcq;
    const total = exam.questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);
    const submitted = attempts[exam.id];
    const published = teacherMarks(exam.id);
    return `
      <article class="admin-row ${hidden ? 'is-hidden' : ''}">
        <span class="admin-badge ${examSubjectTones[exam.subject] || ''}">${escapeText(subjectInitials[exam.subject] || 'পর')}</span>
        <div class="admin-row-main">
          <strong>${escapeText(exam.title)}</strong>
          <small>${escapeText(exam.subject)} · ${escapeText(exam.scope)}</small>
          <p>${num(exam.questions.length)}টি প্রশ্ন (${num(mcq)} MCQ${written ? ` · ${num(written)} লিখিত` : ''}) · ${mark(total)} নম্বর · ${num(exam.minutes)} মিনিট · ${local ? 'লোকাল' : 'config.js'}${submitted ? ` · ${num(submitted.tries || 1)} বার চেষ্টা` : ''}</p>
        </div>
        <div class="admin-row-side">
          ${published ? `<span class="admin-chip good">নম্বর দেওয়া: ${mark(published.marks)}/${mark(published.total || total)}</span>` : submitted ? '<span class="admin-chip warn">জমা পড়েছে</span>' : '<span class="admin-chip">এখনো কেউ দেয়নি</span>'}
          ${hidden ? '<span class="admin-chip bad">লুকানো</span>' : ''}
        </div>
        ${rowActions([
    local
      ? adminButton('এডিট', 'edit-exam', `data-exam-id="${escapeText(exam.id)}"`)
      : adminButton('উইন্ডো/নির্দেশনা', 'override-exam', `data-exam-id="${escapeText(exam.id)}"`),
    adminButton(submitted ? 'নম্বর' : 'তালিকা', 'tab', `data-admin-tab="${submitted ? 'attempts' : 'attempts'}"`),
    adminButton(hidden ? 'চালু করো' : 'লুকাও', hidden ? 'show-exam' : 'hide-exam', `data-exam-id="${escapeText(exam.id)}"`),
    local ? adminButton('মুছে ফেলো', 'delete-exam', `data-exam-id="${escapeText(exam.id)}"`, 'danger') : ''
  ])}
      </article>`;
  }).join('');

  return `
    <div class="admin-lede">
      <h2>প্রশ্নব্যাংক ও সেট</h2>
      <p>শিপ করা ${num(shippedExams.length)}টি পরীক্ষার পাশে এই প্যানেলে বানানো পরীক্ষাগুলো। লুকালে শিক্ষার্থীর তালিকা থেকে ওঠে যায়, <code>config.js</code> অক্ষত থাকে।</p>
    </div>
    ${flashNote()}
    <div class="admin-row-actions admin-toolbar">${adminButton('+ নতুন পরীক্ষা', 'new-exam', '', 'primary')}</div>
    <div class="admin-list">${rows || '<p class="admin-empty">কোনো পরীক্ষা নেই।</p>'}</div>
    ${hiddenStrip()}`;
}

function hiddenStrip() {
  const hidden = hiddenExams(shippedExams);
  if (!hidden.length) return '';
  return `
    <div class="admin-hidden">
      <p>লুকানো পরীক্ষা (${num(hidden.length)}) — শিক্ষার্থীর তালিকায় নেই — শিপ করা ফাইলে আছে</p>
      <div class="admin-hidden-inner">
        ${hidden.map(item => `
          <span class="admin-hidden-chip">
            <b>${escapeText(item.title)}</b>
            <small>${escapeText(item.subject)}${item.local ? ' · লোকাল' : ''}</small>
            ${rowActions([
    adminButton('চালু করো', 'show-exam', `data-exam-id="${escapeText(item.id)}"`, 'primary'),
    item.local ? adminButton('মুছে ফেলো', 'delete-exam', `data-exam-id="${escapeText(item.id)}"`, 'danger') : ''
  ])}
          </span>`).join('')}
      </div>
    </div>`;
}

function panelBuilder() {
  if (!draft) {
    return `
      <div class="admin-lede"><h2>পরীক্ষা বানাও</h2><p>একটি সেট তৈরি করো — নাম, সময়, পাস মার্ক, প্রশ্ন ও সঠিক উত্তর। সেভ করলেই শিক্ষার্থীর “পরীক্ষা” ট্যাবে চলে আসবে।</p></div>
      ${flashNote()}
      <div class="admin-card admin-empty-card">
        <p>এখনো কোনো ড্রাফট খোলা নেই।</p>
        ${rowActions([adminButton('নতুন পরীক্ষা শুরু করো', 'new-exam', '', 'primary')])}
      </div>`;
  }

  const override = draft.mode === 'override';
  const meta = draft.meta;
  const total = draft.questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);

  const fields = `
    <div class="admin-fields">
      <label>পরীক্ষার নাম<input data-meta="title" value="${escapeText(meta.title)}" placeholder="যেমন: সেপ্টেম্বর মাসিক টেস্ট"></label>
      <label>বিষয়<select data-meta="subject">${SUBJECTS.map(subject => `<option ${meta.subject === subject ? 'selected' : ''}>${escapeText(subject)}</option>`).join('')}</select></label>
      <label>স্কোপ<input data-meta="scope" value="${escapeText(meta.scope)}" placeholder="অধ্যায় বা টপিক"></label>
      <label>শিক্ষক<input data-meta="teacher" value="${escapeText(meta.teacher)}"></label>
      <label>তারিখ<input data-meta="date" type="date" value="${escapeText(meta.date)}"></label>
      <label>সময় (মিনিট)<input data-meta="minutes" type="number" min="1" value="${escapeText(meta.minutes)}"></label>
      <label>পাস (%)<input data-meta="passPercent" type="number" min="1" max="100" value="${escapeText(meta.passPercent)}"></label>
      <label>শুরু (খালি = যেকোনো সময়)<input data-meta="startsAt" type="datetime-local" value="${escapeText(meta.startsAt)}"></label>
      <label>শেষ<input data-meta="endsAt" type="datetime-local" value="${escapeText(meta.endsAt)}"></label>
    </div>
    <label class="admin-wide">নির্দেশনা<textarea data-meta="instructions" rows="2">${escapeText(meta.instructions)}</textarea></label>`;

  if (override) {
    return `
      <div class="admin-lede"><h2>শিপ করা পরীক্ষা এডিট</h2><p><b>${escapeText(meta.title)}</b> — এখানে শুধু সময়সীমা, পাস মার্ক ও নির্দেশনা বদলানো যায়; প্রশ্ন <code>js/config.js</code>-এর, সেগুলো এই ডেমো প্যানেলে এডিট হয় না।</p></div>
      ${flashNote()}
      <form class="admin-form" onsubmit="return false">${fields}</form>
      <div class="admin-row-actions">${adminButton('সংরক্ষণ করো', 'save-override', '', 'primary')}${adminButton('বাতিল', 'cancel-edit')}</div>`;
  }

  const questionRows = draft.questions.map((question, index) => {
    const head = `
      <header>
        <span class="admin-q-num">${num(index + 1)}</span>
        <strong>${question.type === 'written' ? 'লিখিত' : 'MCQ'}</strong>
        <label>নম্বর<input data-q="${index}" data-field="marks" type="number" min="0.5" step="0.5" value="${escapeText(question.marks)}"></label>
        ${rowActions([
      adminButton('কপি', 'dup-question', `data-q="${index}"`),
      adminButton('মুছুন', 'remove-question', `data-q="${index}"`, 'danger')
    ])}
      </header>`;

    if (question.type === 'written') {
      return `
        <article class="admin-question">
          ${head}
          <label>প্রশ্ন<textarea data-q="${index}" data-field="prompt" rows="2">${escapeText(question.prompt)}</textarea></label>
          <label>চেকপয়েন্ট (প্রতি লাইনে একটি)<textarea data-q="${index}" data-field="checkpoints" rows="3">${escapeText((question.checkpoints || []).join('\n'))}</textarea></label>
        </article>`;
    }

    return `
        <article class="admin-question">
          ${head}
          <label>প্রশ্ন<textarea data-q="${index}" data-field="prompt" rows="2">${escapeText(question.prompt)}</textarea></label>
          <div class="admin-options">
            ${(question.options.length ? question.options : ['', '', '', '']).map((option, slot) => `
              <label class="admin-option">
                <input type="radio" name="correct-${index}" value="${slot}" ${Number(question.correctIndex) === slot ? 'checked' : ''} data-q="${index}" data-field="correctIndex" aria-label="${num(slot + 1)} নম্বর অপশন সঠিক">
                <span>${num(slot + 1)}</span>
                <input data-q="${index}" data-field="options" data-slot="${slot}" value="${escapeText(option)}" placeholder="অপশন ${num(slot + 1)}">
              </label>`).join('')}
          </div>
          <label>ব্যাখ্যা<input data-q="${index}" data-field="explanation" value="${escapeText(question.explanation)}"></label>
        </article>`;
  }).join('');

  return `
    <div class="admin-lede">
      <h2>${draft.id ? 'পরীক্ষা এডিট' : 'নতুন পরীক্ষা'}</h2>
      <p>সঠিক অপশনটি সেভ করার সময় হ্যাশ হয় — শিক্ষার্থীর ডিভাইসে যাওয়া তালিকায় উত্তর প্লেইন টেক্সটে থাকে না।</p>
    </div>
    ${flashNote()}
    <form class="admin-form" onsubmit="return false">${fields}</form>
    <p class="admin-count"><span id="adminCount">${num(draft.questions.length)}টি প্রশ্ন · ${mark(total)} নম্বর</span></p>
    <div class="admin-questions">${questionRows || '<p class="admin-empty">প্রশ্ন যোগ করো।</p>'}</div>
    <div class="admin-row-actions">
      ${adminButton('+ MCQ', 'add-mcq')}
      ${adminButton('+ লিখিত', 'add-written')}
      ${adminButton(draft.id ? 'আপডেট করো' : 'প্রকাশ করো', 'save-exam', '', 'primary')}
      ${adminButton('বাতিল', 'cancel-edit')}
    </div>`;
}

function panelAttempts() {
  const attempts = Object.values(loadExamAttempts())
    .sort((first, second) => (second.submittedAt || 0) - (first.submittedAt || 0));
  if (!attempts.length) {
    return `
      <div class="admin-lede"><h2>নম্বর দাও</h2><p>এই ডিভাইসে এখনো কেউ পরীক্ষা জমা দেয়নি। শিক্ষার্থী জমা দিলে এখানে স্বয়ংক্রিয় স্কোরসহ দেখাবে।</p></div>
      <div class="admin-card admin-empty-card"><p>কোনো attempt নেই।</p>${rowActions([adminButton('পরীক্ষা বানাও', 'new-exam', '', 'primary')])}</div>`;
  }

  const rows = attempts.map(attempt => {
    const exam = effectiveExams(shippedExams).find(item => item.id === attempt.examId);
    if (!exam) return '';
    const total = exam.questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);
    const published = teacherMarks(exam.id);
    const when = attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    return `
      <article class="admin-row admin-attempt">
        <div class="admin-row-main">
          <strong>${escapeText(exam.title)}</strong>
          <small>${escapeText(exam.subject)} · ${escapeText(when)} · ${num(attempt.tries || 1)} বার চেষ্টা${attempt.autoSubmitted ? ' · স্বয়ংক্রিয় জমা' : ''}</small>
          <p>স্বয়ংক্রিয় স্কোর <b>${mark(attempt.marks?.total)}/${mark(attempt.marks?.available || total)}</b> (${num(attempt.marks?.percent || 0)}%) · সঠিক ${num(attempt.marks?.correct || 0)} · ভুল ${num(attempt.marks?.wrong || 0)} · অনুত্তর ${num(attempt.marks?.unanswered || 0)}</p>
        </div>
        <form class="admin-marks" onsubmit="return false">
          <label>চূড়ান্ত<input type="number" step="0.5" min="0" value="${published ? published.marks : ''}" data-marks-for="${escapeText(exam.id)}" data-mark-field="marks" placeholder="${mark(total)}"></label>
          <label>মোট<input type="number" step="0.5" min="1" value="${published ? published.total || total : total}" data-marks-for="${escapeText(exam.id)}" data-mark-field="total"></label>
          <label>মন্তব্য<input data-marks-for="${escapeText(exam.id)}" data-mark-field="note" value="${escapeText(published?.note || '')}" placeholder="যেমন: হাতের লেখা ভালো নয়"></label>
          <div class="admin-row-actions">
            ${adminButton('সেভ', 'marks-save', `data-exam-id="${escapeText(exam.id)}"`, 'primary')}
            ${published ? adminButton('নম্বর তোলো', 'marks-clear', `data-exam-id="${escapeText(exam.id)}"`, 'danger') : ''}
          </div>
        </form>
      </article>`;
  }).join('');

  return `
    <div class="admin-lede"><h2>নম্বর দাও</h2><p>শিক্ষার্থীর দেওয়া উত্তর এই ডিভাইসেই আছে; চূড়ান্ত নম্বর দিলে সেটাই ফলাফল সেকশনে দেখাবে।</p></div>
    ${flashNote()}
    <div class="admin-list">${rows}</div>`;
}

function panelApprovals() {
  const rows = roster().map(applicant => {
    const status = applicant.status || 'pending';
    const tone = status === 'active' ? 'good' : status === 'rejected' ? 'bad' : 'warn';
    return `
      <article class="admin-row">
        <div class="admin-row-main">
          <strong>${escapeText(applicant.name)}</strong>
          <small>${num(applicant.mobile)} · ${escapeText(applicant.className)} · ${escapeText(applicant.group)}</small>
          <p>ID ${escapeText(applicant.studentId)}${applicant.real ? ' · এই ডিভাইসের আসল অ্যাকাউন্ট' : ' · ডেমো আবেদন'}</p>
        </div>
        <span class="admin-chip ${tone}">${status === 'active' ? 'অনুমোদিত' : status === 'rejected' ? 'বাতিল' : 'পেন্ডিং'}</span>
        ${rowActions([
      adminButton(status === 'active' ? 'আবার ছাড়ো' : 'অনুমোদন', 'approve', `data-key="${escapeText(applicant.key)}"`, 'primary'),
      adminButton('বাতিল', 'reject', `data-key="${escapeText(applicant.key)}"`, 'danger'),
      `<label class="admin-pin">PIN<input inputmode="numeric" maxlength="6" placeholder="৪–৬" data-pin-for="${escapeText(applicant.key)}"></label>`,
      adminButton('PIN সেট', 'pin', `data-key="${escapeText(applicant.key)}"`)
    ])}
      </article>`;
  }).join('');

  return `
    <div class="admin-lede"><h2>অনুমোদন ডেস্ক</h2><p>এই ডিভাইসের অ্যাকাউন্টটি আসল — ছাড়া দিলে শিক্ষার্থী সঙ্গে সঙ্গে পুরো অ্যাপ পাবে। বাকিগুলো ডেমো আবেদন, শুধু প্যানেলের ভেতরেই থাকে।</p></div>
    ${flashNote()}
    <div class="admin-list">${rows || '<p class="admin-empty">কোনো আবেদন নেই।</p>'}</div>`;
}

function panelNotices() {
  const list = publishedNotices().map(notice => `
    <article class="admin-row">
      <div class="admin-row-main">
        <strong>${escapeText(notice.title)}</strong>
        <p>${escapeText(notice.body)}</p>
        <small>${escapeText(new Date(notice.at).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small>
      </div>
      ${rowActions([adminButton('মুছুন', 'delete-notice', `data-id="${escapeText(notice.id)}"`, 'danger')])}
    </article>`).join('');

  return `
    <div class="admin-lede"><h2>নোটিশ</h2><p>সেভ করলে শিক্ষার্থীর ঘণ্টা আইকনে সঙ্গে সঙ্গে উঠে আসে (লোকাল, শুধু এই ডিভাইস)।</p></div>
    ${flashNote()}
    <form class="admin-form" onsubmit="return false">
      <label>শিরোনাম<input data-notice="title" placeholder="যেমন: ক্লাস টেস্টের সময়"></label>
      <label class="admin-wide">লেখা<textarea data-notice="body" rows="3" placeholder="সংক্ষিপ্ত বার্তা…"></textarea></label>
    </form>
    <div class="admin-row-actions">${adminButton('প্রকাশ করো', 'publish-notice', '', 'primary')}</div>
    <div class="admin-list admin-list-spaced">${list || '<p class="admin-empty">এখনো কোনো নোটিশ প্রকাশ করা হয়নি।</p>'}</div>`;
}

/* ---------- builder draft ---------- */

function blankQuestion(type = 'mcq') {
  return type === 'written'
    ? { type: 'written', marks: 5, prompt: '', checkpoints: [] }
    : { type: 'mcq', marks: 1, prompt: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' };
}

function blankMeta(exam) {
  return {
    id: exam?.id || '',
    title: exam?.title || '',
    subject: exam?.subject || SUBJECTS[0],
    scope: exam?.scope || '',
    teacher: exam?.teacher || 'Active Plus একাডেমিক',
    date: (exam?.date || '').match(/^\d{4}-\d{2}-\d{2}$/) ? exam.date : new Date().toISOString().slice(0, 10),
    minutes: exam?.minutes || 12,
    passPercent: exam?.passPercent || 50,
    instructions: exam?.instructions || 'প্রতিটি প্রশ্নে একটি উত্তর বাছো। সময় শেষ হলে উত্তর স্বয়ংক্রিয়ভাবে জমা হয়।',
    startsAt: isoToLocal(exam?.startsAt),
    endsAt: isoToLocal(exam?.endsAt)
  };
}

function isoToLocal(value) {
  if (!value) return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const date = new Date(time);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toShippedDate(value) {
  if (!value) return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
}

function startNewExam() {
  draft = { mode: 'create', id: null, meta: blankMeta(), questions: [blankQuestion('mcq'), blankQuestion('mcq')] };
  tab = 'builder';
  renderPanel();
  $('#adminBody [data-meta="title"]')?.focus();
}

function editExam(examId, mode = 'edit') {
  if (mode === 'override') {
    const exam = effectiveExams(shippedExams).find(item => item.id === examId);
    if (!exam) return;
    // Shipped dates are Bengali labels; only replace them when the admin edits the field.
    draft = { mode: 'override', id: examId, meta: blankMeta(exam), keepDate: exam.date, dateTouched: false, questions: [] };
    tab = 'builder';
    renderPanel();
    return;
  }
  const authored = authoredExam(examId);
  if (!authored) return;
  const questions = authored.exam.questions.map(question => (question.type === 'written'
    ? { type: 'written', marks: question.marks, prompt: question.prompt, checkpoints: [...(question.checkpoints || [])] }
    : {
      type: 'mcq',
      marks: question.marks,
      prompt: question.prompt,
      options: [...(question.options || []), '', '', '', ''].slice(0, 4),
      correctIndex: authored.keys[question.id] ?? 0,
      explanation: question.explanation || ''
    }));
  draft = { mode: 'edit', id: examId, meta: blankMeta(authored.exam), questions };
  tab = 'builder';
  renderPanel();
}

function metaFromDraft() {
  return draft.meta;
}

function saveDraftExam() {
  const meta = metaFromDraft();
  const result = savePublishedExam({
    ...meta,
    id: draft.id || undefined,
    date: toShippedDate(meta.date),
    questions: draft.questions
  });
  if (!result.ok) return announce(result.problems.join(' · '), 'bad');
  announce(`“${result.exam.title}” প্রকাশিত হয়েছে — ${num(result.exam.questions.length)}টি প্রশ্ন`, 'good');
  refreshStudentViews();
  draft = null;
  tab = 'bank';
  renderPanel();
  showFeedback('পরীক্ষা প্রকাশিত হয়েছে');
}

function saveOverride() {
  const meta = metaFromDraft();
  patchShippedExam(draft.id, {
    startsAt: meta.startsAt ? new Date(meta.startsAt).toISOString() : null,
    endsAt: meta.endsAt ? new Date(meta.endsAt).toISOString() : null,
    minutes: Number(meta.minutes) || 10,
    passPercent: Number(meta.passPercent) || 50,
    instructions: meta.instructions,
    date: draft.dateTouched ? toShippedDate(meta.date) : draft.keepDate
  });
  announce('শিপ করা পরীক্ষার উইন্ডো আপডেট হয়েছে (ডিভাইস লোকাল)', 'good');
  refreshStudentViews();
  draft = null;
  tab = 'bank';
  renderPanel();
}

function refreshStudentViews() {
  renderExams();
  renderDeviceResults();
  renderNotices();
}

/* ---------- render ---------- */

function renderPanel() {
  const body = $('#adminBody');
  if (!body) return;
  body.innerHTML = {
    overview: panelOverview,
    bank: panelBank,
    builder: panelBuilder,
    attempts: panelAttempts,
    approvals: panelApprovals,
    notices: panelNotices
  }[tab]();

  $$('#adminTabs [data-admin-tab]').forEach(button => {
    const active = button.dataset.adminTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

/* ---------- wiring ---------- */

const ACTIONS = {
  tab: button => {
    tab = button.dataset.adminTab || tab;
    renderPanel();
  },
  open: () => {
    startDemoAdmin();
    syncAdminShortcut();
    openAdminPanel('overview');
  },
  exit: () => {
    endAdminSession();
    syncAdminShortcut();
    closeAdminPanel();
    refreshStudentViews();
    // main.js decides whether the student app or the login screen comes back
    onExit?.();
  },
  'new-exam': startNewExam,
  'edit-exam': button => editExam(button.dataset.examId, 'edit'),
  'override-exam': button => editExam(button.dataset.examId, 'override'),
  'cancel-edit': () => {
    draft = null;
    tab = 'bank';
    renderPanel();
  },
  'add-mcq': () => {
    if (!draft) return;
    draft.questions.push(blankQuestion('mcq'));
    renderPanel();
  },
  'add-written': () => {
    if (!draft) return;
    draft.questions.push(blankQuestion('written'));
    renderPanel();
  },
  'dup-question': button => {
    const index = Number(button.dataset.q);
    draft.questions.splice(index + 1, 0, JSON.parse(JSON.stringify(draft.questions[index])));
    renderPanel();
  },
  'remove-question': button => {
    draft.questions.splice(Number(button.dataset.q), 1);
    renderPanel();
  },
  'save-exam': saveDraftExam,
  'save-override': saveOverride,
  'hide-exam': button => {
    setExamHidden(button.dataset.examId, true);
    refreshStudentViews();
    renderPanel();
  },
  'show-exam': button => {
    setExamHidden(button.dataset.examId, false);
    refreshStudentViews();
    renderPanel();
  },
  'delete-exam': button => {
    deleteAuthoredExam(button.dataset.examId);
    refreshStudentViews();
    announce('লোকাল পরীক্ষা মুছে ফেলা হয়েছে', 'good');
  },
  'marks-save': button => {
    const examId = button.dataset.examId;
    const read = field => $(`#adminBody [data-marks-for="${examId}"][data-mark-field="${field}"]`)?.value;
    const marks = Number(read('marks'));
    const total = Number(read('total'));
    if (!Number.isFinite(marks) || read('marks') === '') return announce('চূড়ান্ত নম্বরটি লেখো', 'bad');
    if (total > 0 && marks > total) return announce(`নম্বর মোট নম্বরের (${mark(total)}) বেশি হতে পারবে না`, 'bad');
    setTeacherMarks(examId, { marks, total, note: String(read('note') || '').trim() });
    refreshStudentViews();
    announce('চূড়ান্ত নম্বর সংরক্ষিত — শিক্ষার্থী ফলাফলে দেখতে পাবে', 'good');
  },
  'marks-clear': button => {
    clearTeacherMarks(button.dataset.examId);
    refreshStudentViews();
    announce('নম্বর তোলা হয়েছে, স্বয়ংক্রিয় স্কোরই আবার দেখানো হচ্ছে', 'neutral');
  },
  approve: button => {
    setApplicantStatus(button.dataset.key, 'active');
    announce('অনুমোদন দেওয়া হয়েছে', 'good');
  },
  reject: button => {
    setApplicantStatus(button.dataset.key, 'rejected');
    announce('আবেদন বাতিল করা হয়েছে', 'neutral');
  },
  pin: button => {
    const key = button.dataset.key;
    const value = $(`#adminBody [data-pin-for="${key}"]`)?.value || '';
    const result = resetApplicantPin(key, value.replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit)));
    announce(result.message || (result.ok ? 'PIN সেট হয়েছে' : 'PIN লেখা হয়নি'), result.ok ? 'good' : 'bad');
  },
  'publish-notice': () => {
    const title = $('#adminBody [data-notice="title"]')?.value || '';
    const body = $('#adminBody [data-notice="body"]')?.value || '';
    const result = publishNotice({ title, body });
    if (!result.ok) return announce(result.message, 'bad');
    renderNotices();
    $('#adminBody [data-notice="title"]').value = '';
    $('#adminBody [data-notice="body"]').value = '';
    announce('নোটিশ প্রকাশিত হয়েছে', 'good');
  },
  'delete-notice': button => {
    deleteNotice(button.dataset.id);
    renderNotices();
    renderPanel();
  },
  export: () => {
    const pre = $('#adminExport');
    if (!pre) return;
    const payload = { publishedAt: new Date().toISOString(), exams: Object.values(rosterAuthored()) };
    pre.textContent = JSON.stringify(payload, null, 2);
    pre.hidden = false;
    showFeedback('লোকাল পরীক্ষার JSON — config.js-এ মার্জ করে নিও');
  },
  'clear-data': () => {
    clearAdminData();
    draft = null;
    refreshStudentViews();
    startDemoAdmin();
    syncAdminShortcut();
    tab = 'overview';
    announce('এডমিন ডেটা মুছে ফেলা হয়েছে — শিপ করা config.js আবার একমাত্র উৎস', 'neutral');
  }
};

export function initAdmin({ state, onExit: exitHandler } = {}) {
  onExit = typeof exitHandler === 'function' ? exitHandler : null;
  const body = $('#adminBody');

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-admin-act]');
    if (!trigger) return;
    event.preventDefault();
    ACTIONS[trigger.dataset.adminAct]?.(trigger, event);
  });

  if (!body) return;

  // The builder keeps its own in-memory draft so typing never fights a re-render.
  body.addEventListener('input', event => {
    const target = event.target;
    if (target.dataset.meta && draft) {
      draft.meta[target.dataset.meta] = target.type === 'number' ? Number(target.value) || 0 : target.value;
      if (target.dataset.meta === 'date') draft.dateTouched = true;
      const count = $('#adminCount');
      if (count && draft.questions) {
        const total = draft.questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);
        count.textContent = `${num(draft.questions.length)}টি প্রশ্ন · ${mark(total)} নম্বর`;
      }
      return;
    }

    if (target.dataset.q !== undefined && draft) {
      const index = Number(target.dataset.q);
      const question = draft.questions[index];
      if (!question) return;
      const field = target.dataset.field;
      if (field === 'options') {
        question.options[Number(target.dataset.slot)] = target.value;
      } else if (field === 'correctIndex') {
        question.correctIndex = Number(target.value);
      } else if (field === 'checkpoints') {
        question.checkpoints = target.value.split('\n').map(line => line.trim()).filter(Boolean);
      } else if (field === 'marks') {
        question.marks = Number(target.value) || 0;
        const count = $('#adminCount');
        if (count) {
          const total = draft.questions.reduce((sum, item) => sum + (Number(item.marks) || 0), 0);
          count.textContent = `${num(draft.questions.length)}টি প্রশ্ন · ${mark(total)} নম্বর`;
        }
      } else {
        question[field] = target.value;
      }
    }
  });

  body.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.meta && draft && target.tagName === 'SELECT') {
      draft.meta[target.dataset.meta] = target.value;
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isPanelOpen() && !draft) closeAdminPanel();
  });

  // entering from the student topbar keeps the same one-click path
  $('#adminShortcut')?.addEventListener('click', () => ACTIONS.open());
  if (state) state.adminOpen = () => ACTIONS.open();
}
