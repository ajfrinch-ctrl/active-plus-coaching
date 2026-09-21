/**
 * Pure exam logic — no DOM, no framework.
 * Everything here is deterministic and unit-testable in Node, which is why
 * grading/analytics live in this file instead of inside the UI module.
 */

/* ---------- Bangla display helpers ---------- */

export function toBn(value) {
  return String(value ?? '').replace(/[0-9]/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
}

export function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return toBn(`${mm}:${ss}`);
}

/* ---------- selection ---------- */

/** Deterministic Fisher–Yates so a "shuffle" set behaves the same on every device. */
export function seededShuffle(list, seed = 1) {
  const items = [...list];
  let state = (seed >>> 0) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };

  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * @param {Array} questions full bank
 * @param {{set?, chapterId?, difficulty?, count?}} [options]
 */
export function pickQuestions(questions, { set, chapterId, difficulty, count } = {}) {
  const byId = new Map(questions.map(question => [question.id, question]));
  let pool = set?.questionIds?.length
    ? set.questionIds.map(id => byId.get(id)).filter(Boolean)
    : [...questions];

  if (chapterId) pool = pool.filter(question => question.chapterId === chapterId);
  if (difficulty) pool = pool.filter(question => question.difficulty === difficulty);
  if (set?.shuffle?.questions) pool = seededShuffle(pool, hashSeed(set.id));
  if (count) pool = pool.slice(0, count);
  return pool;
}

