/* FCM background service worker — the only file that can show a notification
   while the app is fully closed. It must stay at the repository root so its
   scope covers the whole app.

   The sender (functions/index.js → pushNotice / pushBroadcast / pushExam) sends
   a message with both a `notification` block and a `data` block. When the
   notification block is present the Firebase SDK displays it itself; this file
   only displays the data-only message so a payload can never appear twice. */

importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAW9t4luwORjyu6T926qhL4mhOguxuTstI',
  authDomain: 'active-plus.firebaseapp.com',
  databaseURL: 'https://active-plus.firebaseio.com',
  projectId: 'active-plus',
  storageBucket: 'active-plus.firebasestorage.app',
  messagingSenderId: '267388759271',
  appId: '1:267388759271:web:a2ed1103cae476be784642'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const notification = payload?.notification;
  if (notification && (notification.title || notification.body)) return;   // shown by the SDK
  const data = payload?.data || {};
  return self.registration.showNotification(data.title || 'Active Plus', {
    body: data.body || '',
    icon: './assets/icons/icon-192.png',
    tag: data.key || payload?.messageId || 'active-plus',
    data
  });
});

/* One tap brings the app to the front instead of stacking new tabs. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './index.html';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        client.postMessage({ type: 'apc-notification-click', data: event.notification?.data || {} });
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
