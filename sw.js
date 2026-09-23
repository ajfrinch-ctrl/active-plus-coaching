const CACHE_NAME = 'active-plus-student-v47-resource-popup';
const APP_SHELL = [
  './',
  './index.html',
  './admin.html',
  './teacher.html',
  './payment.html',
  './styles.css',
  './css/admin.css',
  './css/mobile.css',
  './css/exams.css',
  './css/teaching.css',
  './css/receipt.css',
  './manifest.json',
  './assets/icons/app-logo.png',
  './assets/icons/install-icon.png',
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
  './assets/fonts/NotoSansBengali-Variable.ttf',
  './js/config.js',
  './js/demo-data.js',
  './js/demo-forms.js',
  './assets/demo-study-notes.pdf',
  './js/exam-data.js',
  './js/exam-ui.js',
  './js/exam-manager.js',
  './js/exam-pdf.js',
  './js/student-exams.js',
  './js/account-policy.js',
  './js/storage.js',
  './js/ui.js',
  './js/shell.js',
  './js/routine.js',
  './js/profile.js',
  './js/login.js',
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
  './js/payment.js',
  './js/teacher.js',
  './js/teaching-data.js',
  './js/student-teaching.js',
  './js/admin-data.js',
  './js/finance-data.js',
  './js/finance-receipt.js',
  './js/report-generator.js'
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
