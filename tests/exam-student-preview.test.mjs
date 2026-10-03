import assert from 'node:assert/strict';
import test from 'node:test';

import { examQuestionMarkup, examPaperMarkup } from '../js/exam-ui.js';

/* A paper the manager previews and the paper a pupil sits must be one drawing.
   Before v167 the staff side used `questionPreview` — an <article>/<small>
   layout that also revealed the correct answers — so it could not stand in for
   what a pupil would actually see, and the two could drift apart. Both sides
   now call `examQuestionMarkup`; the only difference is whether the radios
   can be answered. */

const question = {
  id: 'q1',
  text: '২ + ২ = ? <b>সহজ</b>',
  marks: 1,
  answer: 'B',
  options: [
    { id: 'A', text: '৩' },
    { id: 'B', text: '৪' },
    { id: 'C', text: '৫' }
  ]
};
const exam = { id: 'E1', title: 'গণিত পরীক্ষা', questions: [question] };

test('the answering markup is byte-identical to the paper pupils were already sitting', async () => {
  const markup = examQuestionMarkup(question, 0, {
    optionIds: ['B', 'A', 'C'],
    selected: 'B',
    answering: true
  });
  assert.equal(markup,
    '<fieldset class="exam-question"><legend>প্রশ্ন ১ • ১ নম্বর</legend>' +
    '<p>২ + ২ = ? &lt;b&gt;সহজ&lt;/b&gt;</p>' +
    '<label class="exam-option"><input type="radio" name="answer-q1" value="B" data-answer-question="q1" checked><span>A. ৪</span></label>' +
    '<label class="exam-option"><input type="radio" name="answer-q1" value="A" data-answer-question="q1" ><span>B. ৩</span></label>' +
    '<label class="exam-option"><input type="radio" name="answer-q1" value="C" data-answer-question="q1" ><span>C. ৫</span></label>' +
    '</fieldset>');
});

test('the preview is the same shell with the radios switched off', async () => {
  const paper = examQuestionMarkup(question, 0);
  const sitting = examQuestionMarkup(question, 0, { answering: true });

  for (const markup of [paper, sitting]) {
    assert.ok(markup.startsWith('<fieldset class="exam-question"><legend>প্রশ্ন ১ • ১ নম্বর</legend>'), 'one question shell');
    assert.equal(markup.match(/class="exam-option"/g)?.length, 3, 'every option is drawn');
  }
  assert.equal(paper.match(/data-answer-question/g), null, 'a preview cannot record an answer');
  assert.equal(paper.match(/type="radio" disabled/g)?.length, 3, 'its radios are inert');
  assert.notEqual(paper, sitting, 'so the two modes really are distinct');
});

test('the preview never leaks the answer key', async () => {
  const paper = examPaperMarkup(exam);
  assert.ok(!/সঠিক উত্তর/.test(paper), 'no answer label');
  assert.ok(!/value="B"/.test(paper), 'no option carries its id as a value either');
  assert.equal(paper.match(/class="exam-question"/g)?.length, 1, 'one question rendered');
});

test('an option missing from the paper is skipped rather than crashing', async () => {
  const markup = examQuestionMarkup(question, 1, { optionIds: ['A', 'ZZ'] });
  assert.equal(markup.match(/class="exam-option"/g)?.length, 1, 'only the real option is drawn');
  assert.ok(markup.includes('প্রশ্ন ২ • ১ নম্বর'), 'and it keeps its numbering');
});
