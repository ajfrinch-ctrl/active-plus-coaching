/**
 * Zero-dependency unit tests for the pure logic layer.
 * Run: node --test ssc-prep/tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildResult, chapterBreakdown, examDeadline, gradeFor, linePath, pickQuestions, remainingSeconds,
  scoreCQ, scoreMCQ, seededShuffle, shouldAutoSubmit, summarize, toBn, verdictFor, windowState
} from '../js/exam-logic.js';

const data = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const mcq = data.questions.mcq;
const q = (stem, answer, extra = {}) => ({
  id: extra.id || stem, stem, answer, marks: 1, chapterId: 'c1', topic: 'টপিক',
  options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }, { id: 'C', text: 'c' }, { id: 'D', text: 'd' }],
  ...extra
});

/* ---------- data contract ---------- */

test('question bank is internally consistent', () => {
  const ids = new Set();
  mcq.forEach(question => {
    assert.ok(!ids.has(question.id), `duplicate question id ${question.id}`);
    ids.add(question.id);
    assert.equal(question.options.length, 4, `${question.id} must have four options`);
    const optionIds = question.options.map(option => option.id);
    assert.ok(optionIds.includes(question.answer), `${question.id} answer "${question.answer}" is not one of its options`);
    assert.ok(question.explanation?.length > 10, `${question.id} needs a short explanation for immediate feedback`);
    assert.ok(data.chapters.some(chapter => chapter.id === question.chapterId), `${question.id} points at a missing chapter`);
  });

  data.sets.forEach(set => {
    set.questionIds.forEach(id => assert.ok(ids.has(id), `set ${set.id} references missing question ${id}`));
    if (set.kind !== 'practice') assert.ok(set.durationMin > 0, `timed set ${set.id} needs a duration`);
  });
});

test('creative questions carry stimulus plus ক খ গ ঘ parts with model answers', () => {
  data.questions.cq.forEach(item => {
    assert.ok(item.stimulus, `${item.id} needs an উদ্দীপক`);
    assert.deepEqual(item.parts.map(part => part.label), ['ক', 'খ', 'গ', 'ঘ']);
    assert.deepEqual(item.parts.map(part => part.marks), [1, 2, 3, 4]);
    item.parts.forEach(part => {
      assert.ok(part.modelAnswer?.length > 5, `${item.id}/${part.label} needs a model answer for the toggle`);
    });
  });
});

/* ---------- grading ---------- */

test('MCQ grading counts correct, incorrect and skipped without negative marking', () => {
  const questions = [q('১+১', 'A', { id: 'a' }), q('২+২', 'C', { id: 'b' }), q('৩+৩', 'B', { id: 'c' })];
  const score = scoreMCQ(questions, { a: 'A', b: 'D' });

  assert.equal(score.correct, 1);
  assert.equal(score.wrong, 1);
  assert.equal(score.skipped, 1);
  assert.equal(score.marks, 1);
  assert.equal(score.maxMarks, 3);
  assert.equal(score.percent, 33.3);
  assert.equal(score.raw, 1, 'practice mode must not deduct for wrong answers');
  assert.deepEqual(score.unansweredIds, ['c']);
});

test('negative marking subtracts and clamps the visible score at zero', () => {
  const questions = [q('১', 'A', { id: 'a' }), q('২', 'A', { id: 'b' }), q('৩', 'A', { id: 'c' }), q('৪', 'A', { id: 'd' })];
  const oneWrong = scoreMCQ(questions, { a: 'A', b: 'D' }, { negativePerWrong: 0.25 });
  assert.equal(oneWrong.raw, 0.75);
  assert.equal(oneWrong.marks, 0.75);

  const allWrong = scoreMCQ(questions, { a: 'D', b: 'D', c: 'D', d: 'D' }, { negativePerWrong: 0.25 });
  assert.equal(allWrong.raw, -1, 'raw can go negative for analytics');
  assert.equal(allWrong.marks, 0, 'but the reported score floors at 0');
  assert.equal(allWrong.percent, 0);
});

test('GPA and pass status follow the board scale', () => {
  assert.deepEqual(gradeFor(85, data.grading), { gpa: 5, grade: 'A+', passed: true, passPercent: 40 });
  assert.equal(gradeFor(72, data.grading).grade, 'A');
  assert.equal(gradeFor(39, data.grading).passed, false);
  assert.equal(gradeFor(40, data.grading).passed, true);
  const fallback = gradeFor(0, { scale: [], passPercent: 40 });
  assert.deepEqual(fallback, { gpa: 0, grade: '—', passed: false, passPercent: 40 }, 'a missing scale degrades, never throws');
});

