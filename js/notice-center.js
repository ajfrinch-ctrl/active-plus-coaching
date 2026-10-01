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
  registration: 'icon-users',
  'exam-soon': 'icon-clipboard',
  'exam-live': 'icon-clipboard',
  'exam-review': 'icon-clipboard',
  'exam-returned': 'icon-clipboard',
  'exam-approved': 'icon-clipboard',
  approved: 'icon-award',
  rejected: 'icon-bell',
  payment: 'icon-bell',
  'payment-review': 'icon-bell',
  'payment-rejected': 'icon-bell'
});
/* The button on an item that asks someone to act. */
const ACTION_LABEL = Object.freeze({
  registration: 'রিভিউ ও অনুমোদন',
  'payment-review': 'পেমেন্ট দেখুন',
  'exam-review': 'পরীক্ষা দেখুন',
  'exam-returned': 'সংশোধন করুন',
  'exam-live': 'পরীক্ষায় যাও'
});
const REFRESH_KEYS = Object.freeze(['activePlus.admin.notices.v1', 'activePlus.app.config.v1', 'active-plus-app-config-v1', 'activePlus.exams.v1', 'activePlus.admin.students.v1', 'activePlus.admin.transactions.v1']);
const REFRESH_COLLECTIONS = Object.freeze(['notices', 'settings', 'exams', 'students', 'transactions']);

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

