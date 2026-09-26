/* Shared helpers for tests that sign staff in.
   Phase 1 removed the built-in default password: a role's first sign-in on a
   device goes through the password-setup dialog, so tests provision a password
   first (or complete the dialog) exactly like a real first login. */
import assert from 'node:assert/strict';
import { STAFF_ACCOUNTS, provisionStaffAccount } from '../js/staff-auth.js';
import { buildSessionRecord } from '../js/session.js';

export const STAFF_TEST_PASSWORD = 'Apc-Test-2026';

/** Give a role its first password on this device, like a real first login. */
export async function provisionStaff(role, password = STAFF_TEST_PASSWORD) {
  const result = await provisionStaffAccount(role, password, password);
  assert.equal(result.ok, true, `provisioning ${role} failed: ${result.error}`);
  return password;
}

/** Write a valid, device-bound session record straight into storage. */
export function seedStaffSession(window, role, { ttlDays = 1 } = {}) {
  const record = buildSessionRecord({ owner: STAFF_ACCOUNTS[role].username, ttlDays });
  window.localStorage.setItem(STAFF_ACCOUNTS[role].sessionKey, JSON.stringify(record));
  return record;
}

/** Sign a staff role in on the shared index.html form, finishing the
    first-use / forced-change dialog when it appears. */
export async function signInOnLoginPage(ctx, role, { password = STAFF_TEST_PASSWORD, remember = true, provision = true } = {}) {
  if (provision) await provisionStaff(role, password);
  const { $, type, submit, waitFor } = ctx;
  type($('#loginMobile'), STAFF_ACCOUNTS[role].username);
  type($('#loginPin'), password);
  const rememberBox = $('#rememberMe');
  if (rememberBox) rememberBox.checked = remember;
  submit($('#loginForm'));
  await waitFor(() => Boolean($('.staff-pw-backdrop')) || ctx.jsdomErrors.some(error => /navigation/i.test(error)));
  const dialog = $('.staff-pw-backdrop');
  if (dialog) {
    type($('#staffPwNew'), password);
    type($('#staffPwConfirm'), password);
    submit($('.staff-pw-form'));
    await waitFor(() => !$('.staff-pw-backdrop'));
  }
  await ctx.flush();
}

/** Complete the first-use setup dialog that a fresh device shows. */
export async function completeStaffPasswordDialog(ctx, password = STAFF_TEST_PASSWORD) {
  const { $, type, submit, waitFor } = ctx;
  await waitFor(() => Boolean($('.staff-pw-backdrop')));
  type($('#staffPwNew'), password);
  type($('#staffPwConfirm'), password);
  submit($('.staff-pw-form'));
  await waitFor(() => !$('.staff-pw-backdrop'));
  await ctx.flush();
}
