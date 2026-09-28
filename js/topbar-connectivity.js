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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update, { once: true });
  } else {
    update();
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
})();
