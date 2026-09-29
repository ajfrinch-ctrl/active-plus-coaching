const CACHE_NAME = 'active-plus-student-v95-firebase-sync-audit';
const APP_SHELL = [
  './js/panel-lockdown.js',
  './js/panel-switch.js',
  './js/firebase-config.js',
  './js/firebase-online-test.js',
  './js/firebase-diagnostics.js',
  './js/realtime-sync-entry.js',
  './js/realtime-sync.js',
  './js/sync-status.js',
  './js/record-sync.js',
  './js/sync-merge.js',
  './js/sync-collections.js',
  './js/realtime-value-codec.js',
  './js/student-search.js',
  './js/sync-status.js',
  './js/rtdb-keys.js',
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

/* Panel lockdown (js/panel-lockdown.js). This device's own panel is the only
   page a tapped notification may open: with no window in sight the worker reads
   the hint the panel left here. Never a hard-coded page, never another panel. */
const PANEL_HINT_CACHE = 'apc-panel-hint';
const PANEL_HINT_PATH = './__apc-last-panel';
const PANEL_PAGES = ['admin.html', 'manager.html', 'teacher.html', 'payment.html'];
const APP_ENTRY = './index.html';

/* Served when an offline navigation is not in the cache. It stays on the page
   the person asked for — the old fallback handed an offline Admin the student
   app, which is exactly the cross-panel jump the panels now close. */
const OFFLINE_DOCUMENT = `<!DOCTYPE html>
<html lang="bn"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>অফলাইন — Active Plus</title>
<style>body{margin:0;padding:24px;font:14px/1.8 'Noto Sans Bengali',system-ui,sans-serif;background:#f4f6fb;color:#14203c}
.card{max-width:420px;margin:10vh auto 0;padding:20px;border:1px solid #dbe2ec;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(9,22,51,.08)}
h1{font-size:17px;margin:6px 0 8px}p{margin:0 0 12px}.eyebrow{margin:0;font-size:11px;letter-spacing:.04em;color:#7a869c}
button{padding:11px 14px;border:1px solid #315efb;border-radius:12px;background:#315efb;color:#fff;font:inherit;font-size:13px}</style>
</head><body><section class="card">
<p class="eyebrow">সংযোগ নেই</p>
<h1>এই পাতাটি এখন ক্যাশে নেই</h1>
<p>ইন্টারনেট সংযোগ ফিরে এলে আবার চেষ্টা করুন। এই ডিভাইসের নিজের ডেটা নিরাপদে আছে।</p>
<button onclick="location.reload()">আবার চেষ্টা করুন</button>
</section></body></html>`;

async function cachedResponse(request) {
  const exact = await caches.match(request);
  if (exact) return exact;
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return null;
    return (await caches.match(url.pathname)) || null;   // ignore a ?v= cache-buster
  } catch { return null; }
}

async function panelHintTarget() {
  try {
    const cache = await caches.open(PANEL_HINT_CACHE);
    const response = await cache.match(PANEL_HINT_PATH);
    if (!response) return '';
    const file = (await response.text()).trim().toLowerCase();
    return PANEL_PAGES.includes(file) ? `./${file}` : '';
  } catch { return ''; }
}

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
    }).catch(async () => {
      const cached = await cachedResponse(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return new Response(OFFLINE_DOCUMENT, {
          status: 503, statusText: 'Offline',
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    })
  );
});

/* A tapped notification brings the app forward (notifications raised by the
   page itself, e.g. a notice that arrived while a tab stayed open). With no
   window open it opens the device's own panel — the hint a panel left here —
   and only falls back to the app door, never to a hard-coded page. */
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
    const target = (await panelHintTarget()) || APP_ENTRY;
    return self.clients.openWindow(target);
  })());
});
