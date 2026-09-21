/* Small DOM and feedback helpers shared by feature modules. */
export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function toBanglaNumber(value) {
  return String(value).replace(/[0-9]/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
}

export function normalizeMobile(value) {
  return String(value || '')
    .replace(/[০-৯]/g, digit => '০১২৩৪৫৬৭৮৯'.indexOf(digit))
    .replace(/[^0-9]/g, '');
}

export function normalizeAnswer(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Anything typed by a student or an admin goes through this before innerHTML. */
export function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ENTITIES[char]);
}

export function showFeedback(message) {
  $('.feedback-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'feedback-toast';
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

export function setAuthMessage(message, success = false) {
  const element = $('#authMessage');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', success);
  element.hidden = !message;
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => modal.querySelector('button, input, select')?.focus(), 50);
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
