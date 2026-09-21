const CACHE_NAME = 'active-plus-student-v19';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './logo.svg',
  './icon-192.png',
  './icon-512.png',
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
  './assets/fonts/NotoSansBengali-Variable.ttf',
  './js/config.js',
  './js/storage.js',
  './js/ui.js',
  './js/shell.js',
  './js/routine.js',
  './js/profile.js',
  './js/auth.js',
  './js/navigation.js',
  './js/modals.js',
  './js/install.js',
  './js/connectivity.js',
  './js/service-worker.js',
  './js/theme.js',
  './js/main.js'
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
