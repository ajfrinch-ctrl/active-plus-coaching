/* Answer keys for the exam module.
 *
 * Correct options are stored as a salted hash instead of plain text or an index,
 * so the offline question bank that ships to a device never reveals the answer.
 * Grading stays completely local: the selected option is hashed and compared.
 */

const KEY_SALT = 'active-plus-exam-v1';

export function normalizeAnswerKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function answerHash(value) {
  const text = `${normalizeAnswerKey(value)}::${KEY_SALT}`;
  let a = 0x811c9dc5;
  let b = 0x2545f491;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x85ebca6b) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }

  b = Math.imul(b ^ (a >>> 15), 0xc2b2ae35) >>> 0;
  return (a.toString(36) + b.toString(36)).padStart(13, '0');
}

export function isCorrectAnswer(question, optionText) {
  return answerHash(optionText) === question.answer;
}
