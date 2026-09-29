/* Offline status indicator. The app never depends on network connectivity. */
import { $, showFeedback } from './ui.js';

export function updateConnectionStatus() {
  const pill = $('#connectionPill');
  const text = $('#connectionText');
  if (!pill || !text) return;
  const offline = !navigator.onLine;
  text.textContent = document.documentElement.dataset.realtimeSyncMessage || (offline ? 'অফলাইন — ডেটা এই ডিভাইসে আছে' : 'ক্লাউড সিঙ্কের অপেক্ষায়');
  pill.classList.toggle('is-offline', offline);
}

export function initConnectivity() {
  updateConnectionStatus();
  window.addEventListener('apc-sync-status', updateConnectionStatus);
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  $('#connectionPill')?.addEventListener('click', () => showFeedback(document.documentElement.dataset.realtimeSyncMessage || 'ক্লাউড সিঙ্কের অপেক্ষায়'));
}
