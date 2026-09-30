import { iconMarkup as minimalIcon } from './icons.js';
/* The notification inbox behind the bell button — one design on every panel.
 *
 * The bell in the topbar is the same control for a student, the Admin, the
 * Manager, the Teacher and the Payment counter. It shows the unread count and
 * opens the list of everything the notification engine (js/notifications.js)
 * considers news for the person using this device: office notices, the urgent
 * broadcast, and — for the student who is taking part — a new exam or a
 * published result.
 *
 * Read state is shared with the system notifications: the inbox marks items
 * with the same receipt the engine keeps (activePlus.notifications.seen.v1),
 * so a notification that was read in the list is never announced again and a
 * notification raised by the engine never appears as unread in the list.
 *
 * The page markup is reused when it exists (#noticeModal on the student page);
 * on the staff panels the same modal is built here, with the same classes, so
 * all six screens look and behave alike.
 */

const MODAL_ID = 'apcNoticeModal';
const KIND_ICON = Object.freeze({
  notice: 'icon-megaphone',
  broadcast: 'icon-bell',
  exam: 'icon-clipboard',
  result: 'icon-award',
  registration: 'icon-users'
});
const REFRESH_KEYS = Object.freeze(['activePlus.admin.notices.v1', 'activePlus.app.config.v1', 'activePlus.exams.v1', 'activePlus.admin.students.v1']);
const REFRESH_COLLECTIONS = Object.freeze(['notices', 'settings', 'exams', 'students']);

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bn = value => String(value).replace(/\d/g, digit => BN_DIGITS[Number(digit)]);

let center = null;

/* ---- helpers ---------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function whenText(item) {
  const at = Number(item?.at);
  if (Number.isFinite(at) && at > 0) {
    const date = new Date(at);
    try {
      return date.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return date.toLocaleString();
    }
  }
  return String(item?.audience || '');
}

/** A symbol may be missing from a page's sprite: fall back, never show a blank. */
function iconId(kind) {
  const wanted = KIND_ICON[kind] || 'icon-bell';
  if (document.getElementById(wanted)) return wanted;
  return document.getElementById('icon-bell') ? 'icon-bell' : '';
}

function iconMarkup(kind) {
  const id = iconId(kind);
  return id ? `${minimalIcon(id)}` : '';
}

/* ---- modal ------------------------------------------------------------------ */

function buildModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = MODAL_ID;
  backdrop.hidden = true;
  backdrop.innerHTML =
    '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="apcNoticeTitle">' +
      '<div class="modal-header"><div><p class="eyebrow">Active Plus আপডেট</p>' +
      '<h2 id="apcNoticeTitle">নোটিফিকেশন</h2></div>' +
      '<button type="button" class="modal-close" data-apc-notice-close aria-label="বন্ধ করুন">×</button></div>' +
      '<p class="notice-read-status" data-apc-notice-status role="status"></p>' +
      '<div data-apc-notice-list></div>' +
      '<p class="form-note" data-apc-notice-push role="status"></p>' +
      '<button class="modal-action" type="button" data-apc-notice-close>বুঝেছি</button>' +
    '</section>';
  document.body.append(backdrop);
  return backdrop;
}

/* ---- mount ------------------------------------------------------------------ */

/**
 * @param {object} api  the notification engine (js/notifications.js)
 * @returns {{ paint: Function, open: Function, close: Function, refresh: Function }}
 */
