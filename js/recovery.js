/* পাসওয়ার্ড recovery feature: security question based পাসওয়ার্ড reset. */
import { $, normalizeAnswer, showFeedback, openModal, closeModal, setAuthMessage } from './ui.js';
import { DEFAULT_PIN } from './config.js';
import { contactNumber, isContactNumber, normalizeUsername } from './account-policy.js';
import { loadAccount, persistAccount, verifySecurityAnswer } from './storage.js';

async function handleRecovery(event, state) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  state.account = loadAccount() || state.account;
  if (!state.account) {
    closeModal('recoveryModal');
    setAuthMessage('এই ডিভাইসে কোনো রেজিস্টার্ড অ্যাকাউন্ট পাওয়া যায়নি।');
    return;
  }
  const form = new FormData(formElement);
  const typed = String(form.get('mobile') || '').trim();
  const username = normalizeUsername(typed);
  const mobile = contactNumber(typed);
  const knownUsername = normalizeUsername(state.account.username || state.account.student?.username || '');
  const identityOk = (Boolean(username) && username === knownUsername)
    || (isContactNumber(mobile) && mobile === (state.account.registrationMobile || state.account.mobile));
  const answer = String(form.get('answer') || '');
  const matches = identityOk
    && form.get('question') === state.account.securityQuestion
    && (await verifySecurityAnswer(state.account, answer));
  const pin = String(form.get('pin') || '');
  if (!matches) return showFeedback('ইউজারনেম/মোবাইল নম্বর, প্রশ্ন বা উত্তর সঠিক নয়');
  if (!/^\d{4,6}$/.test(pin)) return showFeedback('নতুন পাসওয়ার্ড ৪ থেকে ৬ সংখ্যার হতে হবে');
  try {
    // The new password and the proven answer are both stored as PBKDF2 hashes.
    state.account = await persistAccount({ ...state.account, pin, securityAnswer: answer });
  } catch { return showFeedback('পাসওয়ার্ড সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); }
  closeModal('recoveryModal');
  $('#loginMobile').value = state.account.username || state.account.mobile;
  setAuthMessage('নতুন পাসওয়ার্ড সংরক্ষণ হয়েছে। এখন লগইন করুন।', true);
}

export function initRecovery({ state }) {
  $('#recoveryPin').value = $('#recoveryPin').defaultValue = DEFAULT_PIN;
  $('#recoveryForm')?.addEventListener('submit', event => handleRecovery(event, state));
  $('#forgotPinButton')?.addEventListener('click', () => openModal('recoveryModal'));
}
