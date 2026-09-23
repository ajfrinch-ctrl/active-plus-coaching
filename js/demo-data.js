/* Explicit, additive fixtures for app review. Never replace a user's records. */
import { adminStudents, initialTransactions } from './admin-data.js';
import { examRepository, EXAM_KEY, validateExam, examTemplate, scoreAttempt } from './exam-data.js';
import { teachingRepository, TEACHING_KEY, DEMO_TEACHER, validateActivity, todayISO } from './teaching-data.js';
import { TRANSACTIONS_KEY, monthLabel, dateLabel } from './finance-data.js';
export const DEMO_MODE_KEY = 'activePlus.demo.autofill.v1';
export function demoEnabled() {
  try { return window.localStorage.getItem(DEMO_MODE_KEY) !== 'off'; } catch { return false; }
}
const roster = () => adminStudents.filter(s => s.status === 'approved').map(s => ({ id: s.id, name: s.name, className: s.className }));
export function buildDemoExams(now = Date.now(), batch = 'initial') {
  const hour = 3600000, people = roster();
  const definitions = [
    ['live', 'mcq', 'চলমান MCQ — এখনই অংশ নিন', -hour / 30, hour * 58 / 60, 'published'],
    ['upcoming', 'mcq', 'আসন্ন গণিত পরীক্ষা', 2 * hour, 3 * hour, 'published'],
    ['completed', 'mcq', 'সম্পন্ন MCQ — ফলাফল ও উত্তরপত্র', -26 * hour, -25 * hour, 'published'],
    ['written', 'written', 'লিখিত — প্রশ্নপত্র ও ক্লাসের নম্বর', -26 * hour, -25 * hour, 'published'],
    ['short', 'short', 'সংক্ষিপ্ত উত্তর — ক্লাস মূল্যায়ন', -26 * hour, -25 * hour, 'published'],
    ['pending', 'mcq', 'Admin অনুমোদনের অপেক্ষায়', 4 * hour, 5 * hour, 'pending'],
    ['draft', 'short', 'সম্পাদনার জন্য খসড়া', 6 * hour, 7 * hour, 'draft'],
    ['rejected', 'written', 'সংশোধনের জন্য ফেরত', 8 * hour, 9 * hour, 'rejected']
  ];
  const exams = definitions.map(([key, type, title, start, end, status]) => ({
    ...validateExam({ type, title: `ডেমো: ${title}`, subject: 'গণিত', startAt: now + start, endAt: now + end, lateMinutes: key === 'live' ? 60 : 15, negative: .5, passPercent: 33, template: examTemplate(type), instructions: 'এটি অ্যাপ যাচাইয়ের নমুনা পরীক্ষা। সব প্রশ্ন পড়ুন। চাইলে নাম, সময় ও প্রশ্ন বদলে নতুন খসড়া তৈরি করুন।' }),
    id: `DEMO-EX-${batch}-${key}`, teacherId: DEMO_TEACHER.id, teacherName: DEMO_TEACHER.name,
    status, reviewNote: status === 'rejected' ? 'ডেমো মন্তব্য: প্রশ্নের ভাষা সহজ করে পুনরায় অনুমোদনের জন্য পাঠান।' : '',
    participants: status === 'published' ? people : [], createdAt: now, updatedAt: now, demoFixture: true,
    ...(type !== 'mcq' && status === 'published' ? { absentIds: [people[1].id] } : {})
  }));
  const attempts = [];
  function result(exam, person, answers) {
    const attempt = { id: `DEMO-AT-${batch}-${exam.type}-${exam.id.split('-').at(-1)}-${person.id}`, examId: exam.id, studentId: person.id, name: person.name, className: person.className, number: 1, status: 'submitted', startedAt: exam.startAt + 1000, finishedAt: Math.min(now - 1000, exam.endAt - 1000), savedAt: Math.min(now - 1000, exam.endAt - 1000), answers, demoFixture: true, order: exam.type === 'mcq' ? exam.questions.map(q => ({ id: q.id, options: q.options.map(o => o.id) })) : [] };
    if (exam.type === 'mcq') Object.assign(attempt, scoreAttempt(exam, attempt));
    else { attempt.questionScores = { q1: 4, q2: 2 }; attempt.score = 6; attempt.finishedAt = now - 1000; }
    attempts.push(attempt);
  }
  const live = exams[0], complete = exams[2];
  result(live, people[1], { q1: 'A', q2: 'C' }); result(live, people[2], { q1: 'B', q2: 'C' });
  result(complete, people[0], { q1: 'A' }); result(complete, people[1], { q1: 'A', q2: 'C' }); result(complete, people[2], { q1: 'B', q2: 'C' });
  result(exams[3], people[0], {}); result(exams[4], people[0], {});
  return { exams, attempts };
}
export function buildDemoTeaching(now = Date.now(), resourceURL = 'https://example.com/demo-study-notes.pdf') {
  const date = offset => todayISO(new Date(now + offset * 86400000)), timestamp = new Date(now).toISOString();
  return [
    ['exam', 'গত ক্লাসের গণিত পরীক্ষা', -1, 'published'], ['homework', 'আজকের বাড়ির কাজ', 1, 'published'],
    ['suggestion', 'গণিত সাজেশন ও পড়ার নোট', 0, 'published'], ['routine', 'আজকের সহায়ক গণিত ক্লাস', 0, 'published'], ['exam', 'পরবর্তী ক্লাসের খসড়া পরীক্ষা', 2, 'draft']
  ].map(([type, title, day, status]) => ({
    ...validateActivity({ type, title: `ডেমো: ${title}`, subject: 'গণিত', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', date: date(day), time: type === 'routine' ? '16:00' : '18:00', duration: 60, totalMarks: 100, status, room: 'রুম ২০৩', details: 'বীজগণিতের প্রথম অধ্যায় পড়বে। অনুশীলনী ১-এর প্রশ্ন সমাধান করবে। এটি অ্যাপ চেক করার নমুনা কাজ।', resourceURL }),
    id: `DEMO-ACT-${type}-${status}`, teacherId: DEMO_TEACHER.id, teacherName: DEMO_TEACHER.name, createdAt: timestamp, updatedAt: timestamp,
    progress: status === 'draft' || type === 'suggestion' ? {} : Object.fromEntries(['AP-1024', '260810021'].map((id, i) => [id, { value: type === 'exam' ? 85 + i * 5 : type === 'homework' ? (i ? 'done' : 'pending') : (i ? 'late' : 'present'), updatedAt: timestamp }])), demoFixture: true
  }));
}
const locked = (key, task) => navigator.locks ? navigator.locks.request(key, task) : task();
async function seedExams(fresh = false) {
  return locked(EXAM_KEY, async () => {
    const marker = `${EXAM_KEY}.demo-seeded.v1`;
    if (!fresh && window.localStorage.getItem(marker)) return;
    const db = await examRepository.list();
    const fixtures = buildDemoExams(Date.now(), fresh ? crypto.randomUUID().slice(0, 8) : 'initial');
    db.exams.push(...fixtures.exams.filter(e => !db.exams.some(old => old.id === e.id)));
    db.attempts.push(...fixtures.attempts.filter(a => !db.attempts.some(old => old.id === a.id)));
    window.localStorage.setItem(EXAM_KEY, JSON.stringify(db));
    window.localStorage.setItem(marker, '1');
    window.dispatchEvent(new Event('exam-data-updated'));
  });
}
export async function prepareDemoData() {
  if (!demoEnabled()) return [];
  const errors = [];
  for (const task of [seedExams, () => locked(TEACHING_KEY, async () => {
    const marker = `${TEACHING_KEY}.demo-seeded.v1`;
    const notesPDF = new URL('../assets/demo-study-notes.pdf', import.meta.url).href;
    const db = await teachingRepository.list();
    // Devices that seeded earlier demo fixtures still hold the retired .txt
    // link; repoint them so the supplementary-material button stays usable.
    const stale = db.activities.filter(a => a.demoFixture && typeof a.resourceURL === 'string' && a.resourceURL.endsWith('demo-study-notes.txt'));
    if (stale.length) {
      stale.forEach(a => { a.resourceURL = notesPDF; a.updatedAt = new Date().toISOString(); });
      window.localStorage.setItem(TEACHING_KEY, JSON.stringify(db));
      window.dispatchEvent(new Event('teaching-data-updated'));
    }
    if (window.localStorage.getItem(marker)) return;
    db.activities.push(...buildDemoTeaching(Date.now(), notesPDF).filter(a => !db.activities.some(old => old.id === a.id)));
    window.localStorage.setItem(TEACHING_KEY, JSON.stringify(db)); window.localStorage.setItem(marker, '1');
  }), () => locked(TRANSACTIONS_KEY, () => {
    // Never add fictional money to an already-saved ledger, even an empty one.
    if (window.localStorage.getItem(TRANSACTIONS_KEY) !== null) return;
    const records = initialTransactions.map((tx, index) => {
      const date = new Date(Date.now() - Math.floor(index / 2) * 86400000);
      return { ...tx, id: `DEMO-${tx.id}`, receiptNo: `DEMO-${tx.receiptNo}`, date: dateLabel(date), month: monthLabel(date), note: `ডেমো লেনদেন: ${tx.note || 'অ্যাপ পরীক্ষার জন্য'}` };
    });
    window.localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(records));
  })]) {
    try { await task(); } catch { errors.push('কিছু নমুনা ডেটা লোড হয়নি। সংরক্ষিত ডেটা মুছবেন না; স্টোরেজ পরীক্ষা করুন।'); }
  }
  return errors;
}
export async function addFreshDemoExams() { if (!demoEnabled()) throw new Error('ডেমো মোড বন্ধ আছে।'); await seedExams(true); }
