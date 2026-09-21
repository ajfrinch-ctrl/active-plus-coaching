/* Dashboard notice and modal triggers. */
import { $, openModal, closeModal } from './ui.js';

export function initModals({ onLogoutConfirm } = {}) {
  $('#notificationButton')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeShortcut')?.addEventListener('click', () => openModal('noticeModal'));
  $('#noticeStrip')?.addEventListener('click', () => openModal('noticeModal'));
  $('#logoutConfirmButton')?.addEventListener('click', () => {
    closeModal('logoutModal');
    onLogoutConfirm?.();
  });
}
