/* Dashboard notice and modal triggers. */
import { $, $$, openModal } from './ui.js';

export function initModals() {
  $('#notificationButton')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeShortcut')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeStrip')?.addEventListener('click', () => openModal('noticeModal'));
  // ShopLedGer-style home rows and pills that open the notice board.
  $$('.js-notice-open').forEach(trigger => trigger.addEventListener('click', () => openModal('noticeModal')));
}
