/* Report Center structure check on the real admin.html (jsdom).
   The Playwright spec asserts the same numbers; this file keeps them honest
   without a browser download and adds the parts the spec does not cover:
   card grouping, the capped transaction list and the reset button. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';

let ctx;

before(async () => {
  ctx = await loadPage('admin.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await import('../js/admin.js');
});

const text = selector => ctx.$(selector).textContent;
const rows = () => ctx.$$('#reportCollectionList .report-payment').length;

test('every report card is present with its download buttons', () => {
  const keys = ['collection', 'today', 'dues', 'students', 'class', 'results', 'attendance', 'routine'];
  // The panel itself must survive any markup edit: navigation and the
  // delegated download handler both key off this section.
  assert.equal(ctx.$$('.admin-view[data-view-panel="reports"]').length, 1);
  for (const key of keys) {
    const card = ctx.$(`[data-report-card="${key}"]`);
    assert.ok(card, `missing card ${key}`);
    assert.ok(card.closest('.admin-view[data-view-panel="reports"]'), `card ${key} fell outside the reports panel`);
    assert.ok(ctx.$(`[data-report-pdf="${key}"]`), `missing PDF button for ${key}`);
    assert.ok(ctx.$(`[data-report-csv="${key}"]`), `missing CSV button for ${key}`);
    if (key !== 'collection') assert.ok(ctx.$(`#reportMeta-${key}`), `missing meta for ${key}`);
  }
  // Two labelled groups: money first, students/academics after.
  assert.equal(ctx.$$('.reports-group-title').length, 2);
  assert.deepEqual(ctx.$$('.reports-group-title').map(el => el.textContent), ['আর্থিক লেনদেন', 'শিক্ষার্থী ও একাডেমিক']);
  const groups = ctx.$$('.quick-report-grid');
  assert.deepEqual(groups.map(g => g.dataset.reportGroup), ['financial', 'academic']);
  assert.deepEqual(
    ctx.$('[data-report-group="financial"]').querySelectorAll('[data-report-card]').length + 1, 3,
    'collection + today + dues in the money group'
  );
  assert.equal(ctx.$('[data-report-group="academic"]').querySelectorAll('[data-report-card]').length, 5);
  // No duplicate reportMeta ids anywhere on the page.
  const metas = ctx.$$('[id^="reportMeta-"]').map(el => el.id);
  assert.equal(new Set(metas).size, metas.length);
});

test('filters keep their option counts and the totals match the demo data', () => {
  assert.equal(ctx.$('#reportClass').options.length, 13);
  assert.equal(ctx.$('#reportFeeType').options.length, 7);
  assert.equal(ctx.$('#reportMethod').options.length, 6);
  assert.equal(text('#reportTrxCount'), '৪ টি');
  assert.equal(text('#reportGrandTotal'), '৳৫,৮০০');
  assert.equal(text('#reportMeta-dues'), '১ জনের বকেয়া • ৳১,৫০০');
  assert.match(text('#reportMeta-students'), /মোট ৮ জন/);
  assert.match(text('#reportMeta-routine'), /ক্লাস/);
  assert.ok(text('#reportPeriod').length > 0);
});

test('changing the month re-renders and the reset button restores it', () => {
  const { $, window } = ctx;
  const originalMonth = $('#reportMonth').value;
  assert.notEqual(originalMonth, 'all');

  $('#reportMonth').value = 'all';
  $('#reportMonth').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(text('#reportTrxCount'), '৭ টি');
  assert.equal(text('#reportGrandTotal'), '৳১২,৩০০');
  assert.equal(text('#reportPeriod'), 'সব সময়ের হিসাব');

  $('#reportClass').value = $('#reportClass').options[2].value;
  $('#reportClass').dispatchEvent(new window.Event('change', { bubbles: true }));

  ctx.click($('#reportFiltersReset'));
  assert.equal($('#reportMonth').value, originalMonth);
  assert.equal($('#reportClass').value, 'all');
  assert.equal($('#reportFeeType').value, 'all');
  assert.equal($('#reportMethod').value, 'all');
  assert.equal(text('#reportTrxCount'), '৪ টি');
  assert.equal(text('#reportGrandTotal'), '৳৫,৮০০');
});

test('a short list needs no "show more" button', () => {
  assert.ok(rows() > 0);
  assert.equal(ctx.$('#reportListMore').hidden, true);
});

test('a report card downloads its file with the expected name', async () => {
  const downloads = [];
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  ctx.window.HTMLAnchorElement.prototype.click = function click() { downloads.push(this.download); };

  // The "today" set is empty in the demo data, so use the collection report.
  ctx.click(ctx.$('[data-report-csv="collection"]'));
  await ctx.flush();

  assert.equal(downloads.length, 1);
  assert.match(downloads[0], /^APC-collection-report-\d{4}-\d{2}-\d{2}\.csv$/);
  const button = ctx.$('[data-report-csv="collection"]');
  assert.equal(button.disabled, false, 'the button is usable again after the download');
  assert.equal(button.textContent, 'CSV');
});
