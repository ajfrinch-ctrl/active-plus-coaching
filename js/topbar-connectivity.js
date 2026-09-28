/* Active Plus — topbar network-state border indicator. */
(() => {
  const selector = '.auth-topbar, .admin-topbar, .topbar, .teacher-topbar, .manager-topbar, .pay-topbar, header[class*="topbar"]';

  function update() {
    const online = navigator.onLine;
    document.querySelectorAll(selector).forEach(el => {
      el.classList.toggle('connection-online', online);
      el.classList.toggle('connection-offline', !online);
      el.setAttribute('data-connection-state', online ? 'online' : 'offline');
    });
  }

  // Some role topbars are rendered after page load. Observe the DOM so the
  // green/red border is applied as soon as a topbar is created.
  const observe = () => {
    update();
    const root = document.body || document.documentElement;
    if (root) new MutationObserver(update).observe(root, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  } else {
    observe();
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
})();
