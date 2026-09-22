/* Local exam workflow adapter, NOT secure online authentication/proctoring.
   A production API must own authorization, time, answer keys and accepted submissions. */
import { teachingRepository, DEMO_TEACHER } from './teaching-data.js';
export const EXAM_KEY = 'activePlus.exams.v1';
export const EXAM_TYPES = Object.freeze({ mcq: 'MCQ', written: 'লিখিত', short: 'সংক্ষিপ্ত উত্তর' });
export const EXAM_STATUSES = Object.freeze({ draft: 'খসড়া', pending: 'অনুমোদনের অপেক্ষায়', rejected: 'সংশোধনের জন্য ফেরত', published: 'প্রকাশিত' });
export const TEACHER_ACTOR = Object.freeze({ role: 'teacher', id: DEMO_TEACHER.id });
export const ADMIN_ACTOR = Object.freeze({ role: 'admin', id: 'ADMIN' });
const fail = text => { throw new Error(text); };
const number = text => Number(String(text).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const totalMarks = exam => round(exam.questions.reduce((sum, q) => sum + q.marks, 0));
export const examTemplate = type => type === 'mcq'
  ? 'প্রশ্ন: বাংলাদেশের রাজধানী কোনটি?\nনম্বর: ২\nA: ঢাকা\nB: চট্টগ্রাম\nC: খুলনা\nD: রাজশাহী\nউত্তর: A\n---\nপ্রশ্ন: ৫ + ৩ = কত?\nনম্বর: ৩\nA: ৬\nB: ৭\nC: ৮\nD: ৯\nউত্তর: C'
  : 'প্রশ্ন: পরিবেশ রক্ষায় গাছের গুরুত্ব লেখো।\nনম্বর: ৫\n---\nপ্রশ্ন: পানি দূষণ রোধের তিনটি উপায় লেখো।\nনম্বর: ৩';
export function parseQuestions(text, type) {
  if (!Object.hasOwn(EXAM_TYPES, type)) fail('পরীক্ষার ধরন নির্বাচন করুন।');
  if (!String(text).trim() || String(text).length > 150000) fail('প্রশ্নের টেমপ্লেট পূরণ করুন (সর্বোচ্চ ১৫০,০০০ অক্ষর)।');
  const blocks = String(text).trim().split(/^\s*---+\s*$/m).filter(b => b.trim());
  if (!blocks.length || blocks.length > 100) fail('একটি পরীক্ষায় ১–১০০টি প্রশ্ন দিন।');
  const questions = blocks.map((block, i) => {
    const fields = {};
    for (const line of block.trim().split('\n').filter(l => l.trim())) {
      const match = line.match(/^\s*(প্রশ্ন|নম্বর|উত্তর|Question|Marks|Answer|[A-D])\s*[:：]\s*(.*?)\s*$/i);
      if (!match) fail(`প্রশ্ন ${i + 1}: টেমপ্লেটের প্রতিটি লাইন “প্রশ্ন:”, “নম্বর:” বা নির্ধারিত অপশন দিয়ে শুরু করুন।`);
      let key = match[1].toLowerCase();
      key = ({ 'প্রশ্ন': 'question', 'নম্বর': 'marks', 'উত্তর': 'answer' })[key] || key;
      if (Object.hasOwn(fields, key)) fail(`প্রশ্ন ${i + 1}: একই ঘর দুবার দেওয়া হয়েছে।`);
      fields[key] = match[2];
    }
    const marks = number(fields.marks);
    if (!fields.question || fields.question.length > 1200 || !Number.isFinite(marks) || marks <= 0 || marks > 1000 || round(marks) !== marks) fail(`প্রশ্ন ${i + 1}: প্রশ্নের লেখা ও সঠিক নম্বর দিন (০.০১–১০০০)।`);
    const q = { id: `q${i + 1}`, text: fields.question, marks };
    if (type === 'mcq') {
      const keys = ['A', 'B', 'C', 'D'];
      if (keys.some(k => !fields[k.toLowerCase()] || fields[k.toLowerCase()].length > 500) || !keys.includes((fields.answer || '').toUpperCase())) fail(`প্রশ্ন ${i + 1}: চারটি অপশন ও সঠিক উত্তর A/B/C/D দিন।`);
      q.options = keys.map(id => ({ id, text: fields[id.toLowerCase()] })); q.answer = fields.answer.toUpperCase();
      if (new Set(q.options.map(o => o.text)).size !== 4) fail(`প্রশ্ন ${i + 1}: একই অপশন একাধিকবার দেওয়া যাবে না।`);
    } else if (fields.answer || ['a', 'b', 'c', 'd'].some(k => fields[k])) fail(`প্রশ্ন ${i + 1}: লিখিত/সংক্ষিপ্ত পরীক্ষায় অপশন বা উত্তর দেবেন না।`);
    return q;
  });
  if (totalMarks({ questions }) > 10000) fail('মোট নম্বর সর্বোচ্চ ১০,০০০ হতে পারে।');
  return questions;
}
export function classExamDate(startAt) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(startAt);
  const get = type => parts.find(p => p.type === type).value;
  const date = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+06:00`);
  date.setTime(date.getTime() + 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function validateExam(input) {
  const title = String(input.title || '').trim(), subject = String(input.subject || '').trim();
  if (!title || title.length > 150 || !subject || subject.length > 80) fail('পরীক্ষার নাম ও একটি বিষয় দিন।');
  const startAt = Number(input.startAt), endAt = Number(input.endAt), lateMinutes = input.type === 'mcq' ? Number(input.lateMinutes ?? 10) : 0, negative = Number(input.negative ?? 0), passPercent = Number(input.passPercent ?? 33);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt || endAt - startAt > 86400000 || startAt < 1577836800000 || endAt > 4102444800000) fail('সঠিক শুরু ও শেষ সময় দিন; সময়কাল সর্বোচ্চ ২৪ ঘণ্টা।');
  if (input.type === 'mcq' && (!Number.isInteger(lateMinutes) || lateMinutes < 1 || lateMinutes * 60000 > endAt - startAt)) fail('দেরিতে প্রবেশের সীমা ১ মিনিট থেকে পরীক্ষার সময়কালের মধ্যে দিন।');
  if (!Number.isFinite(negative) || negative < 0 || negative > 1000 || round(negative) !== negative) fail('ভুল উত্তরে কাটা নম্বর ০–১০০০-এর মধ্যে দিন।');
  if (!Number.isFinite(passPercent) || passPercent < 1 || passPercent > 100) fail('পাসের হার ১–১০০ শতাংশ দিন।');
  const instructions = String(input.instructions || '').trim();
  if (instructions.length > 2000) fail('নির্দেশনা সর্বোচ্চ ২০০০ অক্ষরে দিন।');
  const questions = parseQuestions(input.template, input.type);
  return { title, subject, type: input.type, startAt, endAt, lateMinutes, negative: input.type === 'mcq' ? negative : 0, passPercent, instructions, template: input.template, questions };
}
function read() {
  const raw = window.localStorage.getItem(EXAM_KEY);
  if (raw === null) return { version: 1, exams: [], attempts: [] };
  let db; try { db = JSON.parse(raw); } catch { fail('পরীক্ষার সংরক্ষিত ডেটা ক্ষতিগ্রস্ত। ডেটা না মুছে সহায়তা নিন।'); }
  if (db?.version !== 1 || !Array.isArray(db.exams) || !Array.isArray(db.attempts)) fail('পরীক্ষার ডেটা সঠিক নয়।');
  const ids = new Set();
  for (const e of db.exams) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || !Object.hasOwn(EXAM_STATUSES, e.status) || typeof e.teacherId !== 'string' || !Array.isArray(e.participants)) fail('পরীক্ষার ডেটা সঠিক নয়।');
    if (e.participants.some(p => !p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.className !== 'string') || (e.absentIds !== undefined && (!Array.isArray(e.absentIds) || e.absentIds.some(id => typeof id !== 'string')))) fail('পরীক্ষার শিক্ষার্থী তালিকা সঠিক নয়।');
    ids.add(e.id); const fields = validateExam(e);
    if (JSON.stringify(fields.questions) !== JSON.stringify(e.questions)) fail('সংরক্ষিত প্রশ্ন সঠিক নয়।');
  }
  const attemptIds = new Set(), attemptNumbers = new Set();
  for (const a of db.attempts) {
    const e = db.exams.find(e => e.id === a?.examId);
    if (!e || typeof a.id !== 'string' || attemptIds.has(a.id) || typeof a.studentId !== 'string' || !['active', 'queued', 'submitted'].includes(a.status) || ![1, 2].includes(a.number) || !a.answers || typeof a.answers !== 'object' || !Array.isArray(a.order) || !Number.isFinite(a.startedAt)) fail('পরীক্ষার উত্তর/ফলাফলের ডেটা সঠিক নয়।');
    const attemptKey = `${e.id}/${a.studentId}/${a.number}`;
    if (attemptNumbers.has(attemptKey) || typeof a.name !== 'string' || typeof a.className !== 'string') fail('পরীক্ষার প্রচেষ্টার ডেটা সঠিক নয়।');
    attemptNumbers.add(attemptKey); attemptIds.add(a.id);
    if (e.type === 'mcq' && (a.order.length !== e.questions.length || new Set(a.order.map(q => q?.id)).size !== e.questions.length || a.order.some(q => !q || !e.questions.some(item => item.id === q.id) || !Array.isArray(q.options) || [...q.options].sort().join('') !== 'ABCD'))) fail('সংরক্ষিত প্রশ্নের ক্রম সঠিক নয়।');
    if (a.status !== 'active' && !Number.isFinite(a.finishedAt)) fail('উত্তরপত্রের জমার সময় সঠিক নয়।');
    if (e.type === 'mcq' && Object.entries(a.answers).some(([id, option]) => !e.questions.some(q => q.id === id && q.options.some(o => o.id === option)))) fail('সংরক্ষিত উত্তর সঠিক নয়।');
    if (a.status === 'submitted' && e.type === 'mcq' && Object.entries(scoreAttempt(e, a)).some(([key, value]) => a[key] !== value)) fail('সংরক্ষিত ফলাফল উত্তরের সঙ্গে মিলছে না।');
    if (a.status === 'submitted' && (!Number.isFinite(a.score) || a.score < 0 || a.score > totalMarks(e))) fail('সংরক্ষিত ফলাফল সঠিক নয়।');
  }
  return db;
}
async function mutate(fn) {
  const task = () => { const db = read(); fn(db); window.localStorage.setItem(EXAM_KEY, JSON.stringify(db)); window.dispatchEvent(new Event('exam-data-updated')); return db; };
  return navigator.locks ? navigator.locks.request(EXAM_KEY, task) : task();
}
function examById(db, id) { const e = db.exams.find(e => e.id === id); if (!e) fail('পরীক্ষাটি পাওয়া যায়নি।'); return e; }
function teacherOwns(exam, actor) { if (actor?.role !== 'teacher' || actor.id !== exam.teacherId) fail('শুধু দায়িত্বপ্রাপ্ত শিক্ষক এই কাজ করতে পারবেন।'); }
function requireAdmin(actor) { if (actor?.role !== 'admin') fail('Admin-এর অনুমোদন প্রয়োজন।'); }
async function eligibleStudent(student) {
  const roster = await teachingRepository.listStudents();
  const found = roster.find(s => s.id === student?.id);
  if (!found) fail('শুধু অনুমোদিত শিক্ষার্থী পরীক্ষা দিতে পারবে।');
  return { id: found.id, name: found.name, className: found.className };
}
function attemptById(db, id, studentId) {
  const a = db.attempts.find(a => a.id === id && a.studentId === studentId);
  if (!a) fail('এই উত্তরপত্র পাওয়া যায়নি।'); return a;
}
function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export function scoreAttempt(exam, attempt) {
  let score = 0, correct = 0, wrong = 0, unanswered = 0;
  for (const q of exam.questions) {
    const answer = attempt.answers[q.id];
    if (!answer) unanswered++; else if (answer === q.answer) { correct++; score += q.marks; } else { wrong++; score -= exam.negative; }
  }
  return { score: round(Math.max(0, score)), correct, wrong, unanswered };
}
export function firstAttemptMean(db, examId) {
  const first = db.attempts.filter(a => a.examId === examId && a.number === 1 && a.status === 'submitted');
  return first.length ? first.reduce((sum, a) => sum + a.score, 0) / first.length : null;
}
export function retryEligibility(db, exam, studentId, now = Date.now()) {
  const attempts = db.attempts.filter(a => a.examId === exam.id && a.studentId === studentId);
  const first = attempts.find(a => a.number === 1 && a.status === 'submitted');
  const mean = firstAttemptMean(db, exam.id);
  return exam.type === 'mcq' && exam.status === 'published' && now < exam.endAt && attempts.length === 1 && !!first && mean !== null && first.score < mean;
}
export function gradeFor(score, total, passPercent = 33) {
  const percent = total ? score / total * 100 : 0;
  if (percent < passPercent) return 'F';
  return percent >= 80 ? 'A+' : percent >= 70 ? 'A' : percent >= 60 ? 'A−' : percent >= 50 ? 'B' : percent >= 40 ? 'C' : 'D';
}
export function examResults(db, exam) {
  const best = new Map();
  for (const a of db.attempts.filter(a => a.examId === exam.id && a.status === 'submitted')) {
    if (!best.has(a.studentId) || a.score > best.get(a.studentId).score) best.set(a.studentId, a);
  }
  const rows = [...best.values()].sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt);
  return rows.map((a, index) => ({ ...a, rank: rows.findIndex(other => other.score === a.score) + 1, grade: gradeFor(a.score, totalMarks(exam), exam.passPercent) }));
}
export const examRepository = {
  async list() { return read(); },
  async listStudents() { return teachingRepository.listStudents(); },
  async saveDraft(input, actor = TEACHER_ACTOR) {
    if (actor.role !== 'teacher') fail('শিক্ষক প্রশ্ন তৈরি করবেন।');
    const fields = validateExam(input);
    return mutate(db => {
      const old = input.id ? examById(db, input.id) : null;
      if (old) { teacherOwns(old, actor); if (old.status === 'published' || db.attempts.some(a => a.examId === old.id)) fail('প্রকাশিত/চালু পরীক্ষার প্রশ্ন বদলানো যাবে না।'); }
      const exam = { ...fields, id: old?.id || `EX-${crypto.randomUUID()}`, teacherId: actor.id, teacherName: DEMO_TEACHER.name, status: 'draft', reviewNote: '', createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(), participants: [] };
      if (old) db.exams[db.exams.indexOf(old)] = exam; else db.exams.unshift(exam);
    });
  },
  async requestApproval(id, actor = TEACHER_ACTOR) {
    return mutate(db => { const e = examById(db, id); teacherOwns(e, actor); if (!['draft', 'rejected'].includes(e.status)) fail('এই পরীক্ষা ইতিমধ্যে পাঠানো/প্রকাশ করা হয়েছে।'); validateExam(e); if (e.startAt <= Date.now()) fail('পরীক্ষার শুরুর সময় ভবিষ্যতে দিন।'); e.status = 'pending'; e.reviewNote = ''; });
  },
  async review(id, decision, options = {}, actor = ADMIN_ACTOR) {
    requireAdmin(actor);
    const students = await teachingRepository.listStudents();
    return mutate(db => {
      const e = examById(db, id); if (e.status !== 'pending') fail('শুধু অপেক্ষমাণ পরীক্ষা পর্যালোচনা করা যাবে।');
      if (decision === 'publish') {
        if (e.startAt <= Date.now()) fail('শুরুর সময় পেরিয়েছে। সংশোধনের জন্য শিক্ষককে ফেরত দিন।');
        const validated = validateExam({ ...e, negative: options.negative ?? e.negative });
        e.negative = validated.negative; e.status = 'published'; e.publishedAt = Date.now();
        e.participants = students.map(s => ({ id: s.id, name: s.name, className: s.className }));
      } else if (decision === 'reject') {
        const note = String(options.note || '').trim(); if (!note || note.length > 500) fail('সংশোধনের কারণ লিখুন (সর্বোচ্চ ৫০০ অক্ষর)।');
        e.status = 'rejected'; e.reviewNote = note;
      } else fail('সঠিক সিদ্ধান্ত নির্বাচন করুন।');
    });
  },
  async deleteDraft(id, actor = TEACHER_ACTOR) {
    return mutate(db => { const e = examById(db, id); teacherOwns(e, actor); if (!['draft', 'rejected'].includes(e.status)) fail('প্রকাশিত/অপেক্ষমাণ পরীক্ষা মুছতে পারবেন না।'); db.exams = db.exams.filter(e => e.id !== id); });
  },
  async startAttempt(examId, student) {
    const person = await eligibleStudent(student);
    return mutate(db => {
      const e = examById(db, examId), now = Date.now();
      if (e.type !== 'mcq' || e.status !== 'published' || now < e.startAt || now >= e.endAt) fail('এখন পরীক্ষা শুরু করা যাবে না।');
      const own = db.attempts.filter(a => a.examId === e.id && a.studentId === person.id);
      if (own.some(a => a.status === 'active')) return;
      if (!own.length && now > e.startAt + e.lateMinutes * 60000) fail('দেরিতে প্রবেশের সময়সীমা শেষ।');
      if (own.length && !retryEligibility(db, e, person.id, now)) fail('দ্বিতীয় সুযোগের যোগ্যতা নেই বা সময় শেষ।');
      const order = shuffled(e.questions).map(q => ({ id: q.id, options: shuffled(q.options.map(o => o.id)) }));
      db.attempts.push({ id: `AT-${crypto.randomUUID()}`, examId, studentId: person.id, name: person.name, className: person.className, number: own.length + 1, status: 'active', startedAt: now, savedAt: now, order, answers: {} });
      if (!e.participants.some(s => s.id === person.id)) e.participants.push(person);
    });
  },
  async saveAnswer(attemptId, studentId, questionId, optionId) {
    const receivedAt = Date.now();
    return mutate(db => {
      const a = attemptById(db, attemptId, studentId), e = examById(db, a.examId);
      if (a.status !== 'active' || receivedAt >= e.endAt) fail('সময় শেষ বা উত্তরপত্র জমা হয়েছে।');
      const q = e.questions.find(q => q.id === questionId);
      if (!q || !q.options.some(o => o.id === optionId)) fail('উত্তরের অপশন সঠিক নয়।');
      a.answers[questionId] = optionId; a.savedAt = receivedAt;
    });
  },
  async finishAttempt(attemptId, studentId) {
    return mutate(db => {
      const a = attemptById(db, attemptId, studentId), e = examById(db, a.examId);
      if (a.status !== 'active') return;
      a.finishedAt = Math.min(Date.now(), e.endAt); a.status = navigator.onLine === false ? 'queued' : 'submitted';
      if (a.status === 'submitted') Object.assign(a, scoreAttempt(e, a));
    });
  },
  async syncStudent(studentId) {
    return mutate(db => {
      for (const a of db.attempts.filter(a => a.studentId === studentId && a.status !== 'submitted')) {
        const e = examById(db, a.examId);
        if (a.status === 'active' && Date.now() >= e.endAt) { a.finishedAt = e.endAt; a.status = 'queued'; }
        if (a.status === 'queued' && navigator.onLine !== false) { a.status = 'submitted'; Object.assign(a, scoreAttempt(e, a)); }
      }
    });
  },
  async markWrittenAbsent(examId, student, actor = TEACHER_ACTOR) {
    const person = await eligibleStudent(student);
    return mutate(db => {
      const e = examById(db, examId); teacherOwns(e, actor);
      if (e.status !== 'published' || e.type === 'mcq' || Date.now() < new Date(`${classExamDate(e.startAt)}T00:00:00+06:00`).getTime()) fail('ক্লাসে পরীক্ষার দিন থেকে উপস্থিতি দেওয়া যাবে।');
      if (db.attempts.some(a => a.examId === e.id && a.studentId === person.id)) fail('এই শিক্ষার্থীর নম্বর আছে; অনুপস্থিত করা যাবে না।');
      e.absentIds = [...new Set([...(e.absentIds || []), person.id])];
      if (!e.participants.some(s => s.id === person.id)) e.participants.push(person);
    });
  },
  async saveWrittenScore(examId, student, questionScores, actor = TEACHER_ACTOR) {
    const person = await eligibleStudent(student);
    return mutate(db => {
      const e = examById(db, examId); teacherOwns(e, actor);
      if (e.status !== 'published' || e.type === 'mcq' || Date.now() < new Date(`${classExamDate(e.startAt)}T00:00:00+06:00`).getTime()) fail('ক্লাসে পরীক্ষার দিন থেকে নম্বর দেওয়া যাবে।');
      if (e.questions.some(q => !Object.hasOwn(questionScores, q.id) || !['string', 'number'].includes(typeof questionScores[q.id]) || !String(questionScores[q.id]).trim() || !Number.isFinite(Number(questionScores[q.id])) || round(Number(questionScores[q.id])) !== Number(questionScores[q.id]) || Number(questionScores[q.id]) < 0 || Number(questionScores[q.id]) > q.marks)) fail('প্রতিটি প্রশ্নের নম্বর শূন্য থেকে পূর্ণমানের মধ্যে দিন।');
      const score = round(e.questions.reduce((sum, q) => sum + Number(questionScores[q.id]), 0));
      let a = db.attempts.find(a => a.examId === e.id && a.studentId === person.id);
      if (!a) { a = { id: `AT-${crypto.randomUUID()}`, examId, studentId: person.id, name: person.name, className: person.className, number: 1, startedAt: Date.now(), order: [], answers: {} }; db.attempts.push(a); }
      const cleanScores = Object.fromEntries(e.questions.map(q => [q.id, Number(questionScores[q.id])]));
      Object.assign(a, { score, questionScores: cleanScores, status: 'submitted', finishedAt: Date.now() });
      e.absentIds = (e.absentIds || []).filter(id => id !== person.id);
      if (!e.participants.some(s => s.id === person.id)) e.participants.push(person);
    });
  }
};
export function watchExams(callback) {
  window.addEventListener('storage', e => { if (e.key === EXAM_KEY || e.key === null) callback(); });
  window.addEventListener('exam-data-updated', callback);
}
