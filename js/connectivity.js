/* Offline status indicator. The app never depends on network connectivity. */
import { $, showFeedback } from './ui.js';

export function updateConnectionStatus() {
  const pill = $('#connectionPill');
  const text = $('#connectionText');
  if (!pill || !text) return;
  const offline = !navigator.onLine;
  text.textContent = offline ? 'অফলাইন মোড · সব ডেটা ফোনে আছে' : 'অফলাইন-রেডি · ডেটা ফোনে সংরক্ষিত';
  pill.classList.toggle('is-offline', offline);
}

export function initConnectivity() {
  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  $('#connectionPill')?.addEventListener('click', () => showFeedback('অ্যাপের ডেটা এই ডিভাইসেই সংরক্ষিত আছে'));
}
