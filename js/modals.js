/* One student notification inbox. Read receipts stay scoped to this device/student.
   Content revisions have distinct receipts so an edited announcement is unread again. */
import { $, openModal, showFeedback, toBanglaNumber as bn } from './ui.js';
import { loadAppConfig } from './storage.js';
import { STORAGE_KEYS } from './config.js';
import { escapeText as esc } from './teaching-data.js';

const READ_PREFIX = 'activePlus.notices.read.v1:';
const sampleNotices = [
  { id: 'demo-class-test', title: 'আগামীকালের ক্লাস টেস্ট', body: 'আগামীকাল উচ্চতর গণিতের ক্লাস টেস্ট বিকেল ৪:৩০ মিনিটে অনুষ্ঠিত হবে। সবাইকে সময়মতো উপস্থিত থাকার জন্য অনুরোধ করা হচ্ছে।', date: 'নমুনা নোটিশ' },
  { id: 'demo-monthly-result', title: 'মাসিক পরীক্ষার ফলাফল', body: 'সেপ্টেম্বর মাসের পরীক্ষার ফলাফল এখন ফলাফল সেকশনে দেখা যাচ্ছে।', date: '১৮ সেপ্টেম্বর ২০২৬ · নমুনা' }
];
const revision = notice => JSON.stringify([notice.id, notice.title, notice.body, notice.date]);

export function initModals({ getStudent }) {
  const sessionRead = new Map();
  const key = () => READ_PREFIX + encodeURIComponent(getStudent().id);
  function savedReads() {
    try {
      const raw = localStorage.getItem(key());
      const data = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(data) && data.every(item => typeof item === 'string') ? data : null;
    } catch { return null; }
  }
  function notices() {
    const config = loadAppConfig();
    const broadcast = config.broadcastAlert && config.broadcastMessage
      ? [{ id: 'broadcast', title: 'জরুরি ঘোষণা', body: config.broadcastMessage, date: 'অফিসের ঘোষণা' }] : [];
    return [...broadcast, ...sampleNotices];
  }
  function readSet() {
    return new Set([...(savedReads() || []), ...(sessionRead.get(key()) || [])]);
  }
  function refresh() {
    const records = notices(), read = readSet();
    const unread = records.filter(notice => !read.has(revision(notice))).length;
    $('#notificationButton .notification-dot').hidden = unread === 0;
    $('#notificationButton').setAttribute('aria-label', unread ? `নোটিশ দেখুন — ${bn(unread)}টি অপঠিত` : 'নোটিশ দেখুন — সব পড়া হয়েছে');
    $('#noticeReadStatus').textContent = unread ? `${bn(unread)}টি অপঠিত নোটিশ` : 'সব নোটিশ পড়া হয়েছে। আগের নোটিশ নিচে দেখতে পারো।';
    $('#noticeListStudent').innerHTML = records.map(notice => `<article class="notice-detail${read.has(revision(notice)) ? '' : ' unread'}"><span class="notice-detail-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-megaphone"></use></svg></span><div><span class="notice-time">${esc(notice.date)}</span><h3>${esc(notice.title)}</h3><p>${esc(notice.body)}</p></div></article>`).join('');
  }
  $('#notificationButton')?.addEventListener('click', () => {
    const records = notices(), saved = savedReads(), read = readSet();
    records.forEach(notice => read.add(revision(notice)));
    sessionRead.set(key(), read);
    try {
      if (saved === null) throw new Error('Unreadable receipts');
      localStorage.setItem(key(), JSON.stringify([...read]));
    } catch { showFeedback('পড়ার অবস্থা এইবারের জন্য রাখা হয়েছে; ডিভাইসে সংরক্ষণ হয়নি।'); }
    refresh();
    openModal('noticeModal');
  });
  window.addEventListener('storage', event => {
    if (!event.key || event.key === key() || event.key === STORAGE_KEYS.appConfig) refresh();
  });
  window.addEventListener('focus', refresh);
  refresh();
  return refresh;
}
