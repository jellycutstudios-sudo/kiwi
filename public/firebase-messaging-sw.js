// public/firebase-messaging-sw.js
// Service Worker for handling Firebase Cloud Messaging background notifications
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker.
// Using the project number from your Firebase Project Settings screenshot: 724042179845
firebase.initializeApp({
  messagingSenderId: "724042179845"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Online Order!';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new order to process.',
    icon: '/icons/icon-192.png',
    badge: '/favicon.svg',
    tag: 'online-order',
    renotify: true,
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