export function mountNoticeCenter(api) {
  if (center) return center;
  if (!api || typeof api.feed !== 'function') return null;

  const ownsModal = !document.getElementById('noticeModal');
  const modal = document.getElementById('noticeModal') || buildModal();
  const listBox = modal.querySelector('[data-apc-notice-list], #noticeListStudent');
  const statusLine = modal.querySelector('[data-apc-notice-status], #noticeReadStatus');
  const pushNote = modal.querySelector('[data-apc-notice-push]');
  let pushRow = null;
  let shownFeed = [];

  /* "সব খালি করুন": one button on every panel (page modal or built modal). */
  let clearButton = modal.querySelector('[data-apc-notice-clear]');
  if (!clearButton && typeof api.clear === 'function') {
    clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'mini-btn';
    clearButton.dataset.apcNoticeClear = '';
    clearButton.textContent = 'সব খালি করুন';
    clearButton.hidden = true;
    if (statusLine) statusLine.after(clearButton);
    else if (listBox) listBox.before(clearButton);
  }

  function show(visible) {
    modal.hidden = !visible;
    if (visible) {
      modal.querySelector('[data-apc-notice-close]')?.focus?.();
      void paintPush();
    }
  }

  function paint() {
    let feed = [];
    try { feed = api.feed() || []; } catch { feed = []; }
    const seen = new Set(api.seen ? api.seen() : []);
    // A registration waiting for a decision stays "unread" until it is opened,
    // decided or cleared: it is a task, not just news.
    const unread = feed.filter(item => !seen.has(item.key) || item.actionable).length;
    shownFeed = feed;
    if (clearButton) clearButton.hidden = feed.length === 0;

    const bell = document.getElementById('notificationButton');
    if (bell) {
      const dot = bell.querySelector('.notification-dot');
      if (dot) dot.hidden = unread === 0;
      bell.setAttribute('aria-label', unread
        ? `নোটিফিকেশন — ${bn(unread)}টি অপঠিত`
        : 'নোটিফিকেশন — সব পড়া হয়েছে');
    }
    if (statusLine) {
      statusLine.textContent = !feed.length
        ? 'এখনও কোনো নোটিফিকেশন নেই।'
        : unread ? `${bn(unread)}টি অপঠিত নোটিফিকেশন` : 'সব নোটিফিকেশন পড়া হয়েছে।';
    }
    if (!listBox) return { unread, total: feed.length };
    listBox.innerHTML = feed.length
      ? feed.map(item => {
        const isUnread = !seen.has(item.key) || item.actionable;
        const action = item.actionable
          ? '<button type="button" class="mini-btn approve" data-apc-notice-open="' + escapeHtml(item.key) + '">রিভিউ ও অনুমোদন</button>'
          : '';
        return '<article class="notice-detail' + (isUnread ? ' unread' : '') + (item.actionable ? ' actionable' : '') + '"' +
          (item.actionable ? ' data-apc-notice-open="' + escapeHtml(item.key) + '" role="button" tabindex="0"' : '') + '>' +
          '<span class="notice-detail-icon' + (item.kind === 'broadcast' ? ' light' : '') + '">' + iconMarkup(item.kind) + '</span>' +
          '<div><span class="notice-time">' + escapeHtml(whenText(item)) + '</span>' +
          '<h3>' + escapeHtml(item.title) + '</h3>' +
          (item.body ? '<p>' + escapeHtml(item.body) + '</p>' : '') + action + '</div></article>';
      }).join('')
      : '<p class="admin-empty">এখনও কোনো নোটিফিকেশন নেই।</p>';
    return { unread, total: feed.length };
  }

  /* The push row explains — and switches — the tray notifications. It is built
     only when the list is opened, so the FCM module never loads on a page that
     does not need it. */
  async function paintPush() {
    if (!pushNote || !api.pushSupport) return;
    const support = await api.pushSupport();
    pushNote.textContent = '';
    if (pushRow) { pushRow.remove(); pushRow = null; }
    const line = document.createElement('span');
    if (!support.supported) {
      line.textContent = 'এই ব্রাউজারে সিস্টেম নোটিফিকেশন নেই — অ্যাপ খোলা থাকলেও নোটিশ এখানে আসবে।';
      pushNote.append(line);
      return;
    }
    if (support.permission === 'granted') {
      line.textContent = support.hasVapidKey
        ? '✅ ডিভাইসে নোটিফিকেশন চালু — অ্যাপ বন্ধ থাকলেও আসবে।'
        : '✅ ডিভাইসে নোটিফিকেশন চালু — অ্যাপ খোলা থাকলে বা ব্যাকগ্রাউন্ডে থাকলে আসবে।';
      const off = document.createElement('button');
      off.type = 'button';
      off.className = 'mini-btn reject';
      off.textContent = 'বন্ধ করুন';
      off.addEventListener('click', async () => {
        off.disabled = true;
        await api.disable();
        off.disabled = false;
        void paintPush();
      });
      pushRow = off;
      pushNote.append(line, off);
      return;
    }
    line.textContent = support.permission === 'denied'
      ? 'ব্রাউজার সেটিংসে নোটিফিকেশন ব্লক করা আছে — Chrome/Safari সেটিংস থেকে অনুমতি দিন।'
      : 'নোটিফিকেশন চালু করলে নতুন নোটিশ, পরীক্ষা ও ফলাফলের খবর সাথে সাথে পাবেন।';
    const on = document.createElement('button');
    on.type = 'button';
    on.className = 'mini-btn';
    on.textContent = '🔔 চালু করুন';
    on.addEventListener('click', async () => {
      on.disabled = true;
      await api.enable();
      on.disabled = false;
      paint();
      void paintPush();
    });
    pushRow = on;
    pushNote.append(line, on);
  }

  function open() {
    let result = null;
    try { result = api.markAllSeen?.(); } catch { /* the list still opens */ }
    paint();
    if (statusLine && result && result.saved === false) {
      statusLine.textContent = 'পড়ার অবস্থা এইবারের জন্য রাখা হয়েছে; ডিভাইসে সংরক্ষণ হয়নি।';
    }
    show(true);
  }

  /* One delegated click handler serves every panel and survives a shell that is
     painted after this module runs. */
  document.addEventListener('click', event => {
    const bell = event.target?.closest?.('#notificationButton');
    if (bell) { event.preventDefault(); open(); return; }
    if (!modal.contains(event.target)) return;
    const target = event.target?.closest?.('[data-apc-notice-open]');
    if (target) { event.preventDefault(); openItem(target.dataset.apcNoticeOpen); return; }
    if (event.target?.closest?.('[data-apc-notice-clear]')) {
      event.preventDefault();
      try { api.clear?.(); } catch { /* the list repaints anyway */ }
      paint();
      if (statusLine) statusLine.textContent = 'নোটিফিকেশন খালি করা হয়েছে।';
      return;
    }
    if (!ownsModal) return;
    if (event.target?.closest?.('[data-apc-notice-close]') || event.target === modal) show(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) show(false);
    if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('article[data-apc-notice-open]')) {
      event.preventDefault();
      openItem(event.target.dataset.apcNoticeOpen);
    }
  });

  /* An actionable item closes the list and opens its own dialog. */
  function openItem(key) {
    const item = shownFeed.find(entry => entry.key === key);
    if (!item || typeof api.openItem !== 'function') return;
    closeModal();
    void Promise.resolve(api.openItem(item)).finally(() => paint());
  }

  /* The page modal (#noticeModal) is closed by its own page code; hide it the
     same way it is hidden there. */
  function closeModal() {
    if (ownsModal) { show(false); return; }
    const pageClose = modal.querySelector('[data-close-notice], .modal-close, [data-close-modal]');
    if (pageClose) pageClose.click();
    else modal.hidden = true;
  }

  const repaint = () => paint();
  window.addEventListener('apc-notifications-updated', repaint);
  window.addEventListener('apc-notification', repaint);
  window.addEventListener('apc-sync-updated', event => {
    const collection = event?.detail?.collection;
    if (!collection || REFRESH_COLLECTIONS.includes(collection)) repaint();
  });
  window.addEventListener('storage', event => {
    if (!event.key || REFRESH_KEYS.includes(event.key)) repaint();
  });
  window.addEventListener('focus', repaint);

  center = {
    paint,
    open,
    close: () => show(false),
    refresh: () => { try { api.refresh?.(); } catch { /* ignore */ } paint(); },
    isOpen: () => !modal.hidden
  };
  paint();
  window.apcNoticeCenter = center;
  return center;
}

export function noticeCenter() {
  return center;
}
