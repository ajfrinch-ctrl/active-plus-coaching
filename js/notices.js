/* Notices the admin panel publishes, rendered into the student's notice modal.
 * The two seeded notices stay in index.html; anything published here goes on top. */
import { $, escapeText, toBanglaNumber } from './ui.js';
import { publishedNotices } from './admin-data.js';

function timeLabel(at) {
  if (!at) return '';
  const date = new Date(at);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const clock = date.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `আজ · ${clock}`;
  return `${date.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })} · ${clock}`;
}

export function renderNotices() {
  const list = $('#noticeList');
  if (!list) return;
  const published = publishedNotices();
  list.innerHTML = published.map(notice => `
    <article class="notice-detail unread">
      <span class="notice-detail-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-megaphone"></use></svg></span>
      <div>
        <span class="notice-time">${escapeText(timeLabel(notice.at))}</span>
        <h3>${escapeText(notice.title)}</h3>
        <p>${escapeText(notice.body)}</p>
      </div>
    </article>`).join('');

  const count = published.length;
  const shortcut = $('#noticeShortcutCount');
  if (shortcut) shortcut.textContent = count ? `${toBanglaNumber(count)}টি নতুন নোটিশ` : 'নতুন নোটিশ নেই';
  const strip = $('#noticeStripText');
  if (strip) {
    if (count) strip.textContent = published[0].title;
  }
  document.querySelectorAll('.notification-dot').forEach(dot => {
    dot.hidden = count === 0;
    // inline style wins over the theme rule that always shows the dot
    dot.style.display = count ? '' : 'none';
  });
}

export function initNotices() {
  renderNotices();
}
