/* Auto-login handoff: when a session already exists (written by the student
   login page or by a remembered device), payment.html must open straight onto
   the desk — no entry form, no second credential prompt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { PAYMENT_SESSION_KEY } from '../js/payment-auth.js';

test('an existing counter session opens the desk directly and it is usable', async () => {
  const ctx = await loadPage('payment.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [PAYMENT_SESSION_KEY]: JSON.stringify({ expiry: Date.now() + 60000 })
    }
  });
  await import('../js/payment.js');
  const { $, $$, click, type, waitFor } = ctx;

  // Shown synchronously, so the entry screen never flashes on arrival.
  assert.equal($('#payEntry').hidden, true);
  assert.equal($('#payShell').hidden, false);

  await waitFor(() => $('#payFeeMonth').options.length > 0);
  assert.equal($$('#payFeeMethodGroup [data-pay-method]').length > 0, true);

  // Straight to work: search → profile, without touching the login form.
  type($('#payStudentSearch'), 'রাইসা');
  const results = $$('#paySearchResults .fee-search-result');
  assert.equal(results.length, 1);
  click(results[0]);
  assert.match($('#payQuickProfile').textContent, /রাইসা ইসলাম/);
  click($('#payProfileCollect'));
  assert.equal($('#payCollectionForm').hidden, false);
});
