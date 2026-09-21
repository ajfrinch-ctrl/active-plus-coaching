/* Dashboard notice and modal triggers. */
import { $, openModal } from './ui.js';

export function initModals() {
  $('#notificationButton')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeShortcut')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeStrip')?.addEventListener('click', () => openModal('noticeModal'));
}