test('buildResult stores everything the results page needs', () => {
  const questions = pickQuestions(mcq, { set: data.sets[1] });
  const answers = Object.fromEntries(questions.map(question => [question.id, question.answer]));
  const startedAt = Date.parse('2026-09-22T10:00:00+06:00');
  const result = buildResult({
    set: data.sets[1], questions, answers, flags: { [questions[0].id]: true },
    startedAt, submittedAt: startedAt + 45_000, grading: data.grading
  });

  assert.equal(result.kind, 'model');
  assert.equal(result.score.correct, questions.length);
  assert.equal(result.score.percent, 100);
  assert.equal(result.durationUsedSec, 45);
  assert.equal(result.autoSubmitted, false);
  assert.deepEqual(result.flags, [questions[0].id]);
  assert.ok(result.id.startsWith('res-'));
  assert.equal(result.score.perQuestion[0].state, 'correct');
});

/* ---------- timing ---------- */

test('the countdown is bounded by both duration and the exam window', () => {
  const startedAt = Date.parse('2026-09-22T16:35:00+06:00');
  const tenMinutes = examDeadline({ startedAt, durationMin: 10, closesAt: '2026-09-22T18:00:00+06:00' });
  assert.equal(remainingSeconds(tenMinutes, startedAt), 600);

  const windowFirst = examDeadline({ startedAt, durationMin: 120, closesAt: '2026-09-22T16:40:00+06:00' });
  assert.equal(remainingSeconds(windowFirst, startedAt), 300);

  const unbounded = examDeadline({ startedAt, durationMin: 5 });
  assert.equal(shouldAutoSubmit(remainingSeconds(unbounded, startedAt + 299_000)), false);
  assert.equal(shouldAutoSubmit(remainingSeconds(unbounded, startedAt + 301_000)), true);
  assert.equal(remainingSeconds(unbounded, startedAt + 999_000), 0, 'never goes negative');
});

test('live exam windows gate starting', () => {
  const live = data.sets.find(set => set.kind === 'live');
  const before = windowState(live, Date.parse(live.window.opensAt) - 60_000);
  assert.equal(before.key, 'scheduled');
  assert.equal(before.canStart, false);
  assert.equal(before.opensInMs, 60_000);

  const during = windowState(live, Date.parse(live.window.opensAt) + 60_000);
  assert.equal(during.canStart, true);
  assert.ok(during.closesInMs > 0);

  const after = windowState(live, Date.parse(live.window.closesAt) + 1);
  assert.equal(after.key, 'closed');
  assert.equal(after.canStart, false);

  assert.equal(windowState({ id: 'untimed' }).canStart, true, 'practice/model sets without a window always run');
});

/* ---------- selection ---------- */

test('pickQuestions honours chapter, difficulty, count and set order', () => {
  const chapter = pickQuestions(mcq, { chapterId: 'math-01' });
  assert.ok(chapter.length >= 4);
  chapter.forEach(question => assert.equal(question.chapterId, 'math-01'));

  const easy = pickQuestions(mcq, { difficulty: 'easy' });
  assert.ok(easy.length > 0 && easy.every(question => question.difficulty === 'easy'));

  assert.equal(pickQuestions(mcq, { count: 3 }).length, 3);
  const set = pickQuestions(mcq, { set: data.sets[1] });
  assert.deepEqual([...set.map(item => item.id)].sort(), [...data.sets[1].questionIds].sort(), 'set selects exactly its own questions');
  assert.notDeepEqual(set.map(item => item.id), data.sets[1].questionIds, 'this set is flagged shuffle:questions');
  assert.deepEqual(pickQuestions(mcq, { set: data.sets[0] }).map(item => item.id), data.sets[0].questionIds, 'an unshuffled set keeps JSON order');
  assert.equal(pickQuestions(mcq, { chapterId: 'does-not-exist' }).length, 0);
});

test('shuffling is deterministic per seed so every device sees one paper', () => {
  const input = mcq.map(question => question.id);
  const first = seededShuffle(input, 12345);
  assert.deepEqual(first, seededShuffle(input, 12345));
  assert.deepEqual([...first].sort(), [...input].sort(), 'shuffle must not drop or duplicate items');
  assert.notDeepEqual(first, input, 'and must actually reorder a 14-item list');
});

/* ---------- dashboard analytics ---------- */

test('chapter breakdown labels strong and weak chapters', () => {
  const strong = q('strong', 'A', { id: 's1', chapterId: 'math-01' });
  const weak = q('weak', 'A', { id: 'w1', chapterId: 'phys-02', topic: 'গতি' });
  const score = scoreMCQ([strong, q('s2', 'A', { id: 's2', chapterId: 'math-01' }), weak, q('w2', 'A', { id: 'w2', chapterId: 'phys-02' })], { s1: 'A', s2: 'A', w1: 'D', w2: 'D' });
  const rows = chapterBreakdown(score, data.chapters);

  assert.equal(rows.length, 2);
  const [weakRow, strongRow] = rows;
  assert.equal(weakRow.accuracy, 0);
  assert.equal(weakRow.verdict.key, 'low-sample', 'two questions is not enough to call a chapter weak');
  assert.equal(strongRow.accuracy, 100);
  assert.equal(strongRow.label, 'সেট ও ফাংশন');
  assert.equal(weakRow.topics[0], 'গতি', 'topic strings are trimmed for display');
});

