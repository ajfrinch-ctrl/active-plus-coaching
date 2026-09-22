/* PIN recovery feature: security question based PIN reset. */
import { $, normalizeAnswer, showFeedback, openModal, closeModal, setAuthMessage } from './ui.js';
import { DEFAULT_PIN } from './config.js';
import { contactNumber } from './account-policy.js';
import { loadAccount, persistAccount } from './storage.js';

function handleRecovery(event, state) {
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
  const matches = contactNumber(form.get('mobile')) === state.account.mobile
    && form.get('question') === state.account.securityQuestion
    && normalizeAnswer(form.get('answer')) === state.account.securityAnswer;
  const pin = String(form.get('pin') || '');
  if (!matches) return showFeedback('মোবাইল নম্বর, প্রশ্ন বা উত্তর সঠিক নয়');
  if (!/^\d{4,6}$/.test(pin)) return showFeedback('নতুন PIN ৪ থেকে ৬ সংখ্যার হতে হবে');
  try { state.account = persistAccount({ ...state.account, pin }); }
  catch { return showFeedback('PIN সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); }
  closeModal('recoveryModal');
  $('#loginMobile').value = state.account.mobile;
  setAuthMessage('নতুন PIN সংরক্ষণ হয়েছে। এখন লগইন করুন।', true);
}

export function initRecovery({ state }) {
  $('#recoveryPin').value = $('#recoveryPin').defaultValue = DEFAULT_PIN;
  $('#recoveryForm')?.addEventListener('submit', event => handleRecovery(event, state));
  $('#forgotPinButton')?.addEventListener('click', () => openModal('recoveryModal'));
}
