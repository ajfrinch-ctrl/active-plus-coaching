/* The on-screen transaction list is capped so a busy month stays readable.
   Seeded with 25 records for the current month; the download still covers all. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { TRANSACTIONS_KEY, monthLabel, dateLabel } from '../js/finance-data.js';

const TOTAL = 25;
const month = monthLabel();
const seeded = Array.from({ length: TOTAL }, (_, i) => ({
  id: `TRX-900${i}`,
  receiptNo: `REC-2609-${90 + i}`,
  auditCode: `AUD-TX-900${i}`,
  studentId: `AP-10${i}`,
  studentName: `শিক্ষার্থী ${i + 1}`,
  className: 'দশম শ্রেণি',
  feeType: 'মাসিক বেতন',
  amount: 1000 + i,
  method: 'নগদ',
  month,
  date: dateLabel(),
  note: ''
}));

let ctx;

before(async () => {
  ctx = await loadPage('admin.html', {
    seed: { 'activePlus.demo.autofill.v1': 'off', [TRANSACTIONS_KEY]: JSON.stringify(seeded) }
  });
  await import('../js/admin.js');
  await ctx.waitFor(() => ctx.$('#reportTrxCount').textContent === '২৫ টি');
});

const rows = () => ctx.$$('#reportCollectionList .report-payment').length;

test('a long month shows one page of rows and offers the rest', () => {
  assert.equal(ctx.$('#reportTrxCount').textContent, '২৫ টি', 'the summary counts every filtered record');
  assert.equal(rows(), 20, 'only one page is rendered at first');
  const more = ctx.$('#reportListMore');
  assert.equal(more.hidden, false);
  assert.equal(more.textContent, 'আরও ৫ টি লেনদেন দেখুন');
});

test('"show more" reveals the rest and then hides itself', () => {
  ctx.click(ctx.$('#reportListMore'));
  assert.equal(rows(), TOTAL);
  assert.equal(ctx.$('#reportListMore').hidden, true);
});

test('resetting the filters pages the list back to the start', () => {
  ctx.click(ctx.$('#reportFiltersReset'));
  assert.equal(rows(), 20);
  const more = ctx.$('#reportListMore');
  assert.equal(more.hidden, false);
  assert.equal(more.textContent, 'আরও ৫ টি লেনদেন দেখুন');
});
