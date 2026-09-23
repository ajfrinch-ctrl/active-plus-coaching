/* Payment-desk credentials. The only login is payment.html — the student
   login page does not accept these credentials. */
import {
  STAFF_ACCOUNTS,
  STAFF_PASSWORD,
  loadStaffAccount,
  verifyStaffCredentials,
  saveStaffSession,
  hasStaffSession,
  clearStaffSession,
  changeStaffPassword,
  normalizeStaffUsername
} from './staff-auth.js';

export const PAYMENT_USER_ID = STAFF_ACCOUNTS.payment.username;
export const DEFAULT_PAYMENT_PIN = STAFF_PASSWORD;
export const PAYMENT_ACCOUNT_KEY = STAFF_ACCOUNTS.payment.accountKey;
export const PAYMENT_SESSION_KEY = STAFF_ACCOUNTS.payment.sessionKey;
export const PAYMENT_PORTAL_PATH = 'payment.html';
export const PAYMENT_REMEMBER_DAYS = 90;

export function loadPaymentAccount() {
  const account = loadStaffAccount('payment');
  return { userId: account.username, username: account.username, pin: account.password, password: account.password };
}

export function isPaymentUserId(value) {
  return normalizeStaffUsername(value) === PAYMENT_USER_ID;
}

export function verifyPaymentCredentials(userId, password) {
  return verifyStaffCredentials('payment', userId, password);
}

export function savePaymentSession(remember = true) {
  return saveStaffSession('payment', remember);
}

export function hasPaymentSession() {
  return hasStaffSession('payment');
}

export function clearPaymentSession() {
  clearStaffSession('payment');
}

export function changePaymentPin(currentPassword, nextPassword, confirmPassword) {
  const result = changeStaffPassword('payment', currentPassword, nextPassword, confirmPassword);
  if (!result.ok) return result;
  return { ok: true, pin: result.password, password: result.password };
}
