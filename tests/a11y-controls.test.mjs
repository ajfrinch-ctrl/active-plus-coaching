/* Accessible names for every interactive control, on every panel and view.
   Found by a dynamic scan (jsdom boots each page for real): the Admin student
   search sat inside an icon-only <label>, the Admin class switches put their
   aria-label on the <label> instead of the checkbox, the Manager finance
   filters had placeholders but no name, and the Teacher "load more" button was
   nameless until script filled it. Each of those is a screen-reader user
   landing on an unlabelled control, so the scan now runs as a test.

   Each page/role pair is scanned in its own process (the ES module cache and
   the jsdom globals belong to one page state), exactly like ui-sweep.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';

const PANELS = [
  ['index.html', 'guest'],
  ['index.html', 'student'],
  ['admin.html', 'admin'],
  ['manager.html', 'manager'],
  ['teacher.html', 'teacher'],
  ['payment.html', 'payment']
];

test('every panel and view names all of its interactive controls', { timeout: 300000 }, () => {
  const problems = [];
  for (const [file, mode] of PANELS) {
    const output = execFileSync(process.execPath, ['--experimental-default-type=module', 'tests/a11y-scan.mjs', file, mode], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    const result = JSON.parse(output.trim().split('\n').pop());
    assert.ok(result.views.length > 0, `${file} (${mode}) exposed at least one view to scan`);
    for (const problem of result.unnamed) problems.push(`${file} (${mode}) → ${problem.view}: <${problem.control}>`);
  }
  assert.deepEqual(problems, [], `unnamed controls:\n${problems.join('\n')}`);
});

test('the specific controls that were fixed keep their names', () => {
  const admin = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(admin, /<input id="studentSearch"[^>]*aria-label="[^"]+"/, 'the icon-only search label needs its own aria-label');
  const manager = readFileSync(new URL('../manager.html', import.meta.url), 'utf8');
  assert.match(manager, /<input id="managerPaymentSearch"[^>]*aria-label="[^"]+"/, 'the finance search needs a name');
  assert.match(manager, /<select id="managerPaymentStatus"[^>]*aria-label="[^"]+"/, 'the finance status filter needs a name');
  const teacher = readFileSync(new URL('../teacher.html', import.meta.url), 'utf8');
  assert.match(teacher, /<button id="teacherRecordMore"[^>]*>আরও দেখুন<\/button>/, 'the load-more button is named before script runs');
  const adminJs = readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8');
  assert.match(adminJs, /<input type="checkbox" data-class-name="\$\{className\}" aria-label="[^"]+"/, 'the class switch names the checkbox itself, not the wrapping label');
});

test('the feedback toast is a persistent live region, not a rebuilt node', async () => {
  const ctx = await loadPage('index.html');
  const { showFeedback } = await import('../js/ui.js');
  showFeedback('টেস্ট বার্তা');
  const toast = ctx.$('.feedback-toast');
  assert.ok(toast, 'the toast is on the page');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.equal(toast.getAttribute('aria-live'), 'polite');
  assert.equal(toast.hidden, false);
  assert.match(toast.textContent, /টেস্ট বার্তা/, 'the text is written synchronously');
  showFeedback('দ্বিতীয় বার্তা');
  assert.equal(ctx.$$('.feedback-toast').length, 1, 'the region is reused so announcements keep arriving');
  assert.match(ctx.$('.feedback-toast').textContent, /দ্বিতীয় বার্তা/);
});
