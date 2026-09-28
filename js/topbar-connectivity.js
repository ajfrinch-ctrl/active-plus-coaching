/* Active Plus — topbar network-state border indicator.
   লাল = ইন্টারনেট নেই · সবুজ = ইন্টারনেট আছে (সিঙ্ক এখনো যাচাই হয়নি)
   · নীল = ইন্টারনেট + Firebase রিয়েলটাইম সিঙ্ক চালু। */
(() => {
  const selector = '.auth-topbar, .admin-topbar, .topbar, .teacher-topbar, .manager-topbar, .pay-topbar, header[class*="topbar"]';

  const syncConfirmed = () => document.documentElement?.dataset?.realtimeSync === 'online';

  function update() {
    const online = navigator.onLine;
    const syncing = online && syncConfirmed();
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('connection-online', online && !syncing);
      el.classList.toggle('connection-offline', !online);
      el.classList.toggle('connection-sync', syncing);
      el.setAttribute('data-connection-state', !online ? 'offline' : syncing ? 'sync' : 'online');
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
