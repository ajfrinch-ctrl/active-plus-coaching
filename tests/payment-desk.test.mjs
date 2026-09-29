/* Payment Receive desk, driven through the real payment.html + js/payment.js in
   jsdom: entry guard, search, one-tap collection (keypad + method pill), the
   durable save, receipt modal, today summary/activity, password change and exit.
   The Playwright spec (tests/payment-panel.spec.cjs) covers the browser-only
   bits: PDF download, canvas PNG and the Web Share/wa.me paths. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { adminStudents, initialTransactions, paymentMethods } from '../js/admin-data.js';
import { studentFeeSummary, dateLabel, TRANSACTIONS_KEY } from '../js/finance-data.js';
import { toBanglaNumber } from '../js/ui.js';
import { PAYMENT_ACCOUNT_KEY, PAYMENT_SESSION_KEY, PAYMENT_USER_ID, hasPaymentSession, loadPaymentAccount } from '../js/payment-auth.js';
import { STAFF_TEST_PASSWORD, provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { ROSTER_KEY } from '../js/office-data.js';

const DEMO_OFF = {
  'activePlus.demo.autofill.v1': 'off',
  [ROSTER_KEY]: JSON.stringify(adminStudents),
  [TRANSACTIONS_KEY]: JSON.stringify(initialTransactions)
};
const raisa = adminStudents.find(s => s.id === 'AP-1024');
const money = value => `৳${toBanglaNumber(Number(value).toLocaleString('en-US'))}`;
let ctx;

before(async () => {
  /* The counter signs in on the one shared login card in index.html, so the
     desk page carries no entry form any more: it opens from the device-bound
     session that sign-in wrote, and that session has to exist before the
     module is imported. */
  ctx = await loadPage('payment.html', { seed: DEMO_OFF });
  await provisionStaff('payment');
  seedStaffSession(ctx.window, 'payment');
  await import('../js/payment.js');
  await ctx.waitFor(() => ctx.$('#payShell').hidden === false);
  // The session token is written after the desk opens; wait for the store.
  await ctx.waitFor(() => ctx.window.localStorage.getItem(PAYMENT_SESSION_KEY) !== null);
});

test('the desk has no entry form of its own — the shared login card is the only door', () => {
  const { $ } = ctx;
  assert.equal($('#payLoginForm'), null, 'the counter page carries no login form');
  assert.equal($('#payLoginUser'), null);
  assert.equal($('#payLoginPin'), null);
  assert.equal($('#payShell').hidden, false, 'the desk is already open');
});

test('a device-bound session opens the desk, stores the session and focuses search', async () => {
  const { $, $$, window } = ctx;
  // The session is a device-bound token (encrypted when the platform allows).
  assert.equal(window.localStorage.getItem(PAYMENT_SESSION_KEY) !== null, true);
  assert.equal(await hasPaymentSession(), true);
  assert.equal(window.document.activeElement, $('#payStudentSearch'));
  // Method pills come from the shared payment method list.
  const pills = $$('#payFeeMethodGroup [data-pay-method]');
  assert.deepEqual(pills.map(pill => pill.dataset.payMethod), [...paymentMethods]);
  assert.equal($('#payFeeMethod').value, paymentMethods[0]);
});

test('search by name lists the student and the profile shows the dues', () => {
  const { $, $$, click, type } = ctx;
  const summary = studentFeeSummary(raisa, initialTransactions);
  type($('#payStudentSearch'), 'রাইসা');
  const results = $$('#paySearchResults .fee-search-result');
  assert.equal(results.length, 1);
  assert.equal(results[0].querySelector('strong').textContent, 'রাইসা ইসলাম');
  assert.match($('#paySearchStatus').textContent, /১ জন শিক্ষার্থী পাওয়া গেছে/);
  assert.match(results[0].textContent, summary.due > 0 ? /বকেয়া/ : /বকেয়া নেই/);

  click(results[0]);
  assert.match($('#payQuickProfile').textContent, /রাইসা ইসলাম/);
  assert.match($('#payQuickProfile').textContent, /বর্তমান মাসের বকেয়া/);
  assert.match($('#payQuickProfile').textContent, new RegExp(money(summary.due)));
  // Sticky collect bar follows the selection.
  assert.equal($('#payStickyBar').hidden, false);
  assert.equal($('#payStickyName').textContent, 'রাইসা ইসলাম');
  assert.equal($('#payStickyAction').textContent, 'টাকা নিন');
});

