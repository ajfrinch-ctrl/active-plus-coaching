/**
 * Author helper for the exam question bank: prints the hash that js/config.js
 * must store as `answer` for a correct option.
 *
 *   npm run hash "অ্যাম্পিয়ার"
 *   npm run hash -- --mcq "ভোল্ট" "ওহম" "অ্যাম্পিয়ার" "ওয়াট"
 *
 * The CLI shares js/exam-hash.js, so it can never drift from app grading.
 */
import { answerHash } from '../js/exam-hash.js';

const args = process.argv.slice(2);

if (args[0] === '--mcq') {
  args.slice(1).forEach((option, index) => {
    console.log(`${index + 1}. ${option}  →  answer: '${answerHash(option)}'`);
  });
} else if (args.length) {
  console.log(args.map(answerHash).join('\n'));
} else {
  console.log('Usage: npm run hash -- "<correct option text>"');
  console.log('       npm run hash -- --mcq "option 1" "option 2" "option 3" "option 4"');
}
