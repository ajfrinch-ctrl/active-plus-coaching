/* Auto-login handoff: when a session already exists (written by the student
   login page or by a remembered device), payment.html must open straight onto
   the desk — no entry form, no second credential prompt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { PAYMENT_SESSION_KEY, hasPaymentSession } from '../js/payment-auth.js';
import { seedStaffSession } from './staff-harness.mjs';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';

test('an existing counter session opens the desk directly and it is usable', async () => {
  const ctx = await loadPage('payment.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify(adminStudents)
    }
  });
  // A remembered session is a device-bound token with an expiry.
  seedStaffSession(ctx.window, 'payment', { ttlDays: 1 });
  await import('../js/payment.js');
  const { $, $$, click, type, waitFor } = ctx;

  // The check is asynchronous (the record may be encrypted); the entry screen
  // is hidden as soon as the session validates.
  await waitFor(() => $('#payShell').hidden === false);
  assert.equal($('#payEntry').hidden, true);

  // The desk rewrites the session on entry; once the months are populated the
  // store has settled and the token is a valid, device-bound session again.
  await waitFor(() => $('#payFeeMonth').options.length > 0);
  assert.equal(await hasPaymentSession(), true);
  assert.equal($$('#payFeeMethodGroup [data-pay-method]').length > 0, true);

  // Straight to work: search → profile, without touching the login form.
  type($('#payStudentSearch'), 'রাইসা');
  await waitFor(() => $$('#paySearchResults .fee-search-result').length > 0);
  const results = $$('#paySearchResults .fee-search-result');
  assert.equal(results.length, 1);
  click(results[0]);
  assert.match($('#payQuickProfile').textContent, /রাইসা ইসলাম/);
  click($('#payProfileCollect'));
  await waitFor(() => $('#payCollectionForm').hidden === false);
  assert.equal($('#payCollectionForm').hidden, false);
});

test('a session from another device does not open the desk', async () => {
  const ctx = await loadPage('payment.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const foreign = { token: 'stolen-token', deviceId: 'some-other-device', owner: 'payment.apc', issuedAt: Date.now(), expiry: Date.now() + 60000 };
  ctx.window.localStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify(foreign));
  await import('../js/payment.js?foreign=1');
  await ctx.flush();
  assert.equal(ctx.$('#payEntry').hidden, false, 'the entry form stays up');
  assert.equal(ctx.$('#payShell').hidden, true);
  assert.equal(ctx.window.localStorage.getItem(PAYMENT_SESSION_KEY), null, 'the foreign record is dropped');
});
