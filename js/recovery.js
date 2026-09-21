/* PIN recovery feature: security question based PIN reset. */
import { $, normalizeMobile, normalizeAnswer, showFeedback, openModal, closeModal, setAuthMessage } from './ui.js';
import { saveAccount } from './storage.js';

function handleRecovery(event, state) {
  event.preventDefault();
  const formElement = event.currentTarget;
  if (!formElement.checkValidity()) {
    formElement.reportValidity();
    return;
  }
  if (!state.account) {
    closeModal('recoveryModal');
    setAuthMessage('এই ডিভাইসে কোনো রেজিস্টার্ড অ্যাকাউন্ট পাওয়া যায়নি।');
    return;
  }
  const form = new FormData(formElement);
  const matches = normalizeMobile(form.get('mobile')) === state.account.mobile
    && form.get('question') === state.account.securityQuestion
    && normalizeAnswer(form.get('answer')) === state.account.securityAnswer;
  const pin = String(form.get('pin') || '');
  if (!matches) return showFeedback('মোবাইল নম্বর, প্রশ্ন বা উত্তর সঠিক নয়');
  if (!/^\d{4,6}$/.test(pin)) return showFeedback('নতুন PIN ৪ থেকে ৬ সংখ্যার হতে হবে');
  state.account.pin = pin;
  saveAccount(state.account);
  closeModal('recoveryModal');
  $('#loginMobile').value = state.account.mobile;
  setAuthMessage('নতুন PIN সংরক্ষণ হয়েছে। এখন লগইন করুন।', true);
}

export function initRecovery({ state }) {
  $('#recoveryForm')?.addEventListener('submit', event => handleRecovery(event, state));
  $('#forgotPinButton')?.addEventListener('click', () => openModal('recoveryModal'));
}
