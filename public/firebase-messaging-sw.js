/* eslint-disable no-undef */
// Service Worker לקבלת התראות Push כשה-CRM סגור או ברקע.
// חייב לשבת ב-public/ ולהיגש מהשורש (/firebase-messaging-sw.js) —
// Service Worker יכול לשלוט רק על נתיבים שנמצאים תחתיו.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ה-apiKey מגיע כפרמטר בכתובת הרישום ולא מקודד כאן בקשיחות,
// כדי שיישאר מקור אמת אחד — משתנה הסביבה ב-Netlify.
const swParams = new URL(self.location).searchParams;

firebase.initializeApp({
  apiKey: swParams.get('apiKey') || '',
  authDomain: 'ds-logistics-crm.firebaseapp.com',
  projectId: 'ds-logistics-crm',
  storageBucket: 'ds-logistics-crm.firebasestorage.app',
  messagingSenderId: '745458915751',
  appId: '1:745458915751:web:12dff3d86b6e97479cbe82',
});

const messaging = firebase.messaging();

// התראות רקע. שים לב: אם ה-payload מהשרת מכיל בלוק notification,
// הדפדפן מציג אותה בעצמו וההנדלר הזה עלול לגרום להתראה כפולה.
// לכן ה-Netlify function שולחת data-only, וההצגה נעשית כאן.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Steel & Spirit CRM', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: d.tag || 'ss-crm',
    renotify: true,
    data: { url: d.url || '/' },
  });
});

// לחיצה על ההתראה: אם ה-CRM כבר פתוח בטאב — מתמקד בו במקום לפתוח חדש.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
