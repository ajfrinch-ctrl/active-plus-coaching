import test from 'node:test';
import assert from 'node:assert/strict';
import { adminStudents, initialTransactions } from '../js/admin-data.js';
import { searchStudents, studentFeeSummary, newestTransactions, monthLabel, dateLabel, financeRepository, TRANSACTIONS_KEY } from '../js/finance-data.js';
import { receiptMarkup, imagePDF } from '../js/finance-receipt.js';
const now = new Date(2026, 8, 22);

test('search: empty, unknown, Bangla/English name, mobile, ID and Bengali digits', () => {
  assert.deepEqual(searchStudents(adminStudents, '  '), []);
  assert.deepEqual(searchStudents(adminStudents, 'unknown-student'), []);
  for (const query of ['রাইসা', 'RAISA', 'ap-1024', '০১৭০০০০০০০০', '017-0000-0000']) {
    assert.equal(searchStudents(adminStudents, query)[0].id, 'AP-1024');
  }
  assert.equal(searchStudents(adminStudents, '২৬০৬১৩০০৪')[0].nameEn, 'Imran Hossain');
});

test('partial tuition, other fee types, wrong year and overpayments', () => {
  const student = adminStudents.find(s => s.id === '260613004');
  let summary = studentFeeSummary(student, initialTransactions, now);
  assert.equal(summary.paid, 800);
  assert.equal(summary.due, 1500); // Model test fees do not settle tuition.
  const tuition = { studentId: student.id, feeType: 'মাসিক বেতন', month: monthLabel(now), amount: 500, date: dateLabel(now) };
  const txs = [...initialTransactions, tuition, { ...tuition, month: 'সেপ্টেম্বর ২০২৫', amount: 9999 }];
  summary = studentFeeSummary(student, txs, now);
  assert.equal(summary.paid, 1300);
  assert.equal(summary.due, 1000);
  assert.equal(studentFeeSummary(student, [...txs, { ...tuition, amount: 2000 }], now).due, 0);
  assert.equal(studentFeeSummary({ ...student, monthlyFee: 2500 }, txs, now).due, 2000);
  assert.equal(studentFeeSummary({ ...student, monthlyFee: 0 }, [], now).due, 0);
  assert.equal(studentFeeSummary(student, [], now).lastPayment, null);
});

test('dynamic dates work across month/year boundaries', () => {
  assert.equal(monthLabel(new Date(2027, 0, 1)), 'জানুয়ারি ২০২৭');
  assert.equal(dateLabel(new Date(2027, 11, 31)), '৩১ ডিসেম্বর ২০২৭');
});

test('recent payments are chronologically sorted without mutating records; ties stable', () => {
  const copy = [...initialTransactions];
  const recent = newestTransactions(copy);
  assert.equal(recent[0].id, 'TRX-9821');
  assert.equal(recent[1].id, 'TRX-9820');
  assert.equal(recent[4].id, 'TRX-9815'); // Aug 25 must precede Aug 14.
  assert.equal(copy[4].id, 'TRX-9817');
});

test('repository seeds once, persists same record shape, merges saves, rejects corruption/failure', async () => {
  const storage = new Map();
  globalThis.window = { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  } };
  const before = await financeRepository.listTransactions();
  const tx = { ...before[0], id: 'unique-one', receiptNo: 'receipt-one', amount: 100 };
  await financeRepository.saveTransaction(tx);
  const after = await financeRepository.listTransactions();
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after[0], tx);
  await financeRepository.saveTransaction(tx); // Idempotent save by ID.
  assert.equal((await financeRepository.listTransactions()).length, after.length);
  const otherTab = { ...tx, id: 'other-tab' };
  storage.set(TRANSACTIONS_KEY, JSON.stringify([otherTab, ...after]));
  await financeRepository.saveTransaction({ ...tx, id: 'second' });
  assert.equal((await financeRepository.listTransactions()).length, after.length + 2);
  storage.set(TRANSACTIONS_KEY, 'corrupt-json');
  await assert.rejects(financeRepository.listTransactions());
  await assert.rejects(financeRepository.saveTransaction(tx));
  assert.equal(storage.get(TRANSACTIONS_KEY), 'corrupt-json');
  storage.delete(TRANSACTIONS_KEY);
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(financeRepository.saveTransaction(tx));
});

test('receipt includes branding, ID/reference, and escapes user-controlled strings', () => {
  const html = receiptMarkup({ ...initialTransactions[0], note: '<img src=x onerror=alert(1)>', trxRef: '<script>bad()</script>' });
  assert.ok(html.includes('assets/icons/app-logo.png'));
  assert.ok(html.includes('AP-1024'));
  assert.ok(html.includes('Active Plus Coaching'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});


test('direct PDF encodes accurate binary stream lengths and cross-reference offsets', async () => {
  const jpeg = new Uint8Array([255, 216, 0, 233, 10, 255, 217]);
  const blob = imagePDF(jpeg, 1520, 2000);
  assert.equal(blob.type, 'application/pdf');
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.includes('/Length 7 >>\nstream\n'));
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  const rows = pdf.slice(xref).split('\n');
  for (let id = 1; id <= 5; id++) {
    const offset = Number(rows[id + 2].slice(0, 10));
    assert.ok(pdf.slice(offset).startsWith(`${id} 0 obj`));
  }
  assert.throws(() => imagePDF(jpeg, 0, 2000));
  assert.throws(() => imagePDF(new Uint8Array(), 1520, 2000));
});
