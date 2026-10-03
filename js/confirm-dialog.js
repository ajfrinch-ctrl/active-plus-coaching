/* One confirmation dialog for the whole app.

   Destructive and irreversible actions (delete, publish, unpublish, complete,
   archive, start) used to ask through the browser's own window.confirm on the
   exam desk and the Manager panel, while the rest of the app used its own
   modal — so the same kind of decision looked different depending on the page.
   This module is the single one: same card, same two buttons, same words,
   same focus and Escape behaviour, everywhere.

   It resolves `true` only when the person confirms. Closing, Escape, the
   backdrop and the × all mean "বাতিল", and a dialog that is already open is
   answered with `false` rather than stacked — an unanswered prompt must never
   run the action it was asking about. */

import { iconMarkup } from './icons.js';

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let backdrop = null;
let resolveCurrent = null;

function markup({ title, message, confirmLabel, cancelLabel, tone, eyebrow }) {
  const confirmClass = tone === 'danger' ? 'admin-btn danger' : 'admin-btn primary';
  return `<section class="admin-modal apc-confirm${tone === 'danger' ? ' is-danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="apcConfirmTitle" aria-describedby="apcConfirmText">
      <header class="admin-modal-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h2 id="apcConfirmTitle">${esc(title)}</h2></div>
      <button class="admin-modal-close" type="button" data-apc-confirm="cancel" aria-label="বন্ধ করুন">×</button></header>
      <div class="admin-modal-body">
        <span class="apc-confirm-icon" aria-hidden="true">${iconMarkup(tone === 'danger' ? 'warning' : 'help', 'apc-confirm-icon-svg')}</span>
        <p id="apcConfirmText">${esc(message)}</p>
      </div>
      <footer class="apc-confirm-actions">
        <button class="admin-btn ghost" type="button" data-apc-confirm="cancel">${esc(cancelLabel)}</button>
        <button class="${confirmClass}" type="button" data-apc-confirm="ok">${esc(confirmLabel)}</button>
      </footer>
    </section>`;
}

function close(answer) {
  if (!backdrop) return;
  backdrop.hidden = true;
  document.body.classList.remove('admin-modal-open');
  document.removeEventListener('keydown', onKeydown, true);
  const resolve = resolveCurrent;
  resolveCurrent = null;
  if (resolve) resolve(answer);
}

function onKeydown(event) {
  if (!backdrop || backdrop.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); return; }
  if (event.key !== 'Tab') return;
  // Keep the focus inside the dialog: a confirmation must not be answered by
  // activating something on the page behind it.
  const items = [...backdrop.querySelectorAll('button:not([disabled])')];
  if (!items.length) return;
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/**
 * Ask one question. Resolves `true` only on the confirm button.
 * @param {object} options
 * @param {string} options.title         the question, in the person's words
 * @param {string} options.message       what happens, including what is safe
 * @param {string} [options.confirmLabel] the action verb ("মুছে ফেলুন")
 * @param {string} [options.cancelLabel]
 * @param {'default'|'danger'} [options.tone]
 * @param {string} [options.eyebrow]     the panel name above the question
 * @returns {Promise<boolean>}
 */
export function confirmAction({ title, message, confirmLabel = 'নিশ্চিত করুন', cancelLabel = 'বাতিল', tone = 'default', eyebrow = 'নিশ্চিতকরণ' } = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (resolveCurrent) { close(false); }   // never stack two questions

  // A page swap (or a test that loads a fresh document) leaves the old card
  // attached to the document it was built in; build a new one rather than
  // painting into a node nobody can see. In a real page `document` never
  // changes, so this costs nothing there.
  if (!backdrop || backdrop.ownerDocument !== document || !backdrop.isConnected) {
    backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop apc-confirm-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(false); });
    backdrop.addEventListener('click', event => {
      const button = event.target.closest('[data-apc-confirm]');
      if (button) close(button.dataset.apcConfirm === 'ok');
    });
    document.body.append(backdrop);
  }

  backdrop.innerHTML = markup({ title, message, confirmLabel, cancelLabel, tone, eyebrow });
  backdrop.hidden = false;
  document.body.classList.add('admin-modal-open');
  document.addEventListener('keydown', onKeydown, true);
  const confirmButton = backdrop.querySelector('[data-apc-confirm="ok"]');
  confirmButton?.focus();
  return new Promise(resolve => { resolveCurrent = resolve; });
}

/** Test/support hook: is a confirmation waiting right now? */
export function confirmIsOpen() { return Boolean(backdrop && !backdrop.hidden); }
