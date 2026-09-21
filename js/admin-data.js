/* Admin data layer for the demo panel.
 *
 * Everything here is local: the panel writes to localStorage next to the student
 * data, and js/exams.js reads the published part of it. The answer keys an admin
 * types are hashed on save (js/exam-hash.js) and the plain index is kept in a
 * separate map that only the admin panel reads — so the exam list a student
 * downloads never carries the key.
 */
import { STORAGE_KEYS } from './config.js';
import { loadAccount, readJSON, saveAccount, writeJSON } from './storage.js';
import { answerHash } from './exam-hash.js';

const EMPTY = Object.freeze({
  version: 1,
  session: null,
  exams: {},
  keys: {},
  hidden: [],
  overrides: {},
  marks: {},
  notices: [],
  roster: []
});

function store() {
  const stored = readJSON(STORAGE_KEYS.admin, null);
  if (!stored || typeof stored !== 'object') return { ...EMPTY, exams: {}, keys: {}, overrides: {}, marks: {}, hidden: [], notices: [], roster: [] };
  return {
    ...EMPTY,
    ...stored,
    exams: stored.exams || {},
    keys: stored.keys || {},
    overrides: stored.overrides || {},
    marks: stored.marks || {},
    hidden: Array.isArray(stored.hidden) ? stored.hidden : [],
    notices: Array.isArray(stored.notices) ? stored.notices : [],
    roster: Array.isArray(stored.roster) ? stored.roster : []
  };
}

function save(next) {
  next.updatedAt = Date.now();
  return writeJSON(STORAGE_KEYS.admin, next);
}

function mutate(change) {
  const next = store();
  change(next);
  return save(next);
}

/* ---------- one-click demo session ---------- */

export function isAdminSession() {
  return Boolean(store().session?.demo);
}

export function startDemoAdmin() {
  mutate(current => {
    current.session = { demo: true, since: Date.now(), note: 'ডেমো প্যানেল — কোনো সার্ভারে কিছু যায়নি' };
  });
  seedRoster();
  return true;
}

export function endAdminSession() {
  return mutate(current => {
    current.session = null;
  });
}

/* ---------- exams: authored locally + shipped defaults ---------- */

/** Turns builder rows into the shape the runner grades, hashing each MCQ key. */
export function compileExam(input) {
  const questions = (input.questions || []).map((question, index) => {
    const id = question.id || `q${index + 1}`;
    if (question.type === 'written') {
      return {
        id,
        type: 'written',
        marks: Number(question.marks) || 5,
        prompt: String(question.prompt || '').trim(),
        checkpoints: (question.checkpoints || []).map(point => String(point).trim()).filter(Boolean)
      };
    }
    const options = (question.options || []).map(option => String(option).trim()).filter(Boolean);
    const correct = options[Number(question.correctIndex) || 0] || '';
    return {
      id,
      type: 'mcq',
      marks: Number(question.marks) || 1,
      prompt: String(question.prompt || '').trim(),
      options,
      answer: correct ? answerHash(correct) : '',
      explanation: String(question.explanation || '').trim()
    };
  });

  const keys = {};
  questions.forEach((question, index) => {
    const source = input.questions[index] || {};
    if (question.type === 'mcq') keys[question.id] = Number(source.correctIndex) || 0;
  });

  const slug = String(input.id || input.title || 'exam')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
    .replace(/^-|-$/g, '') || `exam-${Date.now()}`;

  return {
    exam: {
      id: slug,
      subject: String(input.subject || 'মডেল টেস্ট').trim(),
      title: String(input.title || 'নতুন পরীক্ষা').trim(),
      scope: String(input.scope || '').trim() || 'অ্যাডমিন প্যানেল থেকে প্রকাশিত',
      teacher: String(input.teacher || 'Active Plus').trim(),
      date: String(input.date || '').trim(),
      startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : null,
      endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      minutes: Number(input.minutes) || 10,
      passPercent: Number(input.passPercent) || 50,
      instructions: String(input.instructions || 'প্রতিটি প্রশ্নে একটি উত্তর বাছো।').trim(),
      questions
    },
    keys
  };
}

export function savePublishedExam(input) {
  const { exam, keys } = compileExam(input);
  const problems = validateExam(exam);
  if (problems.length) return { ok: false, problems };
  mutate(current => {
    current.exams[exam.id] = exam;
    current.keys[exam.id] = keys;
    current.hidden = current.hidden.filter(id => id !== exam.id);
    delete current.overrides[exam.id];
  });
  return { ok: true, exam };
}

export function validateExam(exam) {
  const problems = [];
  if (!exam.title) problems.push('পরীক্ষার নাম লেখো');
  if (!exam.questions.length) problems.push('কমপক্ষে একটি প্রশ্ন লাগবে');
  exam.questions.forEach((question, index) => {
    const label = `${index + 1} নম্বর প্রশ্ন`;
    if (!question.prompt) problems.push(`${label}: প্রশ্নের টেক্সট খালি`);
    if (question.type === 'mcq') {
      if (question.options.length < 2) problems.push(`${label}: কমপক্ষে দুটি অপশন লাগবে`);
      if (!question.answer) problems.push(`${label}: সঠিক অপশন বাছতে হবে`);
    } else if (!question.checkpoints.length) {
      problems.push(`${label}: লিখিত প্রশ্নে অন্তত একটি চেকপয়েন্ট লাগবে`);
    }
  });
  return problems;
}