function iconMarkup(kind) {
  /* A page sprite wins when it has the symbol; js/icons.js otherwise draws the
     same glyph from its own paths, so no icon is ever a blank square. */
  const wanted = KIND_ICON[kind] || 'icon-bell';
  if (document.getElementById(wanted)) return minimalIcon(wanted);
  return minimalIcon(document.getElementById('icon-bell') ? 'icon-bell' : wanted);
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
        const opens = item.actionable || Boolean(item.target);
        const label = ACTION_LABEL[item.kind] || (item.actionable ? 'দেখুন' : '');
        const action = label
          ? '<button type="button" class="mini-btn approve" data-apc-notice-open="' + escapeHtml(item.key) + '">' + escapeHtml(label) + '</button>'
          : '';
        return '<article class="notice-detail' + (isUnread ? ' unread' : '') + (opens ? ' actionable' : '') + '"' +
          (opens ? ' data-apc-notice-open="' + escapeHtml(item.key) + '" role="button" tabindex="0"' : '') + '>' +
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
    hideAlerts();                              // the list shows them all
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

  /* ---- Popup: new notifications, and the "notifications are off" story ----
     One sheet serves both. It sits on a blurred backdrop (css/ui-features.css +
     the glass skin), carries ক্যান্সেল and বুঝেছি wherever it opens, and never
     needs the phone's notification permission: it is the in-app half. */
  let alertCard = null;
  let alertBackdrop = null;
  let alertItems = [];
  let alertMode = 'items';
  let infoKind = 'denied';

  const INFO_COPY = {
    denied: 'ব্রাউজার সেটিংসে এই সাইটের নোটিফিকেশন ব্লক করা আছে — Chrome/Safari সেটিংস থেকে অনুমতি দিলে নতুন নোটিশ, পরীক্ষা ও ফলাফলের খবর ফোনেই আসবে।',
    disabled: 'ডিভাইসের নোটিফিকেশন বন্ধ করা হয়েছে। অ্যাপ খোলা থাকলে নোটিশ তবুও এই তালিকায় জমা হবে — চাইলে আবার চালু করতে পারবেন।',
    unsupported: 'এই ব্রাউজারে সিস্টেম নোটিফিকেশন নেই। অ্যাপ খোলা থাকলেই নতুন নোটিশ, পরীক্ষা ও ফলাফলের খবর এখানে দেখা যাবে।'
  };

  function hideAlerts() {
    alertItems = [];
    alertMode = 'items';
    if (alertCard) alertCard.hidden = true;
    if (alertBackdrop) alertBackdrop.hidden = true;
  }

  function ensureAlertShell() {
    if (alertCard) return;
    alertBackdrop = document.createElement('div');
    alertBackdrop.className = 'apc-alert-backdrop';
    alertBackdrop.id = 'apcAlertBackdrop';
    alertBackdrop.hidden = true;
    alertCard = document.createElement('section');
    alertCard.className = 'apc-inapp-alert';
    alertCard.id = 'apcInAppAlert';
    alertCard.setAttribute('role', 'dialog');
    alertCard.setAttribute('aria-modal', 'true');
    alertCard.setAttribute('aria-labelledby', 'apcAlertTitle');
    alertBackdrop.append(alertCard);
    document.body.append(alertBackdrop);
    alertBackdrop.addEventListener('click', event => {
      if (event.target === alertBackdrop) { hideAlerts(); return; }
      if (event.target.closest('[data-apc-alert-close], [data-apc-alert-cancel], [data-apc-alert-ok]')) { hideAlerts(); return; }
      if (event.target.closest('[data-apc-alert-all]')) { hideAlerts(); open(); return; }
      const row = event.target.closest('[data-apc-alert-open]');
      if (!row) return;
      const item = alertItems.find(entry => entry.key === row.dataset.apcAlertOpen);
      alertItems = alertItems.filter(entry => entry !== item);
      paintAlerts();
      if (!item) return;
      if ((item.actionable || item.target) && typeof api.openItem === 'function') {
        void Promise.resolve(api.openItem(item)).finally(() => paint());
      } else open();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && alertBackdrop && !alertBackdrop.hidden) hideAlerts();
    });
  }

  function alertHeader(eyebrow, title) {
    return '<header>' +
        '<span class="apc-alert-icon" aria-hidden="true">' + iconMarkup('notice') + '</span>' +
        '<div class="apc-alert-head-copy"><p class="eyebrow">' + eyebrow + '</p>' +
        '<h2 class="apc-alert-title" id="apcAlertTitle">' + title + '</h2></div>' +
        '<button type="button" class="apc-inapp-alert-close" data-apc-alert-close aria-label="বন্ধ করুন">×</button>' +
      '</header>';
  }

  function alertFooter(showAll) {
    return '<footer class="apc-alert-actions">' +
        (showAll || '') +
        '<div class="apc-alert-choice">' +
          '<button type="button" class="mini-btn" data-apc-alert-cancel>ক্যান্সেল</button>' +
          '<button type="button" class="mini-btn primary" data-apc-alert-ok>বুঝেছি</button>' +
        '</div>' +
      '</footer>';
  }

  function paintAlerts() {
    if (!alertItems.length) { hideAlerts(); return; }
    ensureAlertShell();
    const rows = alertItems.slice(0, 3).map(item =>
      '<li><button type="button" class="apc-inapp-alert-item" data-apc-alert-open="' + escapeHtml(item.key) + '">' +
        '<span class="apc-inapp-alert-icon">' + iconMarkup(item.kind) + '</span>' +
        '<span><b>' + escapeHtml(item.title) + '</b>' + (item.body ? '<small>' + escapeHtml(item.body) + '</small>' : '') + '</span>' +
      '</button></li>').join('');
    const more = alertItems.length > 3 ? 'আরও ' + bn(alertItems.length - 3) + 'টি' : '';
    alertCard.innerHTML =
      alertHeader('Active Plus আপডেট', 'নতুন নোটিফিকেশন' + (alertItems.length > 1 ? ' · ' + bn(alertItems.length) + 'টি' : '')) +
      '<ul>' + rows + '</ul>' +
      (more ? '<p class="apc-alert-note">' + more + ' নোটিফিকেশন অপেক্ষা করছে।</p>' : '') +
      alertFooter('<button type="button" class="mini-btn" data-apc-alert-all>সব দেখুন' + (more ? ' (' + more + ')' : '') + '</button>');
    alertMode = 'items';
    alertBackdrop.hidden = false;
    alertCard.hidden = false;
  }

  /* The same sheet, explaining that system notifications are off. Used by the
     bell and by the notification pill (js/notifications.js). */
  function showInfo(kind = 'denied') {
    if (!document.body) return false;
    infoKind = INFO_COPY[kind] ? kind : 'denied';
    ensureAlertShell();
    alertCard.innerHTML =
      alertHeader('Active Plus', 'নোটিফিকেশন বন্ধ') +
      '<p class="apc-alert-copy">' + INFO_COPY[infoKind] + '</p>' +
      alertFooter('');
    alertMode = 'info';
    alertBackdrop.hidden = false;
    alertCard.hidden = false;
    return true;
  }

  let pumping = false;
  async function pumpAlerts() {
    if (pumping || typeof api.takeAlerts !== 'function') return;
    pumping = true;
    try {
      // Never over a lock/login screen: wait for the signed-in panel.
      if (typeof api.whenReady === 'function' && !(await api.whenReady())) return;
      const incoming = api.takeAlerts() || [];
      if (!incoming.length) return;
      const keys = new Set(incoming.map(item => item.key));
      alertItems = [...incoming, ...alertItems.filter(item => !keys.has(item.key))];
      paintAlerts();
    } finally {
      pumping = false;
    }
  }
  window.addEventListener('apc-inapp-alerts', () => { void pumpAlerts(); });
  void pumpAlerts();

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
    showInfo,
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
