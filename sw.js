const CACHE_NAME = 'active-plus-student-v63-admin-panel';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './manager.html',
  './teacher.html',
  './payment.html',
  './styles.css',
  './css/admin.css',
  './css/mobile.css',
  './css/exams.css',
  './css/teaching.css',
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
  './css/icon-experience.css',
  './css/app-redesign.css',
  './css/admin-panel-ui.css',
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
  './assets/fonts/NotoSansBengali-Variable.ttf',
  './js/config.js',
  './js/password-hash.js',
  './js/secure-store.js',
  './js/session.js',
  './js/sanitize.js',
  './js/staff-password-dialog.js',
  './js/demo-data.js',
  './js/demo-forms.js',
  './js/exam-data.js',
  './js/exam-ui.js',
  './js/exam-manager.js',
  './js/exam-pdf.js',
  './js/material-pdf.js',
  './js/student-exams.js',
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
  './js/modals.js',
  './js/install.js',
  './js/connectivity.js',
  './js/service-worker.js',
  './js/theme.js',
  './js/scroll-header.js',
  './js/fixed-shell.js',
  './js/main.js',
  './js/admin.js',
  './js/manager.js',
  './js/payment.js',
  './js/teacher.js',
  './js/teaching-data.js',
  './js/student-teaching.js',
  './js/admin-data.js',
  './js/office-data.js',
  './js/finance-data.js',
  './js/finance-receipt.js',
  './js/report-generator.js',
  './js/admin-permissions.js',
  './js/admin-panel-ui.js'
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

// Cache-first keeps the installed app usable in airplane mode. A successful
// network response is saved as well, so future screens can be opened offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
