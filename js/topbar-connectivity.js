/* Active Plus — topbar network-state border indicator.
   লাল = ইন্টারনেট নেই · সবুজ = ইন্টারনেট আছে (সিঙ্ক এখনো যাচাই হয়নি)
   · নীল = ইন্টারনেট + Firebase রিয়েলটাইম সিঙ্ক চালু — নীল অবস্থায় টপবারে
     "সিঙ্ক" লেখাটুকুও দেখায়, যাতে রং ছাড়াও অবস্থাটা পড়া যায়। */
(() => {
  const selector = '.auth-topbar, .admin-topbar, .topbar, .teacher-topbar, .manager-topbar, .pay-topbar, header[class*="topbar"]';
  const CHIP_CLASS = 'topbar-sync-chip';
  const CHIP_LABEL = 'সিঙ্ক';

  // `pending` means the link is up and changes are still being written: the
  // border stays blue, the chip already says সিঙ্ক. Errors stay off this list.
  const syncConfirmed = () => ['online', 'pending'].includes(document.documentElement?.dataset?.realtimeSync);

  /** The chip joins the header's right-hand tool cluster when the panel has one, so
      the theme/exit/bell buttons keep their exact place. Without a cluster (login
      screen) it goes last, and the stylesheet keeps it flush right. */
  function chipSlot(topbar) {
    const inner = topbar.querySelector(':scope > .app-topbar-inner, :scope > .admin-topbar-inner') || topbar;
    const cluster = inner.querySelector('.app-topbar-actions, .admin-topbar-actions, .student-header-tools');
    if (cluster) return { host: cluster, before: cluster.firstChild || null };
    return { host: inner, before: null };
  }

  function syncChip(topbar, show) {
    let chip = topbar.querySelector('.' + CHIP_CLASS);
    if (!chip) {
      if (!show) return; // nothing is added to the DOM until the bridge is live
      chip = document.createElement('span');
      chip.className = CHIP_CLASS;
      chip.setAttribute('role', 'status');
      chip.setAttribute('aria-label', 'রিয়েলটাইম সিঙ্ক চালু');
      chip.textContent = CHIP_LABEL;
      const { host, before } = chipSlot(topbar);
      host.insertBefore(chip, before);
      return;
    }
    chip.hidden = !show;
  }

  function update() {
    const online = navigator.onLine;
    const syncing = online && syncConfirmed();
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('connection-online', online && !syncing);
      el.classList.toggle('connection-offline', !online);
      el.classList.toggle('connection-sync', syncing);
      el.setAttribute('data-connection-state', !online ? 'offline' : syncing ? 'sync' : 'online');
      syncChip(el, syncing);
    });
  }

  // Some role topbars are rendered after page load. Observe the DOM so the
  // green/red border is applied as soon as a topbar is created.
  const observe = () => {
    update();
    const root = document.body || document.documentElement;
    if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
    // The realtime bridge starts ~1.2s after load and on reconnect; it flips
    // <html data-realtime-sync="online"> when the Firebase link is up —
    // watch that attribute so the topbar turns blue the moment it does.
    if (document.documentElement) {
      new MutationObserver(update).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-realtime-sync']
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  } else {
    observe();
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
})();
