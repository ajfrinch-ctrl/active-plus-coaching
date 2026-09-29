const CACHE_NAME = 'active-plus-student-v90-theme';
const APP_SHELL = [
  './js/record-sync.js',
  './js/sync-merge.js',
  './js/sync-collections.js',
  './js/realtime-value-codec.js',
  './js/student-search.js',
  './js/sync-status.js',
  './js/username-sync-codec.js',
  './js/notification-rules.js',
  './js/notifications.js',
  './js/push-notifications.js',
  './offline-roles.html',
  './css/offline-roles.css',
  './js/offline-role-store.js',
  './js/offline-role-demo.js',
  './js/offline-role-ui.js',
  './',
  './index.html',
  './admin.html',
  './manager.html',
  './teacher.html',
  './payment.html',
  './styles.css',
  './css/admin.css',
  './css/mobile.css',
  './js/pull-to-refresh.js',
  './css/exams.css',
  './css/teaching.css',
  './css/admin-icon-system.css',
  './css/admin-staff.css',
  './css/receipt.css',
  './manifest.json',
  './favicon.ico',
  './assets/icons/logo-128.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/app-logo.png',
  './assets/icons/glass/home.png',
  './assets/icons/glass/routine.png',
  './assets/icons/glass/courses.png',
  './assets/icons/glass/results.png',
  './assets/icons/glass/profile.png',
  './assets/icons/glass/exam.png',
  './assets/icons/glass/members.png',
  './assets/icons/glass/finance.png',
  './assets/icons/glass/notices.png',
  './assets/icons/glass/reports.png',
  './assets/icons/glass/settings.png',
  './assets/icons/glass/approval.png',
  './assets/icons/glass/class.png',
  './assets/icons/glass/assignment.png',
  './assets/icons/glass/suggestion.png',
  './assets/icons/glass/attendance.png',
  './assets/icons/glass/bell.png',
  './assets/icons/glass/offline.png',
  './assets/icons/glass/app.png',
  './assets/icons/glass/security.png',
  './assets/icons/glass/support.png',
  './assets/icons/glass/card.png',
  './assets/icons/glass/logout.png',
  './assets/icons/admin/dashboard.png',
  './assets/icons/admin/users.png',
  './assets/icons/admin/finance.png',
  './assets/icons/admin/payment.png',
  './assets/icons/admin/reports.png',
  './assets/icons/admin/notices.png',
  './assets/icons/admin/classes.png',
  './assets/icons/admin/app.png',
  './assets/icons/admin/exams.png',
  './assets/icons/admin/routine.png',
  './assets/icons/admin/more.png',
  './assets/icons/admin/logout.png',
  './css/icon-experience.css',
  './css/app-redesign.css',
  './css/student-home.css',
  './css/portal-polish.css',
  './css/admin-panel-ui.css',
  './css/manager-panel.css',
  './css/tokens.css',
  './css/pending.css',
  './css/shell.css',
  './css/dashboard.css',
  './css/routine.css',
  './css/courses.css',
  './css/results.css',
  './css/profile.css',
  './css/navigation.css',
  './css/overlays.css',
  './css/auth.css',
  './css/responsive.css',
  './css/glass.css',
  './css/theme.css',
  './css/typography.css',
  './css/scroll-header.css',
  './css/liquid-glass.css',
  './css/reports.css',
  './css/appearance.css',
  './js/appearance.js',
  './js/appearance-boot.js',
  './js/theme-entry.js',
  './assets/fonts/NotoSansBengali-Variable.ttf',
  './js/config.js',
  './js/password-hash.js',
  './js/secure-store.js',
  './js/session.js',
  './js/sanitize.js',
  './js/sanitize-url.js',
  './js/staff-password-dialog.js',
  './js/demo-data.js',
  './js/exam-data.js',
  './js/exam-ui.js',
  './js/exam-manager.js',
  './js/exam-pdf.js',
  './js/material-pdf.js',
  './js/student-exams.js',
  './js/student-dashboard.js',
  './js/account-policy.js',
  './js/storage.js',
  './js/ui.js',
  './js/shell.js',
  './js/routine.js',
  './js/profile.js',
  './js/login.js',
  './js/staff-auth.js',
  './js/database.js',
  './js/password-hash.js',
  './js/secure-store.js',
  './js/session.js',
  './js/register.js',
  './js/recovery.js',
  './js/logout.js',
  './js/navigation.js',
  './js/notice-center.js',
  './js/install.js',
  './js/connectivity.js',
  './js/service-worker.js',
  './js/theme.js',
  './js/fixed-shell.js',
  './js/main.js',
  './js/admin.js',
  './js/manager.js',
  './js/payment.js',
  './js/teacher.js',
  './js/teaching-data.js',
  './js/teacher-assignments.js',
  './js/student-teaching.js',
  './js/admin-data.js',
  './js/office-data.js',
  './js/finance-data.js',
  './js/finance-receipt.js',
  './js/reports.js',
  './js/report-layout.js',
  './js/report-catalog.js',
  './js/report-access.js',
  './js/report-builders.js',
  './js/report-sources.js',
  './js/admin-permissions.js',
  './js/admin-icons.js',
  './js/admin-panel-ui.js',
  './js/staff-directory.js',
  './js/staff-management.js',
  './js/user-id.js',
  './js/admin-panel-ui.js',
  './js/storage/index.js',
  './js/storage/migration.js',
  './js/storage/users.js',
  './js/storage/students.js',
  './js/storage/payments.js',
  './js/storage/notices.js',
  './js/storage/settings.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first keeps installed users on the latest deployed theme/code when online,
// while retaining the cached app shell for reliable offline use.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))
        );
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

/* A tapped notification brings the app forward (notifications raised by the
   page itself, e.g. a notice that arrived while a tab stayed open). */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        client.postMessage({ type: 'apc-notification-click', data: event.notification?.data || {} });
        return client.focus();
      }
    }
    return self.clients.openWindow('./index.html');
  })());
});