test('keypad + method pill collect in a few taps and the save is durable', async () => {
  const { $, $$, click, type, submit, waitFor, window } = ctx;
  const summary = studentFeeSummary(raisa, initialTransactions);

  // Disabled until the ledger has loaded; a click then would be a no-op.
  await waitFor(() => $('#payProfileCollect').disabled === false);
  click($('#payProfileCollect'));
  assert.equal($('#payCollectionForm').hidden, false);
  assert.equal($('#payFeeAmount').value, String(summary.due || summary.monthlyFee));

  const bkash = $$('#payFeeMethodGroup [data-pay-method]').find(pill => pill.dataset.payMethod === 'বিকাশ (bKash)');
  click(bkash);
  assert.equal($('#payFeeMethod').value, 'বিকাশ (bKash)');
  assert.equal(bkash.getAttribute('aria-checked'), 'true');

  // Amount by keypad: wipe the prefilled value, then 8 → 0 → 0.
  const digits = String($('#payFeeAmount').value).length;
  for (let i = 0; i < digits; i++) click($('#payKeypad [data-pay-key="back"]'));
  assert.equal($('#payFeeAmount').value, '');
  ['8', '0', '0'].forEach(key => click($(`#payKeypad [data-pay-key="${key}"]`)));
  assert.equal($('#payFeeAmount').value, '800');
  assert.match($('#paySaveLabel').textContent, /৳৮০০/);

  type($('#payFeeNote'), 'কাউন্টার টেস্ট');
  // jsdom does not fire submit for a submit-button click; the Playwright spec
  // clicks the real button in a browser.
  submit($('#payCollectionForm'));
  await waitFor(() => $('#payReceiptBackdrop').hidden === false);

  const stored = JSON.parse(window.localStorage.getItem(TRANSACTIONS_KEY));
  const added = stored.find(tx => tx.studentId === 'AP-1024' && tx.amount === 800);
  assert.ok(added, 'the collection must be written to the shared ledger');
  assert.equal(added.method, 'বিকাশ (bKash)');
  assert.equal(added.collectedBy, 'পেমেন্ট কাউন্টার');
  assert.equal(added.note, 'কাউন্টার টেস্ট');
  // Sequential receipt numbers: prefix + YYMMDD (6 digits) + a 3-digit daily sequence.
  assert.match(added.receiptNo, /^R\d{6}\d{3}-[a-f0-9]{16}$/);

  assert.match($('#payReceiptSub').textContent, /রসিদ নং: R\d{9}/);
  assert.match($('#payReceiptBody').textContent, /৳৮০০/);
  assert.match($('#payToast').textContent, /Manager অনুমোদনের অপেক্ষায়/);
  assert.equal(added.status, 'pending');
  assert.equal($('#payToast').dataset.tone, 'success');
  assert.equal($('#payCollectionForm').hidden, true);
});

