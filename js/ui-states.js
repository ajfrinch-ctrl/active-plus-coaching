/* One empty state, one loading row — for every list in the app.

   Before this, a list with nothing in it said so in seven different ways
   (`admin-empty`, `teacher-empty`, `notice-empty`, `dashboard-empty`,
   `empty-routine`, `admin-empty-search`, `rc-preview-empty`), most of them a
   bare line of text with no way forward. A blank screen is a dead end: the
   person cannot tell "nothing exists yet" from "my filter hid it" from
   "it failed to load".

   So every list says it the same way — icon, one line, an optional sentence,
   and the action that actually helps. The wording is unchanged from what each
   list already said; only the shape is shared. */

import { iconMarkup } from './icons.js';

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * @param {object} options
 * @param {string} options.title    the one line that says what is missing
 * @param {string} [options.message] why, or what to do about it
 * @param {string} [options.icon]   an icon name from js/icon-set.js
 * @param {{ label: string, action: string, tone?: 'primary'|'default' }} [options.button]
 * @returns {string} markup
 */
export function emptyState({ title, message = '', icon = 'assignment', button = null } = {}) {
  const art = iconMarkup(icon, 'apc-empty-icon-svg');
  const action = button
    ? `<button type="button" class="mini-btn${button.tone === 'primary' ? ' primary' : ''}" data-empty-action="${esc(button.action)}">${esc(button.label)}</button>`
    : '';
  return `<div class="apc-empty"><span class="apc-empty-icon" aria-hidden="true">${art}</span>` +
    `<strong>${esc(title)}</strong>` +
    (message ? `<p>${esc(message)}</p>` : '') +
    action +
  '</div>';
}