test('verdicts need a sample before blaming a chapter', () => {
  assert.equal(verdictFor(100, 0).key, 'untested');
  assert.equal(verdictFor(0, 2).key, 'low-sample');
  assert.equal(verdictFor(85, 5).key, 'strong');
  assert.equal(verdictFor(65, 5).key, 'ok');
  assert.equal(verdictFor(45, 5).key, 'watch');
  assert.equal(verdictFor(20, 5).key, 'weak');
});

test('summarize aggregates history, focus list and streak', () => {
  const questions = pickQuestions(mcq, { set: data.sets[0] });
  const now = Date.now();
  const good = buildResult({ set: data.sets[0], questions, answers: Object.fromEntries(questions.map(item => [item.id, item.answer])), startedAt: now - 86_400_000, submittedAt: now - 86_400_000, grading: data.grading });
  const poorAnswers = Object.fromEntries(questions.map((question, index) => [question.id, index === 0 ? 'D' : question.answer]));
  const poor = buildResult({ set: data.sets[0], questions, answers: poorAnswers, startedAt: now - 172_800_000, submittedAt: now - 172_800_000, grading: data.grading });

  const stats = summarize({ attempts: [good, poor], submissions: [], chapters: data.chapters, grading: data.grading });
  assert.equal(poor.score.percent, 75, 'one wrong out of four');
  assert.equal(stats.attemptCount, 2);
  assert.equal(stats.best, 100);
  assert.equal(stats.avgPercent, 88);
  assert.equal(stats.trend, 25, 'last attempt minus the earlier average');
  assert.equal(stats.questionsAnswered, 8);
  assert.equal(stats.accuracy, 88);
  assert.equal(stats.streak, 2, 'yesterday plus the day before is a 2-day streak');
  assert.equal(stats.byChapter.length, 1);
  assert.equal(stats.byChapter[0].verdict.key, 'strong');
  assert.equal(stats.focus.length, 0, 'nothing to flag when the only chapter is strong');
  assert.deepEqual(stats.series, [75, 100], 'oldest first, for the sparkline');
});

test('a streak counts consecutive study days only', () => {
  const day = 86_400_000;
  const today = Date.now();
  const questions = [q('x', 'A', { id: 'x' })];
  const attempts = [0, 1, 2].map(offset => buildResult({
    set: data.sets[0], questions, answers: { x: 'A' },
    startedAt: today - offset * day, submittedAt: today - offset * day, grading: data.grading
  }));
  assert.equal(summarize({ attempts, chapters: [], grading: data.grading }).streak, 3);

  const withGap = [0, 2].map(offset => buildResult({
    set: data.sets[0], questions, answers: { x: 'A' },
    startedAt: today - offset * day, submittedAt: today - offset * day, grading: data.grading
  }));
  assert.equal(summarize({ attempts: withGap, chapters: [], grading: data.grading }).streak, 1);
});

test('linePath produces a parseable SVG path', () => {
  assert.equal(linePath([]), '');
  const path = linePath([20, 60, 40], 100, 40);
  assert.match(path, /^M-?\d+,-?\d+( L-?\d+,-?\d+){2}$/);
});

/* ---------- creative questions ---------- */

test('CQ self-assessment halves credit for a partially correct part', () => {
  const parts = [
    { label: 'ক', skill: 'জ্ঞান', marks: 1 },
    { label: 'খ', skill: 'বোধগ', marks: 2 },
    { label: 'গ', skill: 'প্রয়োগ', marks: 3 },
    { label: 'ঘ', skill: 'উচ্চতর দক্ষতা', marks: 4 }
  ];
  const result = scoreCQ(parts, { ক: 'full', খ: 'partial', গ: 'full' });

  assert.equal(result.max, 10);
  assert.equal(result.earned, 5, 'ক(১) + খ partial(২→১) + গ(৩)');
  assert.equal(result.percent, 50);
  assert.equal(result.answered, 3);
  assert.equal(result.detail[1].rating, 'partial');
  assert.equal(scoreCQ(parts, {}).earned, 0);
});

test('Bangla numerals render everywhere the student looks', () => {
  assert.equal(toBn('Score 42/50'), 'Score ৪২/৫০');
  assert.equal(toBn(0), '০');
  assert.equal(toBn(null), '');
});
