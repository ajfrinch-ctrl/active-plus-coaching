/* One empty state. An empty list used to say so in seven different ways
   (admin-empty, teacher-empty, notice-empty, dashboard-empty, empty-routine,
   admin-empty-search, rc-preview-empty), most of them a bare line of text with
   no way forward. These tests pin the shared card: the helper's shape, and that
   the real Teacher and Manager panels actually paint it. */
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { emptyState } from '../js/ui-states.js';
import { loadPage } from './jsdom-harness.mjs';
import { openStaffPanel } from './staff-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { enabledClasses } from '../js/config.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 40));

test('the shared empty state is icon + one line + an optional action', () => {
  const html = emptyState({ icon: 'notice', title: 'কোনো নোটিশ নেই।', message: 'নতুন নোটিশ যোগ করুন।', button: { label: 'নোটিশ যোগ', action: 'add-notice', tone: 'primary' } });
  assert.match(html, /class="apc-empty"/);
  assert.match(html, /<strong>কোনো নোটিশ নেই।<\/strong>/);
  assert.match(html, /<p>নতুন নোটিশ যোগ করুন।<\/p>/);
  assert.match(html, /data-empty-action="add-notice"/);
  assert.match(html, /aria-hidden="true"/, 'the icon is decoration, not text');
  /* No action was asked for, so none is invented. */
  assert.doesNotMatch(emptyState({ title: 'খালি।' }), /data-empty-action/);
  assert.doesNotMatch(emptyState({ title: 'খালি।' }), /<p>/);
  /* Copy is escaped: a title is data, never markup. */
  assert.match(emptyState({ title: '<img src=x onerror=alert(1)>' }), /&lt;img/);
});

test('the real Teacher panel paints the shared card, not its own empty class', async () => {
  const ctx = await loadPage('teacher.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify(enabledClasses.map((className, index) => ({ id: `TAS-${index}`, teacherUsername: 'teacher.apc', teacherName: 'Test Teacher', className, group: '', subject: 'Test' })))
    }
  });
  await openStaffPanel(ctx, 'teacher', {
    importPanel: () => import('../js/teacher.js'),
    shellId: 'teacherShell',
    ready: () => [...ctx.$('#teacherHomeClass').options].some(option => option.textContent === 'সব assigned class')
  });
  await settle();
  const queue = ctx.$('#teacherAttention');
  assert.ok(queue.querySelector('.apc-empty'), 'the work queue uses the shared empty state');
  assert.ok(queue.querySelector('.apc-empty .apc-empty-icon svg'), 'with the icon');
  assert.match(queue.textContent, /সব কাজ শেষ/);
  /* The panel's private empty class is gone from the rendered output. */
  assert.equal(queue.querySelectorAll('.teacher-empty').length, 0);
});

test('the real Manager panel paints the shared card in its lists', async () => {
  const ctx = await loadPage('manager.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([{ id: 'TAS-1', teacherUsername: 'teacher.apc', teacherName: 'Test Teacher', className: enabledClasses[0], group: '', subject: 'Test' }])
    }
  });
  await openStaffPanel(ctx, 'manager', { importPanel: () => import('../js/manager.js'), shellId: 'managerShell' });
  await settle();
  /* Each panel paints its list when its own page opens — open them. */
  ctx.click(ctx.$('[data-manager-view="notices"]'));
  await settle();
  const notices = ctx.$('#managerNoticeList');
  assert.ok(notices.querySelector('.apc-empty'), 'an empty notice list uses the shared empty state');
  assert.match(notices.textContent, /operational notice নেই/);
  assert.equal(notices.querySelectorAll('.admin-empty').length, 0);
  ctx.click(ctx.$('[data-manager-view="finance"]'));
  await settle();
  const payments = ctx.$('#managerPaymentList');
  assert.ok(payments.querySelector('.apc-empty'));
  assert.match(payments.textContent, /payment record নেই/);
});

test('no module hand-rolls its own empty card', () => {
  /* notice-center.js kept a private emptyState() and course-hub.js a hand-built
     .notice-empty block — two more skins for a job the shared card already does
     (§44: never two UIs for the same thing). Both now call emptyState(). */
  for (const file of readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js'))) {
    if (file === 'ui-states.js') continue; // the one place allowed to build the card
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    assert.equal(/class="apc-empty"/.test(source), false, `${file} must call emptyState(), not build the card itself`);
    assert.equal(/class="[^"]*\bnotice-empty\b/.test(source), false, `${file} still paints the retired .notice-empty card`);
  }
});