export function shuffledOptions(question, set) {
  if (!set?.shuffle?.options) return question.options;
  return seededShuffle(question.options, hashSeed(`${set.id}:${question.id}`));
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) {
    hash ^= String(text).charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/* ---------- live exam window ---------- */

export function windowState(exam, now = Date.now()) {
  const opensAt = exam.window?.opensAt ? Date.parse(exam.window.opensAt) : null;
  const closesAt = exam.window?.closesAt ? Date.parse(exam.window.closesAt) : null;

  if (opensAt !== null && now < opensAt) {
    return { key: 'scheduled', canStart: false, opensInMs: opensAt - now, closesInMs: null, label: 'শুরু হতে বাকি' };
  }
  if (closesAt !== null && now > closesAt) {
    return { key: 'closed', canStart: false, opensInMs: 0, closesInMs: 0, label: 'সময় শেষ' };
  }
  const closesInMs = closesAt !== null ? Math.max(0, closesAt - now) : null;
  return { key: 'open', canStart: true, opensInMs: 0, closesInMs, secondsLeft: closesInMs === null ? null : Math.floor(closesInMs / 1000), label: 'চলছে এখন' };
}

/** Deadline = min(exam end, start + duration). Auto-submit fires when it passes. */
export function examDeadline({ startedAt, durationMin, closesAt }, now = Date.now()) {
  const byDuration = startedAt + (durationMin || 0) * 60000;
  const byWindow = closesAt ? Date.parse(closesAt) : Infinity;
  return Math.min(byDuration, Number.isFinite(byWindow) ? byWindow : Infinity);
}

export function remainingSeconds(deadlineMs, nowMs = Date.now()) {
  return Math.max(0, Math.round((deadlineMs - nowMs) / 1000));
}

export function shouldAutoSubmit(remainingSec) {
  return remainingSec <= 0;
}

/* ---------- grading ---------- */

export function gradeFor(percent, grading) {
  const scale = grading?.scale?.length ? grading.scale : [{ min: 0, gpa: 0, grade: '—' }];
  const matched = [...scale].sort((a, b) => b.min - a.min).find(entry => percent >= entry.min) || scale.at(-1);
  const passPercent = grading?.passPercent ?? 40;
  return { gpa: matched.gpa, grade: matched.grade, passed: percent >= passPercent, passPercent };
}

/**
 * MCQ grading with optional negative marking.
 * @returns {{perQuestion, correct, wrong, skipped, marks, maxMarks, raw, percent, unansweredIds}}
 */
export function scoreMCQ(questions, answers, { negativePerWrong = 0 } = {}) {
  const perQuestion = [];
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let raw = 0;
  let maxMarks = 0;

  questions.forEach(question => {
    const chosen = answers?.[question.id];
    const marks = question.marks ?? 1;
    let state = 'skipped';
    let delta = 0;

    maxMarks += marks;
    if (chosen === undefined || chosen === null || chosen === '') {
      skipped += 1;
    } else if (chosen === question.answer) {
      state = 'correct';
      correct += 1;
      delta = marks;
    } else {
      state = 'incorrect';
      wrong += 1;
      delta = -(negativePerWrong || 0) * marks;
    }

    raw += delta;
    perQuestion.push({
      id: question.id,
      state,
      chosen: chosen ?? null,
      answer: question.answer,
      marks: delta,
      maxMarks: marks,
      stem: question.stem,
      explanation: question.explanation,
      chapterId: question.chapterId,
      topic: question.topic,
      difficulty: question.difficulty,
      options: question.options
    });
  });

  const clamped = Math.max(0, raw);
  const percent = maxMarks ? Math.round((clamped / maxMarks) * 1000) / 10 : 0;

  return {
    perQuestion,
    correct,
    wrong,
    skipped,
    total: questions.length,
    raw: Math.round(raw * 100) / 100,
    marks: Math.round(clamped * 100) / 100,
    maxMarks,
    percent,
    accuracy: questions.length ? Math.round((correct / questions.length) * 100) : 0,
    unansweredIds: perQuestion.filter(item => item.state === 'skipped').map(item => item.id)
  };
}

/** Result object stored in history and consumed by the results page. */
export function buildResult({ set, questions, answers, flags, startedAt, submittedAt, autoSubmitted, grading, submission }) {
  const score = scoreMCQ(questions, answers, { negativePerWrong: set?.negativePerWrong ?? 0 });
  const meta = gradeFor(score.percent, grading);

  return {
    id: `res-${submittedAt}-${Math.random().toString(36).slice(2, 7)}`,
    setId: set?.id ?? null,
    kind: set?.kind ?? 'practice',
    title: set?.title ?? 'সাধারণ অনুশীলন',
    chapterId: set?.chapterId ?? null,
    startedAt,
    submittedAt,
    durationUsedSec: Math.max(0, Math.round((submittedAt - startedAt) / 1000)),
    limitSec: (set?.durationMin || 0) * 60,
    autoSubmitted: Boolean(autoSubmitted),
    negativePerWrong: set?.negativePerWrong ?? 0,
    flags: Object.entries(flags || {}).filter(([, on]) => on).map(([id]) => id),
    answers,
    submission: submission || null,
    score,
    grade: meta
  };
}

/* ---------- analysis ---------- */

export function chapterBreakdown(score, chapters = []) {
  const map = new Map();

  score.perQuestion.forEach(item => {
    const key = item.chapterId || 'other';
    const entry = map.get(key) || {
      chapterId: key,
      label: chapters.find(chapter => chapter.id === key)?.name || 'অন্য অধ্যায়',
      total: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      marks: 0,
      maxMarks: 0,
      topics: new Set()
    };
    entry.total += 1;
    entry[item.state === 'correct' ? 'correct' : item.state === 'incorrect' ? 'wrong' : 'skipped'] += 1;
    entry.marks += item.marks;
    entry.maxMarks += item.maxMarks;
    if (item.topic) entry.topics.add(item.topic.trim());
    map.set(key, entry);
  });

  return [...map.values()].map(entry => ({
    ...entry,
    topics: [...entry.topics],
    accuracy: entry.total ? Math.round((entry.correct / entry.total) * 100) : 0,
    marks: Math.round(entry.marks * 100) / 100,
    verdict: verdictFor(entry.total ? (entry.correct / entry.total) * 100 : 0, entry.total)
  })).sort((a, b) => a.accuracy - b.accuracy);
}

/** Weakness detection: accuracy first, but a single question is not a verdict. */
export function verdictFor(accuracy, sample = 0) {
  if (!sample) return { key: 'untested', label: 'পরীক্ষা হয়নি', tone: 'slate' };
  if (sample < 3) return { key: 'low-sample', label: 'নমুনা কম', tone: 'slate' };
  if (accuracy >= 80) return { key: 'strong', label: 'শক্তিশালী', tone: 'emerald' };
  if (accuracy >= 60) return { key: 'ok', label: 'মোটামুটি', tone: 'lime' };
  if (accuracy >= 40) return { key: 'watch', label: 'মনে রাখতে হবে', tone: 'amber' };
  return { key: 'weak', label: 'দুর্বল', tone: 'rose' };
}

/** Topic-level view so the dashboard can say "প্রয়োগ-ধাঁচের প্রশ্নে দুর্বল". */
export function topicBreakdown(attempts) {
  const map = new Map();

  attempts.forEach(attempt => {
    (attempt.score?.perQuestion || []).forEach(item => {
      const key = `${item.chapterId}::${item.topic || 'সাধারণ'}`;
      const entry = map.get(key) || { chapterId: item.chapterId, topic: item.topic || 'সাধারণ', total: 0, correct: 0 };
      entry.total += 1;
      if (item.state === 'correct') entry.correct += 1;
      map.set(key, entry);
    });
  });

  return [...map.values()]
    .map(entry => ({ ...entry, accuracy: entry.total ? Math.round((entry.correct / entry.total) * 100) : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

export function skillBreakdown(submissions) {
  const map = new Map();

  submissions.forEach(record => {
    Object.entries(record.ratings || {}).forEach(([key, rating]) => {
      const skill = rating.skill || key.split('::')[1] || 'অজানা';
      const entry = map.get(skill) || { skill, total: 0, earned: 0, max: 0 };
      entry.total += 1;
      entry.earned += rating.earned;
      entry.max += rating.max;
      map.set(skill, entry);
    });
  });

  return [...map.values()].map(entry => ({
    ...entry,
    accuracy: entry.max ? Math.round((entry.earned / entry.max) * 100) : 0
  })).sort((a, b) => a.accuracy - b.accuracy);
}

export function streakDays(timestamps) {
  if (!timestamps.length) return 0;
  const days = [...new Set(timestamps.map(time => new Date(time).toISOString().slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== new Date(Date.now() - 86400000).toISOString().slice(0, 10)) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    const gap = (Date.parse(days[i - 1]) - Date.parse(days[i])) / 86400000;
    if (Math.round(gap) === 1) streak += 1;
    else break;
  }
  return streak;
}

/** The dashboard model: everything the cards, bars and notes need. */
export function summarize({ attempts, submissions = [], chapters = [], grading = {}, limit = 8 }) {
  const objective = attempts.filter(attempt => attempt.kind !== 'cq');
  const recent = [...objective].sort((a, b) => b.submittedAt - a.submittedAt);
  const percentSeries = recent.map(attempt => attempt.score.percent).reverse();

  const totals = objective.reduce(
    (acc, attempt) => {
      acc.correct += attempt.score.correct;
      acc.total += attempt.score.total;
      acc.marks += attempt.score.marks;
      acc.maxMarks += attempt.score.maxMarks;
      acc.time += attempt.durationUsedSec || 0;
      return acc;
    },
    { correct: 0, total: 0, marks: 0, maxMarks: 0, time: 0 }
  );

  const merged = { perQuestion: [] };
  objective.forEach(attempt => merged.perQuestion.push(...(attempt.score.perQuestion || [])));
  const byChapter = chapterBreakdown(merged, chapters);

  const avgPercent = recent.length ? Math.round(recent.reduce((sum, a) => sum + a.score.percent, 0) / recent.length) : 0;
  const best = recent.length ? Math.max(...recent.map(attempt => attempt.score.percent)) : 0;
  const cq = submissions.length
    ? {
        papers: submissions.length,
        parts: submissions.reduce((sum, record) => sum + Object.keys(record.ratings || {}).length, 0),
        accuracy: Math.round(
          (submissions.reduce((sum, record) => sum + record.earned, 0) /
            Math.max(1, submissions.reduce((sum, record) => sum + record.max, 0))) * 100
        )
      }
    : { papers: 0, parts: 0, accuracy: 0 };

  const focus = byChapter.filter(entry => entry.verdict.key === 'weak' || entry.verdict.key === 'watch');
  const trend = percentSeries.length >= 2
    ? Math.round(percentSeries.at(-1) - percentSeries.slice(0, -1).reduce((s, v, i, a) => s + v / a.length, 0))
    : 0;

  return {
    attempts: recent.slice(0, limit),
    attemptCount: objective.length,
    accuracy: totals.total ? Math.round((totals.correct / totals.total) * 100) : 0,
    avgPercent,
    best,
    trend,
    marks: Math.round(totals.marks * 100) / 100,
    maxMarks: totals.maxMarks,
    avgSecondsPerQuestion: totals.total && totals.time ? Math.round(totals.time / totals.total) : 0,
    questionsAnswered: totals.total,
    streak: streakDays(objective.map(attempt => attempt.submittedAt)),
    grade: gradeFor(avgPercent, grading),
    byChapter,
    focus,
    strengths: byChapter.filter(entry => entry.verdict.key === 'strong').reverse(),
    topics: topicBreakdown([{ score: merged }]),
    cq,
    skills: skillBreakdown(submissions),
    series: percentSeries.slice(-12)
  };
}

/** Small pure geometry helper so the dashboard needs no chart library. */
export function linePath(values, width = 260, height = 60) {
  if (!values.length) return '';
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = Math.round(index * step);
      const y = Math.round(height - ((value - min) / span) * height);
      return `${index === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

/* ---------- creative-question self assessment ---------- */

export const CQ_RATING = Object.freeze({
  none: { key: 'none', label: 'লিখিনি', ratio: 0 },
  partial: { key: 'partial', label: 'আংশিক ঠিক', ratio: 0.5 },
  full: { key: 'full', label: 'পূর্ণমিলিত', ratio: 1 }
});

export function scoreCQ(parts, ratings = {}) {
  let earned = 0;
  let max = 0;

  const detail = parts.map(part => {
    const rating = ratings[part.label] || 'none';
    const ratio = CQ_RATING[rating]?.ratio ?? 0;
    earned += (part.marks || 1) * ratio;
    max += part.marks || 1;
    return { label: part.label, skill: part.skill, marks: part.marks, rating, earned: Math.round((part.marks * ratio) * 100) / 100 };
  });

  return {
    detail,
    earned: Math.round(earned * 100) / 100,
    max,
    percent: max ? Math.round((earned / max) * 100) : 0,
    answered: Object.keys(ratings).length
  };
}