/** The list students see: shipped exams (minus hidden, plus overrides) then local ones. */
export function effectiveExams(shipped) {
  const current = store();
  const base = shipped
    .filter(exam => !current.hidden.includes(exam.id))
    .map(exam => (current.overrides[exam.id] ? { ...exam, ...current.overrides[exam.id] } : exam));
  const local = Object.values(current.exams).filter(exam => !current.hidden.includes(exam.id));
  return [...base, ...local];
}

export function authoredExam(id) {
  const current = store();
  if (!current.exams[id]) return null;
  return { exam: current.exams[id], keys: current.keys[id] || {} };
}

export function isAuthored(id) {
  return Boolean(store().exams[id]);
}

export function examIsHidden(id) {
  return store().hidden.includes(id);
}

export function setExamHidden(id, hidden) {
  return mutate(current => {
    const next = new Set(current.hidden);
    if (hidden) next.add(id);
    else next.delete(id);
    current.hidden = [...next];
  });
}

/** Hidden exams leave the student list, so the panel lists them separately. */
export function hiddenExams(shipped) {
  const current = store();
  return current.hidden.map(id => {
    const exam = current.exams[id] || shipped.find(item => item.id === id);
    return {
      id,
      title: exam?.title || id,
      subject: exam?.subject || '—',
      local: Boolean(current.exams[id]),
      questions: exam?.questions?.length || 0
    };
  });
}

export function deleteAuthoredExam(id) {
  return mutate(current => {
    delete current.exams[id];
    delete current.keys[id];
    current.hidden = current.hidden.filter(item => item !== id);
  });
}

/** Small tweaks to a shipped exam (window, instructions) without touching config.js. */
export function patchShippedExam(id, patch) {
  return mutate(current => {
    current.overrides[id] = { ...(current.overrides[id] || {}), ...patch };
  });
}

/* ---------- teacher marks ---------- */

export function teacherMarks(examId) {
  return store().marks[examId] || null;
}

export function setTeacherMarks(examId, marks) {
  return mutate(current => {
    current.marks[examId] = { ...marks, at: Date.now() };
  });
}

export function clearTeacherMarks(examId) {
  return mutate(current => {
    delete current.marks[examId];
  });
}

/* ---------- notices ---------- */

export function publishedNotices() {
  return store().notices;
}

export function publishNotice({ title, body, tone = 'info' }) {
  const notice = {
    id: `notice-${Date.now()}`,
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    tone,
    at: Date.now()
  };
  if (!notice.title || !notice.body) return { ok: false, message: 'শিরোনাম ও লেখা দুটোই লাগবে' };
  mutate(current => {
    current.notices = [notice, ...current.notices].slice(0, 20);
  });
  return { ok: true, notice };
}

export function deleteNotice(id) {
  return mutate(current => {
    current.notices = current.notices.filter(notice => notice.id !== id);
  });
}

/* ---------- enrolment desk ---------- */

const DEMO_APPLICANTS = [
  { key: 'demo-1', name: 'সাদিয়া আফরিন', mobile: '01711111111', className: 'নবম শ্রেণি', group: 'বিজ্ঞান', studentId: '২৬০৯০০৭', status: 'pending' },
  { key: 'demo-2', name: 'তানভীর হাসান', mobile: '01822222222', className: 'দশম শ্রেণি', group: 'বিজ্ঞান', studentId: '২৬০৯০০৮', status: 'pending' },
  { key: 'demo-3', name: 'নুসরাত জাহান', mobile: '01933333333', className: 'একাদশ শ্রেণি', group: 'ব্যবসায় শিক্ষা', studentId: '২৬০৯০০৯', status: 'rejected' }
];

export function seedRoster() {
  const current = store();
  if (current.roster.length) return current.roster;
  const roster = DEMO_APPLICANTS.map(applicant => ({ ...applicant, appliedAt: Date.now() - 86_400_000 }));
  save({ ...current, roster });
  return roster;
}

/** Demo applicants plus the one real account this device holds. */
export function roster() {
  const current = store();
  const account = loadAccount();
  const device = account
    ? [{
      key: 'device',
      name: account.student?.nameBn || account.student?.name || 'এই ডিভাইসের শিক্ষার্থী',
      mobile: account.mobile,
      className: account.student?.className || '—',
      group: account.student?.group || '—',
      studentId: account.studentId || account.student?.id || '—',
      status: account.status || 'active',
      appliedAt: account.createdAt || null,
      real: true
    }]
    : [];
  return [...device, ...current.roster];
}

export function setApplicantStatus(key, status) {
  if (key === 'device') {
    const account = loadAccount();
    if (!account) return false;
    return saveAccount({ ...account, status });
  }
  return mutate(current => {
    current.roster = current.roster.map(applicant => (applicant.key === key ? { ...applicant, status } : applicant));
  });
}

export function resetApplicantPin(key, pin) {
  const value = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(value)) return { ok: false, message: 'PIN ৪–৬ সংখ্যার হতে হবে' };
  if (key === 'device') {
    const account = loadAccount();
    if (!account) return { ok: false, message: 'এই ডিভাইসে অ্যাকাউন্ট নেই' };
    saveAccount({ ...account, pin: value });
    return { ok: true, message: 'এই ডিভাইসের অ্যাকাউন্টের PIN বদলে গেছে' };
  }
  mutate(current => {
    current.roster = current.roster.map(applicant => (applicant.key === key ? { ...applicant, pin: value } : applicant));
  });
  return { ok: true, message: 'ডেমো অ্যাকাউন্টের PIN সেট হয়েছে (লোকাল)' };
}

export function clearAdminData() {
  return writeJSON(STORAGE_KEYS.admin, { ...EMPTY, exams: {}, keys: {}, overrides: {}, marks: {}, hidden: [], notices: [], roster: [] });
}