test('today summary and activity list refresh after the collection', async () => {
  const { $, $$, click, waitFor } = ctx;
  const summary = studentFeeSummary(raisa, initialTransactions);
  const today = dateLabel(new Date());
  const beforeToday = initialTransactions.filter(tx => tx.date === today).reduce((sum, tx) => sum + tx.amount, 0);

  // A counter entry is not counted as collection until Manager approval.
  assert.equal($('#payTodayAmount').textContent, money(beforeToday));
  assert.match($('#payTodayCount').textContent, /১ অপেক্ষমাণ/);
  const rows = $$('#payTodayList .pay-activity-row');
  assert.equal(rows.length, initialTransactions.filter(tx => tx.date === today).length + 1);
  assert.match($('#payTodayList').textContent, /রাইসা ইসলাম/);

  // Closing the receipt re-renders the profile with the new paid total.
  click($('#payReceiptClose'));
  await waitFor(() => $('#payReceiptBackdrop').hidden === true);
  assert.match($('#payQuickProfile .fee-balance-grid').textContent, new RegExp(money(summary.paid)));

  // Reopening a receipt from today's list uses the stored transaction.
  click(rows[0]);
  await waitFor(() => $('#payReceiptBackdrop').hidden === false);
  assert.match($('#payReceiptSub').textContent, /রসিদ নং: R\d{9}/);
  click($('#payReceiptClose'));
});

test('receipt text can be copied for a quick WhatsApp paste', async () => {
  const { $, click, waitFor, window } = ctx;
  let copied = null;
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async text => { copied = text; } }
  });
  const rows = ctx.$$('#payTodayList .pay-activity-row');
  click(rows[0]);
  await waitFor(() => $('#payReceiptBackdrop').hidden === false);
  click($('#payReceiptCopy'));
  await waitFor(() => copied !== null);
  assert.match(copied, /রাইসা ইসলাম \(AP-1024\)/);
  assert.match(copied, /রসিদ নং: R\d{9}/);
  assert.match($('#payToast').textContent, /কপি হয়েছে/);
  click($('#payReceiptClose'));
});

test('the password can be changed from the desk; the stored account keeps its user ID', async () => {
  const { $, click, type, submit, waitFor, window } = ctx;
  click($('#payPinButton'));
  assert.equal($('#payPinBackdrop').hidden, false);

  type($('#payPinCurrent'), '111111');
  type($('#payPinNew'), '456789');
  type($('#payPinConfirm'), '456789');
  submit($('#payPinForm'));
  await waitFor(() => $('#payPinError').hidden === false);
  assert.match($('#payPinError').textContent, /বর্তমান পাসওয়ার্ড সঠিক নয়/);

  type($('#payPinCurrent'), STAFF_TEST_PASSWORD);
  submit($('#payPinForm'));
  await waitFor(() => $('#payPinBackdrop').hidden === true);
  // The stored record is an encrypted envelope: no username or password text
  // is readable from storage, and the account keeps its user ID.
  const raw = window.localStorage.getItem(PAYMENT_ACCOUNT_KEY);
  assert.equal(/"password"/.test(raw), false);
  assert.equal(/"username"/.test(raw), false);
  const account = await loadPaymentAccount();
  assert.equal(account.userId, PAYMENT_USER_ID);
  assert.equal(account.hasPassword, true);
  // The new password is the one that works now.
  const { verifyPaymentCredentials } = await import('../js/payment-auth.js');
  assert.equal(await verifyPaymentCredentials(PAYMENT_USER_ID, '456789'), true);
  assert.equal(await verifyPaymentCredentials(PAYMENT_USER_ID, STAFF_TEST_PASSWORD), false);
  assert.equal(await hasPaymentSession(), true, 'the desk stays signed in after the change');
  assert.match($('#payToast').textContent, /পাসওয়ার্ড পরিবর্তন হয়েছে/);
});

test('logout clears the session and goes to the shared login page', () => {
  const { $, click, window, jsdomErrors } = ctx;
  assert.equal(jsdomErrors.some(e => /navigation/i.test(e)), false);
  click($('#payExitButton'));
  assert.equal($('#payShell').hidden, true);
  assert.equal($('#payStickyBar').hidden, true);
  assert.equal(window.localStorage.getItem(PAYMENT_SESSION_KEY), null);
  assert.equal(window.sessionStorage.getItem(PAYMENT_SESSION_KEY), null);
  // jsdom cannot navigate, so the attempt itself is the assertion.
  assert.equal(jsdomErrors.some(e => /navigation/i.test(e)), true);
  // And the page really targets the login page.
  assert.match(window.document.querySelector('#payExitButton').outerHTML, /লগআউট/);
});
